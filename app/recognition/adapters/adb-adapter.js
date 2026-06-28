import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import {
  buildAdbCandidatePaths,
  buildAdbSerialCandidates,
  buildBlueStacksConfigPathCandidates,
  normalizeAdbPathKey,
  normalizeAdbSettings,
  parseAdbDevices,
  parseBlueStacksConfigAdbPorts,
  resolveAdbRuntimeSettings,
} from "../../domain/adb-settings.js";
import { randomizeAction } from "../../domain/recognition/geometry.js";

function adbArgs(serial, args) {
  return serial ? ["-s", serial, ...args] : args;
}

function serviceError(status, message, details = {}) {
  return Object.assign(new Error(message), { status, details });
}

function normalizeAdbError(error, { adbPath, args } = {}) {
  const message = String(error?.message || "");
  const stderr = String(error?.stderr || "");
  const combined = `${message}\n${stderr}`;
  if (error?.code === "ENOENT") {
    return serviceError(503, `ADB executable was not found: ${adbPath}. Set ARKNIGHTS_ADB_PATH or install Android platform-tools.`, {
      code: "adb_not_found",
      adbPath,
    });
  }
  if (/no devices\/emulators found|device ['\"]?[^'\"]+['\"]? not found/i.test(combined)) {
    return serviceError(503, "ADB device was not found. Start the emulator and confirm adb devices can see it.", {
      code: "adb_no_device",
      adbPath,
    });
  }
  if (/device offline/i.test(combined)) {
    return serviceError(503, "ADB device is offline. Reconnect the emulator or restart ADB, then try again.", {
      code: "adb_device_offline",
      adbPath,
    });
  }
  if (/more than one device\/emulator/i.test(combined)) {
    return serviceError(409, "Multiple ADB devices were found. Set ARKNIGHTS_ADB_SERIAL to choose the emulator.", {
      code: "adb_multiple_devices",
      adbPath,
    });
  }
  return serviceError(502, "ADB command failed before recognition could start.", {
    code: "adb_command_failed",
    adbPath,
    args,
    stderr: stderr.trim() || null,
  });
}

function parseWmSize(output) {
  const match = String(output).match(/(?:Physical size|Override size):\s*(\d+)x(\d+)/i) || String(output).match(/(\d+)x(\d+)/);
  if (!match) throw new Error(`unable to parse adb wm size: ${output}`);
  return { width: Number(match[1]), height: Number(match[2]) };
}

function parseWindowDisplayResolution(output) {
  const text = String(output || "");
  const appMatch = text.match(/\bapp=(\d+)x(\d+)\b/i);
  if (appMatch) return { width: Number(appMatch[1]), height: Number(appMatch[2]) };
  const curMatch = text.match(/\bcur=(\d+)x(\d+)\b/i);
  if (curMatch) return { width: Number(curMatch[1]), height: Number(curMatch[2]) };
  const boundsMatch = text.match(/mAppBounds=Rect\(\s*0\s*,\s*0\s*-\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (boundsMatch) return { width: Number(boundsMatch[1]), height: Number(boundsMatch[2]) };
  return null;
}

export function parseAdbDisplayResolution({ windowDisplaysOutput = "", wmSizeOutput = "" } = {}) {
  return parseWindowDisplayResolution(windowDisplaysOutput) || parseWmSize(wmSizeOutput);
}

export function adbExecOptions({ encoding = "utf8", workDir = null } = {}) {
  const options = { encoding, maxBuffer: 64 * 1024 * 1024, windowsHide: true };
  if (workDir) options.cwd = workDir;
  return options;
}

function execAdbCommand(adbPath, args, { encoding = "utf8", execFileImpl = execFile, workDir = null } = {}) {
  return new Promise((resolve, reject) => {
    execFileImpl(adbPath, args, adbExecOptions({ encoding, workDir }), (error, stdout, stderr) => {
      if (error) {
        error.stderr = stderr;
        reject(normalizeAdbError(error, { adbPath, args }));
        return;
      }
      resolve(stdout);
    });
  });
}

function isTcpAdbSerial(value = "") {
  return /^(?:localhost|127(?:\.\d{1,3}){3}|\[?::1\]?|\d{1,3}(?:\.\d{1,3}){3}):\d+$/i.test(String(value).trim());
}

async function restartAdbServer(adbPath, runCommand) {
  await runCommand(adbPath, ["kill-server"]).catch(() => null);
  await runCommand(adbPath, ["start-server"]).catch(() => null);
}

async function sleep(ms) {
  if (!ms) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureTcpAdbConnection(adbPath, runtime, runCommand, address) {
  address = String(address || runtime.serial || "").trim();
  if (!isTcpAdbSerial(address)) return null;
  const attempts = Math.max(1, runtime.reconnectAttempts || 1);
  let lastError = null;
  for (let index = 0; index < attempts; index += 1) {
    try {
      const output = await runCommand(adbPath, ["connect", address]);
      return { address, output: String(output || "").trim(), recovered: index > 0, attempts: index + 1 };
    } catch (error) {
      lastError = error;
      if (!runtime.restartProcessOnFailure && !runtime.restartServerOnFailure) break;
      await restartAdbServer(adbPath, runCommand);
      await sleep(runtime.reconnectDelayMs);
    }
  }
  return { address, output: null, error: lastError?.message || String(lastError), recovered: false, attempts };
}

async function readBlueStacksConfigPorts({ settings, env, readFile = fs.readFile } = {}) {
  if (normalizeAdbSettings(settings).connectionPreset !== "bluestacks") return [];
  const ports = [];
  const seen = new Set();
  for (const file of buildBlueStacksConfigPathCandidates(env)) {
    try {
      const text = await readFile(file, "utf8");
      for (const serial of parseBlueStacksConfigAdbPorts(text)) {
        if (seen.has(serial)) continue;
        seen.add(serial);
        ports.push(serial);
      }
    } catch {
      // Missing BlueStacks config files are normal when that emulator is not installed.
    }
  }
  return ports;
}

function selectDetectedSerial(devices, serialCandidates) {
  const usable = devices.filter((item) => item.state === "device");
  if (!usable.length) return "";
  const candidates = new Set(serialCandidates.map((item) => item.toLowerCase()));
  return usable.find((item) => candidates.has(item.serial.toLowerCase()))?.serial || (usable.length === 1 ? usable[0].serial : "");
}

function isPngBytes(bytes) {
  return Buffer.isBuffer(bytes)
    && bytes.length >= 8
    && bytes[0] === 0x89
    && bytes[1] === 0x50
    && bytes[2] === 0x4e
    && bytes[3] === 0x47
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a;
}

export function normalizeAdbScreenshotBytes(bytes) {
  const buffer = Buffer.from(bytes || []);
  if (isPngBytes(buffer)) return buffer;
  const output = [];
  for (let index = 0; index < buffer.length; index += 1) {
    if (buffer[index] === 0x0d && buffer[index + 1] === 0x0d && buffer[index + 2] === 0x0a) {
      output.push(0x0d, 0x0a);
      index += 2;
    } else if (buffer[index] === 0x0d && buffer[index + 1] === 0x0a) {
      output.push(0x0a);
      index += 1;
    } else {
      output.push(buffer[index]);
    }
  }
  const repaired = Buffer.from(output);
  return isPngBytes(repaired) ? repaired : buffer;
}

async function defaultFileExists(file) {
  if (!file || file === "adb") return true;
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function defaultDriveLetters() {
  if (process.platform !== "win32") return [];
  return "CDEFGHIJKLMNOPQRSTUVWXYZ".split("");
}

function mergeCandidatePaths(settings, env, candidatePaths, driveLetters) {
  const normalized = normalizeAdbSettings(settings);
  const raw = candidatePaths || [
    ...(normalized.adbPath ? [{ path: normalized.adbPath, source: "settings", preset: normalized.connectionPreset }] : []),
    ...buildAdbCandidatePaths({ env, driveLetters }),
  ];
  const seen = new Set();
  const byKey = new Map();
  return raw.filter((candidate) => {
    const key = normalizeAdbPathKey(candidate?.path || "");
    if (!key) return false;
    if (seen.has(key)) {
      const existing = byKey.get(key);
      if (existing && ["auto", "custom"].includes(existing.preset) && candidate.preset && !["auto", "custom"].includes(candidate.preset)) {
        existing.preset = candidate.preset;
      }
      return false;
    }
    seen.add(key);
    byKey.set(key, candidate);
    return true;
  });
}


function adbCandidateScore(candidate, normalized, runtime) {
  let score = candidate.available ? 0 : 1000;
  const candidatePathKey = normalizeAdbPathKey(candidate.path);
  const explicitPathKey = normalizeAdbPathKey(normalized.adbPath);
  const runtimePathKey = normalizeAdbPathKey(runtime.adbPath);
  if (explicitPathKey && candidatePathKey === explicitPathKey) score -= 120;
  if (candidate.source === "settings") score -= 90;
  if (candidate.source === "env") score -= 80;
  if (normalized.connectionPreset !== "auto") {
    score += candidate.preset === normalized.connectionPreset ? -60 : 35;
  } else {
    if (candidate.preset === "mumu") score -= 45;
    if (candidate.preset === "bluestacks") score += 35;
    if (candidate.preset === "ldplayer") score += 20;
  }
  if (candidatePathKey === "adb") score += 60;
  if (runtimePathKey && runtimePathKey !== "adb" && candidatePathKey === runtimePathKey) score -= 20;
  return score;
}

function sortAdbCandidates(candidates, normalized, runtime) {
  return [...candidates].sort((a, b) => adbCandidateScore(a, normalized, runtime) - adbCandidateScore(b, normalized, runtime) || String(a.path).localeCompare(String(b.path)));
}

export async function detectAdbConnections({
  settings = {},
  env = process.env,
  candidatePaths = null,
  driveLetters = defaultDriveLetters(),
  fileExists = defaultFileExists,
  runCommand = execAdbCommand,
  readFile = fs.readFile,
} = {}) {
  const normalized = normalizeAdbSettings(settings);
  const runtime = resolveAdbRuntimeSettings(normalized, env);
  const blueStacksPorts = await readBlueStacksConfigPorts({ settings: normalized, env, readFile });
  const serialCandidates = buildAdbSerialCandidates(normalized, { blueStacksPorts });
  const candidates = mergeCandidatePaths(normalized, env, candidatePaths, driveLetters);
  const adbCandidates = [];

  for (const candidate of candidates) {
    const exists = await fileExists(candidate.path);
    const entry = { ...candidate, exists, available: false, error: null };
    if (exists) {
      try {
        await runCommand(candidate.path, ["version"]);
        entry.available = true;
      } catch (error) {
        entry.error = error?.message || String(error);
      }
    }
    adbCandidates.push(entry);
  }

  const orderedCandidates = sortAdbCandidates(adbCandidates, normalized, runtime);
  const selected = orderedCandidates.find((item) => item.available) || null;
  const selectedPathKey = normalizeAdbPathKey(selected?.path || "");
  const effectiveSettings = normalized.connectionPreset === "auto" && selected?.preset && !["auto", "custom"].includes(selected.preset)
    ? normalizeAdbSettings({ ...normalized, connectionPreset: selected.preset })
    : normalized;
  const effectiveBlueStacksPorts = effectiveSettings.connectionPreset === normalized.connectionPreset
    ? blueStacksPorts
    : await readBlueStacksConfigPorts({ settings: effectiveSettings, env, readFile });
  const effectiveSerialCandidates = buildAdbSerialCandidates(effectiveSettings, { blueStacksPorts: effectiveBlueStacksPorts });
  let devices = [];
  let connect = null;
  if (selected) {
    try {
      const tcpCandidates = effectiveSerialCandidates.filter(isTcpAdbSerial);
      for (const address of tcpCandidates) {
        const result = await ensureTcpAdbConnection(selected.path, runtime, runCommand, address);
        if (!connect || !connect.output || result?.output) connect = result;
        if (result && !result.error) break;
      }
      devices = parseAdbDevices(await runCommand(selected.path, ["devices", "-l"]));
    } catch {
      devices = [];
    }
  }
  const detectedSerial = runtime.serial || selectDetectedSerial(devices, effectiveSerialCandidates);

  return {
    settings: normalized,
    runtime: { ...runtime, adbPath: selected?.path || runtime.adbPath, serial: detectedSerial },
    selectedAdbPath: selected?.path || runtime.adbPath,
    adbCandidates: orderedCandidates.map((item) => ({ ...item, selected: normalizeAdbPathKey(item.path) === selectedPathKey })),
    devices,
    connect: connect || null,
  };
}

export function createAdbAdapter({ adbPath = null, serial = null, settings = {}, env = process.env, workDir = null, execFileImpl = execFile, random = Math.random } = {}) {
  const runtime = resolveAdbRuntimeSettings({ ...settings, ...(adbPath ? { adbPath } : {}), ...(serial ? { serial } : {}) }, env);
  adbPath = runtime.adbPath;
  serial = runtime.serial;
  if (workDir) fsSync.mkdirSync(workDir, { recursive: true });
  function rawRun(args, { encoding = "utf8" } = {}) {
    return new Promise((resolve, reject) => {
      execFileImpl(adbPath, adbArgs(serial, args), adbExecOptions({ encoding, workDir }), (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(normalizeAdbError(error, { adbPath, args }));
          return;
        }
        resolve(stdout);
      });
    });
  }
  function controlRun(args) {
    return new Promise((resolve, reject) => {
      execFileImpl(adbPath, args, adbExecOptions({ encoding: "utf8", workDir }), (error, stdout, stderr) => {
        if (error) {
          error.stderr = stderr;
          reject(normalizeAdbError(error, { adbPath, args }));
          return;
        }
        resolve(stdout);
      });
    });
  }
  async function recoverConnection() {
    if (!runtime.restartProcessOnFailure && !runtime.restartServerOnFailure) return false;
    await controlRun(["kill-server"]).catch(() => null);
    await controlRun(["start-server"]).catch(() => null);
    if (isTcpAdbSerial(serial)) await controlRun(["connect", serial]).catch(() => null);
    return true;
  }
  async function run(args, { encoding = "utf8" } = {}) {
    const attempts = Math.max(1, runtime.reconnectAttempts || 1);
    let lastError = null;
    for (let index = 0; index < attempts; index += 1) {
      try {
        return await rawRun(args, { encoding });
      } catch (error) {
        lastError = error;
        if (index >= attempts - 1) break;
        const code = error?.details?.code;
        if (!["adb_no_device", "adb_device_offline", "adb_command_failed"].includes(code)) throw error;
        const recovered = await recoverConnection();
        if (!recovered) throw error;
        await sleep(runtime.reconnectDelayMs);
      }
    }
    throw lastError;
  }

  return {
    async getActualResolution() {
      const wmSizeOutput = await run(["shell", "wm", "size"]);
      let windowDisplaysOutput = "";
      try {
        windowDisplaysOutput = await run(["shell", "dumpsys", "window", "displays"]);
      } catch {
        windowDisplaysOutput = "";
      }
      return parseAdbDisplayResolution({ windowDisplaysOutput, wmSizeOutput });
    },
    async capture(meta = {}) {
      let bytes = normalizeAdbScreenshotBytes(await run(["exec-out", "screencap", "-p"], { encoding: "buffer" }));
      if (!isPngBytes(bytes)) {
        bytes = normalizeAdbScreenshotBytes(await run(["shell", "screencap", "-p"], { encoding: "buffer" }));
      }
      return { bytes, capturedAt: new Date().toISOString(), ...meta };
    },
    async tap(point, options = {}) {
      const commandPoint = options.randomized ? point : randomizeAction({ type: "tap", point }, random).point;
      await run(["shell", "input", "tap", String(Math.round(commandPoint.x)), String(Math.round(commandPoint.y))]);
    },
    async swipe(swipe, options = {}) {
      const commandSwipe = options.randomized ? swipe : randomizeAction({ type: "swipe", ...swipe }, random);
      await run([
        "shell",
        "input",
        "swipe",
        String(Math.round(commandSwipe.start.x)),
        String(Math.round(commandSwipe.start.y)),
        String(Math.round(commandSwipe.end.x)),
        String(Math.round(commandSwipe.end.y)),
        String(Math.round(commandSwipe.durationMs ?? 350)),
      ]);
    },
    async back() {
      await run(["shell", "input", "keyevent", "KEYCODE_BACK"]);
    },
    async wait(ms) {
      await new Promise((resolve) => setTimeout(resolve, ms));
    },
  };
}
