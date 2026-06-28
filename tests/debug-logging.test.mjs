import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  DEBUG_LOG_DIRNAME,
  debugLogDir,
  installDebugFileLogging,
  isDebuggerBuild,
  resolveDebugLoggingConfig,
  attachRendererDebugLogging,
} from "../app/runtime/debug-logging.mjs";

test("debug logging is enabled only by debugger metadata or environment flag", () => {
  assert.equal(isDebuggerBuild({ env: {}, packageMetadata: {} }), false);
  assert.equal(isDebuggerBuild({ env: { ARKNIGHTS_DEBUG_LOGS: "1" }, packageMetadata: {} }), true);
  assert.equal(isDebuggerBuild({ env: {}, packageMetadata: { rhodesDebuggerBuild: true } }), true);
});

test("debug log directory sits beside the executable in packaged debugger builds", () => {
  assert.equal(
    debugLogDir({ env: {}, isPackaged: true, execPath: "D:/Tools/RHODES OBS COMMANDER3373.exe", appRoot: "O:/repo" }),
    path.join("D:/Tools", DEBUG_LOG_DIRNAME),
  );
  assert.equal(
    debugLogDir({ env: { ARKNIGHTS_DEBUG_LOG_DIR: "E:/logs/rhodes" }, isPackaged: true, execPath: "D:/Tools/app.exe", appRoot: "O:/repo" }),
    path.resolve("E:/logs/rhodes"),
  );
});

test("debug log directory uses electron-builder portable executable location when available", () => {
  assert.equal(
    debugLogDir({
      env: { PORTABLE_EXECUTABLE_DIR: "E:/Portable/RHODES" },
      isPackaged: true,
      execPath: "C:/Users/owner/AppData/Local/Temp/RHODES/RHODES OBS COMMANDER3373.exe",
      appRoot: "O:/repo",
    }),
    path.join("E:/Portable/RHODES", DEBUG_LOG_DIRNAME),
  );
  assert.equal(
    debugLogDir({
      env: { PORTABLE_EXECUTABLE_FILE: "F:/Tools/RHODES OBS COMMANDER3373-0.1.0-x64-debugger.exe" },
      isPackaged: true,
      execPath: "C:/Users/owner/AppData/Local/Temp/RHODES/RHODES OBS COMMANDER3373.exe",
      appRoot: "O:/repo",
    }),
    path.join("F:/Tools", DEBUG_LOG_DIRNAME),
  );
});

test("resolveDebugLoggingConfig creates a stable discoverable log filename", () => {
  const config = resolveDebugLoggingConfig({
    env: {},
    packageMetadata: { rhodesDebuggerBuild: true },
    appRoot: "O:/repo",
    execPath: "D:/Tools/app.exe",
    isPackaged: true,
    now: new Date("2026-06-28T08:00:00.000Z"),
  });

  assert.equal(config.enabled, true);
  assert.equal(config.logFile, path.join("D:/Tools", DEBUG_LOG_DIRNAME, "main-2026-06-28T08-00-00-000Z.log"));
  assert.equal(config.recognitionLogDir, path.join("D:/Tools", DEBUG_LOG_DIRNAME, "Recognition Scans"));
  assert.equal(config.adbScreenshotDir, path.join("D:/Tools", DEBUG_LOG_DIRNAME, "ADB Screenshots"));
});

test("installDebugFileLogging mirrors console output to the debug log", () => {
  const writes = [];
  const dirs = [];
  const events = [];
  const consoleCalls = [];
  const fakeConsole = {
    log: (...args) => consoleCalls.push(["log", args]),
    warn: (...args) => consoleCalls.push(["warn", args]),
    error: (...args) => consoleCalls.push(["error", args]),
  };
  const logger = installDebugFileLogging({
    config: { enabled: true, logDir: "D:/Tools/Debug", logFile: "D:/Tools/Debug/main.log" },
    consoleObject: fakeConsole,
    processObject: { on: (event, handler) => events.push([event, handler]) },
    mkdirSync: (dir) => dirs.push(dir),
    appendFileSync: (_file, text) => writes.push(text),
  });

  fakeConsole.log("ADB", { serial: "127.0.0.1:6520" });
  events.find(([event]) => event === "unhandledRejection")[1](new Error("boom"));

  assert.equal(logger.enabled, true);
  assert.deepEqual(dirs, ["D:/Tools/Debug"]);
  assert.equal(consoleCalls[0][0], "log");
  assert.equal(writes.some((line) => line.includes("[log] ADB { serial: '127.0.0.1:6520' }")), true);
  assert.equal(writes.some((line) => line.includes("[unhandledRejection] Error: boom")), true);
});

test("attachRendererDebugLogging records Electron console-message details", () => {
  const handlers = new Map();
  const writes = [];
  attachRendererDebugLogging({
    on: (event, handler) => handlers.set(event, handler),
  }, {
    enabled: true,
    write: (channel, message) => writes.push([channel, message]),
  }, "control");

  handlers.get("console-message")({
    level: "warning",
    message: "renderer warning",
    sourceId: "http://127.0.0.1/control-v2",
    lineNumber: 12,
  });

  assert.deepEqual(writes[0], ["renderer", "control level=warning http://127.0.0.1/control-v2:12 renderer warning"]);
});
