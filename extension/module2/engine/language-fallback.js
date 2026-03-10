"use strict";

(() => {
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());

  function chooseBestTrack(tracks, preferredLanguages) {
    const list = Array.isArray(tracks) ? tracks.filter(Boolean) : [];
    if (list.length === 0) {
      return null;
    }

    const preferenceOrder = buildPreferenceOrder(preferredLanguages);
    let bestTrack = null;
    let bestScore = Number.POSITIVE_INFINITY;

    for (const track of list) {
      const score = scoreTrack(track, preferenceOrder);
      if (score < bestScore) {
        bestScore = score;
        bestTrack = track;
      }
    }

    return bestTrack || list[0];
  }

  function buildPreferenceOrder(preferredLanguages) {
    const raw = Array.isArray(preferredLanguages)
      ? preferredLanguages
      : String(preferredLanguages || "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean);

    const normalized = [];
    const seen = new Set();

    for (const language of raw) {
      const code = normalizeLanguageCode(language);
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      normalized.push(code);
    }

    if (!seen.has("en")) {
      normalized.push("en");
    }

    if (!seen.has("und")) {
      normalized.push("und");
    }

    return normalized;
  }

  function scoreTrack(track, preferenceOrder) {
    const lang = normalizeLanguageCode(track?.lang || "und");
    const baseLang = lang.split("-")[0];
    const isAuto = Boolean(track?.isAuto);

    let preferenceIndex = preferenceOrder.length + 10;
    for (let i = 0; i < preferenceOrder.length; i += 1) {
      const preferred = preferenceOrder[i];
      const preferredBase = preferred.split("-")[0];
      if (lang === preferred) {
        preferenceIndex = i;
        break;
      }
      if (baseLang && baseLang === preferredBase) {
        preferenceIndex = i + 0.5;
        break;
      }
    }

    return preferenceIndex * 10 + (isAuto ? 3 : 0);
  }

  const api = Object.freeze({
    chooseBestTrack,
    buildPreferenceOrder,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2LanguageFallback = api;
})();
