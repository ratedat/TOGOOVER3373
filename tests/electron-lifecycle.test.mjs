import assert from "node:assert/strict";
import test from "node:test";
import { shouldQuitOnAllWindowsClosed } from "../app/runtime/electron-lifecycle.mjs";

test("keeps the app alive while startup picker windows are closing", () => {
  assert.equal(shouldQuitOnAllWindowsClosed({ platform: "win32", startupInProgress: true }), false);
  assert.equal(shouldQuitOnAllWindowsClosed({ platform: "linux", startupInProgress: true }), false);
});

test("quits on non-mac platforms after startup has completed", () => {
  assert.equal(shouldQuitOnAllWindowsClosed({ platform: "win32", startupInProgress: false }), true);
  assert.equal(shouldQuitOnAllWindowsClosed({ platform: "linux", startupInProgress: false }), true);
});

test("keeps macOS window-all-closed behavior unchanged", () => {
  assert.equal(shouldQuitOnAllWindowsClosed({ platform: "darwin", startupInProgress: false }), false);
});
