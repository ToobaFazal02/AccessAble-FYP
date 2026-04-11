const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/module2/adapters/adapter-contracts.js");
const { chooseBestTrack } = require("../../extension/module2/engine/language-fallback.js");

test("chooseBestTrack prefers exact manual language match", () => {
  const tracks = [
    { id: "1", lang: "en", label: "English Auto", isAuto: true },
    { id: "2", lang: "en", label: "English", isAuto: false },
    { id: "3", lang: "es", label: "Spanish", isAuto: false },
  ];

  const selected = chooseBestTrack(tracks, ["en"]);
  assert.ok(selected);
  assert.equal(selected.id, "2");
});

test("chooseBestTrack falls back from regional preference to base language", () => {
  const tracks = [
    { id: "1", lang: "en", label: "English", isAuto: false },
    { id: "2", lang: "de", label: "German", isAuto: false },
  ];

  const selected = chooseBestTrack(tracks, ["en-GB"]);
  assert.ok(selected);
  assert.equal(selected.id, "1");
});
