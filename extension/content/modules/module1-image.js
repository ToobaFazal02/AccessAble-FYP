"use strict";

(() => {
  const { ACTIONS } = globalThis.AccessAbleContracts;
  const IMAGE_ALT_INJECTED_ACTION = "image.altInjected";
  const IMAGES_FIXED_STORAGE_KEY = "accessable_images_fixed_count";
  const SUCCESS_STYLE_ID = "accessable-image-success-style";

  /** Avoid hammering the page when many imgs load (galleries, SPAs). */
  const LOAD_RESCHEDULE_GAP_MS = 1400;
  /** Coalesce burst scans (IO + mutation + timer). */
  const MIN_GAP_BETWEEN_SCANS_MS = 700;
  const MAX_CONCURRENT_IMAGE_ANALYSIS = 2;

  const state = {
    enabled: false,
    observer: null,
    intersectionObserver: null,
    imageLoadCaptureBound: false,
    isScanning: false,
    scannedIds: new Set(),
    counterWriteChain: Promise.resolve(),
    fixedCountCache: null,
    scanDebounceTimer: null,
    loadThrottleNextOk: 0,
    lastScanFinishedAt: 0,
  };

  // Logging utility — initialized once for the whole extension content context.
  // Modules 2 and 3 (loaded after this file) reference it via globalThis.AccessAbleLogs.
  if (!globalThis.AccessAbleLogs) {
    const _LOG_KEY = "accessable_logs";
    const _LOG_MAX = 100;

    function _writeLog(entry) {
      return chrome.storage.local
        .get([_LOG_KEY])
        .then((data) => {
          const logs = Array.isArray(data[_LOG_KEY]) ? data[_LOG_KEY] : [];
          logs.push(entry);
          if (logs.length > _LOG_MAX) {
            logs.splice(0, logs.length - _LOG_MAX);
          }
          return chrome.storage.local.set({ [_LOG_KEY]: logs });
        })
        .catch(() => {});
    }

    globalThis.AccessAbleLogs = {
      log(module, action, result, detail, url) {
        void _writeLog({
          timestamp: Date.now(),
          module,
          action,
          result,
          detail: String(detail || ""),
          url: String(url || window.location.href),
        });
      },
      getAll() {
        return chrome.storage.local
          .get([_LOG_KEY])
          .then((data) => (Array.isArray(data[_LOG_KEY]) ? data[_LOG_KEY] : []))
          .catch(() => []);
      },
      clear() {
        return chrome.storage.local.set({ [_LOG_KEY]: [] }).catch(() => {});
      },
    };
  }

  function enable() {
    if (state.enabled) {
      return { enabled: true };
    }

    ensureSuccessStyle();
    state.enabled = true;
    attachIntersectionPipeline();
    attachImageLoadCapture();
    void scanNow({ force: true });
    attachObserver();
    return { enabled: true };
  }

  function disable() {
    state.enabled = false;
    window.clearTimeout(state.scanDebounceTimer);
    state.scanDebounceTimer = null;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
    if (state.intersectionObserver) {
      state.intersectionObserver.disconnect();
      state.intersectionObserver = null;
    }
    if (state.imageLoadCaptureBound) {
      document.removeEventListener("load", onImageLoadCapture, true);
      state.imageLoadCaptureBound = false;
    }
    document
      .querySelectorAll("img[data-accessable-io-bound='1']")
      .forEach((node) => node.removeAttribute("data-accessable-io-bound"));
    clearHighlights();
    return { enabled: false };
  }

  function getStatus() {
    return { enabled: state.enabled };
  }

  function attachObserver() {
    if (state.observer) {
      return;
    }

    state.observer = new MutationObserver((mutations) => {
      if (!state.enabled || state.isScanning) {
        return;
      }

      let foundCandidate = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          if (node.tagName === "IMG" || node.querySelector("img")) {
            foundCandidate = true;
            break;
          }
        }
        if (foundCandidate) {
          break;
        }
      }

      if (foundCandidate) {
        window.clearTimeout(attachObserver._timer);
        attachObserver._timer = window.setTimeout(() => scanNow(), 900);
      }
    });

    // Do NOT observe src/srcset attribute churn — React/lazy loaders fire constantly and freeze the tab.
    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function scheduleDebouncedScan(delayMs) {
    window.clearTimeout(state.scanDebounceTimer);
    const delay = typeof delayMs === "number" ? delayMs : 550;
    state.scanDebounceTimer = window.setTimeout(() => {
      state.scanDebounceTimer = null;
      void scanNow();
    }, delay);
  }

  function attachIntersectionPipeline() {
    if (state.intersectionObserver) {
      return;
    }
    state.intersectionObserver = new IntersectionObserver(
      (entries) => {
        if (!state.enabled) {
          return;
        }
        const hit = entries.some(
          (entry) =>
            entry.isIntersecting &&
            entry.target instanceof HTMLImageElement &&
            isStructuralCandidate(entry.target)
        );
        if (hit) {
          scheduleDebouncedScan(700);
        }
      },
      {
        root: null,
        rootMargin: "200px 0px", // hero + lazy images before they decode
        threshold: 0.01,
      }
    );
  }

  function attachImageLoadCapture() {
    if (state.imageLoadCaptureBound) {
      return;
    }
    document.addEventListener("load", onImageLoadCapture, true);
    state.imageLoadCaptureBound = true;
  }

  function onImageLoadCapture(event) {
    if (!state.enabled) {
      return;
    }
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) {
      return;
    }
    if (!isStructuralCandidate(target)) {
      return;
    }
    const now = Date.now();
    if (now < state.loadThrottleNextOk) {
      return;
    }
    state.loadThrottleNextOk = now + LOAD_RESCHEDULE_GAP_MS;
    scheduleDebouncedScan(750);
  }

  function wireStructuralImagesForIntersection() {
    if (!state.enabled || !state.intersectionObserver) {
      return;
    }
    const images = document.querySelectorAll("img");
    for (const image of images) {
      if (!(image instanceof HTMLImageElement)) {
        continue;
      }
      if (!isStructuralCandidate(image)) {
        continue;
      }
      if (image.getAttribute("data-accessable-io-bound") === "1") {
        continue;
      }
      image.setAttribute("data-accessable-io-bound", "1");
      state.intersectionObserver.observe(image);
    }
  }

  async function runPool(items, concurrency, fn) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
      while (true) {
        const i = nextIndex;
        nextIndex += 1;
        if (i >= items.length) {
          return;
        }
        results[i] = await fn(items[i], i);
      }
    }
    const n = Math.min(Math.max(1, concurrency), Math.max(1, items.length));
    await Promise.all(Array.from({ length: n }, () => worker()));
    return results;
  }

  async function scanNow(options) {
    const force = options && options.force === true;
    if (!state.enabled || state.isScanning) {
      return { scanned: 0, updated: 0 };
    }
    if (
      !force &&
      state.lastScanFinishedAt > 0 &&
      Date.now() - state.lastScanFinishedAt < MIN_GAP_BETWEEN_SCANS_MS
    ) {
      return { scanned: 0, updated: 0 };
    }

    wireStructuralImagesForIntersection();

    state.isScanning = true;
    let imagesToAnalyze = [];
    try {
      imagesToAnalyze = collectImagesMissingAlt();
      if (imagesToAnalyze.length === 0) {
        return { scanned: 0, updated: 0 };
      }

      const outcomes = await runPool(
        imagesToAnalyze,
        MAX_CONCURRENT_IMAGE_ANALYSIS,
        (candidate) => analyzeAndInject(candidate)
      );
      let updated = 0;
      for (let i = 0; i < outcomes.length; i += 1) {
        if (outcomes[i]) {
          updated += 1;
        }
      }

      if (updated > 0) {
        void globalThis.AccessAbleLogs?.log(
          "module1", "image_alt_generated", "success",
          `${updated} of ${imagesToAnalyze.length} image(s) described`,
          window.location.href
        );
      }
      return { scanned: imagesToAnalyze.length, updated };
    } catch {
      return { scanned: imagesToAnalyze.length, updated: 0 };
    } finally {
      state.isScanning = false;
      state.lastScanFinishedAt = Date.now();
    }
  }

  async function analyzeAndInject(candidate) {
    const target = findImageById(candidate.elementId);
    if (!(target instanceof HTMLImageElement)) {
      state.scannedIds.add(candidate.elementId);
      return false;
    }

    try {
      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.IMAGE_ANALYZE_SINGLE,
        payload: {
          imageUrl: candidate.url,
          pageUrl: window.location.href,
        },
      });

      if (!response?.ok) {
        const message = extractErrorMessage(response, null);
        markAnalysisError(target, candidate.elementId, message);
        return false;
      }

      const result = response.data?.result || {};
      const description =
        typeof result.description === "string" ? result.description.trim() : "";

      if (description.length > 0) {
        target.setAttribute("alt", description);
        target.setAttribute("data-accessable-ai-alt", "true");
        target.removeAttribute("data-accessable-analysis-error");
        removeMissingStyle(target);
        if (
          state.intersectionObserver &&
          target.getAttribute("data-accessable-io-bound") === "1"
        ) {
          state.intersectionObserver.unobserve(target);
          target.removeAttribute("data-accessable-io-bound");
        }
        state.scannedIds.add(candidate.elementId);

        void incrementImagesFixedCounter(candidate);
        return true;
      }

      const message = extractErrorMessage(response, result);
      markAnalysisError(target, candidate.elementId, message);
      return false;
    } catch (error) {
      markAnalysisError(
        target,
        candidate.elementId,
        error?.message || "Image analysis request failed"
      );
      return false;
    }
  }

  function collectImagesMissingAlt() {
    const candidates = [];
    const images = document.querySelectorAll("img");

    let counter = 0;
    for (const image of images) {
      if (!(image instanceof HTMLImageElement)) {
        continue;
      }
      if (!isEligibleImage(image)) {
        continue;
      }

      const sourceUrl = getImageSource(image);
      if (!sourceUrl) {
        continue;
      }

      const id = createStableId(sourceUrl, image, counter);
      counter += 1;
      if (state.scannedIds.has(id)) {
        continue;
      }

      image.setAttribute("data-accessable-image-id", id);
      applyMissingStyle(image);

      candidates.push({
        elementId: id,
        url: sourceUrl,
      });
    }

    return candidates;
  }

  function isStructuralCandidate(image) {
    if (!(image instanceof HTMLImageElement)) {
      return false;
    }
    const role = image.getAttribute("role");
    if (role === "presentation" || role === "none") {
      return false;
    }
    if (image.getAttribute("aria-hidden") === "true") {
      return false;
    }
    const alt = image.getAttribute("alt");
    if (alt && alt.trim().length > 0) {
      return false;
    }
    const sourceUrl = getImageSource(image);
    if (!sourceUrl) {
      return false;
    }
    return true;
  }

  function isEligibleImage(image) {
    if (!isStructuralCandidate(image)) {
      return false;
    }
    return isRenderableForAltAnalysis(image);
  }

  /**
   * Large / lazy images often report 0×0 layout until decode or viewport entry.
   * IntersectionObserver + load capture schedule rescans; this gate avoids truly hidden imgs.
   */
  function isRenderableForAltAnalysis(image) {
    const style = window.getComputedStyle(image);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      Number(style.opacity || "1") <= 0
    ) {
      return false;
    }
    const cw = image.clientWidth;
    const ch = image.clientHeight;
    if (cw > 0 && ch > 0) {
      return true;
    }
    if (image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) {
      return true;
    }
    return false;
  }

  function getImageSource(image) {
    const raw =
      image.currentSrc ||
      image.getAttribute("src") ||
      image.getAttribute("data-src") ||
      "";
    if (!raw || raw.startsWith("data:")) {
      return "";
    }

    try {
      let resolved = raw.trim();
      // Wikipedia and many CDNs use protocol-relative // URLs; resolve like the browser would.
      if (resolved.startsWith("//")) {
        const proto =
          window.location.protocol === "http:" || window.location.protocol === "https:"
            ? window.location.protocol
            : "https:";
        resolved = `${proto}${resolved}`;
      }
      return new URL(resolved, window.location.href).toString();
    } catch (_) {
      return "";
    }
  }

  function createStableId(sourceUrl, image, index) {
    const rect = image.getBoundingClientRect();
    return `img_${hash(`${sourceUrl}|${Math.round(rect.top)}|${Math.round(rect.left)}|${index}`)}`;
  }

  function hash(value) {
    let hashValue = 0;
    for (let i = 0; i < value.length; i += 1) {
      hashValue = (hashValue << 5) - hashValue + value.charCodeAt(i);
      hashValue |= 0;
    }
    return Math.abs(hashValue).toString(16);
  }

  function applyMissingStyle(image) {
    image.setAttribute("data-accessable-missing-alt", "true");
  }

  function removeMissingStyle(image) {
    image.removeAttribute("data-accessable-missing-alt");
  }

  function clearHighlights() {
    document
      .querySelectorAll("[data-accessable-missing-alt='true']")
      .forEach((node) => node.removeAttribute("data-accessable-missing-alt"));

    document
      .querySelectorAll("[data-accessable-ai-alt='true']")
      .forEach((node) => node.removeAttribute("data-accessable-ai-alt"));

    document
      .querySelectorAll("[data-accessable-analysis-error]")
      .forEach((node) => node.removeAttribute("data-accessable-analysis-error"));
  }

  function findImageById(elementId) {
    return document.querySelector(`[data-accessable-image-id="${cssEscape(elementId)}"]`);
  }

  function markAnalysisError(target, elementId, message) {
    const errorText = typeof message === "string" && message.trim().length > 0
      ? message.trim()
      : "Image analysis failed";
    target.setAttribute("data-accessable-analysis-error", errorText);
    removeMissingStyle(target);
    if (
      state.intersectionObserver &&
      target.getAttribute("data-accessable-io-bound") === "1"
    ) {
      state.intersectionObserver.unobserve(target);
      target.removeAttribute("data-accessable-io-bound");
    }
    state.scannedIds.add(elementId);
  }

  function extractErrorMessage(response, result) {
    const resultError =
      typeof result?.error === "string" ? result.error.trim() : "";
    if (resultError) {
      return resultError;
    }

    const error = response?.error;
    if (typeof error === "string" && error.trim().length > 0) {
      return error.trim();
    }

    if (typeof error?.message === "string" && error.message.trim().length > 0) {
      return error.message.trim();
    }

    return "Image analysis failed";
  }

  async function incrementImagesFixedCounter(candidate) {
    // Serialize count updates so concurrent image completions never overwrite each other.
    state.counterWriteChain = state.counterWriteChain
      .then(async () => {
        if (state.fixedCountCache === null) {
          const stored = await chrome.storage.local.get([IMAGES_FIXED_STORAGE_KEY]);
          state.fixedCountCache = normalizeCounter(stored[IMAGES_FIXED_STORAGE_KEY]);
        }

        state.fixedCountCache += 1;
        const currentCount = state.fixedCountCache;

        await chrome.storage.local.set({
          [IMAGES_FIXED_STORAGE_KEY]: currentCount,
        });

        chrome.runtime.sendMessage(
          {
            action: IMAGE_ALT_INJECTED_ACTION,
            payload: {
              count: currentCount,
              pageUrl: window.location.href,
              elementId: candidate.elementId,
              imageUrl: candidate.url,
            },
          },
          () => void chrome.runtime.lastError
        );
      })
      .catch(() => {
        // Non-blocking: alt text injection already succeeded.
        state.fixedCountCache = null;
      });

    await state.counterWriteChain;
  }

  function ensureSuccessStyle() {
    if (document.getElementById(SUCCESS_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = SUCCESS_STYLE_ID;
    style.textContent = `
      [data-accessable-ai-alt="true"] {
        border: 2px solid #2e7d32 !important;
        box-sizing: border-box !important;
      }
    `;

    (document.head || document.documentElement).appendChild(style);
  }

  function normalizeCounter(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric) || numeric < 0) {
      return 0;
    }
    return Math.floor(numeric);
  }

  function cssEscape(value) {
    if (window.CSS && typeof window.CSS.escape === "function") {
      return window.CSS.escape(value);
    }
    return String(value).replace(/["\\]/g, "\\$&");
  }

  globalThis.AccessAbleModuleImage = {
    enable,
    disable,
    getStatus,
    scanNow,
  };
})();
