export const adbConnectionPresetOptions = Object.freeze([
  { id: "auto", label: "自動" },
  { id: "mumu", label: "MuMu Player" },
  { id: "ldplayer", label: "LDPlayer" },
  { id: "bluestacks", label: "BlueStacks" },
  { id: "nox", label: "NoxPlayer" },
  { id: "xyaz", label: "逍遥 / MEmu" },
  { id: "tencent", label: "テンセントアプリストア" },
  { id: "google-play-games-dev", label: "Google Play Games 開発者" },
  { id: "avd", label: "Android Studio AVD" },
  { id: "wsa", label: "WSA" },
  { id: "custom", label: "手動" },
]);

export const adbConnectionPresetDetails = Object.freeze({
  auto: {
    description: "ADB候補と接続済み端末を自動検出します。",
  },
  mumu: {
    description: "MuMu Player 12のshell\\adb.exeを優先検出します。多重起動時はMuMu側のADBボタンでポートを確認してください。",
    defaults: { screenshotExtension: true },
  },
  ldplayer: {
    description: "LDPlayer 9のadb.exeを優先検出します。",
    defaults: { screenshotExtension: false },
  },
  bluestacks: {
    description: "BlueStacks側でAndroid Debug BridgeをONにしてください。Hyper-V版はポートが変わる場合があります。",
    defaults: { screenshotExtension: false },
    hypervisorUseful: true,
  },
  nox: {
    description: "NoxPlayer用。標準ポート127.0.0.1:62001を優先し、旧ポート59865も候補にします。",
    defaults: { screenshotExtension: false },
  },
  xyaz: {
    description: "逍遥 / MEmu系エミュレーター用。標準ポート127.0.0.1:21503を候補にします。",
    defaults: { screenshotExtension: false },
  },
  tencent: {
    description: "アプリストア側でADBデバッグを有効にしてください。接続先は通常127.0.0.1:5555です。",
    defaults: { autoDetect: false, serial: "127.0.0.1:5555", screenshotExtension: false },
  },
  "google-play-games-dev": {
    description: "Google Play Games開発者エミュレーター用。Hyper-VとGoogleログインが必要で、接続先は127.0.0.1:6520です。",
    defaults: { autoDetect: false, serial: "127.0.0.1:6520", screenshotExtension: false, restartProcessOnFailure: true },
    requiresHypervisor: true,
  },
  avd: {
    description: "Android Studio AVD用。Android 10以降ではMinitouch系ではなくADB入力を使います。",
    defaults: { screenshotExtension: false },
    requiresHypervisor: true,
  },
  wsa: {
    description: "WSAは現在非推奨です。使う場合はカスタム接続として扱います。",
    defaults: { autoDetect: false, screenshotExtension: false },
    requiresHypervisor: true,
  },
  custom: {
    description: "ADBパスと接続先/serialを手動で指定します。",
  },
});

// Based on MaaAssistantArknights connection defaults:
// https://github.com/MaaAssistantArknights/MaaAssistantArknights/blob/dev-v2/src/MaaWpfGui/ViewModels/UserControl/Settings/ConnectSettingsUserControlModel.cs
export const adbDefaultSerialsByPreset = Object.freeze({
  bluestacks: Object.freeze(["127.0.0.1:5555", "127.0.0.1:5556", "127.0.0.1:5565", "127.0.0.1:5575", "127.0.0.1:5585", "127.0.0.1:5595", "127.0.0.1:5554"]),
  mumu: Object.freeze(["127.0.0.1:16384", "127.0.0.1:16416", "127.0.0.1:16448", "127.0.0.1:16480", "127.0.0.1:16512", "127.0.0.1:16544", "127.0.0.1:16576"]),
  ldplayer: Object.freeze(["emulator-5554", "emulator-5556", "emulator-5558", "emulator-5560", "127.0.0.1:5555", "127.0.0.1:5557", "127.0.0.1:5559", "127.0.0.1:5561"]),
  nox: Object.freeze(["127.0.0.1:62001", "127.0.0.1:59865"]),
  xyaz: Object.freeze(["127.0.0.1:21503"]),
  tencent: Object.freeze(["127.0.0.1:5555"]),
  wsa: Object.freeze(["127.0.0.1:58526"]),
  "google-play-games-dev": Object.freeze(["127.0.0.1:6520"]),
});

export const defaultAdbSettings = Object.freeze({
  autoDetect: true,
  connectionPreset: "auto",
  adbPath: "",
  serial: "",
  emulatorPath: "",
  screenshotExtension: true,
  restartServerOnFailure: true,
  restartProcessOnFailure: true,
  closeAdbOnExit: false,
  lightweightAdb: false,
  reconnectAttempts: 5,
  reconnectDelayMs: 1000,
});

const validPresets = new Set(adbConnectionPresetOptions.map((item) => item.id));

function asBool(value, fallback) {
  if (value === true || value === "true" || value === "1" || value === 1) return true;
  if (value === false || value === "false" || value === "0" || value === 0) return false;
  return fallback;
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeAdbPathKey(value) {
  return cleanText(value).replace(/[\\/]+\.[\\/]+/g, "\\").replace(/\\/g, "/").toLowerCase();
}

export function normalizeAdbSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const connectionPreset = validPresets.has(source.connectionPreset) ? source.connectionPreset : defaultAdbSettings.connectionPreset;
  return {
    autoDetect: asBool(source.autoDetect, defaultAdbSettings.autoDetect),
    connectionPreset,
    adbPath: cleanText(source.adbPath),
    serial: cleanText(source.serial),
    emulatorPath: cleanText(source.emulatorPath),
    screenshotExtension: asBool(source.screenshotExtension, defaultAdbSettings.screenshotExtension),
    restartServerOnFailure: asBool(source.restartServerOnFailure, defaultAdbSettings.restartServerOnFailure),
    restartProcessOnFailure: asBool(source.restartProcessOnFailure, defaultAdbSettings.restartProcessOnFailure),
    closeAdbOnExit: asBool(source.closeAdbOnExit, defaultAdbSettings.closeAdbOnExit),
    lightweightAdb: asBool(source.lightweightAdb, defaultAdbSettings.lightweightAdb),
    reconnectAttempts: normalizePositiveInteger(source.reconnectAttempts, defaultAdbSettings.reconnectAttempts, { min: 1, max: 5 }),
    reconnectDelayMs: normalizePositiveInteger(source.reconnectDelayMs, defaultAdbSettings.reconnectDelayMs, { min: 0, max: 10000 }),
  };
}

export function applyAdbPresetDefaults(settings = {}, presetId = settings.connectionPreset) {
  const normalized = normalizeAdbSettings({ ...settings, connectionPreset: presetId });
  const defaults = adbConnectionPresetDetails[normalized.connectionPreset]?.defaults || {};
  return normalizeAdbSettings({
    ...normalized,
    ...defaults,
    adbPath: normalized.adbPath,
    emulatorPath: normalized.emulatorPath,
    serial: defaults.serial && !normalized.serial ? defaults.serial : normalized.serial || defaults.serial || "",
  });
}

export function resolveAdbRuntimeSettings(input = {}, env = process.env) {
  const settings = normalizeAdbSettings(input);
  return {
    adbPath: settings.adbPath || cleanText(env.ARKNIGHTS_ADB_PATH) || "adb",
    serial: settings.serial || cleanText(env.ARKNIGHTS_ADB_SERIAL),
    autoDetect: settings.autoDetect,
    connectionPreset: settings.connectionPreset,
    restartServerOnFailure: settings.restartServerOnFailure,
    restartProcessOnFailure: settings.restartProcessOnFailure,
    reconnectAttempts: settings.reconnectAttempts,
    reconnectDelayMs: settings.reconnectDelayMs,
  };
}

export function parseAdbDevices(output = "") {
  return String(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !/^List of devices attached/i.test(line) && !/^\* daemon/i.test(line))
    .map((line) => {
      const [serial = "", state = "", ...rest] = line.split(/\s+/);
      return { serial, state, detail: rest.join(" ") };
    })
    .filter((item) => item.serial && item.state);
}

function pushCandidate(candidates, seen, path, source, preset = "custom") {
  const normalized = cleanText(path);
  if (!normalized) return;
  const key = normalizeAdbPathKey(normalized);
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push({ path: normalized, source, preset });
}

function pushSerial(candidates, seen, serial) {
  const normalized = cleanText(serial);
  if (!normalized) return;
  const key = normalized.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  candidates.push(normalized);
}

function normalizePositiveInteger(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

export function parseBlueStacksConfigAdbPorts(configText = "") {
  const ports = [];
  const seen = new Set();
  for (const line of String(configText).split(/\r?\n/)) {
    const match = line.match(/\b(?:bst|bst\.instance\.[^.]+)\.[\w.-]*status\.adb_port\s*=\s*"?(\d{4,5})"?/i)
      || line.match(/\badb_port\s*=\s*"?(\d{4,5})"?/i);
    if (!match) continue;
    const port = Number.parseInt(match[1], 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65535) continue;
    const serial = `127.0.0.1:${port}`;
    if (seen.has(serial)) continue;
    seen.add(serial);
    ports.push(serial);
  }
  return ports;
}

export function buildBlueStacksConfigPathCandidates(env = process.env) {
  const programData = cleanText(env.ProgramData) || "C:\\ProgramData";
  return [
    cleanText(env.ARKNIGHTS_BLUESTACKS_CONFIG_PATH),
    `${programData}\\BlueStacks_nxt\\bluestacks.conf`,
    `${programData}\\BlueStacks_nxt_cn\\bluestacks.conf`,
  ].filter(Boolean);
}

export function buildAdbSerialCandidates(settings = {}, { blueStacksPorts = [] } = {}) {
  const normalized = normalizeAdbSettings(settings);
  const candidates = [];
  const seen = new Set();
  pushSerial(candidates, seen, normalized.serial);
  if (normalized.connectionPreset === "bluestacks") {
    for (const serial of blueStacksPorts) pushSerial(candidates, seen, serial);
  }
  for (const serial of adbDefaultSerialsByPreset[normalized.connectionPreset] || []) {
    pushSerial(candidates, seen, serial);
  }
  return candidates;
}

function programFilesRoots(env = {}) {
  return [env.ProgramFiles, env["ProgramFiles(x86)"], env.LOCALAPPDATA].filter(Boolean);
}

export function buildAdbCandidatePaths({ env = process.env, driveLetters = [] } = {}) {
  const candidates = [];
  const seen = new Set();
  pushCandidate(candidates, seen, env.ARKNIGHTS_ADB_PATH, "env", "custom");
  pushCandidate(candidates, seen, env.ANDROID_HOME && `${env.ANDROID_HOME}\\platform-tools\\adb.exe`, "env", "avd");
  pushCandidate(candidates, seen, env.ANDROID_SDK_ROOT && `${env.ANDROID_SDK_ROOT}\\platform-tools\\adb.exe`, "env", "avd");
  pushCandidate(candidates, seen, env.LOCALAPPDATA && `${env.LOCALAPPDATA}\\Android\\Sdk\\platform-tools\\adb.exe`, "known-path", "google-play-games-dev");

  const roots = [
    ...programFilesRoots(env),
    ...driveLetters.flatMap((drive) => [`${drive}:\\Program Files`, `${drive}:\\Program Files (x86)`]),
  ];
  for (const root of roots) {
    pushCandidate(candidates, seen, `${root}\\Netease\\MuMu Player 12\\shell\\adb.exe`, "known-path", "mumu");
    pushCandidate(candidates, seen, `${root}\\Netease\\MuMu PlayerGlobal-12.0\\shell\\adb.exe`, "known-path", "mumu");
    pushCandidate(candidates, seen, `${root}\\MuMu Player 12\\shell\\adb.exe`, "known-path", "mumu");
    pushCandidate(candidates, seen, `${root}\\BlueStacks_nxt\\HD-Adb.exe`, "known-path", "bluestacks");
    pushCandidate(candidates, seen, `${root}\\BlueStacks_nxt\\Engine\\ProgramFiles\\HD-Adb.exe`, "known-path", "bluestacks");
    pushCandidate(candidates, seen, `${root}\\LDPlayer\\LDPlayer9\\adb.exe`, "known-path", "ldplayer");
    pushCandidate(candidates, seen, `${root}\\Nox\\bin\\nox_adb.exe`, "known-path", "nox");
    pushCandidate(candidates, seen, `${root}\\Nox\\bin\\adb.exe`, "known-path", "nox");
    pushCandidate(candidates, seen, `${root}\\Microvirt\\MEmu\\adb.exe`, "known-path", "xyaz");
    pushCandidate(candidates, seen, `${root}\\Tencent\\Androws\\Application\\adb.exe`, "known-path", "tencent");
  }
  pushCandidate(candidates, seen, "adb", "path", "custom");
  return candidates;
}
