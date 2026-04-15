"use strict";

(() => {
  const sharedContracts = globalThis.AccessAbleContracts || {};
  const adapterContracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const cueNormalizer = globalThis.AccessAbleModule2CueNormalizer || {};
  const utils = globalThis.AccessAbleModule2AdapterUtils || {};

  const ACTIONS = sharedContracts.ACTIONS || {};
  const normalizeLanguageCode =
    adapterContracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());
  const normalizeCue = cueNormalizer.normalizeCue || ((cue) => cue);
  const clampInteger = utils.clampInteger || ((value) => value);
  const debugLog = utils.debugLog || (() => {});

  const MAX_ASSIST_CUES = 400;
  const QUOTA_COOLDOWN_MS = 60 * 1000;
  let quotaBlockedUntil = 0;

  const ASSIST_ACTIONS = Object.freeze({
    simplify: ACTIONS.CAPTIONS_ASSIST_SIMPLIFY,
    translate: ACTIONS.CAPTIONS_ASSIST_TRANSLATE,
    summarize: ACTIONS.CAPTIONS_ASSIST_SUMMARIZE,
  });

  function createAssistService() {
    return {
      request,
    };
  }

  async function request({
    mode,
    cues,
    track,
    context,
    settings,
    signal,
    debug,
    telemetryEnabled,
  }) {
    const normalizedMode = String(mode || "").trim().toLowerCase();
    const action = ASSIST_ACTIONS[normalizedMode];
    if (!action || !globalThis.chrome?.runtime?.sendMessage) {
      return null;
    }

    if (signal?.aborted) {
      throw createAbortError();
    }

    if (Date.now() < quotaBlockedUntil) {
      debugLog(debug, "assist_quota_cooldown", {
        waitMs: quotaBlockedUntil - Date.now(),
      });
      return null;
    }

    const normalizedCues = normalizeOutgoingCues(cues, track);
    if (normalizedCues.length === 0) {
      return null;
    }

    const timeoutMs = clampInteger(settings?.timeoutMs, 500, 15000, 2500);
    const retries = clampInteger(settings?.retries, 0, 3, 1);
    const rawTargetLanguage = String(settings?.targetLanguage || "").trim();
    const targetLanguage =
      normalizedMode === "translate" ? normalizeLanguageCode(rawTargetLanguage) : "";

    if (normalizedMode === "translate" && !rawTargetLanguage) {
      return null;
    }

    const payload = {
      mode: normalizedMode,
      cues: normalizedCues.slice(0, MAX_ASSIST_CUES).map((cue) => ({
        start: cue.start,
        end: cue.end,
        text: cue.text,
      })),
      source_lang: normalizeLanguageCode(track?.lang || ""),
      target_lang: targetLanguage,
      page_url: String(context?.pageUrl || ""),
      video_url: String(context?.pageUrl || context?.mediaUrl || ""),
      telemetry_enabled: telemetryEnabled === true,
      timeoutMs,
      retries,
    };

    if (normalizedCues.length > MAX_ASSIST_CUES) {
      debugLog(debug, "assist_truncated", {
        mode: normalizedMode,
        cueCount: normalizedCues.length,
        maxCues: MAX_ASSIST_CUES,
      });
    }

    debugLog(debug, "assist_request", {
      mode: normalizedMode,
      cueCount: normalizedCues.length,
      timeoutMs,
      retries,
    });

    const response = await sendRuntimeMessage({ action, payload }, signal);
    const validated = validateAssistResponse(
      response?.data,
      targetLanguage || track?.lang || "und",
      Boolean(track?.isAuto)
    );

    if (!validated) {
      const error = new Error("Invalid assist response schema");
      error.code = "parser_error";
      throw error;
    }

    return validated;
  }

  function normalizeOutgoingCues(cues, track) {
    const entries = Array.isArray(cues) ? cues : [];
    const normalized = [];
    for (const entry of entries) {
      const normalizedCue = normalizeCue(entry, {
        lang: track?.lang || "und",
        isAuto: Boolean(track?.isAuto),
      });
      if (!normalizedCue) {
        continue;
      }
      normalized.push(normalizedCue);
    }
    return normalized;
  }

  function validateAssistResponse(payload, fallbackLang, isAuto) {
    if (!payload || typeof payload !== "object") {
      return null;
    }

    const cues = Array.isArray(payload.cues) ? payload.cues : null;
    if (!cues || cues.length === 0) {
      return null;
    }

    const lang = normalizeLanguageCode(payload.lang || fallbackLang || "und");
    const normalized = [];

    for (const cue of cues) {
      const normalizedCue = normalizeCue(cue, { lang, isAuto });
      if (!normalizedCue) {
        return null;
      }
      normalized.push(normalizedCue);
    }

    return normalized;
  }

  function sendRuntimeMessage(message, signal) {
    return new Promise((resolve, reject) => {
      if (signal?.aborted) {
        reject(createAbortError());
        return;
      }

      chrome.runtime.sendMessage(message, (response) => {
        if (signal?.aborted) {
          reject(createAbortError());
          return;
        }
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        if (!response?.ok) {
          const error = new Error(response?.error?.message || "Assist request failed");
          error.statusCode = Number(response?.error?.statusCode || 0);
          error.code = String(response?.error?.code || "");
          if (error.statusCode === 429) {
            quotaBlockedUntil = Date.now() + QUOTA_COOLDOWN_MS;
            error.code = "assist_quota_exceeded";
          }
          reject(error);
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
    createAssistService,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2AssistService = api;
})();
