import { spawn } from "node:child_process";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..", "..");
export const APP_DIR = path.join(ROOT, "app");
export const DEFAULT_PORT = 5173;

export function readArg(args, name, fallback = null) {
  const index = args.indexOf(name);
  if (index < 0) return fallback;
  return args[index + 1] || fallback;
}

export function hasFlag(args, name) {
  return args.includes(name);
}

export function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return DEFAULT_PORT;
  return port;
}

export function normalizeView(value) {
  if (value === "overlay") return "overlay";
  return "control";
}

export function appUrl(port, view = "control") {
  return `http://127.0.0.1:${port}/${normalizeView(view)}`;
}

export function overlayUrl(port, query = "") {
  return `http://127.0.0.1:${port}/overlay${query}`;
}

export function waitForReady(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let remaining = attempts;
    const retry = () => {
      remaining -= 1;
      if (remaining <= 0) return reject(new Error(`Timed out waiting for ${url}`));
      setTimeout(probe, 250);
    };
    const probe = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) return resolve();
        retry();
      });
      req.setTimeout(500, () => {
        req.destroy();
        retry();
      });
      req.on("error", retry);
    };
    probe();
  });
}

export function startLocalServer({ port = DEFAULT_PORT, stdio = ["ignore", "pipe", "pipe"] } = {}) {
  return spawn(process.execPath, [path.join(APP_DIR, "server.mjs"), "--port", String(port)], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port) },
    stdio,
  });
}

export function stopLocalServer(serverProcess) {
  if (!serverProcess || serverProcess.killed) return;
  serverProcess.kill();
}

export function openExternalUrl(url) {
  const platform = process.platform;
  const command = platform === "win32" ? "cmd.exe" : platform === "darwin" ? "open" : "xdg-open";
  const args = platform === "win32" ? ["/c", "start", "", url] : [url];
  const opener = spawn(command, args, { detached: true, stdio: "ignore" });
  opener.unref();
}