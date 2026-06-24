import { app, BrowserWindow, Menu, shell } from "electron";
import {
  appUrl,
  DEFAULT_PORT,
  hasFlag,
  normalizePort,
  normalizeView,
  overlayUrl,
  readArg,
  startLocalServer,
  stopLocalServer,
  waitForReady,
} from "../runtime/local-server.mjs";

const port = normalizePort(readArg(process.argv, "--port", process.env.PORT || DEFAULT_PORT));
const initialView = normalizeView(readArg(process.argv, "--view", "control"));
const smokeTest = hasFlag(process.argv, "--smoke-test");

let serverProcess = null;
let mainWindow = null;
let isQuitting = false;

function loadView(view) {
  if (!mainWindow) return;
  mainWindow.loadURL(appUrl(port, view));
}

function buildMenu() {
  return Menu.buildFromTemplate([
    {
      label: "表示",
      submenu: [
        { label: "Control", accelerator: "CmdOrCtrl+1", click: () => loadView("control") },
        { label: "Overlay Preview", accelerator: "CmdOrCtrl+2", click: () => loadView("overlay") },
        { type: "separator" },
        { label: "OBS Compact URLを開く", click: () => shell.openExternal(overlayUrl(port, "?layout=compact")) },
        { label: "OBS 横長URLを開く", click: () => shell.openExternal(overlayUrl(port, "?layout=horizontal&size=medium")) },
        { label: "OBS 縦長URLを開く", click: () => shell.openExternal(overlayUrl(port, "?layout=vertical&size=medium")) },
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

function createWindow(targetUrl) {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 920,
    minWidth: 980,
    minHeight: 680,
    title: "Arknights Rogue OBS Tool",
    backgroundColor: "#10100f",
    autoHideMenuBar: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  Menu.setApplicationMenu(buildMenu());
  mainWindow.loadURL(targetUrl);
}

function wireServerLogs() {
  serverProcess.stdout?.on("data", (chunk) => process.stdout.write(chunk));
  serverProcess.stderr?.on("data", (chunk) => process.stderr.write(chunk));
  serverProcess.on("exit", (code) => {
    if (!isQuitting) {
      console.error(`Local server exited with code ${code ?? "unknown"}`);
      app.quit();
    }
  });
}

async function startDesktopApp() {
  serverProcess = startLocalServer({ port });
  wireServerLogs();
  const targetUrl = appUrl(port, initialView);
  await waitForReady(targetUrl);
  console.log(`Desktop: ${targetUrl}`);
  if (smokeTest) {
    app.quit();
    return;
  }
  createWindow(targetUrl);
}

app.whenReady().then(startDesktopApp).catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(appUrl(port, initialView));
});

app.on("before-quit", () => {
  isQuitting = true;
  stopLocalServer(serverProcess);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});