import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { saveAdbScreenshotFrame, saveRecognitionAdbCaptureFrame, startServer } from "../app/server.mjs";

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function tempRecognitionLogDir() {
  return fs.mkdtemp(path.join(os.tmpdir(), "rhodes-recognition-log-"));
}

async function captureConsoleDuring(callback) {
  const entries = [];
  const originalLog = console.log;
  const originalError = console.error;
  console.log = (...args) => entries.push({ level: "log", message: args.map(String).join(" ") });
  console.error = (...args) => entries.push({ level: "error", message: args.map(String).join(" ") });
  try {
    const value = await callback(entries);
    return { entries, value };
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
}

test("recognition scan API accepts POST profile requests without using the default ADB runner", async () => {
  const recognitionLogDir = await tempRecognitionLogDir();
  const { server, port } = await startServer({
    port: 0,
    recognitionLogDir,
    recognitionRunner: async ({ profile, source }) => ({
      scanId: "api-scan",
      profileId: profile.id,
      source,
      status: "completed",
      suggestions: [],
      candidates: [],
      log: [],
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "operatorsFull", source: "adb" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(payload.result.profileId, "operatorsFull");
    assert.equal(payload.result.source, "adb");
  } finally {
    await closeServer(server);
  }
});

test("recognition scan API forwards operator class constraints to the runner", async () => {
  const recognitionLogDir = await tempRecognitionLogDir();
  let receivedContext = null;
  const { server, port } = await startServer({
    port: 0,
    recognitionLogDir,
    recognitionRunner: async ({ profile, source, recognitionContext }) => {
      receivedContext = recognitionContext;
      return {
        scanId: "api-scan-context",
        profileId: profile.id,
        source,
        status: "completed",
        suggestions: [],
        candidates: [],
        log: [],
      };
    },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "operatorsFull", source: "adb", operatorClasses: ["sniper"] }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.result.profileId, "operatorsFull");
    assert.deepEqual(receivedContext, { operatorClasses: ["sniper"] });
  } finally {
    await closeServer(server);
  }
});

test("MAA Resource recognition API converts task detail JSON into RHODES candidates", async () => {
  const { server, port } = await startServer({ port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/maa-resource`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        profile: "runStatusFull",
        pipeline: {
          RhodesOcrRegion_run_hope_current: { attach: { id: "run.hope.current" } },
          RhodesOcrRegion_run_hope_max: { attach: { id: "run.hope.max" } },
          RhodesOcrRegion_run_ingot: { attach: { id: "run.ingot" } },
        },
        taskResults: [
          {
            entry: "RhodesOcrRegion_run_hope_current",
            algorithm: "OCR",
            recognitionDetailJson: JSON.stringify({ best: { text: "3", score: 0.94, box: [941, 17, 32, 35] } }),
          },
          {
            entry: "RhodesOcrRegion_run_hope_max",
            algorithm: "OCR",
            recognitionDetailJson: JSON.stringify({ best: { text: "8", score: 0.95, box: [965, 17, 64, 35] } }),
          },
          {
            entry: "RhodesOcrRegion_run_ingot",
            algorithm: "OCR",
            recognitionDetailJson: JSON.stringify({ best: { text: "20", score: 0.96, box: [1190, 10, 90, 52] } }),
          },
        ],
      }),
    });
    const payload = await response.json();
    const candidates = payload.result.candidates;

    assert.equal(response.status, 200);
    assert.equal(payload.result.source, "maa-framework");
    assert.equal(candidates.find((candidate) => candidate.field === "hope")?.value, 3);
    assert.equal(candidates.find((candidate) => candidate.field === "maxHope")?.value, 8);
    assert.equal(candidates.find((candidate) => candidate.field === "ingot")?.value, 20);
    assert.equal(payload.result.suggestions.length, 3);
  } finally {
    await closeServer(server);
  }
});

test("external trigger routes map to full scan profiles and return aborted scans as 409", async () => {
  const recognitionLogDir = await tempRecognitionLogDir();
  const { server, port } = await startServer({
    port: 0,
    recognitionLogDir,
    recognitionRunner: async ({ profile }) => ({
      scanId: "api-scan",
      profileId: profile.id,
      source: "adb",
      status: "aborted",
      reason: "unknown_screen",
      suggestions: [],
      candidates: [],
      log: [],
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/trigger/scan/sarkaz/age`);
    const payload = await response.json();

    assert.equal(response.status, 409);
    assert.equal(payload.result.profileId, "is5AgeFull");
    assert.equal(payload.result.reason, "unknown_screen");
  } finally {
    await closeServer(server);
  }
});
test("default recognition runner reports missing adb as service unavailable", async () => {
  const currentStateFile = new URL("../data/current-state.json", import.meta.url);
  const previousState = await fs.readFile(currentStateFile, "utf8").catch(() => null);
  await fs.writeFile(currentStateFile, JSON.stringify({
    version: 1,
    run: { campaignId: "is5_sarkaz" },
    adb: { autoDetect: false, adbPath: "definitely-missing-adb-for-test", serial: "" },
  }, null, 2), "utf8");
  const recognitionLogDir = await tempRecognitionLogDir();
  const { server, port } = await startServer({ port: 0, recognitionLogDir });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "relicsFull", source: "adb" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.match(payload.error, /ADB executable was not found/);
    assert.equal(payload.details.code, "adb_not_found");
  } finally {
    await closeServer(server);
    if (previousState == null) await fs.rm(currentStateFile, { force: true });
    else await fs.writeFile(currentStateFile, previousState, "utf8");
  }
});

test("ADB detect API uses saved settings and returns candidates", async () => {
  const { entries } = await captureConsoleDuring(async () => {
    const { server, port } = await startServer({
      port: 0,
      adbDetector: async ({ settings }) => ({
        settings,
        runtime: { adbPath: settings.adbPath || "adb", serial: settings.serial || "", autoDetect: settings.autoDetect, connectionPreset: settings.connectionPreset },
        selectedAdbPath: settings.adbPath || "adb",
        adbCandidates: [{ path: settings.adbPath || "adb", source: "settings", preset: settings.connectionPreset, exists: true, available: true, error: null }],
        devices: [{ serial: settings.serial || "127.0.0.1:16384", state: "device", detail: "product:MuMu" }],
      }),
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/adb/detect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ settings: { autoDetect: false, connectionPreset: "mumu", adbPath: "C:/adb.exe", serial: "127.0.0.1:16384" } }),
      });
      const payload = await response.json();

      assert.equal(response.status, 200);
      assert.equal(payload.settings.connectionPreset, "mumu");
      assert.equal(payload.devices[0].serial, "127.0.0.1:16384");
    } finally {
      await closeServer(server);
    }
  });

  assert.ok(entries.some((entry) => entry.message.includes("[adb-diagnostic]") && entry.message.includes("\"event\":\"adb_detect_start\"")));
  assert.ok(entries.some((entry) => entry.message.includes("[adb-diagnostic]") && entry.message.includes("\"event\":\"adb_detect_success\"") && entry.message.includes("127.0.0.1:16384")));
});

test("ADB test API reports resolution and optional screenshot size", async () => {
  const { server, port } = await startServer({
    port: 0,
    adbTester: async ({ settings, capture }) => ({
      ok: true,
      settings,
      runtime: { adbPath: settings.adbPath || "adb", serial: settings.serial || "" },
      resolution: { width: 2560, height: 1440 },
      screenshot: capture ? { bytes: 123456, capturedAt: "2026-06-27T00:00:00.000Z" } : null,
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/adb/test`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ capture: true, settings: { adbPath: "adb", serial: "127.0.0.1:16384" } }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(payload.resolution, { width: 2560, height: 1440 });
    assert.equal(payload.screenshot.bytes, 123456);
  } finally {
    await closeServer(server);
  }
});

test("ADB test API logs diagnostic details when connection fails", async () => {
  const { entries } = await captureConsoleDuring(async () => {
    const { server, port } = await startServer({
      port: 0,
      adbTester: async () => {
        const error = new Error("ADB device was not found. Start the emulator and confirm adb devices can see it.");
        error.status = 503;
        error.details = { code: "adb_device_not_found" };
        throw error;
      },
    });
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/adb/test`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ capture: true, settings: { connectionPreset: "googlePlayGames", adbPath: "adb", serial: "127.0.0.1:6520" } }),
      });
      const payload = await response.json();

      assert.equal(response.status, 503);
      assert.match(payload.error, /ADB device was not found/);
      assert.equal(payload.details.code, "adb_device_not_found");
    } finally {
      await closeServer(server);
    }
  });

  assert.ok(entries.some((entry) => entry.message.includes("[adb-diagnostic]") && entry.message.includes("\"event\":\"adb_test_start\"") && entry.message.includes("127.0.0.1:6520")));
  assert.ok(entries.some((entry) => entry.level === "error" && entry.message.includes("\"event\":\"adb_test_error\"") && entry.message.includes("adb_device_not_found")));
});

test("system hypervisor API returns injected diagnostics", async () => {
  const { server, port } = await startServer({
    port: 0,
    hypervisorDetector: async () => ({
      platform: "win32",
      supported: true,
      available: false,
      requiresBiosChange: true,
      severity: "error",
      message: "BIOS/UEFIでCPU仮想化支援を有効化してください。",
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/system/hypervisor`);
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.requiresBiosChange, true);
    assert.match(payload.message, /BIOS/);
  } finally {
    await closeServer(server);
  }
});

test("GLM OCR runtime APIs expose status, async install, and uninstall", async () => {
  const calls = [];
  const glmOcrRuntimeManager = {
    status: async () => {
      calls.push("status");
      return { status: "missing", installed: false, installing: false, installRoot: "D:/state/glm-ocr-runtime" };
    },
    install: async () => {
      calls.push("install");
      return { status: "missing", installed: false, installing: true, installJob: { status: "installing", log: [] } };
    },
    uninstall: async () => {
      calls.push("uninstall");
      return { status: "missing", installed: false, installing: false };
    },
  };
  const { server, port } = await startServer({ port: 0, glmOcrRuntimeManager });
  try {
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/status`);
    const statusPayload = await statusResponse.json();
    const installResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/install`, { method: "POST" });
    const installPayload = await installResponse.json();
    const uninstallResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/uninstall`, { method: "POST" });
    const uninstallPayload = await uninstallResponse.json();

    assert.equal(statusResponse.status, 200);
    assert.equal(statusPayload.status, "missing");
    assert.equal(installResponse.status, 202);
    assert.equal(installPayload.installing, true);
    assert.equal(uninstallResponse.status, 200);
    assert.equal(uninstallPayload.installed, false);
    assert.deepEqual(calls, ["status", "install", "uninstall"]);
  } finally {
    await closeServer(server);
  }
});

test("GLM OCR Ollama runtime APIs expose status, async install, start, and uninstall", async () => {
  const calls = [];
  const ollamaRuntimeManager = {
    status: async () => {
      calls.push("status");
      return { status: "missing", installed: false, installing: false, installRoot: "D:/state/ollama-runtime" };
    },
    install: async () => {
      calls.push("install");
      return { status: "partial", installed: true, installing: true, installJob: { status: "installing", log: [] } };
    },
    start: async () => {
      calls.push("start");
      return { status: "ready", installed: true, installing: false, serverReachable: true, modelPresent: true };
    },
    uninstall: async () => {
      calls.push("uninstall");
      return { status: "missing", installed: false, installing: false };
    },
  };
  const { server, port } = await startServer({ port: 0, ollamaRuntimeManager });
  try {
    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/ollama/status`);
    const statusPayload = await statusResponse.json();
    const installResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/ollama/install`, { method: "POST" });
    const installPayload = await installResponse.json();
    const startResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/ollama/start`, { method: "POST" });
    const startPayload = await startResponse.json();
    const uninstallResponse = await fetch(`http://127.0.0.1:${port}/api/ocr/glm/ollama/uninstall`, { method: "POST" });
    const uninstallPayload = await uninstallResponse.json();

    assert.equal(statusResponse.status, 200);
    assert.equal(statusPayload.status, "missing");
    assert.equal(installResponse.status, 202);
    assert.equal(installPayload.installing, true);
    assert.equal(startResponse.status, 200);
    assert.equal(startPayload.status, "ready");
    assert.equal(uninstallResponse.status, 200);
    assert.equal(uninstallPayload.installed, false);
    assert.deepEqual(calls, ["status", "install", "start", "uninstall"]);
  } finally {
    await closeServer(server);
  }
});


test("ADB path picker API returns the desktop selected path", async () => {
  const selectedPath = "M:/Program Files/Netease/MuMu Player 12/shell/adb.exe";
  const { server, port } = await startServer({
    port: 0,
    adbPathPicker: async () => ({ canceled: false, path: selectedPath }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/adb/select-path`, { method: "POST" });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.canceled, false);
    assert.equal(payload.path, selectedPath);
  } finally {
    await closeServer(server);
  }
});

test("saveAdbScreenshotFrame writes PNG bytes to the local state screenshot directory", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-adb-shot-"));
  const screenshot = await saveAdbScreenshotFrame({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    capturedAt: "2026-06-27T00:00:00.000Z",
  }, { stateDir, now: new Date("2026-06-27T00:00:00.000Z") });

  assert.equal(screenshot.bytes, 4);
  assert.equal(screenshot.capturedAt, "2026-06-27T00:00:00.000Z");
  assert.equal(screenshot.path.endsWith(path.join("adb-screenshots", "adb-test-2026-06-27T00-00-00-000Z.png")), true);
  assert.deepEqual([...await fs.readFile(screenshot.path)], [0x89, 0x50, 0x4e, 0x47]);
});

test("saveRecognitionAdbCaptureFrame writes scan screenshots to a readable debug directory", async () => {
  const baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-adb-debug-shot-"));
  const screenshot = await saveRecognitionAdbCaptureFrame({
    bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    capturedAt: "2026-06-28T09:22:06.623Z",
  }, {
    baseDir,
    scanId: "scan/with unsafe chars",
    profile: { id: "is5AgeFull" },
    source: "adb",
    stage: "scan",
    passIndex: 0,
    iteration: 2,
    scanStartedAt: "2026-06-28T09:22:00.000Z",
  });
  const knownScreen = await saveRecognitionAdbCaptureFrame({
    bytes: Buffer.from([0x89, 0x50]),
    capturedAt: "2026-06-28T09:22:07.000Z",
  }, {
    baseDir,
    scanId: "scan/with unsafe chars",
    profile: { id: "is5AgeFull" },
    source: "adb",
    stage: "known-screen",
    scanStartedAt: "2026-06-28T09:22:00.000Z",
  });

  assert.equal(screenshot.bytes, 4);
  assert.equal(screenshot.path.startsWith(baseDir), true);
  assert.equal(screenshot.path.endsWith(path.join("scan-p0-i2.png")), true);
  assert.equal(path.dirname(screenshot.path), path.dirname(knownScreen.path));
  assert.match(screenshot.path, /is5AgeFull/);
  assert.match(screenshot.path, /scan_with_unsafe_chars/);
  assert.deepEqual([...await fs.readFile(screenshot.path)], [0x89, 0x50, 0x4e, 0x47]);
});

test("recognition scan API passes a debug screenshot saver when adbCaptureDir is configured", async () => {
  const recognitionLogDir = await tempRecognitionLogDir();
  const adbCaptureDir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-adb-capture-"));
  const { server, port } = await startServer({
    port: 0,
    recognitionLogDir,
    adbCaptureDir,
    recognitionRunner: async ({ profile, source, onCaptureFrame }) => {
      const screenshot = await onCaptureFrame({
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        capturedAt: "2026-06-28T09:22:06.623Z",
      }, { scanId: "api-debug-scan", profile, source, stage: "scan", iteration: 0, passIndex: 0 });
      return {
        scanId: "api-debug-scan",
        profileId: profile.id,
        source,
        status: "completed",
        suggestions: [],
        candidates: [],
        log: [{ event: "screenshot", path: screenshot.path }],
      };
    },
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "is5AgeFull", source: "adb" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(payload.result.logPath.startsWith(recognitionLogDir), true);
    const record = JSON.parse(await fs.readFile(payload.result.logPath, "utf8"));
    assert.equal(record.counts.log, 1);
    assert.equal(record.log[0].path.startsWith(adbCaptureDir), true);
    assert.deepEqual([...await fs.readFile(record.log[0].path)], [0x89, 0x50, 0x4e, 0x47]);
  } finally {
    await closeServer(server);
  }
});


test("recognition scan status API exposes active progress and persists completion logs", async () => {
  const recognitionLogDir = await fs.mkdtemp(path.join(os.tmpdir(), "rhodes-recognition-log-"));
  let releaseRunner;
  let startedRunner;
  const runnerRelease = new Promise((resolve) => { releaseRunner = resolve; });
  const runnerStarted = new Promise((resolve) => { startedRunner = resolve; });
  const { server, port } = await startServer({
    port: 0,
    recognitionLogDir,
    recognitionRunner: async ({ profile, source, onLog }) => {
      onLog({ event: "capture", at: "2026-06-27T00:00:00.000Z", stage: "known-screen" });
      startedRunner();
      await runnerRelease;
      onLog({ event: "recognize", at: "2026-06-27T00:00:01.000Z", iteration: 0, count: 1 });
      return {
        scanId: "api-live-scan",
        profileId: profile.id,
        source,
        status: "completed",
        suggestions: [],
        candidates: [{ kind: "relic", relicId: "is5_relic_001", name: "テスト秘宝" }],
        log: [],
      };
    },
  });
  try {
    const scanPromise = fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "relicsFull", source: "adb" }),
    });

    await runnerStarted;
    const activeResponse = await fetch(`http://127.0.0.1:${port}/api/recognition/scan/status`);
    const activePayload = await activeResponse.json();

    assert.equal(activeResponse.status, 200);
    assert.equal(activePayload.active.status, "running");
    assert.equal(activePayload.active.profileId, "relicsFull");
    assert.equal(activePayload.active.log.some((entry) => entry.event === "capture" && entry.stage === "known-screen"), true);

    releaseRunner();
    const scanResponse = await scanPromise;
    const scanPayload = await scanResponse.json();
    assert.equal(scanResponse.status, 200);
    assert.equal(scanPayload.result.logPath.startsWith(recognitionLogDir), true);

    const statusResponse = await fetch(`http://127.0.0.1:${port}/api/recognition/scan/status`);
    const statusPayload = await statusResponse.json();
    assert.equal(statusPayload.active, null);
    assert.equal(statusPayload.lastScan.status, "completed");
    assert.equal(statusPayload.lastScan.counts.candidates, 1);
    assert.equal(statusPayload.lastScan.logPath, scanPayload.result.logPath);

    const saved = JSON.parse(await fs.readFile(scanPayload.result.logPath, "utf8"));
    assert.equal(saved.profileId, "relicsFull");
    assert.equal(saved.counts.log, 2);
    assert.equal(saved.log.some((entry) => entry.event === "recognize" && entry.count === 1), true);
  } finally {
    if (typeof releaseRunner === "function") releaseRunner();
    await closeServer(server);
  }
});
