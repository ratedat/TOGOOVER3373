import test from "node:test";
import assert from "node:assert/strict";
import { adbExecOptions, createAdbAdapter, detectAdbConnections, parseAdbDisplayResolution } from "../app/recognition/adapters/adb-adapter.js";

test("parseAdbDisplayResolution prefers active app bounds over portrait wm size", () => {
  const resolution = parseAdbDisplayResolution({
    wmSizeOutput: "Physical size: 1440x2560",
    windowDisplaysOutput: "init=1440x2560 360dpi cur=2560x1440 app=2560x1440 rng=1440x1386-2560x2506",
  });

  assert.deepEqual(resolution, { width: 2560, height: 1440 });
});

test("parseAdbDisplayResolution falls back to wm size when dumpsys has no bounds", () => {
  const resolution = parseAdbDisplayResolution({
    wmSizeOutput: "Physical size: 1440x2560",
    windowDisplaysOutput: "no active display line",
  });

  assert.deepEqual(resolution, { width: 1440, height: 2560 });
});



test("adbExecOptions can pin adb child processes to the configured storage directory", () => {
  const options = adbExecOptions({ encoding: "buffer", workDir: "O:/GameData/RHODES OBS COMMANDER3373 Data/adb-work" });

  assert.equal(options.encoding, "buffer");
  assert.equal(options.cwd, "O:/GameData/RHODES OBS COMMANDER3373 Data/adb-work");
  assert.equal(options.windowsHide, true);
});

test("detectAdbConnections returns available adb candidates and parsed devices without touching real adb", async () => {
  const calls = [];
  const result = await detectAdbConnections({
    settings: { adbPath: "C:/Tools/adb.exe", serial: "127.0.0.1:16384" },
    env: {},
    candidatePaths: [{ path: "C:/Tools/adb.exe", source: "settings", preset: "custom" }],
    fileExists: async () => true,
    runCommand: async (adbPath, args) => {
      calls.push([adbPath, args]);
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:16384 device product:MuMu model:MuMu_Player transport_id:1\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.selectedAdbPath, "C:/Tools/adb.exe");
  assert.equal(result.devices[0].serial, "127.0.0.1:16384");
  assert.equal(result.runtime.serial, "127.0.0.1:16384");
  assert.deepEqual(calls.map(([, args]) => args[0]), ["version", "devices"]);
});

test("detectAdbConnections reports unavailable candidates without failing the whole probe", async () => {
  const result = await detectAdbConnections({
    settings: {},
    env: {},
    candidatePaths: [{ path: "C:/missing/adb.exe", source: "known-path", preset: "mumu" }],
    fileExists: async () => false,
    runCommand: async () => { throw new Error("should not run"); },
  });

  assert.equal(result.adbCandidates[0].available, false);
  assert.equal(result.devices.length, 0);
});


test("detectAdbConnections prefers an available MuMu candidate over an earlier BlueStacks candidate", async () => {
  const result = await detectAdbConnections({
    settings: { connectionPreset: "auto" },
    env: {},
    candidatePaths: [
      { path: "C:/Program Files/BlueStacks_nxt/HD-Adb.exe", source: "known-path", preset: "bluestacks" },
      { path: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe", source: "known-path", preset: "mumu" },
    ],
    fileExists: async () => true,
    runCommand: async (adbPath, args) => {
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "devices") return `List of devices attached\n127.0.0.1:16384 device product:MuMu model:MuMu_Player path:${adbPath}\n`;
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.selectedAdbPath, "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe");
  assert.equal(result.adbCandidates[0].preset, "mumu");
  assert.equal(result.adbCandidates[0].selected, true);
});


test("createAdbAdapter randomizes direct tap and swipe commands unless already randomized", async () => {
  const calls = [];
  const values = [0, 1, 1, 0, 0, 1];
  const adapter = createAdbAdapter({
    adbPath: "adb",
    env: {},
    random: () => values.shift() ?? 0.5,
    execFileImpl: (_file, args, _options, callback) => {
      calls.push(args);
      callback(null, "", "");
    },
  });

  await adapter.tap({ x: 100, y: 200 });
  await adapter.swipe({ start: { x: 300, y: 400 }, end: { x: 500, y: 600 }, durationMs: 450 });
  await adapter.tap({ x: 100, y: 200 }, { randomized: true });

  assert.deepEqual(calls[0], ["shell", "input", "tap", "92", "208"]);
  assert.deepEqual(calls[1], ["shell", "input", "swipe", "312", "388", "488", "612", "450"]);
  assert.deepEqual(calls[2], ["shell", "input", "tap", "100", "200"]);
});
