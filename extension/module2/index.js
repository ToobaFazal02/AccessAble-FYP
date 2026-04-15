"use strict";

(() => {
  const adaptersYouTube = globalThis.AccessAbleModule2YouTubeAdapter || {};
  const adaptersHTML5 = globalThis.AccessAbleModule2HTML5TrackAdapter || {};
  const engineApi = globalThis.AccessAbleModule2CaptionEngine || {};
  const rendererApi = globalThis.AccessAbleModule2CaptionOverlayRenderer || {};
  const settingsStoreApi = globalThis.AccessAbleModule2SettingsStore || {};
  const cueCacheApi = globalThis.AccessAbleModule2CueCache || {};
  const lifecycleApi = globalThis.AccessAbleModule2LifecycleManager || {};
  const statusMapperApi = globalThis.AccessAbleModule2StatusMapper || {};
  const assistServiceApi = globalThis.AccessAbleModule2AssistService || {};

  const createYouTubeAdapter = adaptersYouTube.createYouTubeAdapter || (() => null);
  const createHTML5TrackAdapter = adaptersHTML5.createHTML5TrackAdapter || (() => null);
  const createCaptionEngine = engineApi.createCaptionEngine || (() => null);
  const createCaptionOverlayRenderer = rendererApi.createCaptionOverlayRenderer || (() => null);
  const createCaptionsSettingsStore =
    settingsStoreApi.createCaptionsSettingsStore || (() => null);
  const createCueCache = cueCacheApi.createCueCache || (() => null);
  const createLifecycleManager = lifecycleApi.createLifecycleManager || (() => null);
  const getCaptionStatusPresentation =
    statusMapperApi.getCaptionStatusPresentation || (() => null);
  const createAssistService = assistServiceApi.createAssistService || (() => null);

  const state = {
    enabled: false,
    initializing: false,
    settings: null,
    renderer: null,
    engine: null,
    lifecycle: null,
    settingsStore: null,
    cueCache: null,
    assistService: null,
    unsubscribeSettings: null,
    taskChain: Promise.resolve(),
    engineStatus: {
      stage: "idle",
      available: false,
      reason: "",
    },
  };

  function enable() {
    if (state.enabled) {
      return getStatus();
    }

    state.enabled = true;
    state.initializing = true;
    enqueue(async () => {
      await initializeIfNeeded();
      await rebindToCurrentContext();
      state.initializing = false;
    });

    return getStatus();
  }

  function disable() {
    state.enabled = false;
    state.initializing = false;

    if (typeof state.unsubscribeSettings === "function") {
      state.unsubscribeSettings();
      state.unsubscribeSettings = null;
    }

    if (state.lifecycle) {
      state.lifecycle.stop();
      state.lifecycle = null;
    }

    if (state.engine) {
      state.engine.stop();
      state.engine = null;
    }

    if (state.renderer) {
      state.renderer.destroy();
      state.renderer = null;
    }

    state.engineStatus = {
      stage: "disabled",
      available: false,
      reason: "",
    };

    return getStatus();
  }

  function getStatus() {
    const runtime = state.engine ? state.engine.getStatus() : {};
    return {
      enabled: state.enabled,
      highlighted: state.enabled,
      initializing: state.initializing,
      available: Boolean(runtime.available),
      adapter: runtime.adapter || "",
      trackLang: runtime.trackLang || "",
      isAuto: Boolean(runtime.isAuto),
      cueCount: Number(runtime.cueCount || 0),
      assistEnabled: Boolean(runtime.assistEnabled),
      assistMode: runtime.assistMode || "",
      assistApplied: Boolean(runtime.assistApplied),
      assistProvider: runtime.assistProvider || "",
      assistLastError: runtime.assistLastError || "",
      stage: state.engineStatus.stage,
      reason: state.engineStatus.reason || "",
    };
  }

  function scanCandidates() {
    const candidates = [];
    const seen = new Set();

    const videos = document.querySelectorAll("video");
    for (const video of videos) {
      const sourceUrl = getVideoSource(video);
      if (!sourceUrl || seen.has(sourceUrl)) {
        continue;
      }
      seen.add(sourceUrl);
      candidates.push({
        source: "html5_video",
        url: sourceUrl,
        label: buildVideoLabel(video, sourceUrl),
        hasTrack: video.querySelector("track[kind='captions'], track[kind='subtitles']") !== null,
      });
    }

    const iframes = document.querySelectorAll("iframe[src]");
    for (const iframe of iframes) {
      const src = String(iframe.getAttribute("src") || "").trim();
      const absolute = toAbsoluteUrl(src);
      if (!absolute || seen.has(absolute) || !isKnownVideoHost(absolute)) {
        continue;
      }
      seen.add(absolute);
      candidates.push({
        source: "iframe",
        url: absolute,
        label: "Embedded video",
        hasTrack: false,
      });
    }

    return candidates.slice(0, 15);
  }

  function updateSettings(partialSettings) {
    if (!state.settingsStore) {
      return getStatus();
    }
    enqueue(async () => {
      state.settings = await state.settingsStore.save(partialSettings || {});
      applyRendererSettings();
      if (state.engine) {
        await state.engine.updateSettings(state.settings);
      }
    });
    return getStatus();
  }

  async function initializeIfNeeded() {
    if (!state.enabled) {
      return;
    }

    if (!state.settingsStore) {
      state.settingsStore = createCaptionsSettingsStore();
    }
    if (!state.settings) {
      state.settings = await state.settingsStore.load();
    }

    if (!state.renderer) {
      const renderer = createCaptionOverlayRenderer(state.settings.overlay);
      if (!renderer || typeof renderer.mount !== "function") {
        throw new Error("Caption overlay renderer failed to initialize");
      }
      state.renderer = renderer;
      state.renderer.mount();
    }
    applyRendererSettings();

    if (!state.cueCache) {
      const cueCache = createCueCache();
      if (!cueCache || typeof cueCache.get !== "function" || typeof cueCache.set !== "function") {
        throw new Error("Cue cache failed to initialize");
      }
      state.cueCache = cueCache;
      void state.cueCache.clearExpired();
    }

    if (!state.engine) {
      if (!state.assistService) {
        state.assistService = createAssistService();
      }

      const adapters = [createYouTubeAdapter(), createHTML5TrackAdapter()].filter(Boolean);
      const engine = createCaptionEngine({
        adapters,
        cueCache: {
          get: (key, language, isAuto) => state.cueCache.get(key, language, isAuto),
          set: (key, cues, language, isAuto) => state.cueCache.set(key, cues, language, isAuto),
        },
        assistService: state.assistService,
        onCue: (cue) => {
          if (!state.renderer || !state.enabled) {
            return;
          }
          if (cue) {
            state.renderer.showCue(cue);
          } else if (state.engineStatus.stage === "ready") {
            state.renderer.clear();
          }
        },
        onStatus: (status) => {
          state.engineStatus = status || { stage: "unknown", available: false };
          if (!state.renderer || !state.enabled) {
            return;
          }

          const presentation = getCaptionStatusPresentation(status);
          if (!presentation) {
            return;
          }

          if (status?.stage === "ready") {
            state.renderer.clear();
            return;
          }

          if (!presentation.show) {
            state.renderer.clear();
            return;
          }

          state.renderer.showStatus(presentation.message, presentation.isError, {
            code: presentation.code,
            ttlMs: presentation.ttlMs,
          });
        },
      });
      if (!engine || typeof engine.start !== "function" || typeof engine.rebind !== "function") {
        throw new Error("Caption engine failed to initialize");
      }
      state.engine = engine;
      await state.engine.start(buildContext(), state.settings);
    }

    if (!state.lifecycle) {
      const lifecycle = createLifecycleManager({
        debounceMs: 550,
        onRebind: () => {
          enqueue(async () => {
            await rebindToCurrentContext();
          });
        },
      });
      if (!lifecycle || typeof lifecycle.start !== "function" || typeof lifecycle.stop !== "function") {
        throw new Error("Lifecycle manager failed to initialize");
      }
      state.lifecycle = lifecycle;
      state.lifecycle.start();
    }

    if (!state.unsubscribeSettings && state.settingsStore) {
      state.unsubscribeSettings = state.settingsStore.subscribe((nextSettings) => {
        state.settings = nextSettings;
        applyRendererSettings();
        enqueue(async () => {
          if (state.engine) {
            await state.engine.updateSettings(state.settings);
          }
        });
      });
    }
  }

  async function rebindToCurrentContext() {
    if (!state.enabled) {
      return;
    }
    await initializeIfNeeded();
    if (!state.engine) {
      return;
    }
    await state.engine.rebind(buildContext(), state.settings);
  }

  function applyRendererSettings() {
    if (!state.renderer || !state.settings) {
      return;
    }
    state.renderer.updateSettings(state.settings.overlay);
  }

  function enqueue(task) {
    state.taskChain = state.taskChain
      .then(async () => {
        if (!state.enabled && task !== disable) {
          return;
        }
        await task();
      })
      .catch((error) => {
        state.engineStatus = {
          stage: "error",
          available: false,
          reason: error?.message || "Module 2 error",
        };
        if (state.renderer && state.enabled) {
          state.renderer.showStatus(state.engineStatus.reason, true, {
            code: "error",
            ttlMs: 7000,
          });
        }
      });
    return state.taskChain;
  }

  function buildContext() {
    const videoElement = pickBestVideoElement();
    const mediaUrl = videoElement ? getVideoSource(videoElement) || window.location.href : "";
    return {
      videoElement,
      mediaUrl,
      pageUrl: window.location.href,
      host: window.location.hostname,
    };
  }

  function pickBestVideoElement() {
    const videos = Array.from(document.querySelectorAll("video"));
    if (videos.length === 0) {
      return null;
    }

    const playing = videos.find((video) => !video.paused && !video.ended);
    if (playing) {
      return playing;
    }

    const visible = videos.find((video) => {
      const rect = video.getBoundingClientRect();
      return rect.width > 40 && rect.height > 30;
    });
    return visible || videos[0];
  }

  function getVideoSource(videoElement) {
    if (!(videoElement instanceof HTMLVideoElement)) {
      return "";
    }

    const direct = String(videoElement.currentSrc || videoElement.getAttribute("src") || "").trim();
    if (direct) {
      return toAbsoluteUrl(direct);
    }

    const source = videoElement.querySelector("source[src]");
    return toAbsoluteUrl(source?.getAttribute("src") || "");
  }

  function buildVideoLabel(videoElement, fallbackUrl) {
    const ariaLabel = String(videoElement.getAttribute("aria-label") || "").trim();
    if (ariaLabel) {
      return ariaLabel;
    }

    const title = String(videoElement.getAttribute("title") || "").trim();
    if (title) {
      return title;
    }

    try {
      const parsed = new URL(fallbackUrl);
      return parsed.hostname.replace(/^www\./, "");
    } catch (_) {
      return "Video source";
    }
  }

  function toAbsoluteUrl(value) {
    if (!value) {
      return "";
    }
    try {
      return new URL(value, window.location.href).toString();
    } catch (_) {
      return "";
    }
  }

  function isKnownVideoHost(url) {
    try {
      const host = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
      return (
        host.includes("youtube.com") ||
        host.includes("youtu.be") ||
        host.includes("youtube-nocookie.com") ||
        host.includes("vimeo.com") ||
        host.includes("dailymotion.com") ||
        host.includes("twitch.tv")
      );
    } catch (_) {
      return false;
    }
  }

  const api = Object.freeze({
    enable,
    disable,
    getStatus,
    scanCandidates,
    updateSettings,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2 = api;
})();
