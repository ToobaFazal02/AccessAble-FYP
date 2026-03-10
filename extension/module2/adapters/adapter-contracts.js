"use strict";

(() => {
  /**
   * @typedef {Object} NormalizedCue
   * @property {number} start
   * @property {number} end
   * @property {string} text
   * @property {string} lang
   * @property {boolean} isAuto
   */

  /**
   * @typedef {Object} CaptionTrack
   * @property {string} id
   * @property {string} lang
   * @property {string} label
   * @property {boolean} isAuto
   * @property {string} [kind]
   * @property {string} [src]
   * @property {string} source
   */

  /**
   * @typedef {Object} CaptionContext
   * @property {HTMLVideoElement|null} videoElement
   * @property {string} mediaUrl
   * @property {string} pageUrl
   * @property {string} host
   */

  /**
   * @typedef {Object} CaptionsAdapter
   * @property {(context: CaptionContext) => boolean} supports
   * @property {(context: CaptionContext, options?: {signal?: AbortSignal}) => Promise<CaptionTrack[]>} discoverTracks
   * @property {(track: CaptionTrack, context: CaptionContext, options?: {signal?: AbortSignal, timeoutMs?: number, retries?: number}) => Promise<NormalizedCue[]>} fetchCues
   * @property {(context: CaptionContext, onTime: (currentTime: number) => void) => (() => void)} bindTimeSource
   * @property {(context: CaptionContext) => string} getContextKey
   * @property {() => void} destroy
   */

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function normalizeLanguageCode(value) {
    const language = String(value || "").trim().toLowerCase();
    if (!language) {
      return "und";
    }

    if (language.includes("-")) {
      return language.replace(/_/g, "-");
    }

    if (language.length === 2 || language.length === 3) {
      return language;
    }

    return language.slice(0, 8);
  }

  function isValidNormalizedCue(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    if (!isFiniteNumber(value.start) || !isFiniteNumber(value.end)) {
      return false;
    }

    if (value.end <= value.start || value.start < 0) {
      return false;
    }

    if (typeof value.text !== "string" || value.text.trim().length === 0) {
      return false;
    }

    if (typeof value.lang !== "string" || value.lang.trim().length === 0) {
      return false;
    }

    return typeof value.isAuto === "boolean";
  }

  const api = Object.freeze({
    isFiniteNumber,
    normalizeLanguageCode,
    isValidNormalizedCue,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2AdapterContracts = api;
})();
