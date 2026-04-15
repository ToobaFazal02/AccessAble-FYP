"use strict";

(() => {
  const overlayStyles = globalThis.AccessAbleModule2OverlayStyles || {};
  const normalizeOverlaySettings =
    overlayStyles.normalizeOverlaySettings || ((settings) => settings || {});

  const OVERLAY_ID = "accessable-captions-overlay";
  const OVERLAY_OWNER_ATTR = "data-accessable-overlay-owner";
  const STATUS_AUTO_HIDE_MS = 2500;
  const STATUS_DEDUPE_WINDOW_MS = 5000;

  function createCaptionOverlayRenderer(settings) {
    const state = {
      root: null,
      metaNode: null,
      textNode: null,
      statusNode: null,
      settings: normalizeOverlaySettings(settings),
      mounted: false,
      mode: "cue",
      statusTimerId: 0,
      statusToken: 0,
      lastStatusKey: "",
      lastStatusAt: 0,
      instanceId: `m2_${Date.now().toString(36)}_${Math.random().toString(16).slice(2, 8)}`,
    };

    return {
      mount,
      destroy,
      updateSettings,
      showCue,
      showStatus,
      clear,
    };

    function mount() {
      if (state.mounted && state.root) {
        return;
      }
      const existing = document.getElementById(OVERLAY_ID);
      if (existing) {
        const metaNode = existing.querySelector(".accessable-captions-meta");
        const textNode = existing.querySelector(".accessable-captions-text");
        const statusNode = existing.querySelector(".accessable-captions-status");

        if (metaNode && textNode && statusNode) {
          state.root = existing;
          state.metaNode = metaNode;
          state.textNode = textNode;
          state.statusNode = statusNode;
          state.mounted = true;
          claimOwnership();
          applyBaseStyles();
          clear();
          applySettings();
          return;
        }

        existing.remove();
      }

      const root = document.createElement("section");
      const metaNode = document.createElement("p");
      const textNode = document.createElement("p");
      const statusNode = document.createElement("p");

      root.id = OVERLAY_ID;
      root.appendChild(metaNode);
      root.appendChild(textNode);
      root.appendChild(statusNode);
      (document.body || document.documentElement).appendChild(root);

      metaNode.className = "accessable-captions-meta";
      metaNode.style.margin = "0 0 6px";
      metaNode.style.padding = "0";
      metaNode.style.fontSize = "12px";
      metaNode.style.fontWeight = "700";
      metaNode.style.opacity = "0.9";
      metaNode.style.textTransform = "none";
      metaNode.style.letterSpacing = "0.01em";

      textNode.className = "accessable-captions-text";
      textNode.style.margin = "0";
      textNode.style.padding = "0";

      statusNode.className = "accessable-captions-status";
      statusNode.style.margin = "0";
      statusNode.style.padding = "0";

      state.root = root;
      state.metaNode = metaNode;
      state.textNode = textNode;
      state.statusNode = statusNode;
      state.mounted = true;
      claimOwnership();
      applyBaseStyles();
      applySettings();
    }

    function destroy() {
      if (!state.root) {
        return;
      }
      clearStatusTimer();
      if (isOwner()) {
        state.root.remove();
      }
      state.root = null;
      state.metaNode = null;
      state.textNode = null;
      state.statusNode = null;
      state.mounted = false;
    }

    function updateSettings(nextSettings) {
      state.settings = normalizeOverlaySettings(nextSettings);
      applySettings();
    }

    function showCue(cue) {
      if (!cue || typeof cue.text !== "string" || cue.text.trim().length === 0) {
        clear();
        return;
      }
      mount();
      if (!state.root || !state.metaNode || !state.textNode || !state.statusNode || !isOwner()) {
        return;
      }
      state.mode = "cue";
      clearStatusTimer();
      state.root.style.display = "block";
      state.metaNode.style.display = "block";
      state.textNode.style.display = "block";
      state.statusNode.style.display = "none";
      const cueLang = String(cue.lang || "und").toUpperCase();
      const cueKind = cue.isAuto ? "AUTO" : "MANUAL";
      state.metaNode.textContent = `AccessAble Captions · ${cueLang} · ${cueKind}`;
      state.textNode.textContent = cue.text;
      state.statusNode.textContent = "";
    }

    function showStatus(message, isError, options = {}) {
      mount();
      if (!state.root || !state.metaNode || !state.textNode || !state.statusNode || !isOwner()) {
        return;
      }
      const text = String(message || "").trim();
      if (!text) {
        clear();
        return;
      }

      const code = String(options.code || "status").trim() || "status";
      const statusKey = `${code}|${text}`;
      const now = Date.now();
      if (statusKey === state.lastStatusKey && now - state.lastStatusAt < STATUS_DEDUPE_WINDOW_MS) {
        return;
      }
      state.lastStatusKey = statusKey;
      state.lastStatusAt = now;

      state.mode = "status";
      clearStatusTimer();
      state.root.style.display = "block";
      state.metaNode.style.display = "none";
      state.textNode.style.display = "none";
      state.statusNode.style.display = "block";
      state.statusNode.textContent = text;
      state.statusNode.style.color = isError ? "#ffd2d2" : state.settings.textColor;

      state.statusToken += 1;
      const token = state.statusToken;
      const ttlMs = clampInteger(options.ttlMs, 50, 20000, STATUS_AUTO_HIDE_MS);
      state.statusTimerId = setTimeout(() => {
        if (!state.root || !isOwner() || state.mode !== "status") {
          return;
        }
        if (state.statusToken !== token) {
          return;
        }
        clear();
      }, ttlMs);
    }

    function clear() {
      if (!state.root || !state.metaNode || !state.textNode || !state.statusNode || !isOwner()) {
        return;
      }
      clearStatusTimer();
      state.metaNode.textContent = "";
      state.textNode.textContent = "";
      state.statusNode.textContent = "";
      state.root.style.display = "none";
    }

    function applySettings() {
      if (!state.root) {
        return;
      }

      const settings = state.settings;
      state.root.style.maxWidth = `${settings.maxWidthPercent}vw`;
      state.root.style.padding = `${settings.paddingPx}px`;
      state.root.style.borderRadius = `${settings.borderRadiusPx}px`;
      state.root.style.fontSize = `${settings.fontSizePx}px`;
      state.root.style.fontWeight = String(settings.fontWeight);
      state.root.style.lineHeight = String(settings.lineHeight);
      state.root.style.color = settings.textColor;
      state.root.style.background = toRgba(settings.backgroundColor, settings.backgroundOpacity);
      state.root.style.boxShadow = "0 10px 28px rgba(0,0,0,0.42)";
      state.root.style.backdropFilter = "blur(2px)";

      if (settings.position === "top") {
        state.root.style.top = "8vh";
        state.root.style.bottom = "";
        state.root.style.transform = "translateX(-50%)";
      } else if (settings.position === "middle") {
        state.root.style.top = "50%";
        state.root.style.bottom = "";
        state.root.style.transform = "translate(-50%, -50%)";
      } else {
        state.root.style.bottom = "max(8vh, 64px)";
        state.root.style.top = "";
        state.root.style.transform = "translateX(-50%)";
      }
    }

    function applyBaseStyles() {
      if (!state.root) {
        return;
      }

      state.root.setAttribute("role", "status");
      state.root.setAttribute("aria-live", "polite");
      state.root.setAttribute("aria-atomic", "true");
      state.root.style.position = "fixed";
      state.root.style.zIndex = "2147483645";
      state.root.style.left = "50%";
      state.root.style.transform = "translateX(-50%)";
      state.root.style.maxWidth = "90vw";
      state.root.style.width = "fit-content";
      state.root.style.pointerEvents = "none";
      state.root.style.display = "none";
      state.root.style.boxSizing = "border-box";
      state.root.style.textAlign = "center";
      state.root.style.fontFamily = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
      state.root.style.whiteSpace = "pre-wrap";
      state.root.style.wordBreak = "break-word";
      state.root.style.transition = "opacity 120ms ease";
      state.root.style.opacity = "0.98";
    }

    function clampInteger(value, min, max, fallback) {
      const numeric = Number(value);
      if (!Number.isFinite(numeric)) {
        return fallback;
      }
      return Math.min(max, Math.max(min, Math.round(numeric)));
    }

    function clearStatusTimer() {
      if (!state.statusTimerId) {
        return;
      }
      clearTimeout(state.statusTimerId);
      state.statusTimerId = 0;
    }

    function claimOwnership() {
      if (!state.root) {
        return;
      }
      state.root.setAttribute(OVERLAY_OWNER_ATTR, state.instanceId);
    }

    function isOwner() {
      return (
        Boolean(state.root) &&
        state.root.getAttribute(OVERLAY_OWNER_ATTR) === state.instanceId
      );
    }
  }

  function toRgba(color, opacity) {
    const alpha = Number.isFinite(Number(opacity)) ? Number(opacity) : 0.78;
    const raw = String(color || "").trim();
    const hex = expandHex3(raw);

    if (/^rgba?\(/i.test(hex)) {
      return hex;
    }

    if (!/^#[0-9a-f]{6}$/i.test(hex)) {
      return `rgba(0,0,0,${alpha})`;
    }

    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  function expandHex3(s) {
    if (/^#[0-9a-f]{3}$/i.test(s)) {
      return "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
    }
    return s;
  }

  const api = Object.freeze({
    createCaptionOverlayRenderer,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2CaptionOverlayRenderer = api;
})();
