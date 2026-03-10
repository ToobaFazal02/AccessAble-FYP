"use strict";

(() => {
  const contracts = globalThis.AccessAbleModule2AdapterContracts || {};
  const normalizeLanguageCode =
    contracts.normalizeLanguageCode || ((value) => String(value || "und").toLowerCase());

  function sanitizeCueText(raw) {
    if (raw === null || raw === undefined) {
      return "";
    }

    const stripped = String(raw).replace(/<[^>]*>/g, " ");
    const decoded = decodeMinimalHtmlEntities(stripped);
    return decoded.replace(/\s+/g, " ").trim();
  }

  function decodeMinimalHtmlEntities(value) {
    return String(value)
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&nbsp;/gi, " ");
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function createAbortError() {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    return error;
  }

  function mergeAbortSignals(signals) {
    const filtered = signals.filter(Boolean);
    if (filtered.length === 0) {
      return null;
    }

    const controller = new AbortController();

    const onAbort = () => {
      controller.abort();
      for (const signal of filtered) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    for (const signal of filtered) {
      if (signal.aborted) {
        onAbort();
        break;
      }
      signal.addEventListener("abort", onAbort);
    }

    return controller.signal;
  }

  async function fetchWithRetry(url, options = {}) {
    const retries = clampInteger(options.retries, 0, 5, 1);
    const timeoutMs = clampInteger(options.timeoutMs, 500, 30000, 4000);
    let attempt = 0;
    let lastError = null;

    while (attempt <= retries) {
      try {
        return await fetchWithTimeout(url, {
          method: options.method || "GET",
          headers: options.headers,
          body: options.body,
          signal: options.signal,
          timeoutMs,
        });
      } catch (error) {
        lastError = error;
        if (error?.name === "AbortError") {
          throw error;
        }
        if (attempt >= retries) {
          throw error;
        }
        await sleep(150 * (attempt + 1));
      }
      attempt += 1;
    }

    throw lastError || new Error("Network request failed");
  }

  async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timeoutMs = clampInteger(options.timeoutMs, 500, 30000, 4000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const signal = mergeAbortSignals([options.signal, controller.signal]) || controller.signal;

    try {
      const response = await fetch(url, {
        method: options.method || "GET",
        headers: options.headers,
        body: options.body,
        signal,
      });
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      return response;
    } catch (error) {
      if (controller.signal.aborted && !(options.signal && options.signal.aborted)) {
        throw createAbortError();
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  function parseVttTimestamp(value) {
    const input = String(value || "").trim();
    if (!input) {
      return NaN;
    }

    const parts = input.split(":");
    if (parts.length < 2 || parts.length > 3) {
      return NaN;
    }

    const secondsPart = parts.pop();
    const minutesPart = parts.pop();
    const hoursPart = parts.pop() || "0";

    const seconds = Number(secondsPart.replace(",", "."));
    const minutes = Number(minutesPart);
    const hours = Number(hoursPart);

    if (!Number.isFinite(seconds) || !Number.isFinite(minutes) || !Number.isFinite(hours)) {
      return NaN;
    }

    return hours * 3600 + minutes * 60 + seconds;
  }

  function parseVttCues(vttContent, language, isAuto) {
    const text = String(vttContent || "");
    const lines = text.replace(/\r\n/g, "\n").split("\n");
    const cues = [];

    let index = 0;
    while (index < lines.length) {
      const line = lines[index].trim();
      if (!line || line.toUpperCase() === "WEBVTT") {
        index += 1;
        continue;
      }

      const timingLine = line.includes("-->") ? line : lines[index + 1]?.trim() || "";
      if (!timingLine.includes("-->")) {
        index += 1;
        continue;
      }

      const [rawStart, rawEndWithSettings] = timingLine.split("-->");
      const rawEnd = String(rawEndWithSettings || "").split(" ")[0];
      const start = parseVttTimestamp(rawStart);
      const end = parseVttTimestamp(rawEnd);
      index += line.includes("-->") ? 1 : 2;

      const cueText = [];
      while (index < lines.length && lines[index].trim() !== "") {
        cueText.push(lines[index]);
        index += 1;
      }

      const mergedText = sanitizeCueText(cueText.join(" "));
      if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !mergedText) {
        index += 1;
        continue;
      }

      cues.push({
        start,
        end,
        text: mergedText,
        lang: normalizeLanguageCode(language),
        isAuto: Boolean(isAuto),
      });

      index += 1;
    }

    return cues;
  }

  function isSafeCaptionUrl(value) {
    try {
      const parsed = new URL(String(value || ""));
      return parsed.protocol === "https:" || parsed.protocol === "http:";
    } catch (_) {
      return false;
    }
  }

  function clampInteger(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      return fallback;
    }
    return Math.min(max, Math.max(min, Math.round(numeric)));
  }

  function simpleHash(input) {
    const value = String(input || "");
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
    }
    return (hash >>> 0).toString(16);
  }

  const api = Object.freeze({
    sanitizeCueText,
    fetchWithRetry,
    parseVttTimestamp,
    parseVttCues,
    isSafeCaptionUrl,
    clampInteger,
    simpleHash,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2AdapterUtils = api;
})();
