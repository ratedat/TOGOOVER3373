import { execFile } from "node:child_process";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const resourceRoot = path.join(root, "src-tauri", "resources");
const appResource = path.join(resourceRoot, "rhodes-app");
const binResource = path.join(resourceRoot, "bin");

const dataFiles = [
  "campaigns.json",
  "difficulty-grades.json",
  "difficulty-tiers.json",
  "operator-images.json",
  "operator-implementation-history.json",
  "operators.json",
  "overlay-state.example.json",
  "performances.json",
  "relic-effect-rules.json",
  "relic-effect-variants.json",
  "relic-images.json",
  "relics.json",
  "selectable-effects.json",
  "squads.json",
  "start-templates.json",
];

const ignoredNames = new Set([
  "server.log",
  "server.err.log",
]);

function appFilter(source) {
  return !ignoredNames.has(path.basename(source));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeResourceRoot() {
  const retryableCodes = new Set(["EBUSY", "EPERM", "ENOTEMPTY"]);
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      await rm(resourceRoot, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!retryableCodes.has(error?.code) || attempt === 6) throw error;
      await sleep(250 * attempt);
    }
  }
}

async function hostTriple() {
  try {
    const { stdout } = await execFileAsync("rustc", ["-vV"]);
    const hostLine = stdout.split(/\r?\n/).find((line) => line.startsWith("host:"));
    return hostLine?.slice("host:".length).trim() || "x86_64-pc-windows-msvc";
  } catch {
    return process.platform === "win32" ? "x86_64-pc-windows-msvc" : process.platform;
  }
}

async function copyDir(name, options = {}) {
  await cp(path.join(root, name), path.join(appResource, name), {
    recursive: true,
    force: true,
    ...options,
  });
}

await removeResourceRoot();
await mkdir(path.join(appResource, "data"), { recursive: true });
await mkdir(binResource, { recursive: true });

await copyDir("app", { filter: appFilter });
await copyDir("assets");
await copyDir("docs");
await copyDir(path.join("data", "recognition"));
for (const file of dataFiles) {
  await cp(path.join(root, "data", file), path.join(appResource, "data", file), { force: true });
}
for (const file of ["LICENSE", "README.md", "THIRD_PARTY_NOTICES.md"]) {
  await cp(path.join(root, file), path.join(appResource, file), { force: true });
}

const triple = await hostTriple();
const nodeSuffix = process.platform === "win32" ? ".exe" : "";
const nodeTarget = path.join(binResource, `node-${triple}${nodeSuffix}`);
await cp(process.execPath, nodeTarget, { force: true });

console.log(JSON.stringify({
  resourceRoot,
  appResource,
  nodeTarget,
  triple,
}, null, 2));
