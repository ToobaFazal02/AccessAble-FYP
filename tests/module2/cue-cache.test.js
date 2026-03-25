const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/module2/adapters/adapter-contracts.js");
require("../../extension/module2/adapters/adapter-utils.js");
require("../../extension/module2/engine/cue-normalizer.js");

const { createCueCache } = require("../../extension/module2/state/cue-cache.js");

let store;

test.beforeEach(() => {
  store = new Map();
  globalThis.chrome = {
    storage: {
      local: {
        get: async (keys) => {
          if (keys === null) {
            return Object.fromEntries(store.entries());
          }
          const list = Array.isArray(keys) ? keys : [keys];
          const result = {};
          for (const key of list) {
            if (store.has(key)) {
              result[key] = store.get(key);
            }
          }
          return result;
        },
        set: async (items) => {
          for (const [key, value] of Object.entries(items || {})) {
            store.set(key, value);
          }
        },
        remove: async (keys) => {
          const list = Array.isArray(keys) ? keys : [keys];
          for (const key of list) {
            store.delete(key);
          }
        },
      },
    },
  };
});

test.afterEach(() => {
  delete globalThis.chrome;
  store = null;
});

test("cue cache returns stored cues on hit", async () => {
  const cache = createCueCache({ ttlMs: 10000 });
  const contextKey = "video-1";
  const cues = [
    { start: 0, end: 1, text: "Hello", lang: "en", isAuto: false },
    { start: 1.2, end: 2, text: "World", lang: "en", isAuto: false },
  ];

  await cache.set(contextKey, cues, "en", false);
  const stored = await cache.get(contextKey, "en", false);

  assert.equal(stored.length, 2);
  assert.equal(stored[0].text, "Hello");
  assert.equal(stored[1].text, "World");
});

test("cue cache returns empty on miss then returns after set", async () => {
  const cache = createCueCache({ ttlMs: 10000 });
  const contextKey = "video-2";
  const cues = [{ start: 0.4, end: 1.4, text: "Fresh", lang: "en", isAuto: false }];

  const miss = await cache.get(contextKey, "en", false);
  assert.deepEqual(miss, []);

  await cache.set(contextKey, cues, "en", false);
  const hit = await cache.get(contextKey, "en", false);
  assert.equal(hit.length, 1);
  assert.equal(hit[0].text, "Fresh");
});

test("cue cache separates entries by language and isAuto", async () => {
  const cache = createCueCache({ ttlMs: 10000 });
  const contextKey = "video-3";

  await cache.set(contextKey, [{ start: 0, end: 1, text: "EN", lang: "en", isAuto: false }], "en", false);
  await cache.set(contextKey, [{ start: 0, end: 1, text: "ES", lang: "es", isAuto: false }], "es", false);
  await cache.set(contextKey, [{ start: 0, end: 1, text: "AUTO", lang: "en", isAuto: true }], "en", true);

  const enManual = await cache.get(contextKey, "en", false);
  const esManual = await cache.get(contextKey, "es", false);
  const enAuto = await cache.get(contextKey, "en", true);

  assert.equal(enManual[0].text, "EN");
  assert.equal(esManual[0].text, "ES");
  assert.equal(enAuto[0].text, "AUTO");
});
