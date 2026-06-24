import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { startServer } from "../app/server.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

function runLauncher(args = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["app/launcher.mjs", ...args], {
      cwd: ROOT,
      env: { ...process.env, ARKNIGHTS_APP_NO_OPEN: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("exit", (code) => resolve({ code, stdout, stderr }));
  });
}

test("web launcher reuses an already running local server", async () => {
  const controller = await startServer({ port: 0 });
  try {
    const result = await runLauncher(["--port", String(controller.port), "--no-open", "--exit-after-ready"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /App already running:/);
    assert.match(result.stdout, new RegExp(`127\\.0\\.0\\.1:${controller.port}\\/control`));
    assert.equal(result.stderr, "");
  } finally {
    await close(controller.server);
  }
});