const test = require("node:test");
const assert = require("node:assert/strict");

require("../../extension/shared/contracts.js");

const {
  resolveBackendBaseUrl,
  DEBUG_BACKEND_URL_KEY,
} = require("../../extension/background/backend-url.js");

test.beforeEach(() => {
  globalThis.chrome = {
    storage: {
      local: {
        get: async () => ({}),
      },
    },
  };
});

test.afterEach(() => {
  delete globalThis.chrome;
});

test("uses default API base URL when no override configured", async () => {
  const baseUrl = await resolveBackendBaseUrl();
  assert.equal(baseUrl, globalThis.AccessAbleContracts.API_BASE_URL);
});

test("uses override base URL when configured", async () => {
  globalThis.chrome.storage.local.get = async () => ({
    [DEBUG_BACKEND_URL_KEY]: "http://localhost:8000/",
  });

  const baseUrl = await resolveBackendBaseUrl();
  assert.equal(baseUrl, "http://localhost:8000");
});
