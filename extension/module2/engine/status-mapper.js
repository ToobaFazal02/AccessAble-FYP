"use strict";

(() => {
  function getCaptionStatusPresentation(status) {
    const stage = String(status?.stage || "");
    const reason = String(status?.reason || "").trim();

    switch (stage) {
      case "ready":
        return { code: "ready", message: "", isError: false, show: false };
      case "discovering":
        return { code: stage, message: "Loading captions...", isError: false, show: true };
      case "no_tracks":
        return {
          code: stage,
          message: "No caption tracks found for this video",
          isError: false,
          show: true,
        };
      case "no_cues":
        return {
          code: stage,
          message: "Caption tracks were found but no cues could be loaded",
          isError: false,
          show: true,
        };
      case "backend_unreachable":
        return {
          code: stage,
          message: "Caption backend unavailable",
          isError: true,
          show: true,
        };
      case "parser_error":
        return {
          code: stage,
          message: "Caption data could not be parsed",
          isError: true,
          show: true,
        };
      case "unavailable":
        return { code: stage, message: "No active video found", isError: false, show: true };
      case "unsupported":
        return { code: stage, message: "Unsupported video source", isError: false, show: true };
      case "error":
        return {
          code: stage,
          message: reason || "Caption engine error",
          isError: true,
          show: true,
        };
      case "disabled":
        return { code: stage, message: "", isError: false, show: false };
      default:
        if (!reason) {
          return { code: stage || "unknown", message: "", isError: false, show: false };
        }
        return { code: stage || "unknown", message: reason, isError: false, show: true };
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
