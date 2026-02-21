"use strict";

(() => {
  const state = {
    highlighted: false,
  };

  function scanCandidates() {
    const candidates = [];
    const seen = new Set();

    const html5Videos = document.querySelectorAll("video");
    for (const video of html5Videos) {
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
      const src = iframe.getAttribute("src") || "";
      const normalized = toAbsolute(src);
      if (!normalized || !isKnownVideoHost(normalized) || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      candidates.push({
        source: "iframe",
        url: normalized,
        label: "Embedded video",
        hasTrack: false,
      });
    }

    return candidates.slice(0, 15);
  }

  function enableHighlights() {
    if (state.highlighted) {
      return { highlighted: true };
    }
    state.highlighted = true;
    document.body.setAttribute("data-accessable-caption-scan", "true");
    applyMarkers();
    return { highlighted: true };
  }

  function disableHighlights() {
    state.highlighted = false;
    document.body.removeAttribute("data-accessable-caption-scan");
    clearMarkers();
    return { highlighted: false };
  }

  function getStatus() {
    return { highlighted: state.highlighted };
  }

  function applyMarkers() {
    clearMarkers();

    const targets = document.querySelectorAll("video, iframe[src]");
    let index = 1;
    for (const target of targets) {
      const url = target.tagName === "VIDEO" ? getVideoSource(target) : toAbsolute(target.getAttribute("src"));
      if (!url || !isKnownVideoHost(url)) {
        continue;
      }
      target.setAttribute("data-accessable-video-target", String(index));
      index += 1;
    }
  }

  function clearMarkers() {
    document
      .querySelectorAll("[data-accessable-video-target]")
      .forEach((node) => node.removeAttribute("data-accessable-video-target"));
  }

  function getVideoSource(videoElement) {
    if (!(videoElement instanceof HTMLVideoElement)) {
      return "";
    }

    const direct = videoElement.currentSrc || videoElement.getAttribute("src") || "";
    if (direct) {
      return toAbsolute(direct);
    }

    const source = videoElement.querySelector("source[src]");
    return toAbsolute(source?.getAttribute("src") || "");
  }

  function buildVideoLabel(videoElement, fallbackUrl) {
    const ariaLabel = videoElement.getAttribute("aria-label");
    if (ariaLabel && ariaLabel.trim().length > 0) {
      return ariaLabel.trim();
    }
    const title = videoElement.getAttribute("title");
    if (title && title.trim().length > 0) {
      return title.trim();
    }
    try {
      const parsed = new URL(fallbackUrl);
      return parsed.hostname.replace(/^www\./, "");
    } catch (_) {
      return "Video source";
    }
  }

  function toAbsolute(value) {
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
        host.includes("vimeo.com") ||
        host.includes("dailymotion.com") ||
        host.includes("twitch.tv") ||
        host.includes("youtube-nocookie.com")
      );
    } catch (_) {
      return false;
    }
  }

  globalThis.AccessAbleModuleCaptions = {
    scanCandidates,
    enableHighlights,
    disableHighlights,
    getStatus,
  };
})();
