const test = require("node:test");
const assert = require("node:assert/strict");

const { findActiveCue } = require("../../extension/module2/engine/active-cue-selector.js");

const cues = [
  { start: 0, end: 1, text: "A", lang: "en", isAuto: false },
  { start: 1.2, end: 2.4, text: "B", lang: "en", isAuto: false },
  { start: 3, end: 4, text: "C", lang: "en", isAuto: false },
];

test("findActiveCue returns active cue at playback time", () => {
  const match = findActiveCue(cues, 1.5, -1);
  assert.equal(match.index, 1);
  assert.equal(match.cue.text, "B");
});

test("findActiveCue returns none when no cue is active", () => {
  const match = findActiveCue(cues, 2.6, -1);
  assert.equal(match.index, -1);
  assert.equal(match.cue, null);
});

test("findActiveCue can reuse previous index for faster lookup", () => {
  const first = findActiveCue(cues, 0.5, -1);
  const second = findActiveCue(cues, 1.4, first.index);
  assert.equal(first.index, 0);
  assert.equal(second.index, 1);
});
