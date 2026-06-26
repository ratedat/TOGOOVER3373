import test from "node:test";
import assert from "node:assert/strict";
import { isAppShellPath, resolveAppView } from "../app/lib/view-route.js";

test("resolveAppView maps app routes to stable view ids", () => {
  assert.equal(resolveAppView("/control", ""), "control-v2");
  assert.equal(resolveAppView("/control-v2", ""), "control-v2");
  assert.equal(resolveAppView("/sidecar", ""), "sidecar");
  assert.equal(resolveAppView("/licenses", ""), "licenses");
  assert.equal(resolveAppView("/overlay", ""), "overlay");
  assert.equal(resolveAppView("/overlay/part/relics", ""), "overlay");
});

test("resolveAppView lets query view override neutral paths", () => {
  assert.equal(resolveAppView("/", "?view=control-v2"), "control-v2");
  assert.equal(resolveAppView("/", "?view=sidecar"), "sidecar");
  assert.equal(resolveAppView("/", "?view=licenses"), "licenses");
  assert.equal(resolveAppView("/", "?view=unknown"), "control-v2");
});

test("isAppShellPath keeps /control as a Control v2 compatibility path", () => {
  assert.equal(isAppShellPath("/control-v2"), true);
  assert.equal(isAppShellPath("/control"), true);
  assert.equal(isAppShellPath("/sidecar"), true);
  assert.equal(isAppShellPath("/licenses"), true);
  assert.equal(isAppShellPath("/overlay/part/status"), true);
  assert.equal(isAppShellPath("/app/app.js"), false);
});