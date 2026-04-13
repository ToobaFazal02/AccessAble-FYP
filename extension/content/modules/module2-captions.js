"use strict";

(() => {
  const sharedContracts = globalThis.AccessAbleContracts || {};
  const ACTIONS = sharedContracts.ACTIONS || {};
  const module2 = globalThis.AccessAbleModule2 || null;

  function enableHighlights() {
    const status = module2?.enable?.() || { enabled: false };
    if (status.enabled) { pollCaptionStatus(); }
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function disableHighlights() {
    const status = module2?.disable?.() || { enabled: false };
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function getStatus() {
    const status = module2?.getStatus?.() || { enabled: false };
    return {
      ...status,
      highlighted: Boolean(status.enabled),
    };
  }

  function scanCandidates() {
    return module2?.scanCandidates?.() || [];
  }

  function getActionContracts() {
    return ACTIONS;
  }

  // Poll module2 status until a terminal stage is reached, then log.
  // Uses setInterval so it never blocks the enableHighlights() return path.
  const TERMINAL_STAGES = new Set([
    "ready", "no_tracks", "no_cues", "error",
    "backend_unreachable", "unsupported", "unavailable", "parser_error",
  ]);

  function pollCaptionStatus() {
    let attempts = 0;
    const MAX_ATTEMPTS = 12; // 12 × 500 ms = 6 s max wait
    const id = window.setInterval(() => {
      attempts += 1;
      const s = module2?.getStatus?.() || {};
      if (TERMINAL_STAGES.has(s.stage) || attempts >= MAX_ATTEMPTS) {
        window.clearInterval(id);
        if (s.available) {
          void globalThis.AccessAbleLogs?.log(
            "module2", "captions_loaded", "success",
            `lang:${s.trackLang || "?"} cues:${s.cueCount || 0}`,
            window.location.href
          );
        } else if (s.stage && s.stage !== "idle" && s.stage !== "discovering") {
          void globalThis.AccessAbleLogs?.log(
            "module2", "captions_unavailable", "error",
            s.reason || s.stage || "No captions found",
            window.location.href
          );
        }
      }
    }, 500);
  }

  globalThis.AccessAbleModuleCaptions = {
    scanCandidates,
    enableHighlights,
    disableHighlights,
    getStatus,
    getActionContracts,
  };
})();
