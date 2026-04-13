"use strict";

(() => {
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const utils = globalThis.AccessAbleModule2AdapterUtils || {};
  const cueNormalizer = globalThis.AccessAbleModule2CueNormalizer || {};

  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());
  const sanitizeCueText = utils.sanitizeCueText || ((value) => String(value || "").trim());
  const fetchWithRetry = utils.fetchWithRetry || fetch;
  const parseVttCues = utils.parseVttCues || (() => []);
  const isSafeCaptionUrl = utils.isSafeCaptionUrl || (() => false);
  const normalizeCues = cueNormalizer.normalizeCues || ((items) => items || []);

  function createHTML5TrackAdapter() {
    return {
      name: "html5-track",
      supports,
      discoverTracks,
      fetchCues,
      bindTimeSource,
      getContextKey,
      destroy,
    };
  }

  function supports(context) {
    return Boolean(context?.videoElement && context.videoElement.tagName === "VIDEO");
  }

  async function discoverTracks(context) {
    const videoElement = context?.videoElement;
    if (!videoElement) {
      return [];
    }

    const result = [];
    const seen = new Set();

    if (videoElement.textTracks && videoElement.textTracks.length > 0) {
      for (let i = 0; i < videoElement.textTracks.length; i += 1) {
        const track = videoElement.textTracks[i];
        const trackId = buildTrackId(track.language || track.label || `native_${i}`, i);
        const key = `${trackId}|${track.language || ""}|${track.label || ""}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        result.push({
          id: trackId,
          lang: normalizeLanguageCode(track.language),
          label: track.label || `Track ${i + 1}`,
          isAuto: false,
          kind: track.kind || "captions",
          src: "",
          source: "html5_track",
          _nativeTrack: track,
          _trackElement: findTrackElementByLabel(videoElement, track.label, track.language),
        });
      }
    }

    const trackElements = videoElement.querySelectorAll("track[kind='captions'], track[kind='subtitles']");
    for (let i = 0; i < trackElements.length; i += 1) {
      const trackElement = trackElements[i];
      const src = String(trackElement.getAttribute("src") || "").trim();
      const lang = normalizeLanguageCode(trackElement.getAttribute("srclang"));
      const label = String(trackElement.getAttribute("label") || `Caption ${i + 1}`).trim();
      const key = `${lang}|${label}|${src}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      result.push({
        id: buildTrackId(label || src || `element_${i}`, i),
        lang,
        label: label || lang || "Track",
        isAuto: false,
        kind: String(trackElement.getAttribute("kind") || "captions"),
        src,
        source: "html5_track",
        _nativeTrack: findNativeTextTrack(videoElement, lang, label),
        _trackElement: trackElement,
      });
    }

    return result;
  }

  async function fetchCues(track, _context, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 4000;
    const retries = Number(options.retries) || 1;

    const nativeCues = await readNativeCues(track, timeoutMs);
    if (nativeCues.length > 0) {
      return normalizeCues(nativeCues, {
        lang: track.lang,
        isAuto: track.isAuto,
      });
    }

    const sourceUrl = String(track.src || "").trim();
    let resolved = "";
    if (sourceUrl) {
      try {
        resolved = new URL(sourceUrl, _context?.pageUrl || window.location.href).toString();
      } catch (_) {
        return [];
      }
    }
    if (!isSafeCaptionUrl(resolved)) {
      return [];
    }

    const response = await fetchWithRetry(resolved, {
      method: "GET",
      signal: options.signal,
      timeoutMs,
      retries,
    });
    const vttContent = await response.text();
    const parsed = parseVttCues(vttContent, track.lang, track.isAuto);
    return normalizeCues(parsed, { lang: track.lang, isAuto: track.isAuto });
  }

  function bindTimeSource(context, onTime) {
    const videoElement = context?.videoElement;
    if (!videoElement) {
      return () => {};
    }

    const callback = () => onTime(Number(videoElement.currentTime) || 0);
    videoElement.addEventListener("timeupdate", callback);
    videoElement.addEventListener("seeked", callback);
    videoElement.addEventListener("ratechange", callback);

    return () => {
      videoElement.removeEventListener("timeupdate", callback);
      videoElement.removeEventListener("seeked", callback);
      videoElement.removeEventListener("ratechange", callback);
    };
  }

  function getContextKey(context) {
    const mediaUrl = String(context?.mediaUrl || "").trim();
    if (mediaUrl) {
      return `html5:${mediaUrl}`;
    }
    return `html5:${String(context?.pageUrl || "")}`;
  }

  function destroy() {}

  async function readNativeCues(track, timeoutMs) {
    const nativeTrack = track?._nativeTrack;
    if (!nativeTrack) {
      return [];
    }

    if (nativeTrack.mode === "disabled") {
      nativeTrack.mode = "hidden";
    }

    let cueList = convertNativeCueList(nativeTrack.cues, track.lang, track.isAuto);
    if (cueList.length > 0) {
      return cueList;
    }

    const trackElement = track._trackElement;
    if (!trackElement) {
      return cueList;
    }

    await waitForTrackLoad(trackElement, timeoutMs);
    cueList = convertNativeCueList(nativeTrack.cues, track.lang, track.isAuto);
    return cueList;
  }

  function convertNativeCueList(cues, language, isAuto) {
    if (!cues || typeof cues.length !== "number") {
      return [];
    }

    const result = [];
    for (let i = 0; i < cues.length; i += 1) {
      const cue = cues[i];
      const start = Number(cue?.startTime);
      const end = Number(cue?.endTime);
      const text = sanitizeCueText(cue?.text);
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !text) {
        continue;
      }
      result.push({
        start,
        end,
        text,
        lang: normalizeLanguageCode(language),
        isAuto: Boolean(isAuto),
      });
    }

    return result;
  }

  function waitForTrackLoad(trackElement, timeoutMs) {
    return new Promise((resolve) => {
      if (!trackElement || trackElement.readyState === 2) {
        resolve();
        return;
      }

      const done = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        trackElement.removeEventListener("load", done);
        trackElement.removeEventListener("error", done);
        clearTimeout(timer);
      };

      const timer = setTimeout(done, Math.max(300, timeoutMs));
      trackElement.addEventListener("load", done, { once: true });
      trackElement.addEventListener("error", done, { once: true });
    });
  }

  function findTrackElementByLabel(videoElement, label, language) {
    const trackElements = videoElement.querySelectorAll("track");
    const normalizedLabel = String(label || "").trim().toLowerCase();
    const normalizedLang = normalizeLanguageCode(language);

    for (const trackElement of trackElements) {
      const elementLabel = String(trackElement.getAttribute("label") || "").trim().toLowerCase();
      const elementLang = normalizeLanguageCode(trackElement.getAttribute("srclang"));
      if (normalizedLabel && elementLabel === normalizedLabel) {
        return trackElement;
      }
      if (normalizedLang && normalizedLang !== "und" && elementLang === normalizedLang) {
        return trackElement;
      }
    }

    return null;
  }

  function findNativeTextTrack(videoElement, language, label) {
    if (!videoElement.textTracks || videoElement.textTracks.length === 0) {
      return null;
    }

    const normalizedLang = normalizeLanguageCode(language);
    const normalizedLabel = String(label || "").trim().toLowerCase();

    for (let i = 0; i < videoElement.textTracks.length; i += 1) {
      const track = videoElement.textTracks[i];
      const trackLang = normalizeLanguageCode(track.language);
      const trackLabel = String(track.label || "").trim().toLowerCase();

      if (normalizedLang && normalizedLang !== "und" && trackLang === normalizedLang) {
        return track;
      }
      if (normalizedLabel && trackLabel === normalizedLabel) {
        return track;
      }
    }

    return null;
  }

  function buildTrackId(seed, index) {
    const raw = `${String(seed || "")}:${index}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i += 1) {
      hash = (hash << 5) - hash + raw.charCodeAt(i);
      hash |= 0;
    }
    return `html5_${Math.abs(hash).toString(16)}`;
  }

  const api = Object.freeze({
    createHTML5TrackAdapter,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2HTML5TrackAdapter = api;
})();
