import test from "node:test";
import assert from "node:assert/strict";

import {
  adbConnectionPresetOptions,
  adbDefaultSerialsByPreset,
  buildAdbSerialCandidates,
  buildBlueStacksConfigPathCandidates,
  buildAdbCandidatePaths,
  normalizeAdbSettings,
  parseAdbDevices,
  parseBlueStacksConfigAdbPorts,
  resolveAdbRuntimeSettings,
  normalizeAdbPathKey,
} from "../app/domain/adb-settings.js";
import { updateAdbSetting } from "../app/control-actions.js";

test("normalizeAdbSettings keeps GUI connection settings conservative", () => {
  const settings = normalizeAdbSettings({
    autoDetect: false,
    connectionPreset: "mumu",
    adbPath: "  M:/Program Files/Netease/MuMu Player 12/shell/adb.exe  ",
    serial: "  127.0.0.1:16384  ",
    screenshotExtension: false,
    restartServerOnFailure: false,
    unknown: "ignored",
  });

  assert.deepEqual(settings, {
    autoDetect: false,
    connectionPreset: "mumu",
    adbPath: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe",
    serial: "127.0.0.1:16384",
    emulatorPath: "",
    screenshotExtension: false,
    restartServerOnFailure: false,
    restartProcessOnFailure: true,
    reconnectAttempts: 5,
    reconnectDelayMs: 1000,
    closeAdbOnExit: false,
    lightweightAdb: false,
  });
});

test("resolveAdbRuntimeSettings prefers GUI settings over environment variables", () => {
  const runtime = resolveAdbRuntimeSettings({
    adbPath: "C:/custom/adb.exe",
    serial: "127.0.0.1:20000",
  }, {
    ARKNIGHTS_ADB_PATH: "C:/env/adb.exe",
    ARKNIGHTS_ADB_SERIAL: "env-serial",
  });

  assert.equal(runtime.adbPath, "C:/custom/adb.exe");
  assert.equal(runtime.serial, "127.0.0.1:20000");
});

test("resolveAdbRuntimeSettings falls back to environment and then adb", () => {
  assert.deepEqual(resolveAdbRuntimeSettings({}, { ARKNIGHTS_ADB_PATH: "C:/env/adb.exe", ARKNIGHTS_ADB_SERIAL: "env-serial" }), {
    adbPath: "C:/env/adb.exe",
    serial: "env-serial",
    autoDetect: true,
    connectionPreset: "auto",
    restartServerOnFailure: true,
    restartProcessOnFailure: true,
    reconnectAttempts: 5,
    reconnectDelayMs: 1000,
  });
  assert.deepEqual(resolveAdbRuntimeSettings({}, {}), {
    adbPath: "adb",
    serial: "",
    autoDetect: true,
    connectionPreset: "auto",
    restartServerOnFailure: true,
    restartProcessOnFailure: true,
    reconnectAttempts: 5,
    reconnectDelayMs: 1000,
  });
});

test("parseAdbDevices reads emulator serials and offline states", () => {
  const devices = parseAdbDevices(`List of devices attached
127.0.0.1:16384 device product:MuMu model:MuMu_Player transport_id:1
emulator-5554 offline transport_id:2

`);

  assert.deepEqual(devices, [
    { serial: "127.0.0.1:16384", state: "device", detail: "product:MuMu model:MuMu_Player transport_id:1" },
    { serial: "emulator-5554", state: "offline", detail: "transport_id:2" },
  ]);
});

test("buildAdbCandidatePaths includes MAA-style MuMu paths and de-duplicates", () => {
  const candidates = buildAdbCandidatePaths({
    env: { ARKNIGHTS_ADB_PATH: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe", ProgramFiles: "C:/Program Files" },
    driveLetters: ["M", "C"],
  });

  assert.equal(candidates[0].source, "env");
  assert.equal(candidates.some((item) => item.preset === "mumu" && item.path.includes("MuMu Player 12")), true);
  assert.equal(new Set(candidates.map((item) => item.path.toLowerCase())).size, candidates.length);
});

test("adbConnectionPresetOptions exposes auto, MuMu, and manual choices", () => {
  assert.deepEqual(adbConnectionPresetOptions.map((item) => item.id), [
    "auto",
    "mumu",
    "ldplayer",
    "bluestacks",
    "nox",
    "xyaz",
    "tencent",
    "google-play-games-dev",
    "avd",
    "wsa",
    "custom",
  ]);
});


test("updateAdbSetting applies emulator preset defaults without clobbering paths", () => {
  const state = { adb: {} };
  updateAdbSetting(state, "autoDetect", "", false);
  updateAdbSetting(state, "adbPath", " C:/Android/platform-tools/adb.exe ");
  updateAdbSetting(state, "connectionPreset", "google-play-games-dev");

  assert.equal(state.adb.autoDetect, false);
  assert.equal(state.adb.connectionPreset, "google-play-games-dev");
  assert.equal(state.adb.adbPath, "C:/Android/platform-tools/adb.exe");
  assert.equal(state.adb.serial, "127.0.0.1:6520");
  assert.equal(state.adb.screenshotExtension, false);
  assert.equal(state.adb.restartProcessOnFailure, true);
});


test("normalizes equivalent adb paths with dot path segments", () => {
  assert.equal(
    normalizeAdbPathKey("M:\\Program Files\\Netease\\MuMu Player 12\\shell\\.\\adb.exe"),
    normalizeAdbPathKey("M:/Program Files/Netease/MuMu Player 12/shell/adb.exe"),
  );
});

test("buildAdbCandidatePaths includes MuMu installs from non-C system drives", () => {
  const candidates = buildAdbCandidatePaths({
    env: { ProgramFiles: "C:/Program Files" },
    driveLetters: ["M"],
  });

  assert.equal(candidates.some((item) => item.path === "M:\\Program Files\\Netease\\MuMu Player 12\\shell\\adb.exe"), true);
});

test("buildAdbCandidatePaths includes Android SDK and Tencent ADB locations", () => {
  const candidates = buildAdbCandidatePaths({
    env: {
      LOCALAPPDATA: "C:/Users/test/AppData/Local",
      ANDROID_HOME: "D:/Android/Sdk",
      ProgramFiles: "C:/Program Files",
    },
    driveLetters: [],
  });

  assert.equal(candidates.some((item) => item.path === "C:/Users/test/AppData/Local\\Android\\Sdk\\platform-tools\\adb.exe" && item.preset === "google-play-games-dev"), true);
  assert.equal(candidates.some((item) => item.path === "D:/Android/Sdk\\platform-tools\\adb.exe" && item.preset === "avd"), true);
  assert.equal(candidates.some((item) => item.path === "C:/Program Files\\Tencent\\Androws\\Application\\adb.exe" && item.preset === "tencent"), true);
});

test("MAA-style default serials cover supported emulator presets", () => {
  assert.deepEqual(adbDefaultSerialsByPreset.mumu.slice(0, 3), ["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:16448"]);
  assert.equal(adbDefaultSerialsByPreset.bluestacks.includes("127.0.0.1:5555"), true);
  assert.equal(adbDefaultSerialsByPreset.ldplayer.includes("emulator-5554"), true);
  assert.deepEqual(adbDefaultSerialsByPreset.nox, ["127.0.0.1:62001", "127.0.0.1:59865"]);
  assert.deepEqual(adbDefaultSerialsByPreset.xyaz, ["127.0.0.1:21503"]);
  assert.deepEqual(adbDefaultSerialsByPreset.wsa, ["127.0.0.1:58526"]);
});

test("buildAdbSerialCandidates keeps explicit serial first and adds BlueStacks config ports", () => {
  const serials = buildAdbSerialCandidates(
    { connectionPreset: "bluestacks", serial: "127.0.0.1:6000" },
    { blueStacksPorts: ["127.0.0.1:5599", "127.0.0.1:5555"] },
  );

  assert.deepEqual(serials.slice(0, 4), ["127.0.0.1:6000", "127.0.0.1:5599", "127.0.0.1:5555", "127.0.0.1:5556"]);
  assert.equal(new Set(serials).size, serials.length);
});

test("parseBlueStacksConfigAdbPorts reads Hyper-V dynamic port keys", () => {
  const ports = parseBlueStacksConfigAdbPorts(`
bst.instance.Nougat64.status.adb_port="5585"
bst.instance.Pie64_2.status.adb_port=5595
bst.instance.Pie64_2.status.adb_port=5595
unrelated=1
`);

  assert.deepEqual(ports, ["127.0.0.1:5585", "127.0.0.1:5595"]);
});

test("buildBlueStacksConfigPathCandidates includes env override and common MAA paths", () => {
  assert.deepEqual(buildBlueStacksConfigPathCandidates({
    ProgramData: "D:/ProgramData",
    ARKNIGHTS_BLUESTACKS_CONFIG_PATH: "E:/bs/bluestacks.conf",
  }), [
    "E:/bs/bluestacks.conf",
    "D:/ProgramData\\BlueStacks_nxt\\bluestacks.conf",
    "D:/ProgramData\\BlueStacks_nxt_cn\\bluestacks.conf",
  ]);
});

test("buildAdbCandidatePaths includes MAA-style Nox, MEmu, and BlueStacks relative adb paths", () => {
  const candidates = buildAdbCandidatePaths({
    env: { ProgramFiles: "C:/Program Files" },
    driveLetters: [],
  });

  assert.equal(candidates.some((item) => item.path === "C:/Program Files\\BlueStacks_nxt\\Engine\\ProgramFiles\\HD-Adb.exe" && item.preset === "bluestacks"), true);
  assert.equal(candidates.some((item) => item.path === "C:/Program Files\\Nox\\bin\\nox_adb.exe" && item.preset === "nox"), true);
  assert.equal(candidates.some((item) => item.path === "C:/Program Files\\Microvirt\\MEmu\\adb.exe" && item.preset === "xyaz"), true);
});
