"use strict";

(() => {
  const contracts = globalThis.AccessAbleContracts || {};
  const API_BASE_URL = contracts.API_BASE_URL || "";
  const DEBUG_BACKEND_URL_KEY = "accessable_debug_backend_url";

  function normalizeBackendBaseUrl(raw) {
    const value = String(raw || "").trim();
    if (!value) {
      return "";
    }

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        return "";
      }
      parsed.hash = "";
      return parsed.toString().replace(/\/$/, "");
    } catch (_) {
      return "";
    }
  }

  async function resolveBackendBaseUrl() {
    const storage = globalThis.chrome?.storage?.local;
    if (!storage || typeof storage.get !== "function") {
      return API_BASE_URL;
    }

    const data = await storage.get([DEBUG_BACKEND_URL_KEY]);
    const override = normalizeBackendBaseUrl(data?.[DEBUG_BACKEND_URL_KEY]);
    return override || API_BASE_URL;
  }

  function buildRequestUrl(baseUrl, endpoint) {
    const normalizedBase = normalizeBackendBaseUrl(baseUrl) || API_BASE_URL;
    const base = String(normalizedBase || "").replace(/\/$/, "");
    return `${base}${endpoint}`;
  }

  const api = Object.freeze({
    DEBUG_BACKEND_URL_KEY,
    normalizeBackendBaseUrl,
    resolveBackendBaseUrl,
    buildRequestUrl,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleBackendUrl = api;
})();
