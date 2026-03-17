const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/shared/contracts.js");
require("../../extension/module2/adapters/adapter-contracts.js");
require("../../extension/module2/adapters/adapter-utils.js");
require("../../extension/module2/engine/cue-normalizer.js");

const { createYouTubeAdapter } = require("../../extension/module2/adapters/youtube-adapter.js");

function mockChromeRuntime(responseFactory) {
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (message, callback) => {
        const response = responseFactory(message);
        callback(response);
      },
    },
  };
}

test("youtube adapter falls back to backend when player response has no tracks", async () => {
  globalThis.ytInitialPlayerResponse = {
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  };

  mockChromeRuntime(() => ({
    ok: true,
    data: {
      caption_tracks: [
        {
          url: "https://example.com/captions.vtt",
          language: "en",
          language_name: "English",
          auto_generated: false,
        },
      ],
    },
  }));

  const adapter = createYouTubeAdapter();
  const tracks = await adapter.discoverTracks(
    {
      videoElement: null,
      mediaUrl: "",
      pageUrl: "https://www.youtube.com/watch?v=abc",
      host: "www.youtube.com",
    },
    { debug: false }
  );

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].source, "youtube_backend");
});

test("youtube adapter uses backend when player response is unavailable", async () => {
  globalThis.ytInitialPlayerResponse = null;
  globalThis.ytplayer = null;

  mockChromeRuntime(() => ({
    ok: true,
    data: {
      caption_tracks: [
        {
          url: "https://example.com/captions.vtt",
          language: "en",
          language_name: "English",
          auto_generated: false,
        },
      ],
    },
  }));

  const adapter = createYouTubeAdapter();
  const tracks = await adapter.discoverTracks(
    {
      videoElement: null,
      mediaUrl: "",
      pageUrl: "https://www.youtube.com/watch?v=xyz",
      host: "www.youtube.com",
    },
    { debug: false }
  );

  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].source, "youtube_backend");
});

test("youtube adapter prefers pageUrl over blob mediaUrl for backend fallback", async () => {
  globalThis.ytInitialPlayerResponse = {
    captions: { playerCaptionsTracklistRenderer: { captionTracks: [] } },
  };

  let lastMessage = null;
  mockChromeRuntime((message) => {
    lastMessage = message;
    return {
      ok: true,
      data: { caption_tracks: [] },
    };
  });

  const adapter = createYouTubeAdapter();
  await adapter.discoverTracks(
    {
      videoElement: null,
      mediaUrl: "blob:https://www.youtube.com/12345",
      pageUrl: "https://www.youtube.com/watch?v=blobpref",
      host: "www.youtube.com",
    },
    { debug: false }
  );

  assert.ok(lastMessage);
  assert.equal(lastMessage.payload.videoUrl, "https://www.youtube.com/watch?v=blobpref");
});
