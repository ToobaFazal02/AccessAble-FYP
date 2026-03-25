"use strict";

importScripts("../shared/contracts.js", "backend-url.js");

const {
  API_BASE_URL,
  ACTIONS,
  ENDPOINTS,
  STORAGE_KEYS,
  DEFAULT_SETTINGS,
  DEFAULT_STATE,
  CACHE_POLICY,
  REQUEST_POLICY,
  DEFAULT_CAPTIONS_SETTINGS,
  toAbsoluteUrl,
  normalizeUrl,
  getDomain,
} = globalThis.AccessAbleContracts;

const backendUrlApi = globalThis.AccessAbleBackendUrl || {};
const resolveBackendBaseUrl =
  backendUrlApi.resolveBackendBaseUrl || (async () => API_BASE_URL);
const buildRequestUrl =
  backendUrlApi.buildRequestUrl || ((_baseUrl, endpoint) => toAbsoluteUrl(endpoint));

const IMAGE_CACHE_SCOPE = "image";
const CAPTIONS_CACHE_SCOPE = "captions";
const TELEMETRY_SCOPE = "keyboard";
const IMAGE_ALT_INJECTED_ACTION = "image.altInjected";

const IMAGE_QUEUE_POLICY = Object.freeze({
  MAX_CONCURRENT_TASKS: 2,
  MIN_DELAY_BETWEEN_REQUESTS_MS: 350,
  MAX_RETRIES: 5,
  RETRY_BASE_DELAY_MS: 15000,
  RETRY_MAX_DELAY_MS: 30000,
  RETRY_JITTER_MS: 1200,
});

const inflightRequests = new Map();

class RequestQueue {
  constructor(maxConcurrent, minDelayMs) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
    this.running = 0;
    this.queue = [];
    this.lastStartedAt = 0;
  }

  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({ taskFn, resolve, reject });
      this.pump();
    });
  }

  async pump() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const delayNeeded = Math.max(
      0,
      this.minDelayMs - (Date.now() - this.lastStartedAt)
    );
    if (delayNeeded > 0) {
      setTimeout(() => this.pump(), delayNeeded);
      return;
    }

    const next = this.queue.shift();
    if (!next) {
      return;
    }

    this.running += 1;
    this.lastStartedAt = Date.now();

    try {
      const result = await next.taskFn();
      next.resolve(result);
    } catch (error) {
      next.reject(error);
    } finally {
      this.running -= 1;
      this.pump();
    }
  }
}

class RateLimitedRetryQueue {
  constructor({
    maxConcurrent,
    minDelayMs,
    maxRetries,
    retryStatusCodes,
    retryBaseDelayMs,
    retryMaxDelayMs,
    retryJitterMs,
  }) {
    this.maxConcurrent = maxConcurrent;
    this.minDelayMs = minDelayMs;
    this.maxRetries = maxRetries;
    this.retryStatusCodes = new Set(retryStatusCodes);
    this.retryBaseDelayMs = retryBaseDelayMs;
    this.retryMaxDelayMs = retryMaxDelayMs;
    this.retryJitterMs = retryJitterMs;

    this.running = 0;
    this.queue = [];
    this.lastStartedAt = 0;
    this.pausedUntil = 0;
    this.pumpTimer = null;
    this.scheduledPumpAt = 0;
  }

  enqueue(taskFn) {
    return new Promise((resolve, reject) => {
      this.queue.push({
        taskFn,
        resolve,
        reject,
        attempt: 0,
      });
      this.pump();
    });
  }

  pump() {
    while (this.running < this.maxConcurrent && this.queue.length > 0) {
      const now = Date.now();

      if (now < this.pausedUntil) {
        this.schedulePump(this.pausedUntil - now);
        return;
      }

      const delayNeeded = Math.max(0, this.minDelayMs - (now - this.lastStartedAt));
      if (delayNeeded > 0) {
        this.schedulePump(delayNeeded);
        return;
      }

      const next = this.queue.shift();
      if (!next) {
        return;
      }

      this.running += 1;
      this.lastStartedAt = Date.now();

      void this.runTask(next).finally(() => {
        this.running -= 1;
        this.pump();
      });
    }
  }

  async runTask(task) {
    try {
      const response = await task.taskFn();
      const statusCode = Number(response?.status || 0);

      if (this.shouldRetryStatus(statusCode) && task.attempt < this.maxRetries) {
        task.attempt += 1;
        const retryAfterMs = Number(response?.retryAfterMs || 0);
        const backoffMs = this.calculateBackoffMs(task.attempt, retryAfterMs);

        // Global queue pause: no new image work starts until cooldown expires.
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + backoffMs);
        // Retry the same image first so we never drop failed items.
        this.queue.unshift(task);
        this.schedulePump(backoffMs);
        return;
      }

      task.resolve(response);
    } catch (error) {
      if (task.attempt < this.maxRetries) {
        task.attempt += 1;
        const backoffMs = this.calculateBackoffMs(task.attempt, 0);
        this.pausedUntil = Math.max(this.pausedUntil, Date.now() + backoffMs);
        this.queue.unshift(task);
        this.schedulePump(backoffMs);
        return;
      }

      task.reject(error);
    }
  }

  shouldRetryStatus(statusCode) {
    return this.retryStatusCodes.has(statusCode);
  }

  calculateBackoffMs(attempt, retryAfterMs) {
    const exponential = this.retryBaseDelayMs * Math.pow(2, Math.max(0, attempt - 1));
    const capped = Math.min(exponential, this.retryMaxDelayMs);
    const jitter = Math.floor(Math.random() * this.retryJitterMs);
    return Math.max(capped + jitter, retryAfterMs || 0);
  }

  schedulePump(delayMs) {
    const targetAt = Date.now() + Math.max(0, Number(delayMs) || 0);

    if (this.pumpTimer && this.scheduledPumpAt <= targetAt) {
      return;
    }

    if (this.pumpTimer) {
      clearTimeout(this.pumpTimer);
    }

    this.scheduledPumpAt = targetAt;
    this.pumpTimer = setTimeout(() => {
      this.pumpTimer = null;
      this.scheduledPumpAt = 0;
      this.pump();
    }, Math.max(0, targetAt - Date.now()));
  }
}

const networkQueue = new RequestQueue(
  REQUEST_POLICY.MAX_CONCURRENT_NETWORK_TASKS,
  REQUEST_POLICY.MIN_DELAY_BETWEEN_REQUESTS_MS
);

// Dedicated queue for image AI calls. Free-tier quotas are strict, so we allow only
// a few concurrent requests and pause the full queue when 429/503 is returned.
const imageQueue = new RateLimitedRetryQueue({
  maxConcurrent: IMAGE_QUEUE_POLICY.MAX_CONCURRENT_TASKS,
  minDelayMs: IMAGE_QUEUE_POLICY.MIN_DELAY_BETWEEN_REQUESTS_MS,
  maxRetries: IMAGE_QUEUE_POLICY.MAX_RETRIES,
  retryStatusCodes: [429, 503],
  retryBaseDelayMs: IMAGE_QUEUE_POLICY.RETRY_BASE_DELAY_MS,
  retryMaxDelayMs: IMAGE_QUEUE_POLICY.RETRY_MAX_DELAY_MS,
  retryJitterMs: IMAGE_QUEUE_POLICY.RETRY_JITTER_MS,
});

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.sync.get([
    STORAGE_KEYS.SETTINGS,
    STORAGE_KEYS.STATE,
  ]);
  const mergedSettings = Object.assign(
    {},
    DEFAULT_SETTINGS,
    stored[STORAGE_KEYS.SETTINGS] || {}
  );
  const mergedState = Object.assign(
    {},
    DEFAULT_STATE,
    stored[STORAGE_KEYS.STATE] || {}
  );
  await chrome.storage.sync.set({
    [STORAGE_KEYS.SETTINGS]: mergedSettings,
    [STORAGE_KEYS.STATE]: mergedState,
  });
});

chrome.commands.onCommand.addListener((command) => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs && tabs[0];
    if (!tab || !tab.id) {
      return;
    }

    const commandMap = {
      "toggle-reader": ACTIONS.CONTENT_TOGGLE_READER,
      "pause-resume": ACTIONS.CONTENT_PAUSE_READER,
      "read-next": ACTIONS.CONTENT_READ_NEXT,
      "read-previous": ACTIONS.CONTENT_READ_PREVIOUS,
    };

    const action = commandMap[command];
    if (!action) {
      return;
    }

    chrome.tabs.sendMessage(tab.id, { action }, () => void chrome.runtime.lastError);
  });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  void routeMessage(request, sender)
    .then((response) => sendResponse(response))
    .catch((error) =>
      sendResponse({
        ok: false,
        error: { message: error?.message || "Unexpected background error" },
      })
    );
  return true;
});

async function routeMessage(request, sender) {
  switch (request?.action) {
    case ACTIONS.PING:
      return { ok: true, data: { status: "ready" } };

    case ACTIONS.CHECK_BACKEND:
      return checkBackendHealth();

    case ACTIONS.IMAGE_ANALYZE_SINGLE:
      return analyzeSingleImage(request?.payload || {});

    case ACTIONS.IMAGE_ANALYZE_BATCH:
      return analyzeImageBatch(request?.payload || {});

    case ACTIONS.CAPTIONS_EXTRACT:
      return extractCaptions(request?.payload || {});

    case ACTIONS.CAPTIONS_ASSIST_SIMPLIFY:
    case ACTIONS.CAPTIONS_ASSIST_TRANSLATE:
    case ACTIONS.CAPTIONS_ASSIST_SUMMARIZE:
      return assistCaptions(request?.payload || {}, request?.action);

    case ACTIONS.KEYBOARD_TRACK_FIXES:
      return trackKeyboardFixes(request?.payload || {}, sender);

    case ACTIONS.KEYBOARD_GET_ANALYTICS:
      return fetchKeyboardAnalytics();

    case IMAGE_ALT_INJECTED_ACTION:
      return { ok: true, data: { acknowledged: true } };

    default:
      return {
        ok: false,
        error: { message: `Unknown action: ${request?.action || "undefined"}` },
      };
  }
}

async function checkBackendHealth() {
  try {
    const response = await queuedRequest({
      requestKey: "backend_root_health",
      endpoint: ENDPOINTS.ROOT,
      method: "GET",
      useQueue: false,
      parseJson: true,
    });

    return {
      ok: response.ok,
      data: {
        connected: response.ok,
        statusCode: response.status,
      },
      error: response.ok
        ? null
        : { message: `Backend returned ${response.status}` },
    };
  } catch (error) {
    return { ok: false, data: { connected: false }, error: { message: error.message } };
  }
}

async function analyzeSingleImage(payload) {
  const imageUrl = normalizeUrl(payload.imageUrl);
  const pageUrl = normalizeUrl(payload.pageUrl);

  if (!imageUrl) {
    return { ok: false, error: { message: "Invalid image URL" } };
  }

  const result = await getOrAnalyzeImage(imageUrl, pageUrl);
  return {
    ok: true,
    data: {
      result,
    },
  };
}

async function analyzeImageBatch(payload) {
  const pageUrl = normalizeUrl(payload.pageUrl);
  const images = Array.isArray(payload.images) ? payload.images : [];
  const normalized = [];
  const seenUrls = new Set();

  for (const item of images) {
    const imageUrl = normalizeUrl(item?.url);
    const elementId = typeof item?.elementId === "string" ? item.elementId : "";
    if (!imageUrl || !elementId) {
      continue;
    }
    if (seenUrls.has(imageUrl)) {
      continue;
    }
    seenUrls.add(imageUrl);
    normalized.push({ elementId, url: imageUrl });
  }

  if (normalized.length === 0) {
    return { ok: true, data: { results: [] } };
  }

  const results = [];
  for (const image of normalized) {
    try {
      const analysis = await getOrAnalyzeImage(image.url, pageUrl);
      results.push({
        elementId: image.elementId,
        url: image.url,
        description: analysis.description,
        fromCache: analysis.fromCache,
        error: analysis.error || null,
      });
    } catch (error) {
      results.push({
        elementId: image.elementId,
        url: image.url,
        description: "",
        fromCache: false,
        error: error.message || "Image analysis failed",
      });
    }
  }

  return { ok: true, data: { results } };
}

async function getOrAnalyzeImage(imageUrl, pageUrl) {
  const cacheKey = cacheKeyFor(IMAGE_CACHE_SCOPE, imageUrl);
  const cached = await readCache(cacheKey, CACHE_POLICY.IMAGE_TTL_MS);
  if (cached) {
    return {
      description: cached.description,
      confidence: cached.confidence ?? null,
      source: cached.source || "cache",
      fromCache: true,
      error: cached.error || null,
    };
  }

  const negative = await readCache(`${cacheKey}:negative`, CACHE_POLICY.NEGATIVE_TTL_MS);
  if (negative) {
    return {
      description: "",
      confidence: null,
      source: "negative_cache",
      fromCache: true,
      error: negative.error || "Image skipped due to previous validation failure",
    };
  }

  const requestKey = `image:${imageUrl}`;
  const response = await queuedImageRequest({
    requestKey,
    endpoint: ENDPOINTS.IMAGE_ANALYZE,
    method: "POST",
    body: {
      image_url: imageUrl,
      page_url: pageUrl || undefined,
    },
    parseJson: true,
  });

  if (!response.ok) {
    if (response.status === 400) {
      await writeCache(`${cacheKey}:negative`, {
        error: "Unsupported or unreadable image URL",
      });
      return {
        description: "",
        confidence: null,
        source: "negative_cache",
        fromCache: false,
        error: "Unsupported or unreadable image URL",
      };
    }

    const errorMessage = response.payload?.detail || `API error ${response.status}`;
    throw new Error(typeof errorMessage === "string" ? errorMessage : "Image analysis failed");
  }

  const payload = response.payload || {};
  const normalized = {
    description: payload.description || "",
    confidence: payload.confidence ?? null,
    source: payload.source || "AI_Generated",
  };

  await writeCache(cacheKey, normalized);

  return {
    description: normalized.description,
    confidence: normalized.confidence,
    source: normalized.source,
    fromCache: false,
    error: null,
  };
}

function logCaptionsDebug(event, detail) {
  if (!globalThis.console || typeof console.debug !== "function") {
    return;
  }
  const payload = detail && typeof detail === "object" ? detail : { detail };
  console.debug("[AccessAble][Module2][Captions]", { event, ...payload });
}

async function extractCaptions(payload) {
  const videoUrl = normalizeUrl(payload.videoUrl);
  const pageUrl = normalizeUrl(payload.pageUrl);

  if (!videoUrl) {
    return { ok: false, error: { message: "Invalid video URL" } };
  }

  const cacheKey = cacheKeyFor(CAPTIONS_CACHE_SCOPE, videoUrl);
  const cached = await readCache(cacheKey, CACHE_POLICY.CAPTIONS_TTL_MS);
  if (cached) {
    return { ok: true, data: { ...cached, fromCache: true } };
  }

  const baseUrl = await resolveBackendBaseUrl();
  logCaptionsDebug("captions_extract_request", {
    videoUrl,
    baseUrl,
    endpoint: ENDPOINTS.CAPTIONS_EXTRACT,
  });

  const requestKey = `captions:${videoUrl}`;
  const response = await queuedRequest({
    requestKey,
    endpoint: ENDPOINTS.CAPTIONS_EXTRACT,
    method: "POST",
    body: {
      video_url: videoUrl,
      page_url: pageUrl || undefined,
    },
    parseJson: true,
    baseUrl,
  });

  if (!response.ok) {
    const detail = response.payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.error || `Caption extraction failed (${response.status})`;
    logCaptionsDebug("captions_extract_response", {
      endpoint: ENDPOINTS.CAPTIONS_EXTRACT,
      status: response.status,
      error: message,
    });
    return { ok: false, error: { message, statusCode: response.status } };
  }

  logCaptionsDebug("captions_extract_response", {
    endpoint: ENDPOINTS.CAPTIONS_EXTRACT,
    status: response.status,
  });

  const data = response.payload || {};
  const normalized = {
    video_url: data.video_url || videoUrl,
    has_captions: Boolean(data.has_captions),
    caption_tracks: Array.isArray(data.caption_tracks) ? data.caption_tracks : [],
    video_title: data.video_title || "",
    video_duration: data.video_duration || null,
    platform: data.platform || "",
    source: data.source || "Caption_Metadata",
    cached: Boolean(data.cached),
    response_time_sec: data.response_time_sec || null,
  };

  await writeCache(cacheKey, normalized);
  return { ok: true, data: { ...normalized, fromCache: false } };
}

async function assistCaptions(payload, action) {
  const endpointMap = {
    [ACTIONS.CAPTIONS_ASSIST_SIMPLIFY]: ENDPOINTS.CAPTIONS_ASSIST_SIMPLIFY,
    [ACTIONS.CAPTIONS_ASSIST_TRANSLATE]: ENDPOINTS.CAPTIONS_ASSIST_TRANSLATE,
    [ACTIONS.CAPTIONS_ASSIST_SUMMARIZE]: ENDPOINTS.CAPTIONS_ASSIST_SUMMARIZE,
  };
  const endpoint = endpointMap[action];
  if (!endpoint) {
    return { ok: false, error: { message: "Unknown assist action" } };
  }

  const cues = Array.isArray(payload?.cues) ? payload.cues : [];
  if (cues.length === 0) {
    return { ok: false, error: { message: "Invalid assist payload" } };
  }

  const timeoutMs = clampInteger(
    payload?.timeoutMs,
    500,
    15000,
    DEFAULT_CAPTIONS_SETTINGS?.assist?.timeoutMs || 2500
  );
  const retries = clampInteger(
    payload?.retries,
    0,
    3,
    DEFAULT_CAPTIONS_SETTINGS?.assist?.retries || 1
  );

  const response = await requestWithRetryBounded({
    endpoint,
    method: "POST",
    body: {
      mode: String(payload?.mode || "").trim(),
      cues,
      source_lang: String(payload?.source_lang || ""),
      target_lang: String(payload?.target_lang || ""),
      page_url: normalizeUrl(payload?.page_url || ""),
      video_url: normalizeUrl(payload?.video_url || ""),
      telemetry_enabled: payload?.telemetry_enabled === true,
    },
    parseJson: true,
    timeoutMs,
    retries,
  });

  if (!response.ok) {
    const detail = response.payload?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.error || `Caption assist failed (${response.status})`;
    return { ok: false, error: { message, statusCode: response.status } };
  }

  return { ok: true, data: response.payload || {} };
}

async function trackKeyboardFixes(payload, sender) {
  const url = normalizeUrl(payload.url || sender?.tab?.url || "");
  const domain = getDomain(url);
  const fixesApplied = Array.isArray(payload.fixesApplied)
    ? payload.fixesApplied.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  if (!url || !domain || fixesApplied.length === 0) {
    return { ok: false, error: { message: "Invalid keyboard fix report payload" } };
  }

  const telemetryKey = cacheKeyFor(
    TELEMETRY_SCOPE,
    `${domain}:${url}:${fixesApplied.slice().sort().join(",")}`
  );
  const recentTelemetry = await readCache(
    telemetryKey,
    CACHE_POLICY.TELEMETRY_DEDUPE_TTL_MS
  );
  if (recentTelemetry) {
    return { ok: true, data: { status: "deduped", domain } };
  }

  const response = await queuedRequest({
    requestKey: `keyboard:${telemetryKey}`,
    endpoint: ENDPOINTS.KEYBOARD_TRACK_FIXES,
    method: "POST",
    body: {
      url,
      domain,
      fixes_applied: fixesApplied,
      user_agent: payload.userAgent || "AccessAble Extension",
    },
    parseJson: true,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: {
        message: `Keyboard telemetry failed (${response.status})`,
        statusCode: response.status,
      },
    };
  }

  await writeCache(telemetryKey, { sentAt: Date.now() });
  return { ok: true, data: response.payload || { status: "recorded", domain } };
}

async function fetchKeyboardAnalytics() {
  const response = await queuedRequest({
    requestKey: "keyboard:analytics",
    endpoint: ENDPOINTS.KEYBOARD_ANALYTICS,
    method: "GET",
    parseJson: true,
  });

  if (!response.ok) {
    return {
      ok: false,
      error: { message: `Analytics request failed (${response.status})` },
    };
  }

  return { ok: true, data: response.payload || {} };
}

async function queuedRequest({
  requestKey,
  endpoint,
  method,
  body,
  parseJson,
  useQueue = true,
  baseUrl,
}) {
  if (inflightRequests.has(requestKey)) {
    return inflightRequests.get(requestKey);
  }

  const task = async () =>
    requestWithRetry({
      endpoint,
      method,
      body,
      parseJson,
      baseUrl,
    });

  const wrapped = (useQueue ? networkQueue.enqueue(task) : task()).finally(() => {
    inflightRequests.delete(requestKey);
  });

  inflightRequests.set(requestKey, wrapped);
  return wrapped;
}

async function queuedImageRequest({ requestKey, endpoint, method, body, parseJson }) {
  if (inflightRequests.has(requestKey)) {
    return inflightRequests.get(requestKey);
  }

  const task = async () =>
    performFetch({
      endpoint,
      method,
      body,
      parseJson,
    });

  const wrapped = imageQueue.enqueue(task).finally(() => {
    inflightRequests.delete(requestKey);
  });

  inflightRequests.set(requestKey, wrapped);
  return wrapped;
}

async function requestWithRetry({ endpoint, method, body, parseJson, baseUrl }) {
  let attempt = 0;

  while (attempt <= REQUEST_POLICY.MAX_RETRIES) {
    const response = await performFetch({
      endpoint,
      method,
      body,
      parseJson,
      baseUrl,
    });

    if (!shouldRetry(response.status) || attempt === REQUEST_POLICY.MAX_RETRIES) {
      return response;
    }

    const backoff = REQUEST_POLICY.RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
    const jitter = Math.floor(Math.random() * REQUEST_POLICY.RETRY_JITTER_MS);
    await sleep(backoff + jitter);
    attempt += 1;
  }

  return {
    ok: false,
    status: 599,
    payload: null,
  };
}

async function requestWithRetryBounded({
  endpoint,
  method,
  body,
  parseJson,
  timeoutMs,
  retries,
}) {
  let attempt = 0;
  const maxRetries = clampInteger(retries, 0, 5, 0);

  while (attempt <= maxRetries) {
    const response = await performFetch({
      endpoint,
      method,
      body,
      parseJson,
      timeoutMs,
    });

    if (response.ok || attempt === maxRetries) {
      return response;
    }

    await sleep(300 * (attempt + 1));
    attempt += 1;
  }

  return {
    ok: false,
    status: 599,
    payload: null,
  };
}

async function performFetch({ endpoint, method, body, parseJson, timeoutMs, baseUrl }) {
  const controller = timeoutMs ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => controller.abort(), Math.max(0, Number(timeoutMs) || 0))
    : null;
  try {
    const response = await fetch(buildRequestUrl(baseUrl, endpoint), {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller?.signal,
    });

    let payload = null;
    if (parseJson) {
      try {
        payload = await response.json();
      } catch (_) {
        payload = null;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      payload,
      retryAfterMs: parseRetryAfterHeader(response.headers.get("Retry-After")),
    };
  } catch (error) {
    const isTimeout = controller?.signal?.aborted;
    return {
      ok: false,
      status: 598,
      payload: { detail: isTimeout ? "Request timed out" : error.message || "Network failure" },
      retryAfterMs: 0,
    };
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function shouldRetry(statusCode) {
  return statusCode === 429 || statusCode === 503 || statusCode === 598;
}

function cacheKeyFor(scope, input) {
  return `${STORAGE_KEYS.CACHE_PREFIX}${scope}_${simpleHash(input)}`;
}

function simpleHash(input) {
  const value = String(input || "");
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash +=
      (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
  }
  return (hash >>> 0).toString(16);
}

async function readCache(key, ttlMs) {
  const entry = await chrome.storage.local.get([key]);
  const cached = entry[key];
  if (!cached || typeof cached !== "object") {
    return null;
  }

  if (Date.now() - Number(cached.savedAt || 0) > ttlMs) {
    await chrome.storage.local.remove([key]);
    return null;
  }

  return cached.value || null;
}

async function writeCache(key, value) {
  await chrome.storage.local.set({
    [key]: {
      savedAt: Date.now(),
      value,
    },
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterHeader(value) {
  if (!value || typeof value !== "string") {
    return 0;
  }

  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return asSeconds * 1000;
  }

  const asDate = Date.parse(value);
  if (Number.isNaN(asDate)) {
    return 0;
  }

  return Math.max(0, asDate - Date.now());
}

function clampInteger(value, min, max, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(numeric)));
}
