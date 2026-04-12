"use strict";

const FALLBACK_ACTIONS = Object.freeze({
  PING: "core.ping",
  CHECK_BACKEND: "core.checkBackend",
  CAPTIONS_EXTRACT: "captions.extract",
  CONTENT_TOGGLE_READER: "content.toggleReader",
  CONTENT_PAUSE_READER: "content.pauseReader",
  CONTENT_UPDATE_SETTING: "content.updateSetting",
  CONTENT_TOGGLE_IMAGE_MODULE: "content.toggleImageModule",
  CONTENT_SCAN_IMAGES_NOW: "content.scanImagesNow",
  CONTENT_TOGGLE_KEYBOARD_MODULE: "content.toggleKeyboardModule",
  CONTENT_TOGGLE_CAPTIONS_MODULE: "content.toggleCaptionsModule",
  CONTENT_SCAN_VIDEO_CANDIDATES: "content.scanVideoCandidates",
  CONTENT_GET_KEYBOARD_STATUS: "content.getKeyboardStatus",
});

const contracts = globalThis.AccessAbleContracts || {};
const ACTIONS = contracts.ACTIONS || FALLBACK_ACTIONS;
const STORAGE_KEYS = contracts.STORAGE_KEYS || {
  SETTINGS: "accessable_settings",
  STATE: "accessable_state",
};
const DEFAULT_SETTINGS = contracts.DEFAULT_SETTINGS || {
  speed: 1,
  pitch: 1,
  volume: 1,
};
const IMAGE_ALT_INJECTED_ACTION = "image.altInjected";
const IMAGES_FIXED_STORAGE_KEY = "accessable_images_fixed_count";
const contentInjectionTasks = new Map();

const popupState = {
  readerEnabled: false,
  paused: false,
  imageModuleEnabled: false,
  keyboardModuleEnabled: false,
  captionsModuleEnabled: false,
  captionsScanInProgress: false,
  imagesFixed: 0,
  settings: { ...DEFAULT_SETTINGS },
};

const refs = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  registerRuntimeListeners();
  void initializePopup();
});

async function initializePopup() {
  initializeTabs();
  await loadStoredState();
  renderAll();
  await syncKeyboardFixesFromActiveTab();
  await checkBackend();
}

function cacheElements() {
  refs.tabButtons = Array.from(document.querySelectorAll(".tab-button[data-tab-target]"));
  refs.tabPanels = Array.from(document.querySelectorAll(".tab-panel[data-tab-panel]"));

  refs.toggleReader = document.getElementById("toggleReader");
  refs.readerStatus = document.getElementById("readerStatus");
  refs.pauseResume = document.getElementById("pauseResume");
  refs.pauseStatus = document.getElementById("pauseStatus");

  refs.toggleImageMode = document.getElementById("toggleImageMode");
  refs.imageModeStatus = document.getElementById("imageModeStatus");

  refs.toggleKeyboardMode = document.getElementById("toggleKeyboardMode");
  refs.keyboardModeStatus = document.getElementById("keyboardModeStatus");

  refs.toggleCaptionsMode = document.getElementById("toggleCaptionsMode");
  refs.captionsModeStatus = document.getElementById("captionsModeStatus");
  refs.scanCaptionsNow = document.getElementById("scanCaptionsNow");
  refs.captionsScanStatus = document.getElementById("captionsScanStatus");

  refs.speed = document.getElementById("speed");
  refs.speedValue = document.getElementById("speedValue");
  refs.pitch = document.getElementById("pitch");
  refs.pitchValue = document.getElementById("pitchValue");
  refs.volume = document.getElementById("volume");
  refs.volumeValue = document.getElementById("volumeValue");
  refs.statusText = document.getElementById("statusText");
  refs.imagesFixedValue = document.getElementById("imagesFixedStat") || findStatValueByLabel("Images Fixed");
  refs.elementsAdjustedValue = document.getElementById("elementsAdjustedStat");
}

function findStatValueByLabel(labelText) {
  const cards = Array.from(document.querySelectorAll(".stat-card"));
  for (const card of cards) {
    const labelNode = card.querySelector(".stat-label");
    const valueNode = card.querySelector(".stat-value");
    if (!labelNode || !valueNode) {
      continue;
    }
    if ((labelNode.textContent || "").trim().toLowerCase() === labelText.toLowerCase()) {
      return valueNode;
    }
  }
  return null;
}

function bindEvents() {
  refs.tabButtons?.forEach((button) => {
    button.addEventListener("click", () => {
      activateTab(button.dataset.tabTarget || "");
    });
    button.addEventListener("keydown", onTabKeydown);
  });

  refs.toggleReader?.addEventListener("click", () => void onToggleReader());
  refs.pauseResume?.addEventListener("click", () => void onPauseResume());
  refs.toggleImageMode?.addEventListener("click", () => void onToggleImageMode());
  refs.toggleKeyboardMode?.addEventListener("click", () => void onToggleKeyboardMode());
  refs.toggleCaptionsMode?.addEventListener("click", () => void onToggleCaptionsMode());
  refs.scanCaptionsNow?.addEventListener("click", () => void onScanCaptionsNow());

  refs.speed?.addEventListener("input", (event) =>
    onSettingChange("speed", Number(event.target.value))
  );
  refs.pitch?.addEventListener("input", (event) =>
    onSettingChange("pitch", Number(event.target.value))
  );
  refs.volume?.addEventListener("input", (event) =>
    onSettingChange("volume", Number(event.target.value))
  );
}

function registerRuntimeListeners() {
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.action !== IMAGE_ALT_INJECTED_ACTION) {
      return;
    }

    const payloadCount = Number(message?.payload?.count);
    popupState.imagesFixed =
      Number.isFinite(payloadCount) && payloadCount >= 0
        ? Math.floor(payloadCount)
        : popupState.imagesFixed + 1;

    renderImagesFixedCounter();
    void chrome.storage.local.set({ [IMAGES_FIXED_STORAGE_KEY]: popupState.imagesFixed });
  });
}

function initializeTabs() {
  if (!refs.tabButtons || refs.tabButtons.length === 0) {
    return;
  }

  const initialTab =
    refs.tabButtons.find((button) => button.getAttribute("aria-selected") === "true") ||
    refs.tabButtons[0];

  if (!initialTab) {
    return;
  }

  activateTab(initialTab.dataset.tabTarget || "", { focus: false });
}

function activateTab(targetPanelId, options = {}) {
  if (!targetPanelId || !refs.tabButtons || !refs.tabPanels) {
    return;
  }

  const shouldFocus = options.focus !== false;
  let hasMatch = false;

  refs.tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === targetPanelId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
    if (isActive && shouldFocus) {
      button.focus();
      hasMatch = true;
    } else if (isActive) {
      hasMatch = true;
    }
  });

  refs.tabPanels.forEach((panel) => {
    const isActive = panel.id === targetPanelId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });

  if (!hasMatch && refs.tabButtons[0]) {
    activateTab(refs.tabButtons[0].dataset.tabTarget || "", { focus: shouldFocus });
  }
}

function onTabKeydown(event) {
  const keys = ["ArrowLeft", "ArrowRight", "Home", "End"];
  if (!keys.includes(event.key)) {
    return;
  }

  if (!refs.tabButtons || refs.tabButtons.length === 0) {
    return;
  }

  event.preventDefault();
  const currentIndex = refs.tabButtons.indexOf(event.currentTarget);
  if (currentIndex < 0) {
    return;
  }

  let nextIndex = currentIndex;

  if (event.key === "ArrowRight") {
    nextIndex = (currentIndex + 1) % refs.tabButtons.length;
  } else if (event.key === "ArrowLeft") {
    nextIndex = (currentIndex - 1 + refs.tabButtons.length) % refs.tabButtons.length;
  } else if (event.key === "Home") {
    nextIndex = 0;
  } else if (event.key === "End") {
    nextIndex = refs.tabButtons.length - 1;
  }

  const nextButton = refs.tabButtons[nextIndex];
  if (nextButton) {
    activateTab(nextButton.dataset.tabTarget || "");
  }
}

async function onToggleReader() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const response = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_TOGGLE_READER,
    });
    if (!response?.ok) {
      throw new Error(extractResponseError(response, "Reader toggle failed"));
    }

    popupState.readerEnabled = Boolean(response.data?.enabled);
    popupState.paused = Boolean(response.data?.paused);
    await persistState({ readerEnabled: popupState.readerEnabled });
    renderReaderState();
    updateStatus(popupState.readerEnabled ? "Reader enabled" : "Reader disabled");
  } catch (error) {
    updateStatus(error.message || "Reader toggle failed", true);
  }
}

async function onPauseResume() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const response = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_PAUSE_READER,
    });
    if (!response?.ok) {
      throw new Error(extractResponseError(response, "Pause/resume failed"));
    }

    popupState.readerEnabled = Boolean(response.data?.enabled);
    popupState.paused = Boolean(response.data?.paused);
    renderReaderState();
    updateStatus(popupState.paused ? "Reader paused" : "Reader resumed");
  } catch (error) {
    updateStatus(error.message || "Pause/resume failed", true);
  }
}

async function onToggleImageMode() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const desired = !popupState.imageModuleEnabled;
    const toggleResponse = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_TOGGLE_IMAGE_MODULE,
      payload: { enabled: desired },
    });
    if (!toggleResponse?.ok) {
      throw new Error(extractResponseError(toggleResponse, "Image mode toggle failed"));
    }

    popupState.imageModuleEnabled = Boolean(toggleResponse.data?.enabled);
    await persistState({ imageModuleEnabled: popupState.imageModuleEnabled });
    renderImageModeState();

    if (popupState.imageModuleEnabled) {
      const scanResponse = await sendTabMessage(tab.id, {
        action: ACTIONS.CONTENT_SCAN_IMAGES_NOW,
      });
      const updated = Number(scanResponse?.data?.updated || 0);
      updateStatus(`Image mode enabled (${updated} image${updated === 1 ? "" : "s"} updated)`);
      return;
    }

    updateStatus("Image mode disabled");
  } catch (error) {
    updateStatus(error.message || "Image mode toggle failed", true);
  }
}

async function onToggleKeyboardMode() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const desired = !popupState.keyboardModuleEnabled;
    const response = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_TOGGLE_KEYBOARD_MODULE,
      payload: { enabled: desired },
    });
    if (!response?.ok) {
      throw new Error(extractResponseError(response, "Keyboard assist toggle failed"));
    }

    popupState.keyboardModuleEnabled = Boolean(response.data?.enabled);
    await persistState({ keyboardModuleEnabled: popupState.keyboardModuleEnabled });
    renderKeyboardState();

    if (popupState.keyboardModuleEnabled) {
      const fixes = Array.isArray(response.data?.fixesApplied) ? response.data.fixesApplied.length : 0;
      if (refs.elementsAdjustedValue) {
        refs.elementsAdjustedValue.textContent = String(fixes);
      }
      updateStatus(`Keyboard assist enabled (${fixes} fix${fixes === 1 ? "" : "es"})`);
    } else {
      if (refs.elementsAdjustedValue) {
        refs.elementsAdjustedValue.textContent = "0";
      }
      updateStatus("Keyboard assist disabled");
    }
  } catch (error) {
    updateStatus(error.message || "Keyboard assist toggle failed", true);
  }
}

async function onToggleCaptionsMode() {
  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const desired = !popupState.captionsModuleEnabled;
    const response = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_TOGGLE_CAPTIONS_MODULE,
      payload: { enabled: desired },
    });
    if (!response?.ok) {
      throw new Error(extractResponseError(response, "Video captions toggle failed"));
    }

    popupState.captionsModuleEnabled = Boolean(response.data?.highlighted);
    await persistState({ captionsModuleEnabled: popupState.captionsModuleEnabled });
    renderCaptionsModeState();
    updateStatus(
      popupState.captionsModuleEnabled
        ? "Video Captions: Enabled"
        : "Video Captions: Disabled"
    );
  } catch (error) {
    updateStatus(error.message || "Video captions toggle failed", true);
  }
}

async function onScanCaptionsNow() {
  if (popupState.captionsScanInProgress) {
    return;
  }

  popupState.captionsScanInProgress = true;
  renderCaptionsScanState();

  try {
    const tab = await getActiveTab();
    if (isRestrictedTab(tab.url)) {
      updateStatus("Cannot run on browser pages", true);
      return;
    }

    const ready = await ensureContentScript(tab.id);
    if (!ready) {
      updateStatus("Failed to load page scripts", true);
      return;
    }

    const candidatesResponse = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_SCAN_VIDEO_CANDIDATES,
    });
    if (!candidatesResponse?.ok) {
      throw new Error(extractResponseError(candidatesResponse, "Video scan failed"));
    }

    const rawCandidates = Array.isArray(candidatesResponse.data?.candidates)
      ? candidatesResponse.data.candidates
      : [];
    const candidates = dedupeVideoCandidates(rawCandidates).slice(0, 5);

    if (candidates.length === 0) {
      updateStatus("No supported video candidates found");
      return;
    }

    let checked = 0;
    let withCaptions = 0;
    let withoutCaptions = 0;
    let failed = 0;

    for (const candidate of candidates) {
      if (candidate.hasTrack) {
        checked += 1;
        withCaptions += 1;
        continue;
      }

      const response = await chrome.runtime.sendMessage({
        action: ACTIONS.CAPTIONS_EXTRACT,
        payload: {
          videoUrl: candidate.url,
          pageUrl: tab.url,
        },
      });

      if (!response?.ok) {
        failed += 1;
        continue;
      }

      checked += 1;
      if (response.data?.has_captions) {
        withCaptions += 1;
      } else {
        withoutCaptions += 1;
      }
    }

    const suffix = failed > 0 ? `, ${failed} failed` : "";
    updateStatus(
      `Captions scan: ${withCaptions} with, ${withoutCaptions} without (checked ${checked}${suffix})`
    );
  } catch (error) {
    updateStatus(error.message || "Caption scan failed", true);
  } finally {
    popupState.captionsScanInProgress = false;
    renderCaptionsScanState();
  }
}

function dedupeVideoCandidates(candidates) {
  const seen = new Set();
  const result = [];

  for (const candidate of candidates) {
    const url = typeof candidate?.url === "string" ? candidate.url.trim() : "";
    const hasTrack = Boolean(candidate?.hasTrack);
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    result.push({ url, hasTrack });
  }

  return result;
}

async function onSettingChange(key, value) {
  popupState.settings[key] = value;
  renderSettings();
  await persistSettings();

  try {
    const tab = await getActiveTab();
    if (!tab?.id || isRestrictedTab(tab.url)) {
      return;
    }

    await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_UPDATE_SETTING,
      payload: { key, value },
    });
  } catch (_) {
    // Non-blocking: keep setting persistence even when tab messaging fails.
  }
}

/**
 * Elements Adjusted = count of keyboard fixes on the *current tab's page* (not global).
 * Each navigation loads a new document, so fixes are re-applied and the count can differ.
 * We sync from the content script whenever the popup opens so the number is not stuck at 0.
 */
async function syncKeyboardFixesFromActiveTab() {
  if (!refs.elementsAdjustedValue) {
    return;
  }
  try {
    const tab = await getActiveTab();
    if (!tab?.id || isRestrictedTab(tab.url)) {
      refs.elementsAdjustedValue.textContent = "0";
      return;
    }
    const response = await sendTabMessage(tab.id, {
      action: ACTIONS.CONTENT_GET_KEYBOARD_STATUS,
      payload: {},
    });
    if (!response?.ok) {
      return;
    }
    const fixes = Array.isArray(response.data?.fixesApplied) ? response.data.fixesApplied.length : 0;
    const enabled = Boolean(response.data?.enabled);
    refs.elementsAdjustedValue.textContent = enabled ? String(fixes) : "0";
  } catch (_) {
    // Tab may not have content script yet (e.g. chrome:// page).
  }
}

async function loadStoredState() {
  const [data, localData] = await Promise.all([
    chrome.storage.sync.get([
      STORAGE_KEYS.SETTINGS,
      STORAGE_KEYS.STATE,
      "speed",
      "pitch",
      "volume",
    ]),
    chrome.storage.local.get([IMAGES_FIXED_STORAGE_KEY]),
  ]);

  const storedSettings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    data[STORAGE_KEYS.SETTINGS] || {}
  );

  if (typeof data.speed === "number" && !data[STORAGE_KEYS.SETTINGS]?.speed) {
    storedSettings.speed = data.speed;
  }
  if (typeof data.pitch === "number" && !data[STORAGE_KEYS.SETTINGS]?.pitch) {
    storedSettings.pitch = data.pitch;
  }
  if (typeof data.volume === "number" && !data[STORAGE_KEYS.SETTINGS]?.volume) {
    storedSettings.volume = data.volume;
  }

  popupState.settings = storedSettings;

  const storedState = Object.assign({}, data[STORAGE_KEYS.STATE] || {});
  popupState.readerEnabled = Boolean(storedState.readerEnabled);
  popupState.imageModuleEnabled = Boolean(storedState.imageModuleEnabled);
  popupState.keyboardModuleEnabled = Boolean(storedState.keyboardModuleEnabled);
  popupState.captionsModuleEnabled = Boolean(storedState.captionsModuleEnabled);
  popupState.imagesFixed = normalizeCounter(localData[IMAGES_FIXED_STORAGE_KEY]);
}

async function persistSettings() {
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SETTINGS]: {
      speed: popupState.settings.speed,
      pitch: popupState.settings.pitch,
      volume: popupState.settings.volume,
    },
  });
}

async function persistState(partialState) {
  const stored = await chrome.storage.sync.get([STORAGE_KEYS.STATE]);
  const merged = Object.assign({}, stored[STORAGE_KEYS.STATE] || {}, partialState || {});
  await chrome.storage.sync.set({ [STORAGE_KEYS.STATE]: merged });
}

function renderAll() {
  renderReaderState();
  renderImageModeState();
  renderKeyboardState();
  renderCaptionsModeState();
  renderCaptionsScanState();
  renderSettings();
  renderImagesFixedCounter();
}

function renderReaderState() {
  if (!refs.toggleReader || !refs.readerStatus || !refs.pauseResume || !refs.pauseStatus) {
    return;
  }

  refs.toggleReader.classList.toggle("active", popupState.readerEnabled);
  refs.readerStatus.textContent = popupState.readerEnabled ? "Stop Reading" : "Start Reading";
  refs.pauseResume.style.display = popupState.readerEnabled ? "block" : "none";
  refs.pauseStatus.textContent = popupState.paused ? "Resume" : "Pause";
}

function renderImageModeState() {
  if (!refs.toggleImageMode || !refs.imageModeStatus) {
    return;
  }

  refs.toggleImageMode.classList.toggle("active", popupState.imageModuleEnabled);
  refs.imageModeStatus.textContent = popupState.imageModuleEnabled
    ? "Disable Image Mode"
    : "Enable Image Mode";
}

function renderKeyboardState() {
  if (!refs.toggleKeyboardMode || !refs.keyboardModeStatus) {
    return;
  }

  refs.toggleKeyboardMode.classList.toggle("active", popupState.keyboardModuleEnabled);
  refs.keyboardModeStatus.textContent = popupState.keyboardModuleEnabled
    ? "Disable Keyboard Assist"
    : "Enable Keyboard Assist";
}

function renderCaptionsModeState() {
  if (!refs.toggleCaptionsMode || !refs.captionsModeStatus) {
    return;
  }

  refs.toggleCaptionsMode.classList.toggle("active", popupState.captionsModuleEnabled);
  refs.captionsModeStatus.textContent = popupState.captionsModuleEnabled
    ? "Disable Video Captions"
    : "Enable Video Captions";
}

function renderCaptionsScanState() {
  if (!refs.scanCaptionsNow || !refs.captionsScanStatus) {
    return;
  }

  refs.scanCaptionsNow.disabled = popupState.captionsScanInProgress;
  refs.captionsScanStatus.textContent = popupState.captionsScanInProgress
    ? "Scanning..."
    : "Check Captions Now";
}

function renderSettings() {
  if (refs.speed && refs.speedValue) {
    refs.speed.value = String(popupState.settings.speed);
    refs.speedValue.textContent = `${popupState.settings.speed.toFixed(1)}x`;
  }
  if (refs.pitch && refs.pitchValue) {
    refs.pitch.value = String(popupState.settings.pitch);
    refs.pitchValue.textContent = `${popupState.settings.pitch.toFixed(1)}x`;
  }
  if (refs.volume && refs.volumeValue) {
    refs.volume.value = String(popupState.settings.volume);
    refs.volumeValue.textContent = `${Math.round(popupState.settings.volume * 100)}%`;
  }
}

function renderImagesFixedCounter() {
  if (!refs.imagesFixedValue) {
    return;
  }
  refs.imagesFixedValue.textContent = String(normalizeCounter(popupState.imagesFixed));
}

function updateStatus(message, isError = false) {
  if (!refs.statusText) {
    return;
  }
  refs.statusText.textContent = message;
  refs.statusText.style.color = isError ? "#ff6b6b" : "#9fe0e5";
}

function isRestrictedTab(url) {
  if (typeof contracts.isRestrictedChromePage === "function") {
    return contracts.isRestrictedChromePage(url);
  }
  return !url || url.startsWith("chrome://") || url.startsWith("chrome-extension://");
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs && tabs[0];
  if (!tab || !tab.id) {
    throw new Error("No active tab found");
  }
  return tab;
}

async function ensureContentScript(tabId) {
  if (contentInjectionTasks.has(tabId)) {
    return contentInjectionTasks.get(tabId);
  }

  const task = (async () => {
    try {
      const ping = await sendTabMessage(tabId, { action: ACTIONS.PING });
      return Boolean(ping?.ok);
    } catch (_) {
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          files: [
            "shared/contracts.js",
            "module2/adapters/adapter-contracts.js",
            "module2/adapters/adapter-utils.js",
            "module2/engine/cue-normalizer.js",
            "module2/assist/assist-service.js",
            "module2/adapters/youtube-adapter.js",
            "module2/adapters/html5-track-adapter.js",
            "module2/engine/language-fallback.js",
            "module2/engine/active-cue-selector.js",
            "module2/engine/caption-engine.js",
            "module2/engine/status-mapper.js",
            "module2/renderer/caption-overlay-styles.js",
            "module2/renderer/caption-overlay-renderer.js",
            "module2/state/settings-store.js",
            "module2/state/cue-cache.js",
            "module2/state/lifecycle-manager.js",
            "module2/index.js",
            "content/modules/module1-image.js",
            "content/modules/module2-captions.js",
            "content/modules/module3-keyboard.js",
            "content/content.js",
          ],
        });

        await chrome.scripting.insertCSS({
          target: { tabId },
          files: ["content/content.css"],
        });
        return true;
      } catch (_) {
        return false;
      }
    }
  })();

  contentInjectionTasks.set(tabId, task);
  const result = await task;
  contentInjectionTasks.delete(tabId);
  return result;
}

function sendTabMessage(tabId, message) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function extractResponseError(response, fallback) {
  const error = response?.error;
  if (!error) {
    return fallback;
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error.message === "string") {
    return error.message;
  }
  return fallback;
}

function normalizeCounter(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < 0) {
    return 0;
  }
  return Math.floor(numeric);
}

async function checkBackend() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: ACTIONS.CHECK_BACKEND,
    });

    if (response?.ok && response?.data?.connected) {
      updateStatus("Backend connected");
    } else {
      updateStatus("Backend unavailable", true);
    }
  } catch (_) {
    updateStatus("Backend unavailable", true);
  }
}
