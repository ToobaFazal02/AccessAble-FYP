"use strict";

(() => {
  const languageFallback = globalThis.AccessAbleModule2LanguageFallback || {};
  const activeCueSelector = globalThis.AccessAbleModule2ActiveCueSelector || {};
  const adapterUtils = globalThis.AccessAbleModule2AdapterUtils || {};

  const chooseBestTrack = languageFallback.chooseBestTrack || (() => null);
  const findActiveCue = activeCueSelector.findActiveCue || (() => ({ cue: null, index: -1 }));
  const debugLog = adapterUtils.debugLog || (() => {});

  function createCaptionEngine(options = {}) {
    const adapters = Array.isArray(options.adapters) ? options.adapters.filter(Boolean) : [];
    const cueCache = options.cueCache || null;
    const assistService = options.assistService || null;
    const onCue = typeof options.onCue === "function" ? options.onCue : () => {};
    const onStatus = typeof options.onStatus === "function" ? options.onStatus : () => {};

    const state = {
      enabled: false,
      adapter: null,
      context: null,
      track: null,
      cues: [],
      cueKey: "",
      activeCueIndex: -1,
      unbindTime: null,
      abortController: null,
      settings: {},
      lastError: "",
      lastStage: "",
      assistRequestId: 0,
    };

    return {
      start,
      rebind,
      stop,
      getStatus,
      updateSettings,
    };

    async function start(context, settings) {
      state.enabled = true;
      if (settings && typeof settings === "object") {
        state.settings = settings;
      }
      await loadContext(context);
      return getStatus();
    }

    async function rebind(context, settings) {
      if (settings && typeof settings === "object") {
        state.settings = settings;
      }
      if (!state.enabled) {
        return getStatus();
      }
      await loadContext(context);
      return getStatus();
    }

    async function updateSettings(settings) {
      if (settings && typeof settings === "object") {
        state.settings = settings;
      }
      if (!state.enabled || !state.context) {
        return getStatus();
      }
      await loadContext(state.context);
      return getStatus();
    }

    async function loadContext(context) {
      resetBinding();
      state.context = context || null;
      state.track = null;
      state.cues = [];
      state.cueKey = "";
      state.activeCueIndex = -1;
      state.lastError = "";

      if (!context?.videoElement) {
        safeStatus({
          stage: "unavailable",
          available: false,
          reason: "No active video element found",
        });
        safeCue(null);
        return;
      }

      const adapter = adapters.find((item) => {
        try {
          return item.supports(context);
        } catch (_) {
          return false;
        }
      });

      if (!adapter) {
        safeStatus({
          stage: "unsupported",
          available: false,
          reason: "No captions adapter supports this video source",
        });
        safeCue(null);
        return;
      }

      state.adapter = adapter;
      state.abortController = new AbortController();
      debugLog(Boolean(state.settings?.debug), "adapter_selected", {
        adapter: adapter.name,
      });

      try {
        safeStatus({
          stage: "discovering",
          available: true,
          adapter: adapter.name,
        });

        const tracks = await adapter.discoverTracks(context, {
          signal: state.abortController.signal,
          debug: Boolean(state.settings?.debug),
        });
        if (!state.enabled || state.abortController.signal.aborted) {
          return;
        }

        const preferred = Array.isArray(state.settings.preferredLanguages)
          ? state.settings.preferredLanguages
          : [];
        const selectedTrack = chooseBestTrack(tracks, preferred);

        if (!selectedTrack) {
          safeStatus({
            stage: "no_tracks",
            available: false,
            adapter: adapter.name,
            reason: "No caption tracks were found",
          });
          safeCue(null);
          return;
        }

        state.track = selectedTrack;
        state.cueKey = `${adapter.getContextKey(context)}:${selectedTrack.lang}:${selectedTrack.isAuto ? 1 : 0}`;

        let cues = [];
        if (cueCache && typeof cueCache.get === "function") {
          cues = await cueCache.get(state.cueKey);
          if (Array.isArray(cues) && cues.length > 0) {
            debugLog(Boolean(state.settings?.debug), "cue_fetch_source", {
              source: "cache",
              cueCount: cues.length,
              key: state.cueKey,
            });
          }
        }

        if (!Array.isArray(cues) || cues.length === 0) {
          const timeoutMs = Number(state.settings?.network?.timeoutMs) || 4000;
          const retries = Number(state.settings?.network?.retries) || 2;
          cues = await adapter.fetchCues(selectedTrack, context, {
            signal: state.abortController.signal,
            timeoutMs,
            retries,
            debug: Boolean(state.settings?.debug),
          });
          if (cueCache && typeof cueCache.set === "function" && Array.isArray(cues) && cues.length > 0) {
            await cueCache.set(state.cueKey, cues);
          }
        }

        if (!state.enabled || state.abortController.signal.aborted) {
          return;
        }

        if (!Array.isArray(cues) || cues.length === 0) {
          safeStatus({
            stage: "no_cues",
            available: false,
            adapter: adapter.name,
            language: selectedTrack.lang,
            reason: "Caption tracks were found but no cues could be loaded",
          });
          safeCue(null);
          return;
        }

        state.cues = cues;
        state.unbindTime = adapter.bindTimeSource(context, onTimeUpdate);

        safeStatus({
          stage: "ready",
          available: true,
          adapter: adapter.name,
          language: selectedTrack.lang,
          cueCount: cues.length,
          isAuto: Boolean(selectedTrack.isAuto),
        });

        onTimeUpdate(Number(context.videoElement.currentTime) || 0);
        void maybeAssistCues(cues, selectedTrack, context);
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        state.lastError = error?.message || "Caption engine failed";
        const errorCode = String(error?.code || "");
        const stage =
          errorCode === "backend_unreachable"
            ? "backend_unreachable"
            : errorCode === "parser_error"
              ? "parser_error"
              : "error";
        safeStatus({
          stage,
          available: false,
          adapter: adapter?.name || "",
          reason: state.lastError,
        });
        safeCue(null);
      }
    }

    function onTimeUpdate(currentTime) {
      if (!state.enabled || !Array.isArray(state.cues) || state.cues.length === 0) {
        return;
      }
      const match = findActiveCue(state.cues, currentTime, state.activeCueIndex);
      state.activeCueIndex = match.index;
      safeCue(match.cue);
    }

    function stop() {
      state.enabled = false;
      state.lastError = "";
      resetBinding();
      safeCue(null);
      safeStatus({
        stage: "disabled",
        available: false,
      });
      return getStatus();
    }

    function getStatus() {
      return {
        enabled: state.enabled,
        adapter: state.adapter?.name || "",
        trackLang: state.track?.lang || "",
        isAuto: Boolean(state.track?.isAuto),
        cueCount: Array.isArray(state.cues) ? state.cues.length : 0,
        available: Boolean(state.track && Array.isArray(state.cues) && state.cues.length > 0),
        lastError: state.lastError,
      };
    }

    function resetBinding() {
      if (typeof state.unbindTime === "function") {
        try {
          state.unbindTime();
        } catch (_) {
          // Ignore cleanup errors.
        }
      }
      state.unbindTime = null;

      if (state.abortController) {
        state.abortController.abort();
      }
      state.abortController = null;
      state.assistRequestId += 1;

      if (state.adapter && typeof state.adapter.destroy === "function") {
        try {
          state.adapter.destroy();
        } catch (_) {
          // Ignore cleanup errors.
        }
      }
      state.adapter = null;
    }

    function safeCue(cue) {
      try {
        onCue(cue);
      } catch (_) {
        // Ignore observer callback errors.
      }
    }

    function safeStatus(payload) {
      try {
        if (payload?.stage && payload.stage !== state.lastStage) {
          debugLog(Boolean(state.settings?.debug), "engine_status", {
            from: state.lastStage || "none",
            to: payload.stage,
            reason: payload.reason || "",
          });
          state.lastStage = payload.stage;
        }
        onStatus(payload);
      } catch (_) {
        // Ignore observer callback errors.
      }
    }

    async function maybeAssistCues(baseCues, track, context) {
      if (!assistService || typeof assistService.request !== "function") {
        return;
      }

      const assistSettings = state.settings?.assist;
      if (!assistSettings || assistSettings.enabled !== true) {
        return;
      }

      const mode = String(assistSettings.mode || "").toLowerCase();
      if (!["simplify", "translate", "summarize"].includes(mode)) {
        return;
      }

      if (!Array.isArray(baseCues) || baseCues.length === 0) {
        return;
      }

      const requestId = (state.assistRequestId += 1);

      try {
        const assisted = await assistService.request({
          mode,
          cues: baseCues,
          track,
          context,
          settings: assistSettings,
          signal: state.abortController?.signal,
          debug: Boolean(state.settings?.debug),
          telemetryEnabled: state.settings?.telemetryEnabled === true,
        });

        if (
          !state.enabled ||
          state.abortController?.signal.aborted ||
          requestId !== state.assistRequestId
        ) {
          return;
        }

        if (Array.isArray(assisted) && assisted.length > 0) {
          state.cues = assisted;
          state.activeCueIndex = -1;
          debugLog(Boolean(state.settings?.debug), "assist_applied", {
            mode,
            cueCount: assisted.length,
          });
          onTimeUpdate(Number(context?.videoElement?.currentTime) || 0);
        }
      } catch (error) {
        if (error?.name === "AbortError") {
          return;
        }
        debugLog(Boolean(state.settings?.debug), "assist_failed", {
          mode,
          error: error?.message || "Assist request failed",
        });
      }
    }
  }

  const api = Object.freeze({
    createCaptionEngine,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2CaptionEngine = api;
})();
