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

function createMockFetch(responsesByUrl) {
  return async (url) => {
    const response = responsesByUrl[url];
    if (!response) {
      throw new Error(`Unexpected fetch for ${url}`);
    }
    return {
      ok: response.ok !== false,
      status: response.status || 200,
      headers: {
        get: (name) =>
          name && name.toLowerCase() === "content-type" ? response.contentType || "" : null,
      },
      text: async () => String(response.body || ""),
      json: async () => JSON.parse(String(response.body || "")),
    };
  };
}

function mockRuntimeWithHandlers(handlers) {
  globalThis.chrome = {
    runtime: {
      lastError: null,
      sendMessage: (message, callback) => {
        const handler = handlers[message.action];
        const response = handler ? handler(message) : { ok: false, error: { message: "No handler" } };
        callback(response);
      },
    },
  };
}

test.afterEach(() => {
  delete globalThis.fetch;
  delete globalThis.chrome;
});

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

test("youtube adapter treats html payloads as non-caption content", async () => {
  globalThis.fetch = createMockFetch({
    "https://www.youtube.com/api/timedtext?fmt=json3": {
      contentType: "text/html; charset=UTF-8",
      body: "<!doctype html><html>Consent</html>",
    },
    "https://www.youtube.com/api/timedtext?fmt=vtt": {
      contentType: "text/html; charset=UTF-8",
      body: "<html>Blocked</html>",
    },
  });

  mockRuntimeWithHandlers({
    "captions.fetchTrackContent": () => ({
      ok: true,
      data: {
        status: 200,
        contentType: "text/html; charset=UTF-8",
        body: "<html>Blocked</html>",
      },
    }),
  });

  const adapter = createYouTubeAdapter();
  const cues = await adapter.fetchCues(
    { src: "https://www.youtube.com/api/timedtext", lang: "en", isAuto: false },
    {},
    { timeoutMs: 1000, retries: 0 }
  );

  assert.deepEqual(cues, []);
});

test("youtube adapter falls back to background fetch when direct payload is html", async () => {
  globalThis.fetch = createMockFetch({
    "https://www.youtube.com/api/timedtext?fmt=json3": {
      contentType: "text/html; charset=UTF-8",
      body: "<!doctype html><html>Consent</html>",
    },
    "https://www.youtube.com/api/timedtext?fmt=vtt": {
      contentType: "text/html; charset=UTF-8",
      body: "<html>Blocked</html>",
    },
  });

  mockRuntimeWithHandlers({
    "captions.fetchTrackContent": () => ({
      ok: true,
      data: {
        status: 200,
        contentType: "text/vtt",
        body: "WEBVTT\n\n00:00.000 -->00:01.000\nHello",
      },
    }),
  });

  const adapter = createYouTubeAdapter();
  const cues = await adapter.fetchCues(
    { src: "https://www.youtube.com/api/timedtext", lang: "en", isAuto: false },
    {},
    { timeoutMs: 1000, retries: 0 }
  );

  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Hello");
});

test("youtube adapter returns parser_error only for malformed caption payloads", async () => {
  globalThis.fetch = createMockFetch({
    "https://www.youtube.com/api/timedtext?fmt=json3": {
      contentType: "application/json",
      body: "{\"events\":[]}",
    },
    "https://www.youtube.com/api/timedtext?fmt=vtt": {
      contentType: "text/vtt",
      body: "WEBVTT\n\nBAD",
    },
  });

  mockRuntimeWithHandlers({
    "captions.fetchTrackContent": () => ({
      ok: true,
      data: {
        status: 200,
        contentType: "text/vtt",
        body: "WEBVTT\n\nBAD",
      },
    }),
  });

  const adapter = createYouTubeAdapter();
  try {
    await adapter.fetchCues(
      { src: "https://www.youtube.com/api/timedtext", lang: "en", isAuto: false },
      {},
      { timeoutMs: 1000, retries: 0 }
    );
    assert.fail("Expected parser_error");
  } catch (error) {
    assert.equal(error.code, "parser_error");
  }
});
