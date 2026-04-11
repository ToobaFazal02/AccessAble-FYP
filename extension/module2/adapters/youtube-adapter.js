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
  const debugLog = utils.debugLog || (() => {});
  const normalizeUrl = sharedContracts.normalizeUrl || ((value) => String(value || "").trim());
  const ACTIONS = sharedContracts.ACTIONS || {};

  const YOUTUBE_HOSTS = new Set([
    "youtube.com",
    "www.youtube.com",
    "m.youtube.com",
    "youtu.be",
    "www.youtu.be",
    "youtube-nocookie.com",
    "www.youtube-nocookie.com",
  ]);
  const HTML_PAYLOAD_MARKERS = [
    "consent.youtube.com",
    "consent.google.com",
    "unusual traffic",
    "our systems have detected",
    "enable javascript",
    "captcha",
    "g-recaptcha",
    "challenge",
  ];

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
    const playerResponse = getPlayerResponse();
    const tracks = extractTracksFromPlayerResponse(playerResponse);

    debugLog(options.debug, "player_response", {
      available: Boolean(playerResponse),
      trackCount: tracks.length,
    });

    if (tracks.length > 0) {
      debugLog(options.debug, "track_discovery", { player: tracks.length, backend: 0 });
      return tracks;
    }

    const backendTracks = await discoverTracksFromBackend(
      context,
      options.signal,
      options.debug
    );
    debugLog(options.debug, "track_discovery", {
      player: 0,
      backend: backendTracks.length,
    });
    return backendTracks;
  }

  async function fetchCues(track, _context, options = {}) {
    const timeoutMs = Number(options.timeoutMs) || 4000;
    const retries = Number(options.retries) || 2;
    const trackUrl = String(track?.src || "").trim();
    if (!isSafeCaptionUrl(trackUrl)) {
      return [];
    }
    debugLog(options.debug, "cue_fetch_start", {
      url: trackUrl,
      lang: track?.lang || "",
      isAuto: Boolean(track?.isAuto),
    });

    const jsonUrl = withYouTubeFormat(trackUrl, "json3");
    let parserErrorCandidate = false;
    let shouldTryBackground = false;

    const jsonFetch = await fetchTrackBody(jsonUrl, {
      signal: options.signal,
      timeoutMs,
      retries,
    });
    debugLog(options.debug, "cue_fetch_response", {
      format: "json3",
      ok: jsonFetch.ok,
      status: jsonFetch.status,
      contentType: jsonFetch.contentType,
    });
    if (!jsonFetch.ok) {
      shouldTryBackground = true;
    } else {
      const jsonIsHtml = isHtmlPayload(jsonFetch.contentType, jsonFetch.body);
      debugLog(options.debug, "cue_fetch_html_detected", {
        format: "json3",
        isHtml: jsonIsHtml,
      });
      if (jsonIsHtml) {
        shouldTryBackground = true;
      } else {
        debugLog(options.debug, "cue_parse_attempt", { format: "json3" });
        const jsonResult = parseJson3FromBody(jsonFetch.body, track);
        debugLog(options.debug, "cue_parse_result", {
          format: "json3",
          cueCount: jsonResult.cues.length,
          parserError: jsonResult.parserError,
        });
        if (jsonResult.parserError) {
          parserErrorCandidate = true;
          shouldTryBackground = true;
        }
        if (jsonResult.cues.length > 0) {
          debugLog(options.debug, "cue_fetch_source", {
            source: "json3",
            cueCount: jsonResult.cues.length,
            lang: track.lang,
            isAuto: Boolean(track.isAuto),
          });
          return jsonResult.cues;
        }
      }
    }

    const vttUrl = withYouTubeFormat(trackUrl, "vtt");
    const vttFetch = await fetchTrackBody(vttUrl, {
      signal: options.signal,
      timeoutMs,
      retries,
    });
    debugLog(options.debug, "cue_fetch_response", {
      format: "vtt",
      ok: vttFetch.ok,
      status: vttFetch.status,
      contentType: vttFetch.contentType,
    });
    if (!vttFetch.ok) {
      shouldTryBackground = true;
    } else {
      const vttIsHtml = isHtmlPayload(vttFetch.contentType, vttFetch.body);
      debugLog(options.debug, "cue_fetch_html_detected", {
        format: "vtt",
        isHtml: vttIsHtml,
      });
      if (vttIsHtml) {
        shouldTryBackground = true;
      } else {
        debugLog(options.debug, "cue_parse_attempt", { format: "vtt" });
        const vttResult = parseVttFromBody(vttFetch.body, track, {
          debug: options.debug,
          source: "vtt",
        });
        debugLog(options.debug, "cue_parse_result", {
          format: "vtt",
          cueCount: vttResult.cues.length,
          parserError: vttResult.parserError,
        });
        if (vttResult.parserError) {
          parserErrorCandidate = true;
          shouldTryBackground = true;
        }
        if (vttResult.cues.length > 0) {
          debugLog(options.debug, "cue_fetch_source", {
            source: "vtt",
            cueCount: vttResult.cues.length,
            lang: track.lang,
            isAuto: Boolean(track.isAuto),
          });
          return vttResult.cues;
        }
      }
    }

    if (shouldTryBackground) {
      const fallback = await fetchTrackContentFromBackground(vttUrl, options.signal);
      debugLog(options.debug, "cue_fetch_response", {
        format: "background",
        ok: Boolean(fallback?.ok),
        status: Number(fallback?.status || 0),
        contentType: fallback?.contentType || "",
      });
      if (fallback?.ok) {
        const fallbackIsHtml = isHtmlPayload(fallback.contentType, fallback.body);
        debugLog(options.debug, "cue_fetch_html_detected", {
          format: "background",
          isHtml: fallbackIsHtml,
        });
        if (fallbackIsHtml) {
          return [];
        }
        debugLog(options.debug, "cue_parse_attempt", { format: "background_vtt" });
        const fallbackVtt = parseVttFromBody(fallback.body, track, {
          debug: options.debug,
          source: "background_vtt",
        });
        debugLog(options.debug, "cue_parse_result", {
          format: "background_vtt",
          cueCount: fallbackVtt.cues.length,
          parserError: fallbackVtt.parserError,
        });
        if (fallbackVtt.cues.length > 0) {
          debugLog(options.debug, "cue_fetch_source", {
            source: "background",
            cueCount: fallbackVtt.cues.length,
            lang: track.lang,
            isAuto: Boolean(track.isAuto),
          });
          return fallbackVtt.cues;
        }
        if (fallbackVtt.parserError) {
          parserErrorCandidate = true;
        }

        debugLog(options.debug, "cue_parse_attempt", { format: "background_json3" });
        const fallbackJson = parseJson3FromBody(fallback.body, track);
        debugLog(options.debug, "cue_parse_result", {
          format: "background_json3",
          cueCount: fallbackJson.cues.length,
          parserError: fallbackJson.parserError,
        });
        if (fallbackJson.cues.length > 0) {
          debugLog(options.debug, "cue_fetch_source", {
            source: "background_json3",
            cueCount: fallbackJson.cues.length,
            lang: track.lang,
            isAuto: Boolean(track.isAuto),
          });
          return fallbackJson.cues;
        }
        if (fallbackJson.parserError) {
          parserErrorCandidate = true;
        }
      } else if (fallback?.error) {
        const backendError = new Error(fallback.error || "Caption backend unavailable");
        backendError.code = "backend_unreachable";
        throw backendError;
      }
    }

    if (parserErrorCandidate) {
      const parseError = new Error("Caption parsing failed");
      parseError.code = "parser_error";
      throw parseError;
    }

    return [];
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

  function extractTracksFromPlayerResponse(playerResponse) {
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

  async function discoverTracksFromBackend(context, signal, debug) {
    const action =
      sharedContracts?.ACTIONS?.CAPTIONS_EXTRACT || "captions.extract";
    if (!action || !globalThis.chrome?.runtime?.sendMessage) {
      return [];
    }

    const candidateUrl = selectBackendVideoUrl(context);
    const canonical = canonicalizeYouTubeVideoUrl(candidateUrl, context);
    if (!canonical.ok) {
      debugLog(debug, "backend_video_url_invalid", {
        reason: canonical.reason || "invalid_video_url",
      });
      return [];
    }
    const mediaUrl = canonical.url;

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
    } catch (error) {
      debugLog(debug, "backend_fallback_failed", {
        error: error?.message || "Backend fallback failed",
      });
      const backendError = new Error(
        error?.message || "Caption backend unavailable"
      );
      backendError.code = "backend_unreachable";
      throw backendError;
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

  function parseJson3FromBody(body, track) {
    const text = String(body || "").trim();
    if (!looksLikeJson(text)) {
      return { cues: [], parserError: false };
    }

    try {
      const payload = JSON.parse(text);
      const parsed = parseJson3Cues(payload, track.lang, track.isAuto);
      return {
        cues: normalizeCues(parsed, {
          lang: track.lang,
          isAuto: track.isAuto,
        }),
        parserError: false,
      };
    } catch (_) {
      return { cues: [], parserError: true };
    }
  }

  function parseVttFromBody(body, track, options = {}) {
    const text = String(body || "");
    let parsed = [];
    let parserError = false;

    try {
      parsed = parseVttCues(text, track.lang, track.isAuto, {
        debug: Boolean(options.debug),
        source: options.source || "vtt",
      });
    } catch (_) {
      parserError = true;
    }

    const normalized = normalizeCues(parsed, {
      lang: track.lang,
      isAuto: track.isAuto,
    });

    if (looksLikeVtt(text) && normalized.length === 0) {
      parserError = true;
    }

    return { cues: normalized, parserError };
  }

  function isHtmlPayload(contentType, body) {
    const type = String(contentType || "").toLowerCase();
    if (type.includes("text/html")) {
      return true;
    }

    const text = String(body || "").trim().toLowerCase();
    if (!text) {
      return false;
    }
    if (text.startsWith("<!doctype") || text.startsWith("<html") || text.startsWith("<head")) {
      return true;
    }
    return HTML_PAYLOAD_MARKERS.some((marker) => text.includes(marker));
  }

  function looksLikeVtt(body) {
    const text = String(body || "").trim();
    return text.toUpperCase().startsWith("WEBVTT");
  }

  function looksLikeJson(body) {
    const text = String(body || "").trim();
    return text.startsWith("{") || text.startsWith("[");
  }

  async function fetchTrackBody(url, options = {}) {
    try {
      const response = await fetchWithRetry(url, {
        method: "GET",
        signal: options.signal,
        timeoutMs: options.timeoutMs,
        retries: options.retries,
      });
      const contentType = response.headers?.get?.("content-type") || "";
      const body = await response.text();
      return {
        ok: true,
        status: response.status,
        contentType,
        body,
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: "",
        error: error?.message || "Request failed",
      };
    }
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

  function selectBackendVideoUrl(context) {
    const pageUrl = normalizeUrl(context?.pageUrl || "");
    const mediaUrl = normalizeUrl(context?.mediaUrl || "");

    const pageVideoId = extractYouTubeVideoId(pageUrl);
    const mediaVideoId = extractYouTubeVideoId(mediaUrl);

    if (pageVideoId) {
      return pageUrl;
    }

    if (mediaVideoId && !mediaUrl.startsWith("blob:")) {
      return mediaUrl;
    }

    if (pageUrl) {
      return pageUrl;
    }

    if (!mediaUrl.startsWith("blob:")) {
      return mediaUrl;
    }

    return "";
  }

  function canonicalizeYouTubeVideoUrl(inputUrl, pageContext) {
    const primaryUrls = [];
    const fallbackUrl = normalizeUrl(pageContext?.pageUrl || "");
    const mediaUrl = normalizeUrl(pageContext?.mediaUrl || "");

    addUniqueUrl(primaryUrls, normalizeUrl(inputUrl));
    addUniqueUrl(primaryUrls, mediaUrl);

    const watchId = findVideoId(primaryUrls, parseWatchVideoId);
    if (watchId) {
      return buildCanonicalResult(watchId);
    }

    const youtuId = findVideoId(primaryUrls, parseYoutuBeVideoId);
    if (youtuId) {
      return buildCanonicalResult(youtuId);
    }

    const shortId = findVideoId(primaryUrls, parseShortsVideoId);
    if (shortId) {
      return buildCanonicalResult(shortId);
    }

    const playerId = extractVideoIdFromPlayerResponse();
    if (playerId) {
      return buildCanonicalResult(playerId);
    }

    if (fallbackUrl) {
      const fallbackWatch = parseWatchVideoId(fallbackUrl);
      if (fallbackWatch) {
        return buildCanonicalResult(fallbackWatch);
      }
      const fallbackShort = parseShortsVideoId(fallbackUrl);
      if (fallbackShort) {
        return buildCanonicalResult(fallbackShort);
      }
      const fallbackYoutu = parseYoutuBeVideoId(fallbackUrl);
      if (fallbackYoutu) {
        return buildCanonicalResult(fallbackYoutu);
      }
    }

    return { ok: false, reason: "no_video_id" };
  }

  function addUniqueUrl(list, url) {
    if (!url) {
      return;
    }
    if (!list.includes(url)) {
      list.push(url);
    }
  }

  function findVideoId(urls, parser) {
    for (const url of urls) {
      const id = parser(url);
      if (id) {
        return id;
      }
    }
    return "";
  }

  function buildCanonicalResult(videoId) {
    return {
      ok: true,
      videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  function parseWatchVideoId(url) {
    const parsed = safeParseUrl(url);
    if (!parsed || isRejectedYouTubePath(parsed)) {
      return "";
    }
    const host = normalizeHost(parsed.hostname);
    if (!YOUTUBE_HOSTS.has(host)) {
      return "";
    }
    if (parsed.pathname !== "/watch") {
      return "";
    }
    const videoId = parsed.searchParams.get("v");
    return isValidYouTubeVideoId(videoId) ? videoId : "";
  }

  function parseYoutuBeVideoId(url) {
    const parsed = safeParseUrl(url);
    if (!parsed || isRejectedYouTubePath(parsed)) {
      return "";
    }
    const host = normalizeHost(parsed.hostname);
    if (host !== "youtu.be" && host !== "www.youtu.be") {
      return "";
    }
    const id = parsed.pathname.replace(/^\//, "").split("/")[0];
    return isValidYouTubeVideoId(id) ? id : "";
  }

  function parseShortsVideoId(url) {
    const parsed = safeParseUrl(url);
    if (!parsed || isRejectedYouTubePath(parsed)) {
      return "";
    }
    const host = normalizeHost(parsed.hostname);
    if (!YOUTUBE_HOSTS.has(host)) {
      return "";
    }
    if (!parsed.pathname.startsWith("/shorts/")) {
      return "";
    }
    const id = parsed.pathname.split("/shorts/")[1]?.split("/")[0] || "";
    return isValidYouTubeVideoId(id) ? id : "";
  }

  function extractVideoIdFromPlayerResponse() {
    const playerResponse = getPlayerResponse();
    const id = playerResponse?.videoDetails?.videoId;
    return isValidYouTubeVideoId(id) ? id : "";
  }

  function isRejectedYouTubePath(parsedUrl) {
    const host = normalizeHost(parsedUrl.hostname);
    if (host === "accounts.youtube.com") {
      return true;
    }
    if (!host.endsWith("youtube.com")) {
      return false;
    }
    const path = String(parsedUrl.pathname || "").toLowerCase();
    return path.startsWith("/playlist") || path.startsWith("/results");
  }

  function isValidYouTubeVideoId(value) {
    const id = String(value || "").trim();
    return /^[a-zA-Z0-9_-]{11}$/.test(id);
  }

  function safeParseUrl(value) {
    try {
      return new URL(String(value || ""));
    } catch (_) {
      return null;
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

  async function fetchTrackContentFromBackground(url, signal) {
    const action = ACTIONS.CAPTIONS_FETCH_TRACK_CONTENT || "captions.fetchTrackContent";
    if (!action || !globalThis.chrome?.runtime?.sendMessage) {
      return null;
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    try {
      const response = await sendRuntimeMessage({
        action,
        payload: { url },
      });
      const data = response?.data || {};
      return {
        ok: Boolean(response?.ok),
        status: Number(data.status || 0),
        contentType: String(data.contentType || ""),
        body: String(data.body || ""),
      };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        contentType: "",
        body: "",
        error: error?.message || "Caption fallback failed",
      };
    }
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
