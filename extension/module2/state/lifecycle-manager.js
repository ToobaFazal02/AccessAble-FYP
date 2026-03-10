"use strict";

(() => {
  function createLifecycleManager(options = {}) {
    const onRebind = typeof options.onRebind === "function" ? options.onRebind : () => {};
    const debounceMs = clampInteger(options.debounceMs, 100, 5000, 500);

    const state = {
      observer: null,
      timerId: 0,
      hrefPollId: 0,
      lastHref: "",
      started: false,
      cleanupHandlers: [],
    };

    return {
      start,
      stop,
      triggerRebind: scheduleRebind,
    };

    function start() {
      if (state.started) {
        return;
      }
      state.started = true;
      state.lastHref = window.location.href;

      attachMutationObserver();
      attachNavigationEvents();
      state.hrefPollId = window.setInterval(checkHrefChange, 600);
    }

    function stop() {
      if (!state.started) {
        return;
      }
      state.started = false;

      if (state.observer) {
        state.observer.disconnect();
        state.observer = null;
      }

      if (state.timerId) {
        window.clearTimeout(state.timerId);
        state.timerId = 0;
      }

      if (state.hrefPollId) {
        window.clearInterval(state.hrefPollId);
        state.hrefPollId = 0;
      }

      for (const cleanup of state.cleanupHandlers) {
        try {
          cleanup();
        } catch (_) {
          // Ignore cleanup errors.
        }
      }
      state.cleanupHandlers = [];
    }

    function scheduleRebind() {
      if (!state.started) {
        return;
      }
      if (state.timerId) {
        window.clearTimeout(state.timerId);
      }
      state.timerId = window.setTimeout(() => {
        state.timerId = 0;
        onRebind();
      }, debounceMs);
    }

    function attachMutationObserver() {
      if (!document.documentElement || state.observer) {
        return;
      }

      state.observer = new MutationObserver((mutations) => {
        let shouldRebind = false;
        for (const mutation of mutations) {
          if (mutation.type === "childList") {
            if (containsMediaNode(mutation.addedNodes) || containsMediaNode(mutation.removedNodes)) {
              shouldRebind = true;
              break;
            }
          }
        }
        if (shouldRebind) {
          scheduleRebind();
        }
      });

      state.observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
      });
    }

    function attachNavigationEvents() {
      const events = [
        "popstate",
        "hashchange",
        "yt-navigate-finish",
        "yt-page-data-updated",
      ];

      for (const eventName of events) {
        const handler = () => scheduleRebind();
        window.addEventListener(eventName, handler, true);
        state.cleanupHandlers.push(() => window.removeEventListener(eventName, handler, true));
      }
    }

    function checkHrefChange() {
      const currentHref = window.location.href;
      if (currentHref === state.lastHref) {
        return;
      }
      state.lastHref = currentHref;
      scheduleRebind();
    }
  }

  function containsMediaNode(nodeList) {
    for (const node of nodeList || []) {
      if (!(node instanceof HTMLElement)) {
        continue;
      }
      if (node.tagName === "VIDEO" || node.tagName === "IFRAME") {
        return true;
      }
      if (node.querySelector("video, iframe")) {
        return true;
      }
    }
    return false;
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  const api = Object.freeze({
    createLifecycleManager,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2LifecycleManager = api;
})();
