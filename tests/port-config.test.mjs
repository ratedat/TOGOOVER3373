import test from "node:test";
import assert from "node:assert/strict";
import {
  explicitPortValue,
  parseDesktopSettings,
  resolveStartupPort,
  serializeDesktopSettings,
  shouldPromptForPort,
} from "../app/runtime/port-config.mjs";

test("explicitPortValue prefers --port over env PORT", () => {
  assert.equal(explicitPortValue(["electron", ".", "--port", "5188"], { PORT: "5174" }), "5188");
});

test("explicitPortValue falls back to env PORT", () => {
  assert.equal(explicitPortValue(["electron", "."], { PORT: "5174" }), "5174");
});

test("shouldPromptForPort prompts only when no explicit port exists", () => {
  assert.equal(shouldPromptForPort(["electron", "."], {}, { smokeTest: false }), true);
  assert.equal(shouldPromptForPort(["electron", ".", "--port", "5174"], {}, { smokeTest: false }), false);
  assert.equal(shouldPromptForPort(["electron", "."], { PORT: "5175" }, { smokeTest: false }), false);
  assert.equal(shouldPromptForPort(["electron", "."], {}, { smokeTest: true }), false);
});

test("resolveStartupPort uses explicit, saved, then default values", () => {
  assert.equal(resolveStartupPort({ args: ["electron", ".", "--port", "5188"], savedPort: 5174 }), 5188);
  assert.equal(resolveStartupPort({ args: ["electron", "."], env: {}, savedPort: 5174 }), 5174);
  assert.equal(resolveStartupPort({ args: ["electron", "."], env: {}, savedPort: null, defaultPort: 5190 }), 5190);
});

test("desktop settings parsing tolerates malformed input", () => {
  assert.deepEqual(parseDesktopSettings('{"port":5174}'), { port: 5174 });
  assert.deepEqual(parseDesktopSettings("{broken"), { port: null });
});

test("serializeDesktopSettings normalizes invalid ports", () => {
  assert.equal(JSON.parse(serializeDesktopSettings({ port: 5188 })).port, 5188);
  assert.equal(JSON.parse(serializeDesktopSettings({ port: "bad" })).port, 5173);
});
