import test from "node:test";
import assert from "node:assert/strict";
import { adbExecOptions, createAdbAdapter, detectAdbConnections, normalizeAdbScreenshotBytes, parseAdbDisplayResolution } from "../app/recognition/adapters/adb-adapter.js";

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
      if (args[0] === "connect") return "connected to 127.0.0.1:16384";
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:16384 device product:MuMu model:MuMu_Player transport_id:1\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.selectedAdbPath, "C:/Tools/adb.exe");
  assert.equal(result.devices[0].serial, "127.0.0.1:16384");
  assert.equal(result.runtime.serial, "127.0.0.1:16384");
  assert.deepEqual(calls.map(([, args]) => args[0]), ["version", "connect", "devices"]);
});

test("detectAdbConnections connects configured TCP serials before listing devices", async () => {
  const calls = [];
  const result = await detectAdbConnections({
    settings: { connectionPreset: "google-play-games-dev", serial: "127.0.0.1:6520" },
    env: {},
    candidatePaths: [{ path: "adb", source: "path", preset: "google-play-games-dev" }],
    fileExists: async () => true,
    runCommand: async (adbPath, args) => {
      calls.push([adbPath, args]);
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "connect") return "connected to 127.0.0.1:6520";
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:6520 device product:gpg model:Google_Play_Games\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.devices[0].serial, "127.0.0.1:6520");
  assert.equal(result.connect?.address, "127.0.0.1:6520");
  assert.deepEqual(calls.map(([, args]) => args[0]), ["version", "connect", "devices"]);
});

test("detectAdbConnections tries MAA-style default serials for selected preset", async () => {
  const calls = [];
  const result = await detectAdbConnections({
    settings: { connectionPreset: "nox", reconnectDelayMs: 0 },
    env: {},
    candidatePaths: [{ path: "C:/Nox/bin/nox_adb.exe", source: "known-path", preset: "nox" }],
    fileExists: async () => true,
    runCommand: async (_adbPath, args) => {
      calls.push(args);
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "connect") {
        if (args[1] === "127.0.0.1:62001") throw new Error("failed to connect");
        return "connected to 127.0.0.1:59865";
      }
      if (args[0] === "kill-server" || args[0] === "start-server") return "";
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:59865 device product:Nox\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.runtime.serial, "127.0.0.1:59865");
  assert.equal(result.connect?.address, "127.0.0.1:59865");
  assert.deepEqual(calls.filter((args) => args[0] === "connect").map((args) => args[1]), ["127.0.0.1:62001", "127.0.0.1:62001", "127.0.0.1:62001", "127.0.0.1:62001", "127.0.0.1:62001", "127.0.0.1:59865"]);
});

test("detectAdbConnections reads BlueStacks config ports before default ports", async () => {
  const calls = [];
  const result = await detectAdbConnections({
    settings: { connectionPreset: "bluestacks", reconnectDelayMs: 0 },
    env: { ProgramData: "C:/ProgramData" },
    candidatePaths: [{ path: "C:/Program Files/BlueStacks_nxt/HD-Adb.exe", source: "known-path", preset: "bluestacks" }],
    fileExists: async () => true,
    readFile: async (file) => {
      if (file.endsWith("BlueStacks_nxt\\bluestacks.conf")) return 'bst.instance.Pie64.status.adb_port="5595"';
      throw new Error("missing");
    },
    runCommand: async (_adbPath, args) => {
      calls.push(args);
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "connect") return "connected to 127.0.0.1:5595";
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:5595 device product:BlueStacks\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.runtime.serial, "127.0.0.1:5595");
  assert.equal(calls.find((args) => args[0] === "connect")?.[1], "127.0.0.1:5595");
});

test("detectAdbConnections restarts adb and retries the first Google Play Games connection", async () => {
  const calls = [];
  let connectCount = 0;
  const result = await detectAdbConnections({
    settings: { connectionPreset: "google-play-games-dev", serial: "127.0.0.1:6520", restartProcessOnFailure: true, reconnectDelayMs: 0 },
    env: {},
    candidatePaths: [{ path: "adb", source: "path", preset: "google-play-games-dev" }],
    fileExists: async () => true,
    runCommand: async (_adbPath, args) => {
      calls.push(args);
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "kill-server" || args[0] === "start-server") return "";
      if (args[0] === "connect") {
        connectCount += 1;
        if (connectCount === 1) throw new Error("failed to connect to 127.0.0.1:6520");
        return "connected to 127.0.0.1:6520";
      }
      if (args[0] === "devices") return "List of devices attached\n127.0.0.1:6520 device\n";
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.connect?.recovered, true);
  assert.equal(result.devices[0].serial, "127.0.0.1:6520");
  assert.deepEqual(calls.map((args) => args[0]), ["version", "connect", "kill-server", "start-server", "connect", "devices"]);
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
    settings: { connectionPreset: "auto", reconnectDelayMs: 0 },
    env: {},
    candidatePaths: [
      { path: "C:/Program Files/BlueStacks_nxt/HD-Adb.exe", source: "known-path", preset: "bluestacks" },
      { path: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe", source: "known-path", preset: "mumu" },
    ],
    fileExists: async () => true,
    runCommand: async (adbPath, args) => {
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "connect") return `connected to ${args[1]}`;
      if (args[0] === "devices") return `List of devices attached\n127.0.0.1:16384 device product:MuMu model:MuMu_Player path:${adbPath}\n`;
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.selectedAdbPath, "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe");
  assert.equal(result.adbCandidates[0].preset, "mumu");
  assert.equal(result.adbCandidates[0].selected, true);
});

test("detectAdbConnections resolves a selected MuMu adb path to a MuMu serial while preset is auto", async () => {
  const result = await detectAdbConnections({
    settings: { connectionPreset: "auto", adbPath: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe" },
    env: {},
    candidatePaths: [
      { path: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe", source: "settings", preset: "auto" },
      { path: "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe", source: "known-path", preset: "mumu" },
    ],
    fileExists: async () => true,
    runCommand: async (_adbPath, args) => {
      if (args[0] === "version") return "Android Debug Bridge version 1.0.41";
      if (args[0] === "connect") return `connected to ${args[1]}`;
      if (args[0] === "devices") {
        return [
          "List of devices attached",
          "emulator-5554 device product:Android model:AVD",
          "127.0.0.1:16384 device product:MuMu model:MuMu_Player",
        ].join("\n");
      }
      throw new Error("unexpected command");
    },
  });

  assert.equal(result.selectedAdbPath, "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe");
  assert.equal(result.adbCandidates[0].preset, "mumu");
  assert.equal(result.runtime.serial, "127.0.0.1:16384");
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

test("createAdbAdapter retries commands after adb server restart for TCP serials", async () => {
  const calls = [];
  let wmSizeCount = 0;
  const adapter = createAdbAdapter({
    settings: { adbPath: "adb", serial: "127.0.0.1:6520", restartProcessOnFailure: true, reconnectDelayMs: 0 },
    env: {},
    execFileImpl: (_file, args, _options, callback) => {
      calls.push(args);
      if (args.includes("wm") && args.includes("size")) {
        wmSizeCount += 1;
        if (wmSizeCount === 1) {
          const error = new Error("no devices/emulators found");
          callback(error, "", "no devices/emulators found");
          return;
        }
        callback(null, "Physical size: 2560x1440", "");
        return;
      }
      if (args[0] === "kill-server" || args[0] === "start-server") callback(null, "", "");
      else if (args[0] === "connect") callback(null, "connected to 127.0.0.1:6520", "");
      else callback(null, "", "");
    },
  });

  assert.deepEqual(await adapter.getActualResolution(), { width: 2560, height: 1440 });
  assert.deepEqual(calls.map((args) => args[0] === "-s" ? args[2] : args[0]), ["shell", "kill-server", "start-server", "connect", "shell", "shell"]);
});

test("createAdbAdapter retries adb commands up to the MAA-style reconnect limit", async () => {
  const calls = [];
  let wmSizeCount = 0;
  const adapter = createAdbAdapter({
    settings: { adbPath: "adb", serial: "127.0.0.1:6520", restartProcessOnFailure: true, reconnectAttempts: 5, reconnectDelayMs: 0 },
    env: {},
    execFileImpl: (_file, args, _options, callback) => {
      calls.push(args);
      if (args.includes("wm") && args.includes("size")) {
        wmSizeCount += 1;
        if (wmSizeCount < 3) {
          const error = new Error("device offline");
          callback(error, "", "device offline");
          return;
        }
        callback(null, "Physical size: 1280x720", "");
        return;
      }
      callback(null, "connected", "");
    },
  });

  assert.deepEqual(await adapter.getActualResolution(), { width: 1280, height: 720 });
  assert.equal(calls.filter((args) => args.includes("wm") && args.includes("size")).length, 3);
});

test("normalizeAdbScreenshotBytes repairs adb shell CRLF-expanded PNG bytes", () => {
  const expanded = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0d, 0x0a, 0x1a, 0x0d, 0x0a, 0x00]);
  const repaired = normalizeAdbScreenshotBytes(expanded);

  assert.deepEqual([...repaired.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});

test("createAdbAdapter falls back to adb shell screencap when exec-out is not a PNG", async () => {
  const calls = [];
  const shellPng = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0d, 0x0a, 0x1a, 0x0d, 0x0a, 0x00]);
  const adapter = createAdbAdapter({
    settings: { adbPath: "adb", serial: "127.0.0.1:6520" },
    env: {},
    execFileImpl: (_file, args, _options, callback) => {
      calls.push(args);
      if (args.includes("exec-out")) callback(null, Buffer.from("not png"), "");
      else if (args.includes("screencap")) callback(null, shellPng, "");
      else callback(null, "", "");
    },
  });

  const result = await adapter.capture();
  assert.deepEqual(calls.map((args) => args.includes("exec-out") ? "exec-out" : "shell"), ["exec-out", "shell"]);
  assert.deepEqual([...result.bytes.slice(0, 8)], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
});
