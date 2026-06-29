import path from "node:path";

export const STORAGE_POINTER_FILE = "storage-location.json";
export const PORTABLE_STORAGE_DIRNAME = "RHODES OBS COMMANDER3373 Data";
export const DEV_STORAGE_DIRNAME = "user-data";
export const DOCUMENTS_STORAGE_DIRNAME = "RHODES OBS COMMANDER3373";
export const storageModeOptions = Object.freeze(["portable", "documents", "custom"]);

export function normalizeStorageMode(value, fallback = "portable") {
  return storageModeOptions.includes(value) ? value : fallback;
}

function cleanPath(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function defaultDocumentsPath({ homeDir = "" } = {}) {
  return path.join(homeDir || process.cwd(), "Documents");
}

function portableExecutableDir({ env = {}, execPath = process.execPath } = {}) {
  const envDir = cleanPath(env.PORTABLE_EXECUTABLE_DIR);
  if (envDir) return envDir;
  const envFile = cleanPath(env.PORTABLE_EXECUTABLE_FILE);
  if (envFile) return path.dirname(envFile);
  const execDir = cleanPath(execPath) ? path.dirname(execPath) : "";
  if (path.basename(execDir).toLowerCase() === "win-unpacked") return path.dirname(execDir);
  return execDir;
}

export function portableStorageDir({ appRoot = process.cwd(), execPath = process.execPath, isPackaged = false, env = {} } = {}) {
  const base = isPackaged ? (portableExecutableDir({ env, execPath }) || appRoot) : appRoot;
  return path.join(base, isPackaged ? PORTABLE_STORAGE_DIRNAME : DEV_STORAGE_DIRNAME);
}

export function documentsStorageDir({ documentsPath = defaultDocumentsPath() } = {}) {
  return path.join(documentsPath, DOCUMENTS_STORAGE_DIRNAME);
}

export function storageTarget({ mode = "portable", storageDir = "", appRoot, execPath, documentsPath, isPackaged, env } = {}) {
  const normalizedMode = normalizeStorageMode(mode);
  const baseDir = cleanPath(storageDir)
    || (normalizedMode === "documents" ? documentsStorageDir({ documentsPath }) : portableStorageDir({ appRoot, execPath, isPackaged, env }));
  return {
    mode: normalizedMode,
    storageDir: baseDir,
    settingsFile: path.join(baseDir, "desktop-settings.json"),
    stateDir: normalizedMode === "custom" ? baseDir : path.join(baseDir, "state"),
    userDataDir: normalizedMode === "custom" ? path.join(baseDir, "electron") : path.join(baseDir, "electron"),
  };
}

export function storagePointerPath(context = {}) {
  return path.join(portableStorageDir(context), STORAGE_POINTER_FILE);
}

export function parseStoragePointer(text) {
  try {
    const parsed = JSON.parse(text);
    const mode = normalizeStorageMode(parsed?.mode, "");
    return mode ? { mode, storageDir: cleanPath(parsed?.storageDir) } : null;
  } catch {
    return null;
  }
}

export function serializeStoragePointer(target) {
  return `${JSON.stringify({ mode: normalizeStorageMode(target?.mode), storageDir: cleanPath(target?.storageDir) }, null, 2)}\n`;
}

export function targetFromStoredSelection(selection, context = {}) {
  if (!selection) return null;
  const mode = normalizeStorageMode(selection.mode, "");
  if (!mode) return null;
  return storageTarget({ ...context, mode, storageDir: mode === "portable" ? "" : selection.storageDir });
}
