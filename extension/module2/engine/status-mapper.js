"use strict";

(() => {
  const STATUS_TTL_MS = Object.freeze({
    discovering: 2000,
    no_tracks: 4000,
    no_cues: 4000,
    backend_unreachable: 7000,
    parser_error: 7000,
    error: 7000,
  });
  const DEFAULT_TTL_MS = 2500;

  function getCaptionStatusPresentation(status) {
    const stage = String(status?.stage || "");
    const reason = String(status?.reason || "").trim();
    const ttlMs = STATUS_TTL_MS[stage] || DEFAULT_TTL_MS;

    switch (stage) {
      case "ready":
        return { code: "ready", message: "", isError: false, show: false, ttlMs };
      case "discovering":
        return { code: stage, message: "Loading captions...", isError: false, show: true, ttlMs };
      case "no_tracks":
        return {
          code: stage,
          message: "No caption tracks found for this video",
          isError: false,
          show: true,
          ttlMs,
        };
      case "no_cues":
        return {
          code: stage,
          message: "Caption tracks were found but no cues could be loaded",
          isError: false,
          show: true,
          ttlMs,
        };
      case "backend_unreachable":
        return {
          code: stage,
          message: "Caption backend unavailable",
          isError: true,
          show: true,
          ttlMs,
        };
      case "parser_error":
        return {
          code: stage,
          message: "Caption data could not be parsed",
          isError: true,
          show: true,
          ttlMs,
        };
      case "unavailable":
        return {
          code: stage,
          message: "No active video found",
          isError: false,
          show: true,
          ttlMs,
        };
      case "unsupported":
        return {
          code: stage,
          message: "Unsupported video source",
          isError: false,
          show: true,
          ttlMs,
        };
      case "error":
        return {
          code: stage,
          message: reason || "Caption engine error",
          isError: true,
          show: true,
          ttlMs,
        };
      case "disabled":
        return { code: stage, message: "", isError: false, show: false, ttlMs };
      default:
        if (!reason) {
          return { code: stage || "unknown", message: "", isError: false, show: false, ttlMs };
        }
        return { code: stage || "unknown", message: reason, isError: false, show: true, ttlMs };
    }
  }

  const api = Object.freeze({
    getCaptionStatusPresentation,
  });

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalThis.AccessAbleModule2StatusMapper = api;
})();
