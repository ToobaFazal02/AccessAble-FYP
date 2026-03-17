const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getCaptionStatusPresentation,
} = require("../../extension/module2/engine/status-mapper.js");

test("status mapper separates no_tracks and no_cues messages", () => {
  const noTracks = getCaptionStatusPresentation({ stage: "no_tracks" });
  const noCues = getCaptionStatusPresentation({ stage: "no_cues" });

  assert.ok(noTracks.message.includes("No caption tracks"));
  assert.equal(noTracks.isError, false);
  assert.ok(noCues.message.includes("no cues"));
  assert.equal(noCues.isError, false);
});

test("status mapper marks backend_unreachable and parser_error as errors", () => {
  const backend = getCaptionStatusPresentation({ stage: "backend_unreachable" });
  const parser = getCaptionStatusPresentation({ stage: "parser_error" });

  assert.ok(backend.message.toLowerCase().includes("backend"));
  assert.equal(backend.isError, true);
  assert.ok(parser.message.toLowerCase().includes("parsed"));
  assert.equal(parser.isError, true);
});
