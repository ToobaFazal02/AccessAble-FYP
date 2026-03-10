"use strict";

(() => {
  const overlayStyles = globalThis.AccessAbleModule2OverlayStyles || {};
  const normalizeOverlaySettings =
    overlayStyles.normalizeOverlaySettings || ((settings) => settings || {});

  const OVERLAY_ID = "accessable-captions-overlay";

  function createCaptionOverlayRenderer(settings) {
    const state = {
      root: null,
      textNode: null,
      statusNode: null,
      settings: normalizeOverlaySettings(settings),
      mounted: false,
      mode: "cue",
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
      if (state.mounted) {
        return;
      }
      const root = document.createElement("section");
      root.id = OVERLAY_ID;
      root.setAttribute("role", "status");
      root.setAttribute("aria-live", "polite");
      root.setAttribute("aria-atomic", "true");
      root.style.position = "fixed";
      root.style.zIndex = "2147483645";
      root.style.left = "50%";
      root.style.transform = "translateX(-50%)";
      root.style.maxWidth = "90vw";
      root.style.width = "fit-content";
      root.style.pointerEvents = "none";
      root.style.display = "none";
      root.style.boxSizing = "border-box";
      root.style.textAlign = "center";
      root.style.fontFamily = '"Segoe UI", Tahoma, Geneva, Verdana, sans-serif';
      root.style.whiteSpace = "pre-wrap";
      root.style.wordBreak = "break-word";

      const textNode = document.createElement("p");
      textNode.className = "accessable-captions-text";
      textNode.style.margin = "0";
      textNode.style.padding = "0";

      const statusNode = document.createElement("p");
      statusNode.className = "accessable-captions-status";
      statusNode.style.margin = "0";
      statusNode.style.padding = "0";

      root.appendChild(textNode);
      root.appendChild(statusNode);
      (document.body || document.documentElement).appendChild(root);

      state.root = root;
      state.textNode = textNode;
      state.statusNode = statusNode;
      state.mounted = true;
      applySettings();
    }

    function destroy() {
      if (!state.root) {
        return;
      }
      state.root.remove();
      state.root = null;
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
      if (!state.root || !state.textNode || !state.statusNode) {
        return;
      }
      state.mode = "cue";
      state.root.style.display = "block";
      state.textNode.style.display = "block";
      state.statusNode.style.display = "none";
      state.textNode.textContent = cue.text;
    }

    function showStatus(message, isError) {
      mount();
      if (!state.root || !state.textNode || !state.statusNode) {
        return;
      }
      state.mode = "status";
      const text = String(message || "").trim();
      if (!text) {
        clear();
        return;
      }
      state.root.style.display = "block";
      state.textNode.style.display = "none";
      state.statusNode.style.display = "block";
      state.statusNode.textContent = text;
      state.statusNode.style.color = isError ? "#ffd2d2" : state.settings.textColor;
    }

    function clear() {
      if (!state.root || !state.textNode || !state.statusNode) {
        return;
      }
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
      state.root.style.boxShadow = "0 4px 20px rgba(0,0,0,0.35)";

      if (settings.position === "top") {
        state.root.style.top = "8vh";
        state.root.style.bottom = "";
      } else if (settings.position === "middle") {
        state.root.style.top = "50%";
        state.root.style.bottom = "";
        state.root.style.transform = "translate(-50%, -50%)";
      } else {
        state.root.style.bottom = "8vh";
        state.root.style.top = "";
        state.root.style.transform = "translateX(-50%)";
      }
    }
  }

  function toRgba(color, opacity) {
    const alpha = Number.isFinite(Number(opacity)) ? Number(opacity) : 0.78;
    const hex = String(color || "").trim();

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

  const api = Object.freeze({
    createCaptionOverlayRenderer,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2CaptionOverlayRenderer = api;
})();
