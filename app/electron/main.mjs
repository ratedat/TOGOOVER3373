import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, Menu, dialog, shell, ipcMain } from "electron";
import {
  appUrl,
  DEFAULT_PORT,
  hasFlag,
  normalizePort,
  normalizeView,
  overlayPartUrl,
  overlayUrl,
  readArg,
  waitForReady,
} from "../runtime/local-server.mjs";
import {
  attachRendererDebugLogging,
  installDebugFileLogging,
  resolveDebugLoggingConfig,
} from "../runtime/debug-logging.mjs";
import {
  parseDesktopSettings,
  resolveStartupPort,
  serializeDesktopSettings,
  shouldPromptForPort,
} from "../runtime/port-config.mjs";
import { launchRequestData, resolveSecondInstanceView } from "../runtime/launch-guard.mjs";
import {
  parseStoragePointer,
  serializeStoragePointer,
  storagePointerPath,
  storageTarget,
  targetFromStoredSelection,
} from "../runtime/storage-config.mjs";
import { isInternalAppUrl } from "../runtime/window-open.mjs";
import { shouldQuitOnAllWindowsClosed } from "../runtime/electron-lifecycle.mjs";
import { isPortInUseError, nextPortCandidate } from "../runtime/server-startup.mjs";

let port = resolveStartupPort({ args: process.argv, env: process.env });
const initialView = normalizeView(readArg(process.argv, "--view", "control-v2"));
const smokeTest = hasFlag(process.argv, "--smoke-test");
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, "../..");
const PORT_PICKER_PRELOAD = path.join(__dirname, "port-picker-preload.cjs");
const packageMetadata = JSON.parse(readJsonFileSync(path.join(APP_ROOT, "package.json")) || "{}");
const storageContext = {
  appRoot: APP_ROOT,
  execPath: process.execPath,
  documentsPath: path.join(os.homedir(), "Documents"),
  isPackaged: app.isPackaged,
};
const debugLoggingConfig = resolveDebugLoggingConfig({
  env: process.env,
  packageMetadata,
  appRoot: APP_ROOT,
  execPath: process.execPath,
  isPackaged: app.isPackaged,
});
const debugLogger = installDebugFileLogging({
  config: debugLoggingConfig,
});

let storageSelectionSaved = false;
let storageTargetCurrent = resolveInitialStorageTarget();
try {
  app.setPath("userData", storageTargetCurrent.userDataDir);
} catch (error) {
  console.warn(error instanceof Error ? error.message : String(error));
}

let serverController = null;
let mainWindow = null;
let isQuitting = false;
let startupInProgress = true;

function readJsonFileSync(file) {
  try {
    return fsSync.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

function targetFromDesktopSettingsText(textValue) {
  if (!textValue) return null;
  const settings = parseDesktopSettings(textValue);
  if (!settings.storageMode) return null;
  return targetFromStoredSelection({ mode: settings.storageMode, storageDir: settings.storageDir }, storageContext);
}

function defaultPortableTarget() {
  return storageTarget({ ...storageContext, mode: "portable" });
}

function defaultDocumentsTarget() {
  return storageTarget({ ...storageContext, mode: "documents" });
}

function envStateTarget() {
  if (!process.env.ARKNIGHTS_STATE_DIR) return null;
  const stateDir = path.resolve(process.env.ARKNIGHTS_STATE_DIR);
  return storageTarget({ ...storageContext, mode: "custom", storageDir: stateDir });
}

function resolveInitialStorageTarget() {
  const envTarget = envStateTarget();
  if (envTarget) {
    storageSelectionSaved = true;
    return envTarget;
  }

  const pointer = parseStoragePointer(readJsonFileSync(storagePointerPath(storageContext)) || "");
  const pointedTarget = targetFromStoredSelection(pointer, storageContext);
  if (pointedTarget) {
    storageSelectionSaved = true;
    return pointedTarget;
  }

  for (const target of [defaultPortableTarget(), defaultDocumentsTarget()]) {
    const storedTarget = targetFromDesktopSettingsText(readJsonFileSync(target.settingsFile));
    if (storedTarget) {
      storageSelectionSaved = true;
      return storedTarget;
    }
  }

  return defaultPortableTarget();
}

async function writeStoragePointer(target) {
  if (target.mode === "custom") return;
  const file = storagePointerPath(storageContext);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serializeStoragePointer(target), "utf8");
}

async function writeDesktopSettingsForTarget(target, { port: selectedPort = port } = {}) {
  await fs.mkdir(path.dirname(target.settingsFile), { recursive: true });
  await fs.writeFile(target.settingsFile, serializeDesktopSettings({
    port: selectedPort,
    storageMode: target.mode === "custom" ? null : target.mode,
    storageDir: target.mode === "custom" ? "" : target.storageDir,
  }), "utf8");
  await writeStoragePointer(target);
}

function storageTargetSummary(target) {
  if (target.mode === "documents") return `ドキュメント: ${target.storageDir}`;
  if (target.mode === "custom") return `指定: ${target.stateDir}`;
  return `実行ファイル側: ${target.storageDir}`;
}

function currentPort() {
  return serverController?.port || port;
}

function loadView(view) {
  if (!mainWindow) return;
  mainWindow.loadURL(appUrl(currentPort(), view));
}

function controlV2ScreenUrl(screen) {
  return `${appUrl(currentPort(), "control-v2")}?screen=${encodeURIComponent(screen)}`;
}

function focusWindow(window) {
  if (!window || window.isDestroyed()) return false;
  if (window.isMinimized()) window.restore();
  window.show();
  window.focus();
  return true;
}

function focusAnyWindow() {
  return focusWindow(mainWindow) || focusWindow(BrowserWindow.getAllWindows().find((window) => !window.isDestroyed()));
}

function handleSecondInstance(_event, commandLine, _workingDirectory, additionalData) {
  const requestedView = resolveSecondInstanceView(commandLine, additionalData, initialView);
  if (serverController) {
    if (mainWindow) loadView(requestedView);
    else if (app.isReady()) createWindow(appUrl(currentPort(), requestedView));
  }
  focusAnyWindow();
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "表示",
      submenu: [
        { label: "Control", accelerator: "CmdOrCtrl+1", click: () => loadView("control-v2") },
        { label: "Sidecar", accelerator: "CmdOrCtrl+2", click: () => loadView("sidecar") },
        { label: "Overlay Preview", accelerator: "CmdOrCtrl+3", click: () => loadView("overlay") },
        { label: "ライセンス / 謝辞", accelerator: "CmdOrCtrl+4", click: () => loadView("licenses") },
        { type: "separator" },
        {
          label: "Control v2 別ウィンドウ",
          submenu: [
            { label: "共通設定", click: () => createAuxWindow(controlV2ScreenUrl("common")) },
            { label: "オペレーター", click: () => createAuxWindow(controlV2ScreenUrl("operators")) },
            { label: "秘宝", click: () => createAuxWindow(controlV2ScreenUrl("relics")) },
            { label: "特殊", click: () => createAuxWindow(controlV2ScreenUrl("special")) },
            { label: "OBS設定", click: () => createAuxWindow(controlV2ScreenUrl("obs")) },
            { label: "サイドカー", click: () => createAuxWindow(appUrl(currentPort(), "sidecar")) },
          ],
        },
        { type: "separator" },
        { label: "OBS Compact URLを開く", click: () => shell.openExternal(overlayUrl(currentPort(), "?layout=compact")) },
        { label: "OBS 横長URLを開く", click: () => shell.openExternal(overlayUrl(currentPort(), "?layout=horizontal&size=medium")) },
        { label: "OBS 縦長URLを開く", click: () => shell.openExternal(overlayUrl(currentPort(), "?layout=vertical&size=medium")) },
        { type: "separator" },
        {
          label: "分割パーツURL",
          submenu: [
            { label: "ラン状態", click: () => shell.openExternal(overlayPartUrl(currentPort(), "status")) },
            { label: "秘宝", click: () => shell.openExternal(overlayPartUrl(currentPort(), "relics")) },
            { label: "招集", click: () => shell.openExternal(overlayPartUrl(currentPort(), "operators")) },
            { label: "効果", click: () => shell.openExternal(overlayPartUrl(currentPort(), "effects")) },
            { label: "ボス", click: () => shell.openExternal(overlayPartUrl(currentPort(), "bosses")) },
            { label: "特殊値", click: () => shell.openExternal(overlayPartUrl(currentPort(), "special")) },
          ],
        },
      ],
    },
    {
      label: "操作",
      submenu: [
        { label: "保存先設定", click: () => changeStorageLocation() },
        { type: "separator" },
        { role: "reload", label: "再読み込み" },
        { role: "toggleDevTools", label: "開発者ツール" },
        { type: "separator" },
        { role: "quit", label: "終了" },
      ],
    },
  ]);
}

function handleWindowOpen({ url }) {
  if (isInternalAppUrl(url, currentPort())) {
    createAuxWindow(url);
    return { action: "deny" };
  }
  if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  return { action: "deny" };
}

function createAppBrowserWindow({ targetUrl, width, height, minWidth, minHeight, show = true }) {
  const browserWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    show,
    title: "RHODES OBS COMMANDER3373",
    backgroundColor: "#10100f",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  attachRendererDebugLogging(browserWindow.webContents, debugLogger, targetUrl);
  browserWindow.webContents.setWindowOpenHandler(handleWindowOpen);
  browserWindow.loadURL(targetUrl);
  return browserWindow;
}

function createAuxWindow(targetUrl) {
  return createAppBrowserWindow({
    targetUrl,
    width: 1180,
    height: 840,
    minWidth: 820,
    minHeight: 560,
  });
}

function createWindow(targetUrl) {
  mainWindow = createAppBrowserWindow({
    targetUrl,
    width: 1360,
    height: 920,
    minWidth: 980,
    minHeight: 680,
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  Menu.setApplicationMenu(buildMenu());
}

async function validateRendererSmoke(targetUrl) {
  const smokeWindow = createAppBrowserWindow({
    targetUrl,
    width: 1024,
    height: 768,
    minWidth: 800,
    minHeight: 600,
    show: false,
  });
  const consoleMessages = [];
  smokeWindow.webContents.on("console-message", (details) => {
    consoleMessages.push(`${details?.sourceId || "renderer"}:${details?.lineNumber || 0} ${details?.message || ""}`);
  });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("renderer smoke timed out before load finished")), 8000);
      smokeWindow.webContents.once("did-fail-load", (_event, code, description) => {
        clearTimeout(timer);
        reject(new Error(`renderer load failed: ${code} ${description}`));
      });
      smokeWindow.webContents.once("render-process-gone", (_event, details) => {
        clearTimeout(timer);
        reject(new Error(`renderer process gone: ${details.reason}`));
      });
      smokeWindow.webContents.once("did-finish-load", () => {
        clearTimeout(timer);
        resolve();
      });
    });

    const result = await smokeWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const started = Date.now();
        const probe = () => {
          const app = document.querySelector('#app');
          const text = (app?.textContent || '').trim();
          const payload = {
            loading: app?.dataset?.loading || '',
            className: app?.className || '',
            text: text.slice(0, 240),
          };
          if (payload.loading === 'false' || Date.now() - started > 5000) resolve(payload);
          else setTimeout(probe, 100);
        };
        probe();
      })
    `);
    if (result?.loading !== "false") {
      const details = consoleMessages.length ? ` Console: ${consoleMessages.join(" | ")}` : "";
      throw new Error(`renderer stayed on Loading. Text: ${result?.text || ""}.${details}`);
    }
  } finally {
    if (!smokeWindow.isDestroyed()) smokeWindow.destroy();
  }
}

function settingsPath() {
  return storageTargetCurrent.settingsFile;
}

async function readSavedPort() {
  try {
    const text = await fs.readFile(settingsPath(), "utf8");
    return parseDesktopSettings(text).port;
  } catch (error) {
    if (error?.code !== "ENOENT") console.warn(error instanceof Error ? error.message : String(error));
    return null;
  }
}

async function saveSelectedPort(value) {
  await writeDesktopSettingsForTarget(storageTargetCurrent, { port: value });
}

function portPickerHtml(defaultPort) {
  return `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>サーバー設定</title>
  <style>
    :root { color-scheme: dark; font-family: "Yu Gothic UI", "Segoe UI", sans-serif; }
    body { margin: 0; background: #11100f; color: #f2eee6; }
    main { padding: 22px; display: grid; gap: 16px; }
    h1 { margin: 0; font-size: 18px; letter-spacing: 0; }
    p { margin: 0; color: #bdb5aa; font-size: 12px; line-height: 1.6; }
    label { display: grid; gap: 8px; color: #d8d1c8; font-size: 12px; font-weight: 700; }
    input { width: 100%; box-sizing: border-box; border: 1px solid #4d463d; border-radius: 6px; background: #1d1b19; color: #fff; padding: 10px 12px; font-size: 18px; }
    input:focus { outline: 2px solid #d4aa38; outline-offset: 1px; }
    .preview { padding: 10px 12px; border: 1px solid #36322d; border-radius: 6px; background: #171614; color: #e5c65e; font-family: Consolas, monospace; font-size: 12px; overflow-wrap: anywhere; }
    .error { min-height: 18px; color: #ff9084; font-size: 12px; }
    .actions { display: flex; justify-content: flex-end; gap: 8px; }
    button { border: 1px solid #4d463d; border-radius: 6px; background: #26231f; color: #f2eee6; padding: 9px 13px; font-weight: 700; cursor: pointer; }
    button.primary { border-color: #d4aa38; background: #d4aa38; color: #17120a; }
  </style>
</head>
<body>
  <main>
    <h1>サーバー設定</h1>
    <p>OBS Browser Source と操作画面で使うローカルサーバーのポート番号を指定します。通常は既定値のままで問題ありません。</p>
    <form id="port-form">
      <label>ポート番号
        <input id="port" inputmode="numeric" pattern="[0-9]*" autocomplete="off" value="${normalizePort(defaultPort)}" />
      </label>
      <div id="preview" class="preview"></div>
      <div id="error" class="error" aria-live="polite"></div>
      <div class="actions">
        <button type="button" id="reset">既定値に戻す</button>
        <button type="button" id="cancel">終了</button>
        <button type="submit" class="primary">起動</button>
      </div>
    </form>
  </main>
  <script>
    const defaultPort = ${DEFAULT_PORT};
    const input = document.getElementById('port');
    const preview = document.getElementById('preview');
    const error = document.getElementById('error');
    const form = document.getElementById('port-form');
    const reset = document.getElementById('reset');
    const cancel = document.getElementById('cancel');
    function readPort() {
      return Number(input.value);
    }
    function isValidPort(value) {
      return Number.isInteger(value) && value >= 1 && value <= 65535;
    }
    function refreshPreview() {
      const value = readPort();
      preview.textContent = isValidPort(value) ? 'http://127.0.0.1:' + value + '/overlay' : 'http://127.0.0.1:----/overlay';
      error.textContent = '';
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const value = readPort();
      if (!isValidPort(value)) {
        error.textContent = '1から65535までの整数を入力してください。';
        input.focus();
        input.select();
        return;
      }
      if (window.rhodesPortPicker) {
        window.rhodesPortPicker.select(value);
      } else {
        location.href = 'arknights-port://select?port=' + value;
      }
    });
    reset.addEventListener('click', () => {
      input.value = String(defaultPort);
      input.focus();
      input.select();
      refreshPreview();
    });
    cancel.addEventListener('click', () => {
      if (window.rhodesPortPicker) {
        window.rhodesPortPicker.cancel();
      } else {
        location.href = 'arknights-port://cancel';
      }
    });
    input.addEventListener('input', refreshPreview);
    refreshPreview();
    input.focus();
    input.select();
  </script>
</body>
</html>`;
}

function showPortPicker(defaultPort) {
  return new Promise((resolve) => {
    const picker = new BrowserWindow({
      width: 440,
      height: 340,
      resizable: false,
      minimizable: false,
      maximizable: false,
      title: "サーバー設定",
      backgroundColor: "#11100f",
      autoHideMenuBar: true,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: PORT_PICKER_PRELOAD,
      },
    });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      ipcMain.off("rhodes-port-picker-select", handleIpcSelect);
      ipcMain.off("rhodes-port-picker-cancel", handleIpcCancel);
      resolve(value);
      if (!picker.isDestroyed()) picker.close();
    };
    const handleIpcSelect = (event, value) => {
      if (event.sender !== picker.webContents) return;
      finish(normalizePort(value));
    };
    const handleIpcCancel = (event) => {
      if (event.sender !== picker.webContents) return;
      finish(null);
    };
    ipcMain.on("rhodes-port-picker-select", handleIpcSelect);
    ipcMain.on("rhodes-port-picker-cancel", handleIpcCancel);
    const handlePickerUrl = (targetUrl) => {
      if (!targetUrl.startsWith("arknights-port://")) return false;
      const parsed = new URL(targetUrl);
      if (parsed.hostname === "select") {
        finish(normalizePort(parsed.searchParams.get("port")));
        return true;
      }
      if (parsed.hostname === "cancel") {
        finish(null);
        return true;
      }
      return false;
    };
    picker.webContents.on("will-navigate", (event, targetUrl) => {
      if (!handlePickerUrl(targetUrl)) return;
      event.preventDefault();
    });
    picker.webContents.setWindowOpenHandler(({ url }) => {
      handlePickerUrl(url);
      return { action: "deny" };
    });
    picker.on("closed", () => finish(null));
    picker.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(portPickerHtml(defaultPort))}`);
  });
}

async function showStoragePicker() {
  const portableTarget = defaultPortableTarget();
  const documentsTarget = defaultDocumentsTarget();
  const result = await dialog.showMessageBox({
    type: "question",
    title: "保存先設定",
    message: "設定とスクリーンショットの保存先を選択してください",
    detail: [
      `実行ファイル側: ${portableTarget.storageDir}`,
      `ドキュメント: ${documentsTarget.storageDir}`,
      "後から 操作 > 保存先設定 で変更できます。",
    ].join("\n"),
    buttons: ["実行ファイル側に保存（推奨）", "ドキュメントに保存", "終了"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  });
  if (result.response === 0) return portableTarget;
  if (result.response === 1) return documentsTarget;
  return null;
}

async function chooseStorageTarget() {
  if (process.env.ARKNIGHTS_STATE_DIR || smokeTest || storageSelectionSaved) return storageTargetCurrent;
  const selected = await showStoragePicker();
  if (!selected) return null;
  storageTargetCurrent = selected;
  storageSelectionSaved = true;
  try {
    app.setPath("userData", storageTargetCurrent.userDataDir);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : String(error));
  }
  await writeDesktopSettingsForTarget(storageTargetCurrent, { port });
  return storageTargetCurrent;
}

async function changeStorageLocation() {
  const selected = await showStoragePicker();
  if (!selected) return;
  if (selected.storageDir === storageTargetCurrent.storageDir) return;
  await writeDesktopSettingsForTarget(selected, { port: currentPort() });
  const result = await dialog.showMessageBox(mainWindow || undefined, {
    type: "info",
    title: "保存先設定",
    message: "保存先を変更しました",
    detail: `${storageTargetSummary(selected)}\n変更を反映するため再起動します。`,
    buttons: ["再起動", "後で"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (result.response === 0) {
    app.relaunch({ args: process.argv.slice(1) });
    app.exit(0);
  }
}

async function chooseStartupPort() {
  const savedPort = await readSavedPort();
  const resolvedPort = resolveStartupPort({ args: process.argv, env: process.env, savedPort });
  if (!shouldPromptForPort(process.argv, process.env, { smokeTest })) return resolvedPort;
  const pickedPort = await showPortPicker(resolvedPort);
  if (pickedPort == null) return null;
  try {
    await saveSelectedPort(pickedPort);
  } catch (error) {
    console.warn(error instanceof Error ? error.message : String(error));
  }
  return pickedPort;
}


async function pickAdbPath() {
  const owner = BrowserWindow.getFocusedWindow() || mainWindow || undefined;
  const result = await dialog.showOpenDialog(owner, {
    title: "ADB実行ファイルを選択",
    properties: ["openFile"],
    filters: process.platform === "win32"
      ? [{ name: "ADB executable", extensions: ["exe"] }, { name: "All files", extensions: ["*"] }]
      : [{ name: "All files", extensions: ["*"] }],
  });
  return { canceled: result.canceled, path: result.filePaths?.[0] || "" };
}

async function showPortInUseDialog(conflictingPort) {
  const result = await dialog.showMessageBox({
    type: "warning",
    title: "サーバー起動失敗",
    message: `ポート ${conflictingPort} は既に使用中です`,
    detail: "別のRHODES OBS COMMANDER3373、開発用サーバー、または他のアプリが同じポートを使っています。別ポートを選ぶか、使用中のアプリを終了してください。",
    buttons: ["別ポートを選ぶ", "終了"],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  return result.response === 0;
}

async function startServerWithPortRetry(startServer, selectedPort) {
  let candidatePort = selectedPort;
  while (candidatePort != null) {
    port = candidatePort;
    try {
      const controller = await startServer({
        port: candidatePort,
        adbPathPicker: pickAdbPath,
        ...(debugLoggingConfig.enabled ? {
          recognitionLogDir: debugLoggingConfig.recognitionLogDir,
          adbCaptureDir: debugLoggingConfig.adbScreenshotDir,
        } : {}),
      });
      port = controller.port;
      return controller;
    } catch (error) {
      if (!isPortInUseError(error) || smokeTest) throw error;
      console.warn(error instanceof Error ? error.message : String(error));
      const retry = await showPortInUseDialog(candidatePort);
      if (!retry) return null;
      candidatePort = await showPortPicker(nextPortCandidate(candidatePort));
      if (candidatePort != null) {
        try {
          await saveSelectedPort(candidatePort);
        } catch (saveError) {
          console.warn(saveError instanceof Error ? saveError.message : String(saveError));
        }
      }
    }
  }
  return null;
}
async function startDesktopApp() {
  startupInProgress = true;
  const selectedStorageTarget = await chooseStorageTarget();
  if (!selectedStorageTarget) {
    app.quit();
    return;
  }
  process.env.ARKNIGHTS_STATE_DIR = process.env.ARKNIGHTS_STATE_DIR || selectedStorageTarget.stateDir;
  const startupPort = await chooseStartupPort();
  if (startupPort == null) {
    app.quit();
    return;
  }
  const { startServer } = await import("../server.mjs");
  serverController = await startServerWithPortRetry(startServer, startupPort);
  if (!serverController) {
    app.quit();
    return;
  }
  const targetUrl = appUrl(serverController.port, initialView);
  await waitForReady(targetUrl);
  console.log(`Desktop: ${targetUrl}`);
  if (debugLogger.enabled) console.log(`Debug log: ${debugLogger.logFile}`);
  if (smokeTest) {
    await validateRendererSmoke(targetUrl);
    app.quit();
    return;
  }
  createWindow(targetUrl);
  startupInProgress = false;
}

if (!app.requestSingleInstanceLock(launchRequestData({ port, view: initialView }))) {
  app.quit();
} else {
  app.on("second-instance", handleSecondInstance);

  app.whenReady().then(startDesktopApp).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    dialog.showErrorBox("RHODES OBS COMMANDER3373 起動失敗", message);
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0 && serverController) createWindow(appUrl(currentPort(), initialView));
  });

  app.on("before-quit", () => {
    isQuitting = true;
    serverController?.server?.close();
  });

  app.on("window-all-closed", () => {
    if (shouldQuitOnAllWindowsClosed({ platform: process.platform, startupInProgress })) app.quit();
  });
}
