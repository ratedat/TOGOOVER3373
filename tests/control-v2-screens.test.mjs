import test from "node:test";
import assert from "node:assert/strict";
import { controlV2ScreenIds, controlV2ScreenOptions, getControlV2ScreenMeta, normalizeControlV2Screen } from "../app/domain/control-v2-screens.js";

test("control-v2 screen ids include independent special values workspace", () => {
  assert.deepEqual(controlV2ScreenIds, ["common", "operators", "relics", "special", "obs", "sidecar"]);
});

test("normalizeControlV2Screen accepts known screens and falls back to common", () => {
  assert.equal(normalizeControlV2Screen("common"), "common");
  assert.equal(normalizeControlV2Screen("operators"), "operators");
  assert.equal(normalizeControlV2Screen("relics"), "relics");
  assert.equal(normalizeControlV2Screen("special"), "special");
  assert.equal(normalizeControlV2Screen("obs"), "obs");
  assert.equal(normalizeControlV2Screen("sidecar"), "sidecar");
  assert.equal(normalizeControlV2Screen(null), "common");
});

test("control-v2 screen metadata provides labels and detached-window targets", () => {
  assert.deepEqual(controlV2ScreenOptions.map((item) => item.id), controlV2ScreenIds);
  assert.deepEqual(controlV2ScreenOptions.map((item) => item.label), ["共通設定", "オペレーター", "秘宝", "特殊値", "OBS設定", "サイドカー"]);
  assert.equal(getControlV2ScreenMeta("operators").detachPath, "/control-v2?screen=operators");
  assert.equal(getControlV2ScreenMeta("sidecar").detachPath, "/sidecar");
  assert.equal(Object.hasOwn(getControlV2ScreenMeta("operators"), "eyebrow"), false);
  assert.equal(getControlV2ScreenMeta("missing").id, "common");
});
