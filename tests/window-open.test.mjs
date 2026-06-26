import assert from "node:assert/strict";
import { test } from "node:test";
import { isInternalAppUrl } from "../app/runtime/window-open.mjs";

test("isInternalAppUrl accepts same-port local app shell URLs", () => {
  assert.equal(isInternalAppUrl("http://127.0.0.1:5173/control-v2?screen=operators", 5173), true);
  assert.equal(isInternalAppUrl("http://localhost:5173/sidecar", 5173), true);
  assert.equal(isInternalAppUrl("http://127.0.0.1:5173/overlay/part/relics", 5173), true);
});

test("isInternalAppUrl rejects external, wrong-port, and static URLs", () => {
  assert.equal(isInternalAppUrl("https://example.com/control-v2", 5173), false);
  assert.equal(isInternalAppUrl("http://127.0.0.1:5174/control-v2", 5173), false);
  assert.equal(isInternalAppUrl("http://127.0.0.1:5173/app.js", 5173), false);
  assert.equal(isInternalAppUrl("not a url", 5173), false);
});
