import fs from "node:fs";
import path from "node:path";
import util from "node:util";

export const DEBUG_LOG_DIRNAME = "RHODES OBS COMMANDER3373 Debug Logs";

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function safeTimestamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, "-");
}

export function isDebuggerBuild({ env = process.env, packageMetadata = {} } = {}) {
  return truthy(env.ARKNIGHTS_DEBUG_LOGS) || packageMetadata.rhodesDebuggerBuild === true;
}

export function debugLogDir({ env = process.env, appRoot = process.cwd(), execPath = process.execPath, isPackaged = false } = {}) {
  const override = cleanText(env.ARKNIGHTS_DEBUG_LOG_DIR);
  if (override) return path.resolve(override);
  const portableDir = cleanText(env.PORTABLE_EXECUTABLE_DIR)
    || (cleanText(env.PORTABLE_EXECUTABLE_FILE) ? path.dirname(cleanText(env.PORTABLE_EXECUTABLE_FILE)) : "");
  const base = isPackaged && portableDir ? portableDir : (isPackaged && execPath ? path.dirname(execPath) : appRoot);
  return path.join(base, DEBUG_LOG_DIRNAME);
}

export function resolveDebugLoggingConfig({ env = process.env, packageMetadata = {}, appRoot, execPath, isPackaged = false, now = new Date() } = {}) {
  const enabled = isDebuggerBuild({ env, packageMetadata });
  const logDir = debugLogDir({ env, appRoot, execPath, isPackaged });
  return {
    enabled,
    logDir,
    logFile: path.join(logDir, `main-${safeTimestamp(now)}.log`),
    recognitionLogDir: path.join(logDir, "Recognition Scans"),
    adbScreenshotDir: path.join(logDir, "ADB Screenshots"),
  };
}

function serializeLogArgs(args) {
  return util.format(...args).replace(/\r?\n/g, "\n");
}

export function installDebugFileLogging({
  config,
  consoleObject = console,
  processObject = process,
  mkdirSync = fs.mkdirSync,
  appendFileSync = fs.appendFileSync,
} = {}) {
  if (!config?.enabled) return { enabled: false, logDir: config?.logDir || "", logFile: config?.logFile || "", write: () => {} };

  mkdirSync(config.logDir, { recursive: true });
  const write = (channel, message) => {
    const line = `[${new Date().toISOString()}] [${channel}] ${String(message || "")}\n`;
    appendFileSync(config.logFile, line, "utf8");
  };

  const original = {
    log: consoleObject.log.bind(consoleObject),
    warn: consoleObject.warn.bind(consoleObject),
    error: consoleObject.error.bind(consoleObject),
  };
  for (const level of ["log", "warn", "error"]) {
    consoleObject[level] = (...args) => {
      write(level, serializeLogArgs(args));
      original[level](...args);
    };
  }

  processObject.on?.("uncaughtException", (error) => {
    write("uncaughtException", error?.stack || error?.message || String(error));
  });
  processObject.on?.("unhandledRejection", (reason) => {
    write("unhandledRejection", reason?.stack || reason?.message || String(reason));
  });

  write("debug", `Debug logging enabled. logFile=${config.logFile}`);
  return { enabled: true, logDir: config.logDir, logFile: config.logFile, write };
}

export function attachRendererDebugLogging(webContents, logger, label = "renderer") {
  if (!logger?.enabled || !webContents?.on) return;
  webContents.on("console-message", (details) => {
    logger.write("renderer", `${label} level=${details?.level || "info"} ${details?.sourceId || "renderer"}:${details?.lineNumber || 0} ${details?.message || ""}`);
  });
  webContents.on("did-fail-load", (_event, code, description, validatedUrl) => {
    logger.write("renderer-load", `${label} failed code=${code} description=${description || ""} url=${validatedUrl || ""}`);
  });
  webContents.on("render-process-gone", (_event, details) => {
    logger.write("renderer-gone", `${label} ${JSON.stringify(details || {})}`);
  });
}
