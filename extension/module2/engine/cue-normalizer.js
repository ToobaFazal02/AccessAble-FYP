"use strict";

(() => {
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const utils = globalThis.AccessAbleModule2AdapterUtils || {};

  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());
  const sanitizeCueText = utils.sanitizeCueText || ((value) => String(value || "").trim());

  function normalizeCue(rawCue, options = {}) {
    if (!rawCue || typeof rawCue !== "object") {
      return null;
    }

    const start = Number(rawCue.start);
    const end = Number(rawCue.end);
    const text = sanitizeCueText(rawCue.text);
    const lang = normalizeLanguageCode(rawCue.lang || options.lang || "und");
    const isAuto = Boolean(rawCue.isAuto ?? options.isAuto);

    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || start < 0) {
      return null;
    }
    if (!text) {
      return null;
    }

    return {
      start,
      end,
      text,
      lang,
      isAuto,
    };
  }

  function normalizeCues(rawCues, options = {}) {
    const entries = Array.isArray(rawCues) ? rawCues : [];
    const maxCues = clampInteger(options.maxCues, 1, 5000, 2000);
    const normalized = [];
    const dedupe = new Set();

    for (let i = 0; i < entries.length && normalized.length < maxCues; i += 1) {
      const cue = normalizeCue(entries[i], options);
      if (!cue) {
        continue;
      }
      const dedupeKey = `${cue.start.toFixed(3)}|${cue.end.toFixed(3)}|${cue.text}|${cue.lang}|${cue.isAuto}`;
      if (dedupe.has(dedupeKey)) {
        continue;
      }
      dedupe.add(dedupeKey);
      normalized.push(cue);
    }

    normalized.sort((a, b) => a.start - b.start || a.end - b.end);
    return normalized;
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  const api = Object.freeze({
    normalizeCue,
    normalizeCues,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2CueNormalizer = api;
})();
