import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const agentWork = path.join(root, ".agent-work");
const defaultInstaller = path.join(root, "src-tauri", "target", "release", "bundle", "nsis", "RHODES OBS COMMANDER3373_0.1.0_x64-setup.exe");
const defaultInstallDir = path.join(agentWork, "tauri-installed-smoke");
const mainBinaryName = "rhodes-obs-commander3373-tauri.exe";
const host = process.env.RHODES_TAURI_SMOKE_HOST || "localhost";
const port = Number(process.env.RHODES_TAURI_SMOKE_PORT || 5181);

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function assertChildPath(parent, child) {
  const relative = path.relative(parent, child);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing to operate outside ${parent}: ${child}`);
  }
}

async function removeInstallDir(installDir) {
  assertChildPath(agentWork, installDir);
  await fs.rm(installDir, { recursive: true, force: true });
}

async function collectInstalledExes(dir, result = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectInstalledExes(fullPath, result).catch(() => {});
      continue;
    }
    if (!entry.isFile()) continue;
    const lower = entry.name.toLowerCase();
    if (lower.endsWith(".exe") && lower !== "uninstall.exe") result.push(fullPath);
  }
  return result;
}

async function findInstalledExe(dir) {
  const exes = await collectInstalledExes(dir);
  return exes.find((file) => path.basename(file).toLowerCase() === mainBinaryName)
    || exes.find((file) => {
      const lower = path.basename(file).toLowerCase();
      return lower.includes("rhodes") && !lower.startsWith("node-");
    })
    || null;
}

async function waitForEndpoint(url, timeoutMs = 20000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`endpoint did not respond: ${url}; ${lastError?.message || "timeout"}`);
}

async function killProcessTree(pid) {
  if (!pid || process.platform !== "win32") return;
  await execFileAsync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
}

async function runSilentInstaller(installer, installDir) {
  await fs.mkdir(path.dirname(installDir), { recursive: true });
  await execFileAsync(installer, ["/S", `/D=${installDir}`], {
    cwd: root,
    timeout: 120000,
    windowsHide: true,
  });
}

async function runSilentUninstaller(installDir) {
  const uninstaller = path.join(installDir, "uninstall.exe");
  try {
    await fs.access(uninstaller);
  } catch {
    return;
  }
  await execFileAsync(uninstaller, ["/S"], {
    cwd: installDir,
    timeout: 120000,
    windowsHide: true,
  }).catch(() => {});
}

async function main() {
  const installer = path.resolve(argValue("--installer", defaultInstaller));
  const installDir = path.resolve(argValue("--install-dir", defaultInstallDir));
  assertChildPath(agentWork, installDir);
  await fs.access(installer);
  await removeInstallDir(installDir);
  let appProcess = null;
  try {
    await runSilentInstaller(installer, installDir);
    const appExe = await findInstalledExe(installDir);
    if (!appExe) throw new Error(`installed application exe not found under ${installDir}`);
    appProcess = spawn(appExe, ["--port", String(port)], {
      cwd: path.dirname(appExe),
      detached: false,
      stdio: "ignore",
      windowsHide: true,
    });
    const response = await waitForEndpoint(`http://${host}:${port}/api/master`);
    const payload = await response.json();
    if (!Array.isArray(payload?.campaigns) || payload.campaigns.length === 0) {
      throw new Error("master payload did not include campaigns");
    }
    console.log(JSON.stringify({
      ok: true,
      installer,
      installDir,
      appExe,
      host,
      port,
      campaignCount: payload.campaigns.length,
    }, null, 2));
  } finally {
    if (appProcess?.pid) await killProcessTree(appProcess.pid);
    await runSilentUninstaller(installDir);
    await removeInstallDir(installDir);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
