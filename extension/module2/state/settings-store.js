"use strict";

(() => {
  const sharedContracts = globalThis.AccessAbleContracts || {};
  const overlayStyles = globalThis.AccessAbleModule2OverlayStyles || {};

  const normalizeOverlaySettings =
    overlayStyles.normalizeOverlaySettings || ((settings) => settings || {});

  const STORAGE_KEYS = sharedContracts.STORAGE_KEYS || {};

  const DEFAULT_CAPTIONS_SETTINGS = Object.freeze({
    enabled: true,
    preferredLanguages: ["en"],
    overlay: normalizeOverlaySettings(
      sharedContracts.DEFAULT_CAPTIONS_SETTINGS?.overlay || undefined
    ),
    network: {
      timeoutMs: 4000,
      retries: 2,
    },
    assist: {
      enabled: false,
      mode: "simplify",
      targetLanguage: "",
      timeoutMs: 2500,
      retries: 1,
    },
    telemetryEnabled: false,
    debug: false,
  });

  function createCaptionsSettingsStore() {
    const key = STORAGE_KEYS.CAPTIONS_SETTINGS || "accessable_captions_settings";
    const listeners = new Set();

    return {
      load,
      save,
      subscribe,
      getDefaults,
    };

    async function load() {
      const storage = await chrome.storage.sync.get([key]);
      const raw = storage[key];
      return normalizeSettings(raw);
    }

    async function save(partialSettings) {
      const current = await load();
      const merged = normalizeSettings({
        ...current,
        ...(partialSettings || {}),
      });
      await chrome.storage.sync.set({
        [key]: merged,
      });
      return merged;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") {
        return () => {};
      }

      listeners.add(listener);
      const onChanged = (changes, areaName) => {
        if (areaName !== "sync" || !changes[key]) {
          return;
        }

        const next = normalizeSettings(changes[key].newValue);
        for (const callback of listeners) {
          try {
            callback(next);
          } catch (_) {
            // Ignore observer callback errors.
          }
        }
      };

      chrome.storage.onChanged.addListener(onChanged);

      return () => {
        listeners.delete(listener);
        chrome.storage.onChanged.removeListener(onChanged);
      };
    }

    function getDefaults() {
      return normalizeSettings(DEFAULT_CAPTIONS_SETTINGS);
    }
  }

  function normalizeSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const preferredLanguages = normalizePreferredLanguages(source.preferredLanguages);
    const overlay = normalizeOverlaySettings({
      ...(DEFAULT_CAPTIONS_SETTINGS.overlay || {}),
      ...(source.overlay || {}),
    });
    const network = normalizeNetworkSettings(source.network);
    const assist = normalizeAssistSettings(source.assist);

    return {
      enabled: source.enabled !== false,
      preferredLanguages,
      overlay,
      network,
      assist,
      telemetryEnabled: source.telemetryEnabled === true,
      debug: source.debug === true,
    };
  }

  function normalizePreferredLanguages(value) {
    const list = Array.isArray(value)
      ? value
      : String(value || "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

    const normalized = [];
    const seen = new Set();
    for (const item of list) {
      const code = String(item || "").trim().toLowerCase();
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      normalized.push(code);
    }

    if (normalized.length === 0) {
      normalized.push(...DEFAULT_CAPTIONS_SETTINGS.preferredLanguages);
    }

    return normalized.slice(0, 6);
  }

  function normalizeNetworkSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    return {
      timeoutMs: clampInteger(
        source.timeoutMs,
        500,
        30000,
        DEFAULT_CAPTIONS_SETTINGS.network.timeoutMs
      ),
      retries: clampInteger(source.retries, 0, 5, DEFAULT_CAPTIONS_SETTINGS.network.retries),
    };
  }

  function normalizeAssistSettings(raw) {
    const source = raw && typeof raw === "object" ? raw : {};
    const mode = String(source.mode || DEFAULT_CAPTIONS_SETTINGS.assist.mode || "simplify")
      .trim()
      .toLowerCase();
    const allowedModes = new Set(["simplify", "translate", "summarize"]);
    return {
      enabled: source.enabled === true,
      mode: allowedModes.has(mode) ? mode : DEFAULT_CAPTIONS_SETTINGS.assist.mode,
      targetLanguage: String(source.targetLanguage || "")
        .trim()
        .toLowerCase(),
      timeoutMs: clampInteger(
        source.timeoutMs,
        500,
        15000,
        DEFAULT_CAPTIONS_SETTINGS.assist.timeoutMs
      ),
      retries: clampInteger(
        source.retries,
        0,
        3,
        DEFAULT_CAPTIONS_SETTINGS.assist.retries
      ),
    };
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  const api = Object.freeze({
    createCaptionsSettingsStore,
    DEFAULT_CAPTIONS_SETTINGS,
    normalizeSettings,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2SettingsStore = api;
})();
