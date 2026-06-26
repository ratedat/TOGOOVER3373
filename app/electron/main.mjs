import fs from "node:fs/promises";
import path from "node:path";
import { app, BrowserWindow, Menu, shell } from "electron";
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
  DESKTOP_SETTINGS_FILE,
  parseDesktopSettings,
  resolveStartupPort,
  serializeDesktopSettings,
  shouldPromptForPort,
} from "../runtime/port-config.mjs";
import { launchRequestData, resolveSecondInstanceView } from "../runtime/launch-guard.mjs";
import { isInternalAppUrl } from "../runtime/window-open.mjs";

let port = resolveStartupPort({ args: process.argv, env: process.env });
const initialView = normalizeView(readArg(process.argv, "--view", "control-v2"));
const smokeTest = hasFlag(process.argv, "--smoke-test");

let serverController = null;
let mainWindow = null;
let isQuitting = false;

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

function createAppBrowserWindow({ targetUrl, width, height, minWidth, minHeight }) {
  const browserWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    title: "RHODES OBS COMMANDER3373",
    backgroundColor: "#10100f",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
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

function settingsPath() {
  return path.join(app.getPath("userData"), DESKTOP_SETTINGS_FILE);
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
  const file = settingsPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, serializeDesktopSettings({ port: value }), "utf8");
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
      location.href = 'arknights-port://select?port=' + value;
    });
    reset.addEventListener('click', () => {
      input.value = String(defaultPort);
      input.focus();
      input.select();
      refreshPreview();
    });
    cancel.addEventListener('click', () => {
      location.href = 'arknights-port://cancel';
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
      },
    });
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      if (!picker.isDestroyed()) picker.close();
    };
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

async function startDesktopApp() {
  process.env.ARKNIGHTS_STATE_DIR = process.env.ARKNIGHTS_STATE_DIR || path.join(app.getPath("userData"), "state");
  const startupPort = await chooseStartupPort();
  if (startupPort == null) {
    app.quit();
    return;
  }
  port = startupPort;
  const { startServer } = await import("../server.mjs");
  serverController = await startServer({ port });
  port = serverController.port;
  const targetUrl = appUrl(serverController.port, initialView);
  await waitForReady(targetUrl);
  console.log(`Desktop: ${targetUrl}`);
  if (smokeTest) {
    app.quit();
    return;
  }
  createWindow(targetUrl);
}

if (!app.requestSingleInstanceLock(launchRequestData({ port, view: initialView }))) {
  app.quit();
} else {
  app.on("second-instance", handleSecondInstance);

  app.whenReady().then(startDesktopApp).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
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
    if (process.platform !== "darwin") app.quit();
  });
}
