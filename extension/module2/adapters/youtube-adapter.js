"use strict";

(() => {
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const utils = globalThis.AccessAbleModule2AdapterUtils || {};
  const cueNormalizer = globalThis.AccessAbleModule2CueNormalizer || {};
  const sharedContracts = globalThis.AccessAbleContracts || {};

  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());
  const fetchWithRetry = utils.fetchWithRetry || fetch;
  const sanitizeCueText = utils.sanitizeCueText || ((value) => String(value || "").trim());
  const parseVttCues = utils.parseVttCues || (() => []);
  const isSafeCaptionUrl = utils.isSafeCaptionUrl || (() => false);
  const normalizeCues = cueNormalizer.normalizeCues || ((items) => items || []);

  const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
  ]);

  function createYouTubeAdapter() {
    return {
      name: "youtube",
      supports,
      discoverTracks,
      fetchCues,
      bindTimeSource,
      getContextKey,
      destroy,
    };
  }

  function supports(context) {
    if (!context) {
      return false;
    }

    const host = normalizeHost(context.host || context.pageUrl || "");
    if (host && YOUTUBE_HOSTS.has(host)) {
      return true;
    }

    const mediaUrlHost = normalizeHost(context.mediaUrl || "");
    return Boolean(mediaUrlHost && YOUTUBE_HOSTS.has(mediaUrlHost));
  }

  async function discoverTracks(context, options = {}) {
    const tracks = extractTracksFromPlayerResponse();
    if (tracks.length > 0) {
      return tracks;
    }

    const backendTracks = await discoverTracksFromBackend(context, options.signal);
    return backendTracks;
  }

  async function fetchCues(track, _context, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 4000;
    const retries = Number(options.retries) || 2;
    const trackUrl = String(track?.src || "").trim();
    if (!isSafeCaptionUrl(trackUrl)) {
      return [];
    }

    const jsonUrl = withYouTubeFormat(trackUrl, "json3");
    try {
      const jsonResponse = await fetchWithRetry(jsonUrl, {
        method: "GET",
        signal: options.signal,
        timeoutMs,
        retries,
      });
      const payload = await jsonResponse.json();
      const parsedJsonCues = parseJson3Cues(payload, track.lang, track.isAuto);
      const normalizedJson = normalizeCues(parsedJsonCues, {
        lang: track.lang,
        isAuto: track.isAuto,
      });
      if (normalizedJson.length > 0) {
        return normalizedJson;
      }
    } catch (_) {
      // Fall through to VTT fetch.
    }

    const vttUrl = withYouTubeFormat(trackUrl, "vtt");
    const vttResponse = await fetchWithRetry(vttUrl, {
      method: "GET",
      signal: options.signal,
      timeoutMs,
      retries,
    });
    const vttContent = await vttResponse.text();
    const parsedVttCues = parseVttCues(vttContent, track.lang, track.isAuto);
    return normalizeCues(parsedVttCues, {
      lang: track.lang,
      isAuto: track.isAuto,
    });
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
    videoElement.addEventListener("play", callback);

    return () => {
      videoElement.removeEventListener("timeupdate", callback);
      videoElement.removeEventListener("seeked", callback);
      videoElement.removeEventListener("ratechange", callback);
      videoElement.removeEventListener("play", callback);
    };
  }

  function getContextKey(context) {
    const videoId = extractYouTubeVideoId(context?.pageUrl || context?.mediaUrl || "");
    if (videoId) {
      return `youtube:${videoId}`;
    }
    return `youtube:${String(context?.pageUrl || "")}`;
  }

  function destroy() {}

  function extractTracksFromPlayerResponse() {
    const playerResponse = getPlayerResponse();
    const captionTracks =
      playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    if (!Array.isArray(captionTracks)) {
      return [];
    }

    const result = [];
    const seen = new Set();

    for (const rawTrack of captionTracks) {
      if (!rawTrack || typeof rawTrack !== "object") {
        continue;
      }

      const src = String(rawTrack.baseUrl || "").trim();
      if (!isSafeCaptionUrl(src)) {
        continue;
      }

      const lang = normalizeLanguageCode(rawTrack.languageCode);
      const label = extractLabel(rawTrack.name, lang);
      const isAuto = rawTrack.kind === "asr" || String(rawTrack.vssId || "").startsWith("a.");
      const id = String(rawTrack.vssId || `${lang}:${label}`).trim();
      const key = `${id}|${lang}|${src}`;

      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      result.push({
        id,
        lang,
        label,
        isAuto,
        kind: isAuto ? "auto" : "manual",
        src,
        source: "youtube",
      });
    }

    return result;
  }

  async function discoverTracksFromBackend(context, signal) {
    const action = sharedContracts?.ACTIONS?.CAPTIONS_EXTRACT;
    if (!action || !globalThis.chrome?.runtime?.sendMessage) {
      return [];
    }

    const mediaUrl = String(context?.mediaUrl || context?.pageUrl || "").trim();
    if (!mediaUrl) {
      return [];
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    try {
      const response = await sendRuntimeMessage({
        action,
        payload: {
          videoUrl: mediaUrl,
          pageUrl: context?.pageUrl || "",
        },
      });

      const tracks = Array.isArray(response?.data?.caption_tracks)
        ? response.data.caption_tracks
        : [];
      const result = [];

      for (let i = 0; i < tracks.length; i += 1) {
        const track = tracks[i];
        const src = String(track?.url || "").trim();
        if (!isSafeCaptionUrl(src)) {
          continue;
        }

        const lang = normalizeLanguageCode(track?.language);
        result.push({
          id: `backend_${lang}_${i}`,
          lang,
          label: String(track?.language_name || lang).trim(),
          isAuto: Boolean(track?.auto_generated),
          kind: Boolean(track?.auto_generated) ? "auto" : "manual",
          src,
          source: "youtube_backend",
        });
      }

      return result;
    } catch (_) {
      return [];
    }
  }

  function parseJson3Cues(payload, language, isAuto) {
    const events = Array.isArray(payload?.events) ? payload.events : [];
    const result = [];

    for (const event of events) {
      const startMs = Number(event?.tStartMs);
      const durationMs = Number(event?.dDurationMs);
      const segments = Array.isArray(event?.segs) ? event.segs : [];

      if (!Number.isFinite(startMs) || !Number.isFinite(durationMs) || durationMs <= 0) {
        continue;
      }

      const rawText = segments
        .map((segment) => String(segment?.utf8 || ""))
        .join("")
        .replace(/\n+/g, " ");
      const text = sanitizeCueText(rawText);
      if (!text) {
        continue;
      }

      result.push({
        start: startMs / 1000,
        end: (startMs + durationMs) / 1000,
        text,
        lang: normalizeLanguageCode(language),
        isAuto: Boolean(isAuto),
      });
    }

    return result;
  }

  function withYouTubeFormat(url, format) {
    try {
      const parsed = new URL(url);
      parsed.searchParams.set("fmt", format);
      return parsed.toString();
    } catch (_) {
      return url;
    }
  }

  function getPlayerResponse() {
    if (globalThis.ytInitialPlayerResponse && typeof globalThis.ytInitialPlayerResponse === "object") {
      return globalThis.ytInitialPlayerResponse;
    }

    const rawPlayerResponse = globalThis.ytplayer?.config?.args?.player_response;
    if (typeof rawPlayerResponse === "string") {
      try {
        return JSON.parse(rawPlayerResponse);
      } catch (_) {
        return null;
      }
    }

    if (rawPlayerResponse && typeof rawPlayerResponse === "object") {
      return rawPlayerResponse;
    }

    return null;
  }

  function extractLabel(name, fallback) {
    if (!name || typeof name !== "object") {
      return fallback || "Unknown";
    }
    if (typeof name.simpleText === "string" && name.simpleText.trim()) {
      return name.simpleText.trim();
    }
    if (Array.isArray(name.runs)) {
      return name.runs.map((item) => String(item?.text || "")).join("").trim() || fallback || "Unknown";
    }
    return fallback || "Unknown";
  }

  function extractYouTubeVideoId(url) {
    try {
      const parsed = new URL(String(url || ""));
      const host = normalizeHost(parsed.hostname);

      if (host === "youtu.be") {
        return parsed.pathname.replace(/^\//, "").split("/")[0];
      }
      if (host && host.includes("youtube")) {
        if (parsed.pathname === "/watch") {
          return parsed.searchParams.get("v") || "";
        }
        if (parsed.pathname.startsWith("/shorts/")) {
          return parsed.pathname.split("/shorts/")[1].split("/")[0];
        }
        if (parsed.pathname.startsWith("/embed/")) {
          return parsed.pathname.split("/embed/")[1].split("/")[0];
        }
      }
      return "";
    } catch (_) {
      return "";
    }
  }

  function normalizeHost(rawUrlOrHost) {
    try {
      const parsed = new URL(String(rawUrlOrHost));
      return String(parsed.hostname || "").toLowerCase();
    } catch (_) {
      return String(rawUrlOrHost || "").toLowerCase().replace(/^https?:\/\//, "").split("/")[0];
    }
  }

  function sendRuntimeMessage(message) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(message, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          reject(new Error(response?.error?.message || "Runtime message failed"));
          return;
        }
        resolve(response);
      });
    });
  }

  function createAbortError() {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
  }

  const api = Object.freeze({
    createYouTubeAdapter,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2YouTubeAdapter = api;
})();
