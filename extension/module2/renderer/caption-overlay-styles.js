"use strict";

(() => {
  const DEFAULT_OVERLAY_SETTINGS = Object.freeze({
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
  });

  function normalizeOverlaySettings(rawSettings) {
    const source = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    const merged = {
      ...DEFAULT_OVERLAY_SETTINGS,
      ...source,
    };

    const normalized = {
      position: normalizePosition(merged.position),
      fontSizePx: clampNumber(merged.fontSizePx, 12, 48, DEFAULT_OVERLAY_SETTINGS.fontSizePx),
      lineHeight: clampNumber(merged.lineHeight, 1, 2.2, DEFAULT_OVERLAY_SETTINGS.lineHeight),
      textColor: normalizeColor(merged.textColor, DEFAULT_OVERLAY_SETTINGS.textColor),
      backgroundColor: normalizeColor(merged.backgroundColor, DEFAULT_OVERLAY_SETTINGS.backgroundColor),
      backgroundOpacity: clampNumber(merged.backgroundOpacity, 0.1, 1, DEFAULT_OVERLAY_SETTINGS.backgroundOpacity),
      maxWidthPercent: clampNumber(
        merged.maxWidthPercent,
        40,
        100,
        DEFAULT_OVERLAY_SETTINGS.maxWidthPercent
      ),
      paddingPx: clampNumber(merged.paddingPx, 4, 24, DEFAULT_OVERLAY_SETTINGS.paddingPx),
      borderRadiusPx: clampNumber(
        merged.borderRadiusPx,
        0,
        20,
        DEFAULT_OVERLAY_SETTINGS.borderRadiusPx
      ),
      fontWeight: clampNumber(merged.fontWeight, 400, 800, DEFAULT_OVERLAY_SETTINGS.fontWeight),
    };

    return normalized;
  }

  function normalizePosition(value) {
    const raw = String(value || "").trim().toLowerCase();
    if (raw === "top" || raw === "middle" || raw === "bottom") {
      return raw;
    }
    return DEFAULT_OVERLAY_SETTINGS.position;
  }

  function normalizeColor(value, fallback) {
    const text = String(value || "").trim();
    if (/^#[0-9a-f]{3,8}$/i.test(text)) {
      return text;
    }
    if (/^rgba?\([^)]*\)$/i.test(text)) {
      return text;
    }
    return fallback;
  }

  function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, numeric));
  }

  const api = Object.freeze({
    DEFAULT_OVERLAY_SETTINGS,
    normalizeOverlaySettings,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2OverlayStyles = api;
})();
