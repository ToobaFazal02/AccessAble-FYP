const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/module2/adapters/adapter-contracts.js");
require("../../extension/module2/adapters/adapter-utils.js");
const { normalizeCues } = require("../../extension/module2/engine/cue-normalizer.js");

test("normalizeCues sanitizes and normalizes external cues", () => {
  const output = normalizeCues(
    [
      { start: 0, end: 1.8, text: "<b>Hello</b> &amp; welcome", lang: "EN-US", isAuto: true },
      { start: 2, end: 4, text: "Second cue", lang: "en-US", isAuto: true },
    ],
    { lang: "en", isAuto: false }
  );

  assert.equal(output.length, 2);
  assert.deepEqual(output[0], {
    start: 0,
    end: 1.8,
    text: "Hello & welcome",
    lang: "en-us",
    isAuto: true,
  });
});

test("normalizeCues drops invalid or empty cues", () => {
  const output = normalizeCues(
    [
      { start: 5, end: 2, text: "bad range", lang: "en", isAuto: false },
      { start: -1, end: 1, text: "negative", lang: "en", isAuto: false },
      { start: 1, end: 2, text: "   ", lang: "en", isAuto: false },
      { start: 3, end: 4.5, text: "valid", lang: "en", isAuto: false },
    ],
    { lang: "en", isAuto: false }
  );

  assert.equal(output.length, 1);
  assert.equal(output[0].text, "valid");
});
