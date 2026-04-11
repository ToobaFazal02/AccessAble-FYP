const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/module2/adapters/adapter-contracts.js");
require("../../extension/module2/adapters/adapter-utils.js");

const { parseVttCues } = require("../../extension/module2/adapters/adapter-utils.js");

test("parseVttCues handles spaces around timing arrow", () => {
  const vtt = "WEBVTT\n\n00:00.000 --> 00:01.000\nHello\n\n";
  const cues = parseVttCues(vtt, "en", false);

  assert.equal(cues.length, 1);
  assert.equal(cues[0].text, "Hello");
  assert.equal(cues[0].start, 0);
  assert.equal(cues[0].end, 1);
});
