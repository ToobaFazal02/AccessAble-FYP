"use strict";

(() => {
  const API_BASE_URL = "https://accessable-fyp.onrender.com";

  const ACTIONS = Object.freeze({
    PING: "core.ping",
    CHECK_BACKEND: "core.checkBackend",

    IMAGE_ANALYZE_BATCH: "image.analyzeBatch",
    IMAGE_ANALYZE_SINGLE: "image.analyzeSingle",

    CAPTIONS_EXTRACT: "captions.extract",
    CAPTIONS_FETCH_TRACK_CONTENT: "captions.fetchTrackContent",

    KEYBOARD_TRACK_FIXES: "keyboard.trackFixes",
    KEYBOARD_GET_ANALYTICS: "keyboard.getAnalytics",

    CONTENT_TOGGLE_READER: "content.toggleReader",
    CONTENT_PAUSE_READER: "content.pauseReader",
    CONTENT_READ_NEXT: "content.readNext",
    CONTENT_READ_PREVIOUS: "content.readPrevious",
    CONTENT_UPDATE_SETTING: "content.updateSetting",

    CONTENT_TOGGLE_IMAGE_MODULE: "content.toggleImageModule",
    CONTENT_SCAN_IMAGES_NOW: "content.scanImagesNow",

    CONTENT_TOGGLE_KEYBOARD_MODULE: "content.toggleKeyboardModule",
    CONTENT_GET_KEYBOARD_STATUS: "content.getKeyboardStatus",

    CONTENT_TOGGLE_CAPTIONS_MODULE: "content.toggleCaptionsModule",
    CONTENT_SCAN_VIDEO_CANDIDATES: "content.scanVideoCandidates",
    CONTENT_UPDATE_CAPTIONS_SETTINGS: "content.updateCaptionsSettings",
    CONTENT_GET_CAPTIONS_STATUS: "content.getCaptionsStatus",

    VOICE_ENABLE: "voice.enable",
    VOICE_DISABLE: "voice.disable",
    VOICE_GET_STATUS: "voice.getStatus",
    VOICE_TRACK_COMMAND: "voice.trackCommand",
  });

  const ENDPOINTS = Object.freeze({
    ROOT: "/",
    IMAGE_ANALYZE: "/api/v1/image/analyze",
    CAPTIONS_EXTRACT: "/api/v1/captions/extract",
    KEYBOARD_TRACK_FIXES: "/api/v1/keyboard/track-fixes",
    KEYBOARD_ANALYTICS: "/api/v1/keyboard/analytics",
  });

  const STORAGE_KEYS = Object.freeze({
    SETTINGS: "accessable_settings",
    CAPTIONS_SETTINGS: "accessable_captions_settings",
    STATE: "accessable_state",
    CACHE_PREFIX: "accessable_cache_",
    TELEMETRY_PREFIX: "accessable_telemetry_",
  });

  const DEFAULT_SETTINGS = Object.freeze({
    speed: 1,
    pitch: 1,
    volume: 1,
  });

  const DEFAULT_CAPTIONS_SETTINGS = Object.freeze({
    enabled: true,
    preferredLanguages: ["en", "ur"],
    overlay: Object.freeze({
      position: "bottom",
      fontSizePx: 20,
      lineHeight: 1.35,
      textColor: "#ffffff",
      backgroundColor: "#111111",
      backgroundOpacity: 0.78,
      maxWidthPercent: 88,
      paddingPx: 10,
      borderRadiusPx: 10,
      fontWeight: 600,
    }),
    network: Object.freeze({
      timeoutMs: 4000,
      retries: 2,
    }),
    telemetryEnabled: false,
    debug: false,
  });

  const DEFAULT_STATE = Object.freeze({
    readerEnabled: false,
    imageModuleEnabled: false,
    keyboardModuleEnabled: false,
    captionsModuleEnabled: false,
    voiceModuleEnabled: false,
  });

  const CACHE_POLICY = Object.freeze({
    IMAGE_TTL_MS: 7 * 24 * 60 * 60 * 1000,
    CAPTIONS_TTL_MS: 30 * 24 * 60 * 60 * 1000,
    CAPTIONS_CUE_TTL_MS: 24 * 60 * 60 * 1000,
    NEGATIVE_TTL_MS: 12 * 60 * 60 * 1000,
    TELEMETRY_DEDUPE_TTL_MS: 30 * 60 * 1000,
  });

  const REQUEST_POLICY = Object.freeze({
    MAX_CONCURRENT_NETWORK_TASKS: 1,
    MIN_DELAY_BETWEEN_REQUESTS_MS: 900,
    MAX_RETRIES: 3,
    RETRY_BASE_DELAY_MS: 800,
    RETRY_JITTER_MS: 250,
    CAPTIONS_FETCH_TIMEOUT_MS: 4000,
    CAPTIONS_FETCH_MAX_RETRIES: 2,
  });

  function toAbsoluteUrl(path) {
    return `${API_BASE_URL}${path}`;
  }

  function normalizeUrl(raw) {
    if (!raw || typeof raw !== "string") {
      return "";
    }

    const trimmed = raw.trim();
    if (!trimmed) {
      return "";
    }

    try {
      // Protocol-relative URLs ("//host/...") are invalid for `new URL` without a base (e.g. service worker).
      let toParse = trimmed;
      if (toParse.startsWith("//")) {
        toParse = `https:${toParse}`;
      }
      const parsed = new URL(toParse);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      parsed.hash = "";
      return parsed.toString();
    } catch (_) {
      return "";
    }
  }

  function isRestrictedChromePage(url) {
    if (!url || typeof url !== "string") {
      return true;
    }

    return (
      url.startsWith("chrome://") ||
      url.startsWith("chrome-extension://") ||
      url.startsWith("edge://") ||
      url.startsWith("about:")
    );
  }

  function getDomain(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    } catch (_) {
      return "";
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  globalThis.AccessAbleContracts = Object.freeze({
    API_BASE_URL,
    ACTIONS,
    ENDPOINTS,
    STORAGE_KEYS,
    DEFAULT_SETTINGS,
    DEFAULT_CAPTIONS_SETTINGS,
    DEFAULT_STATE,
    CACHE_POLICY,
    REQUEST_POLICY,
    toAbsoluteUrl,
    normalizeUrl,
    isRestrictedChromePage,
    getDomain,
    nowIso,
  });
})();
