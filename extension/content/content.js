"use strict";

(() => {
  const {
    ACTIONS,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_STATE,
    isRestrictedChromePage,
  } = globalThis.AccessAbleContracts;

  const readerState = {
    enabled: false,
    paused: false,
    currentIndex: 0,
    elements: [],
    widget: null,
    settings: { ...DEFAULT_SETTINGS },
  };

  initialize();

  function initialize() {
    if (isRestrictedChromePage(window.location.href)) {
      return;
    }

    void loadSettings();
    void restoreState();
    registerKeyboardShortcuts();
    registerMessageHandler();
  }

  async function loadSettings() {
    const stored = await chrome.storage.sync.get([STORAGE_KEYS.SETTINGS]);
    const settings = Object.assign(
      {},
      DEFAULT_SETTINGS,
      stored[STORAGE_KEYS.SETTINGS] || {}
    );
    readerState.settings = settings;
  }

  async function restoreState() {
    const stored = await chrome.storage.sync.get([STORAGE_KEYS.STATE]);
    const state = Object.assign({}, DEFAULT_STATE, stored[STORAGE_KEYS.STATE] || {});

    if (state.imageModuleEnabled) {
      globalThis.AccessAbleModuleImage?.enable();
    }

    if (state.keyboardModuleEnabled) {
      globalThis.AccessAbleModuleKeyboard?.enable();
    }

    if (state.captionsModuleEnabled) {
      globalThis.AccessAbleModuleCaptions?.enableHighlights();
    }

    if (state.voiceModuleEnabled) {
      globalThis.AccessAbleModuleVoice?.enable();
    }
  }

  function registerKeyboardShortcuts() {
    document.addEventListener("keydown", (event) => {
      if (!event.altKey) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        toggleReader();
      } else if (key === "s") {
        event.preventDefault();
        togglePause();
      } else if (key === "n") {
        event.preventDefault();
        readNext();
      } else if (key === "p") {
        event.preventDefault();
        readPrevious();
      }
    });
  }

  function registerMessageHandler() {
    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      void handleMessage(request)
        .then((response) => sendResponse(response))
        .catch((error) =>
          sendResponse({ ok: false, error: error?.message || "Content script error" })
        );
      return true;
    });
  }

  async function handleMessage(request) {
    switch (request?.action) {
      case ACTIONS.PING:
        return { ok: true, data: { status: "ready" } };

      case ACTIONS.CONTENT_TOGGLE_READER: {
        const status = toggleReader();
        return { ok: true, data: status };
      }

      case ACTIONS.CONTENT_PAUSE_READER: {
        const status = togglePause();
        return { ok: true, data: status };
      }

      case ACTIONS.CONTENT_READ_NEXT: {
        readNext();
        return { ok: true, data: getReaderStatus() };
      }

      case ACTIONS.CONTENT_READ_PREVIOUS: {
        readPrevious();
        return { ok: true, data: getReaderStatus() };
      }

      case ACTIONS.CONTENT_UPDATE_SETTING: {
        const key = request?.payload?.key;
        const value = request?.payload?.value;
        if (key && Object.prototype.hasOwnProperty.call(readerState.settings, key)) {
          readerState.settings[key] = value;
        }
        return { ok: true, data: { settings: readerState.settings } };
      }

      case ACTIONS.CONTENT_TOGGLE_IMAGE_MODULE: {
        const enabled = Boolean(request?.payload?.enabled);
        const result = enabled
          ? globalThis.AccessAbleModuleImage?.enable()
          : globalThis.AccessAbleModuleImage?.disable();
        return { ok: true, data: result || { enabled } };
      }

      case ACTIONS.CONTENT_SCAN_IMAGES_NOW: {
        const result = await globalThis.AccessAbleModuleImage?.scanNow();
        return { ok: true, data: result || { scanned: 0, updated: 0 } };
      }

      case ACTIONS.CONTENT_SCAN_VIDEO_CANDIDATES: {
        const result = globalThis.AccessAbleModuleCaptions?.scanCandidates() || [];
        return { ok: true, data: { candidates: result } };
      }

      case ACTIONS.CONTENT_TOGGLE_CAPTIONS_MODULE: {
        const enabled = Boolean(request?.payload?.enabled);
        const result = enabled
          ? globalThis.AccessAbleModuleCaptions?.enableHighlights()
          : globalThis.AccessAbleModuleCaptions?.disableHighlights();
        return { ok: true, data: result || { highlighted: enabled } };
      }

      case ACTIONS.CONTENT_TOGGLE_KEYBOARD_MODULE: {
        const enabled = Boolean(request?.payload?.enabled);
        const result = enabled
          ? globalThis.AccessAbleModuleKeyboard?.enable()
          : globalThis.AccessAbleModuleKeyboard?.disable();
        return { ok: true, data: result || { enabled } };
      }

      case ACTIONS.CONTENT_GET_KEYBOARD_STATUS: {
        const result = globalThis.AccessAbleModuleKeyboard?.getStatus() || {
          enabled: false,
          fixesApplied: [],
        };
        return { ok: true, data: result };
      }

      case ACTIONS.VOICE_ENABLE: {
        const result = globalThis.AccessAbleModuleVoice?.enable() || { enabled: false };
        return { ok: true, data: result };
      }

      case ACTIONS.VOICE_DISABLE: {
        const result = globalThis.AccessAbleModuleVoice?.disable() || { enabled: false };
        return { ok: true, data: result };
      }

      case ACTIONS.VOICE_GET_STATUS: {
        const result = globalThis.AccessAbleModuleVoice?.getStatus() || {
          enabled: false,
          commandsExecuted: 0,
        };
        return { ok: true, data: result };
      }

      default:
        return { ok: false, error: `Unknown action: ${request?.action || "undefined"}` };
    }
  }

  function toggleReader() {
    if (readerState.enabled) {
      stopReader();
    } else {
      startReader();
    }
    return getReaderStatus();
  }

  function getReaderStatus() {
    return {
      enabled: readerState.enabled,
      paused: readerState.paused,
      index: readerState.currentIndex,
      total: readerState.elements.length,
    };
  }

  function startReader() {
    readerState.elements = collectReadableElements();
    readerState.currentIndex = 0;
    readerState.enabled = true;
    readerState.paused = false;

    if (readerState.elements.length === 0) {
      speak("No readable content found on this page.");
      stopReader();
      return;
    }

    createReaderWidget();
    updateReaderWidget();
    readCurrentElement();
  }

  function stopReader() {
    readerState.enabled = false;
    readerState.paused = false;
    readerState.currentIndex = 0;
    speechSynthesis.cancel();
    clearCurrentHighlight();
    removeReaderWidget();
  }

  function togglePause() {
    if (!readerState.enabled) {
      return getReaderStatus();
    }

    readerState.paused = !readerState.paused;
    if (readerState.paused) {
      speechSynthesis.pause();
    } else {
      speechSynthesis.resume();
    }
    updateReaderWidget();
    return getReaderStatus();
  }

  function readNext() {
    if (!readerState.enabled) {
      return;
    }
    if (readerState.currentIndex >= readerState.elements.length - 1) {
      speak("This is the last element.");
      return;
    }
    readerState.currentIndex += 1;
    readerState.paused = false;
    readCurrentElement();
  }

  function readPrevious() {
    if (!readerState.enabled) {
      return;
    }
    if (readerState.currentIndex <= 0) {
      speak("This is the first element.");
      return;
    }
    readerState.currentIndex -= 1;
    readerState.paused = false;
    readCurrentElement();
  }

  function readCurrentElement() {
    if (!readerState.enabled || readerState.paused) {
      return;
    }

    const element = readerState.elements[readerState.currentIndex];
    if (!element) {
      stopReader();
      return;
    }

    clearCurrentHighlight();
    element.setAttribute("data-accessable-reading-current", "true");
    element.scrollIntoView({ block: "center", behavior: "smooth" });

    const text = formatElementText(element);
    updateReaderWidget();
    speak(text, () => {
      if (!readerState.enabled) {
        return;
      }
      if (readerState.currentIndex >= readerState.elements.length - 1) {
        speak("Reading complete.");
        stopReader();
        return;
      }
      readerState.currentIndex += 1;
      readCurrentElement();
    });
  }

  function collectReadableElements() {
    const root =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.body;

    const selectors = "h1,h2,h3,h4,h5,h6,p,blockquote,li";
    const skipAreas = "nav,header,footer,aside,[role='navigation'],[aria-hidden='true']";
    const nodes = root.querySelectorAll(selectors);
    const result = [];

    for (const node of nodes) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.closest(skipAreas)) {
        continue;
      }
      if (!isVisible(node)) {
        continue;
      }
      const text = (node.innerText || "").trim();
      if (text.length < 8) {
        continue;
      }
      result.push(node);
    }

    result.sort((a, b) => {
      const topA = a.getBoundingClientRect().top + window.scrollY;
      const topB = b.getBoundingClientRect().top + window.scrollY;
      return topA - topB;
    });
    return result;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      Number(style.opacity || "1") > 0 &&
      element.offsetHeight > 0 &&
      element.offsetWidth > 0
    );
  }

  function formatElementText(element) {
    const text = (element.innerText || "").replace(/\s+/g, " ").trim();
    const tag = element.tagName.toLowerCase();
    if (tag === "h1") {
      return `Title: ${text}`;
    }
    if (tag === "h2" || tag === "h3") {
      return `Section: ${text}`;
    }
    if (tag === "blockquote") {
      return `Quote: ${text}`;
    }
    return text;
  }

  function speak(text, onEnd) {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = Number(readerState.settings.speed) || 1;
    utterance.pitch = Number(readerState.settings.pitch) || 1;
    utterance.volume = Number(readerState.settings.volume) || 1;
    if (typeof onEnd === "function") {
      utterance.onend = onEnd;
    }
    speechSynthesis.speak(utterance);
  }

  function clearCurrentHighlight() {
    document
      .querySelectorAll("[data-accessable-reading-current='true']")
      .forEach((node) => node.removeAttribute("data-accessable-reading-current"));
  }

  function createReaderWidget() {
    if (readerState.widget) {
      return;
    }

    const widget = document.createElement("aside");
    widget.id = "accessable-reader-widget";
    widget.setAttribute("role", "region");
    widget.setAttribute("aria-label", "AccessAble Reader Controls");
    widget.innerHTML = `
      <div class="accessable-widget-header">
        <strong>AccessAble Reader</strong>
        <button type="button" class="accessable-widget-close" aria-label="Close reader">x</button>
      </div>
      <p class="accessable-widget-status" aria-live="polite"></p>
      <div class="accessable-widget-actions">
        <button type="button" data-action="pause">Pause</button>
        <button type="button" data-action="previous">Previous</button>
        <button type="button" data-action="next">Next</button>
      </div>
    `;

    const closeButton = widget.querySelector(".accessable-widget-close");
    closeButton?.addEventListener("click", () => stopReader());
    widget.querySelector("[data-action='pause']")?.addEventListener("click", () => togglePause());
    widget.querySelector("[data-action='previous']")?.addEventListener("click", () => readPrevious());
    widget.querySelector("[data-action='next']")?.addEventListener("click", () => readNext());

    document.body.appendChild(widget);
    readerState.widget = widget;
  }

  function updateReaderWidget() {
    if (!readerState.widget) {
      return;
    }
    const status = readerState.widget.querySelector(".accessable-widget-status");
    const pauseButton = readerState.widget.querySelector("[data-action='pause']");

    if (status) {
      const text = readerState.enabled
        ? `Reading item ${readerState.currentIndex + 1} of ${readerState.elements.length}`
        : "Reader disabled";
      status.textContent = text;
    }
    if (pauseButton) {
      pauseButton.textContent = readerState.paused ? "Resume" : "Pause";
    }
  }

  function removeReaderWidget() {
    if (readerState.widget) {
      readerState.widget.remove();
      readerState.widget = null;
    }
  }
})();
