"use strict";

(() => {
  const { ACTIONS } = globalThis.AccessAbleContracts;
  const IMAGE_ALT_INJECTED_ACTION = "image.altInjected";
  const IMAGES_FIXED_STORAGE_KEY = "accessable_images_fixed_count";
  const SUCCESS_STYLE_ID = "accessable-image-success-style";

  const state = {
    enabled: false,
    observer: null,
    isScanning: false,
    scannedIds: new Set(),
    counterWriteChain: Promise.resolve(),
    fixedCountCache: null,
  };

  function enable() {
    if (state.enabled) {
      return { enabled: true };
    }

    ensureSuccessStyle();
    state.enabled = true;
    void scanNow();
    attachObserver();
    return { enabled: true };
  }

  function disable() {
    state.enabled = false;
    if (state.observer) {
      state.observer.disconnect();
      state.observer = null;
    }
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
        attachObserver._timer = window.setTimeout(() => scanNow(), 600);
      }
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  async function scanNow() {
    if (!state.enabled || state.isScanning) {
      return { scanned: 0, updated: 0 };
    }

    state.isScanning = true;
    let imagesToAnalyze = [];
    try {
      imagesToAnalyze = collectImagesMissingAlt();
      if (imagesToAnalyze.length === 0) {
        return { scanned: 0, updated: 0 };
      }

      let updated = 0;
      await Promise.all(
        imagesToAnalyze.map(async (candidate) => {
          const didUpdate = await analyzeAndInject(candidate);
          if (didUpdate) {
            updated += 1;
          }
        })
      );

      return { scanned: imagesToAnalyze.length, updated };
    } catch {
      return { scanned: imagesToAnalyze.length, updated: 0 };
    } finally {
      state.isScanning = false;
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

  function isEligibleImage(image) {
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

    if (!isVisible(image)) {
      return false;
    }

    return true;
  }

  function isVisible(element) {
    const style = window.getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      element.clientWidth > 0 &&
      element.clientHeight > 0
    );
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
      return new URL(raw, window.location.href).toString();
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
