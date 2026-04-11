const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/module2/adapters/adapter-contracts.js");
require("../../extension/module2/adapters/adapter-utils.js");
require("../../extension/module2/engine/cue-normalizer.js");
require("../../extension/module2/engine/language-fallback.js");
require("../../extension/module2/engine/active-cue-selector.js");

const { createCaptionEngine } = require("../../extension/module2/engine/caption-engine.js");

test("caption engine orchestrates adapter selection, cue load, and cue sync", async () => {
  const statuses = [];
  const emittedCues = [];
  const cacheStore = new Map();

  const unsupportedAdapter = {
    name: "unsupported",
    supports: () => false,
  };

  const supportedAdapter = {
    name: "supported",
    supports: () => true,
    discoverTracks: async () => [
      {
        id: "track_en",
        lang: "en",
        label: "English",
        isAuto: false,
        source: "test",
      },
    ],
    fetchCues: async () => [
      { start: 0, end: 1.2, text: "First", lang: "en", isAuto: false },
      { start: 1.3, end: 2.8, text: "Second", lang: "en", isAuto: false },
    ],
    bindTimeSource: (context, onTime) => {
      context.videoElement.emitTime = onTime;
      return () => {
        context.videoElement.emitTime = null;
      };
    },
    getContextKey: () => "test-video",
    destroy: () => {},
  };

  const engine = createCaptionEngine({
    adapters: [unsupportedAdapter, supportedAdapter],
    cueCache: {
      get: async (key) => cacheStore.get(key) || [],
      set: async (key, cues) => cacheStore.set(key, cues),
    },
    onCue: (cue) => emittedCues.push(cue),
    onStatus: (status) => statuses.push(status),
  });

  const videoElement = { currentTime: 0, emitTime: null };
  const context = {
    videoElement,
    mediaUrl: "https://example.com/video.mp4",
    pageUrl: "https://example.com/page",
    host: "example.com",
  };

  await engine.start(context, {
    preferredLanguages: ["en"],
    network: { timeoutMs: 1000, retries: 0 },
  });

  assert.equal(engine.getStatus().adapter, "supported");
  assert.ok(statuses.some((status) => status.stage === "ready"));
  assert.equal(typeof videoElement.emitTime, "function");

  videoElement.currentTime = 0.8;
  videoElement.emitTime(videoElement.currentTime);
  const firstCue = emittedCues[emittedCues.length - 1];
  assert.ok(firstCue);
  assert.equal(firstCue.text, "First");

  videoElement.currentTime = 1.8;
  videoElement.emitTime(videoElement.currentTime);
  const secondCue = emittedCues[emittedCues.length - 1];
  assert.ok(secondCue);
  assert.equal(secondCue.text, "Second");

  engine.stop();
  assert.equal(videoElement.emitTime, null);
});
