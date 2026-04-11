"use strict";

(() => {
  const { ACTIONS, getDomain } = globalThis.AccessAbleContracts;

  const state = {
    enabled: false,
    fixesApplied: [],
    trapHandler: null,
  };

  function enable() {
    if (state.enabled) {
      return { enabled: true, fixesApplied: [...state.fixesApplied] };
    }

    state.enabled = true;
    state.fixesApplied = [];

    if (injectSkipLink()) {
      pushFix("skip_link");
    }
    if (enhanceFocusIndicators()) {
      pushFix("focus_indicators");
    }
    if (ensureLandmarks()) {
      pushFix("landmarks");
    }
    if (enableTrapEscape()) {
      pushFix("focus_traps");
    }
    if (registerKeyboardShortcutsHint()) {
      pushFix("keyboard_shortcuts");
    }

    void reportFixes();
    return { enabled: true, fixesApplied: [...state.fixesApplied] };
  }

  function disable() {
    if (!state.enabled) {
      return { enabled: false, fixesApplied: [] };
    }

    state.enabled = false;
    state.fixesApplied = [];

    const skip = document.getElementById("accessable-skip-link");
    if (skip) {
      skip.remove();
    }

    document.documentElement.removeAttribute("data-accessable-focus-boost");
    document.removeEventListener("keydown", state.trapHandler, true);
    state.trapHandler = null;

    return { enabled: false, fixesApplied: [] };
  }

  function getStatus() {
    return {
      enabled: state.enabled,
      fixesApplied: [...state.fixesApplied],
    };
  }

  function injectSkipLink() {
    if (document.getElementById("accessable-skip-link")) {
      return false;
    }

    const mainTarget =
      document.querySelector("main") ||
      document.querySelector("[role='main']") ||
      document.querySelector("#content") ||
      document.body.firstElementChild;

    if (!(mainTarget instanceof HTMLElement)) {
      return false;
    }

    if (!mainTarget.id) {
      mainTarget.id = "accessable-main-content";
    }

    const link = document.createElement("a");
    link.id = "accessable-skip-link";
    link.href = `#${mainTarget.id}`;
    link.className = "accessable-skip-link";
    link.textContent = "Skip to main content";
    link.setAttribute("aria-label", "Skip to main content");

    document.body.prepend(link);
    return true;
  }

  function enhanceFocusIndicators() {
    if (document.documentElement.getAttribute("data-accessable-focus-boost") === "true") {
      return false;
    }
    document.documentElement.setAttribute("data-accessable-focus-boost", "true");
    return true;
  }

  function ensureLandmarks() {
    const hasMain = document.querySelector("main, [role='main']") !== null;
    const hasBanner = document.querySelector("[role='banner']") !== null;
    const hasNav = document.querySelector("[role='navigation']") !== null;
    const hasContentInfo = document.querySelector("[role='contentinfo']") !== null;
    let applied = false;

    if (!hasMain && document.body) {
      document.body.setAttribute("role", "main");
      applied = true;
    }

    const header = document.querySelector("header");
    if (header && !hasBanner && !header.getAttribute("role") &&
        !header.closest("main, article, section")) {
      header.setAttribute("role", "banner");
      applied = true;
    }

    const nav = document.querySelector("nav");
    if (nav && !hasNav && !nav.getAttribute("role")) {
      nav.setAttribute("role", "navigation");
      applied = true;
    }

    const footer = document.querySelector("footer");
    if (footer && !hasContentInfo && !footer.getAttribute("role")) {
      footer.setAttribute("role", "contentinfo");
      applied = true;
    }

    return applied;
  }

  function enableTrapEscape() {
    if (state.trapHandler) {
      return false;
    }

    state.trapHandler = (event) => {
      if (!state.enabled) {
        return;
      }
      if (event.key !== "Escape") {
        return;
      }
      const dialog = document.querySelector(
        "[role='dialog'][aria-modal='true'], dialog[open]"
      );
      if (!(dialog instanceof HTMLElement)) {
        return;
      }

      const closeBtn =
        dialog.querySelector("[aria-label='Close']") ||
        dialog.querySelector("[data-dismiss]") ||
        dialog.querySelector("button");
      if (closeBtn instanceof HTMLElement) {
        closeBtn.click();
      } else {
        dialog.blur();
      }
    };

    document.addEventListener("keydown", state.trapHandler, true);
    return true;
  }

  function registerKeyboardShortcutsHint() {
    if (document.getElementById("accessable-shortcut-hint")) {
      return false;
    }

    const hint = document.createElement("div");
    hint.id = "accessable-shortcut-hint";
    hint.className = "accessable-shortcut-hint";
    hint.setAttribute("role", "status");
    hint.setAttribute("aria-live", "polite");
    hint.textContent = "Accessibility keyboard support enabled.";
    document.body.appendChild(hint);

    window.setTimeout(() => {
      const node = document.getElementById("accessable-shortcut-hint");
      if (node) {
        node.remove();
      }
    }, 2500);
    return true;
  }

  function pushFix(fixType) {
    if (!state.fixesApplied.includes(fixType)) {
      state.fixesApplied.push(fixType);
    }
  }

  async function reportFixes() {
    if (state.fixesApplied.length === 0) {
      return;
    }

    await chrome.runtime.sendMessage({
      action: ACTIONS.KEYBOARD_TRACK_FIXES,
      payload: {
        url: window.location.href,
        domain: getDomain(window.location.href),
        fixesApplied: [...state.fixesApplied],
        userAgent: `AccessAble Extension ${chrome.runtime.getManifest().version}`,
      },
    });
  }

  globalThis.AccessAbleModuleKeyboard = {
    enable,
    disable,
    getStatus,
  };
})();
