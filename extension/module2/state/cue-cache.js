"use strict";

(() => {
  const sharedContracts = globalThis.AccessAbleContracts || {};
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const utils = globalThis.AccessAbleModule2AdapterUtils || {};
  const cueNormalizer = globalThis.AccessAbleModule2CueNormalizer || {};

  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());
  const simpleHash = utils.simpleHash || ((value) => String(value || ""));
  const normalizeCues = cueNormalizer.normalizeCues || ((items) => items || []);

  function createCueCache(options = {}) {
    const storagePrefix = `${sharedContracts.STORAGE_KEYS?.CACHE_PREFIX || "accessable_cache_"}m2cue_`;
    const ttlMs =
      Number(options.ttlMs) ||
      Number(sharedContracts.CACHE_POLICY?.CAPTIONS_CUE_TTL_MS) ||
      24 * 60 * 60 * 1000;
    const maxCuesPerEntry = clampInteger(options.maxCuesPerEntry, 20, 5000, 2000);

    return {
      get,
      set,
      remove,
      buildKey,
      clearExpired,
    };

    function buildKey(rawKey, language, isAuto) {
      const base = String(rawKey || "unknown");
      const lang = normalizeLanguageCode(language || "und");
      const auto = isAuto ? "a" : "m";
      return `${storagePrefix}${simpleHash(`${base}:${lang}:${auto}`)}`;
    }

    async function get(rawKey, language = "und", isAuto = false) {
      const key = buildKey(rawKey, language, isAuto);
      const data = await chrome.storage.local.get([key]);
      const entry = data[key];
      if (!entry || typeof entry !== "object") {
        return [];
      }

      const savedAt = Number(entry.savedAt || 0);
      if (!Number.isFinite(savedAt) || Date.now() - savedAt > ttlMs) {
        await chrome.storage.local.remove([key]);
        return [];
      }

      const cues = normalizeCues(entry.value, { maxCues: maxCuesPerEntry });
      return cues;
    }

    async function set(rawKey, cues, language = "und", isAuto = false) {
      const normalized = normalizeCues(cues, { maxCues: maxCuesPerEntry });
      if (normalized.length === 0) {
        return;
      }
      const key = buildKey(rawKey, language, isAuto);
      await chrome.storage.local.set({
        [key]: {
          savedAt: Date.now(),
          value: normalized,
        },
      });
    }

    async function remove(rawKey, language = "und", isAuto = false) {
      const key = buildKey(rawKey, language, isAuto);
      await chrome.storage.local.remove([key]);
    }

    async function clearExpired() {
      const all = await chrome.storage.local.get(null);
      const keysToDelete = [];
      const now = Date.now();

      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith(storagePrefix)) {
          continue;
        }
        const savedAt = Number(value?.savedAt || 0);
        if (!Number.isFinite(savedAt) || now - savedAt > ttlMs) {
          keysToDelete.push(key);
        }
      }

      if (keysToDelete.length > 0) {
        await chrome.storage.local.remove(keysToDelete);
      }
      return keysToDelete.length;
    }
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  const api = Object.freeze({
    createCueCache,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2CueCache = api;
})();
