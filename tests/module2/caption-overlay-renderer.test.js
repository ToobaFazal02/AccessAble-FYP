const test = require("node:test");
const assert = require("node:assert/strict");
const { setTimeout: sleep } = require("node:timers/promises");

const {
  createCaptionOverlayRenderer,
} = require("../../extension/module2/renderer/caption-overlay-renderer.js");

const STATUS_WAIT_MS = 120;

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName || "").toUpperCase();
    this.children = [];
    this.parentNode = null;
    this.style = {};
    this.attributes = {};
    this.className = "";
    this.id = "";
    this.textContent = "";
  }

  setAttribute(name, value) {
    const key = String(name || "");
    this.attributes[key] = String(value);
    if (key === "id") {
      this.id = String(value);
    }
  }

  getAttribute(name) {
    const key = String(name || "");
    return Object.prototype.hasOwnProperty.call(this.attributes, key)
      ? this.attributes[key]
      : null;
  }

  appendChild(child) {
    if (!child) {
      return null;
    }
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  remove() {
    if (!this.parentNode) {
      return;
    }
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) {
      this.parentNode.children.splice(index, 1);
    }
    this.parentNode = null;
  }

  querySelector(selector) {
    return findFirst(this, selector);
  }

  querySelectorAll(selector) {
    return findAll(this, selector);
  }
}

function createFakeDocument() {
  const body = new FakeElement("body");
  const documentElement = new FakeElement("html");

  return {
    body,
    documentElement,
    createElement: (tagName) => new FakeElement(tagName),
    getElementById: (id) => findById(body, id) || findById(documentElement, id),
    querySelector: (selector) => findFirst(body, selector) || findFirst(documentElement, selector),
    querySelectorAll: (selector) => [
      ...findAll(body, selector),
      ...findAll(documentElement, selector),
    ],
  };
}

function findById(node, id) {
  if (!node) {
    return null;
  }
  if (node.id === id) {
    return node;
  }
  for (const child of node.children || []) {
    const match = findById(child, id);
    if (match) {
      return match;
    }
  }
  return null;
}

function findFirst(node, selector) {
  const matches = findAll(node, selector);
  return matches.length > 0 ? matches[0] : null;
}

function findAll(node, selector) {
  const result = [];
  if (!node || !selector) {
    return result;
  }
  if (matchesSelector(node, selector)) {
    result.push(node);
  }
  for (const child of node.children || []) {
    result.push(...findAll(child, selector));
  }
  return result;
}

function matchesSelector(node, selector) {
  if (!node || !selector) {
    return false;
  }
  if (selector.startsWith(".")) {
    const className = selector.slice(1);
    return String(node.className || "")
      .split(/\s+/)
      .includes(className);
  }
  if (selector.startsWith("#")) {
    return node.id === selector.slice(1);
  }
  return node.tagName.toLowerCase() === selector.toLowerCase();
}

test.beforeEach(() => {
  globalThis.document = createFakeDocument();
});

test.afterEach(() => {
  delete globalThis.document;
});

test("overlay renderer reuses existing overlay node", () => {
  const rendererA = createCaptionOverlayRenderer({});
  rendererA.mount();
  const rendererB = createCaptionOverlayRenderer({});
  rendererB.mount();

  assert.equal(document.body.children.length, 1);
  assert.equal(document.body.children[0].id, "accessable-captions-overlay");
});

test("overlay renderer auto-hides non-error status", async () => {
  const renderer = createCaptionOverlayRenderer({});
  renderer.showStatus("Loading captions...", false, { code: "discovering", ttlMs: 80 });

  const root = document.getElementById("accessable-captions-overlay");
  assert.ok(root);
  assert.equal(root.style.display, "block");

  await sleep(STATUS_WAIT_MS);

  assert.equal(root.style.display, "none");
});

test("overlay renderer auto-hides backend_unreachable status", async () => {
  const renderer = createCaptionOverlayRenderer({});
  renderer.showStatus("Caption backend unavailable", true, {
    code: "backend_unreachable",
    ttlMs: 80,
  });

  const root = document.getElementById("accessable-captions-overlay");
  assert.ok(root);

  await sleep(STATUS_WAIT_MS);

  assert.equal(root.style.display, "none");
});

test("overlay renderer suppresses duplicate status within dedupe window", async () => {
  const renderer = createCaptionOverlayRenderer({});
  renderer.showStatus("Loading captions...", false, { code: "discovering", ttlMs: 60 });

  const root = document.getElementById("accessable-captions-overlay");
  assert.ok(root);

  await sleep(90);
  assert.equal(root.style.display, "none");

  renderer.showStatus("Loading captions...", false, { code: "discovering", ttlMs: 60 });
  await sleep(30);

  assert.equal(root.style.display, "none");
});

test("overlay renderer clears status when cue is shown", async () => {
  const renderer = createCaptionOverlayRenderer({});
  renderer.showStatus("Loading captions...", false, { code: "discovering", ttlMs: 120 });
  renderer.showCue({ text: "Hello world" });

  const root = document.getElementById("accessable-captions-overlay");
  const statusNode = root.querySelector(".accessable-captions-status");
  const textNode = root.querySelector(".accessable-captions-text");

  await sleep(160);

  assert.equal(root.style.display, "block");
  assert.equal(statusNode.textContent, "");
  assert.equal(textNode.textContent, "Hello world");
});
