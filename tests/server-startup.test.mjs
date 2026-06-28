import test from "node:test";
import assert from "node:assert/strict";

import { isPortInUseError, nextPortCandidate } from "../app/runtime/server-startup.mjs";

test("isPortInUseError detects EADDRINUSE errors from Node server startup", () => {
  assert.equal(isPortInUseError(Object.assign(new Error("listen EADDRINUSE: address already in use 127.0.0.1:5173"), { code: "EADDRINUSE" })), true);
  assert.equal(isPortInUseError(new Error("listen EADDRINUSE: address already in use")), true);
  assert.equal(isPortInUseError(new Error("permission denied")), false);
});

test("nextPortCandidate suggests the next valid local server port", () => {
  assert.equal(nextPortCandidate(5173), 5174);
  assert.equal(nextPortCandidate("5174"), 5175);
  assert.equal(nextPortCandidate(65535), 5173);
  assert.equal(nextPortCandidate("bad"), 5173);
});
