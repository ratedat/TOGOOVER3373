import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("package exposes Tauri development and build scripts", async () => {
  const pkg = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.equal(pkg.scripts["tauri:prepare"], "node tools/prepare-tauri-resources.mjs");
  assert.equal(pkg.scripts["tauri:dev"], "tauri dev");
  assert.equal(pkg.scripts["tauri:build"], "npm run tauri:prepare && tauri build");
  assert.equal(pkg.scripts["tauri:test"], "cargo test --manifest-path src-tauri/Cargo.toml");
  assert.equal(pkg.scripts["tauri:smoke:installer"], "node tools/smoke-tauri-installer.mjs");
  assert.match(pkg.devDependencies["@tauri-apps/cli"], /^\^2\./);
});

test("Tauri config keeps the existing localhost control surface", async () => {
  const config = JSON.parse(await readFile(new URL("../src-tauri/tauri.conf.json", import.meta.url), "utf8"));
  assert.equal(config.identifier, "com.ratedat.rhodes.obs.commander3373");
  assert.equal(config.build.devUrl, "http://localhost:5173/control-v2");
  assert.equal(config.build.frontendDist, "../app");
  assert.deepEqual(config.app.windows, []);
  assert.equal(config.app.withGlobalTauri, true);
  assert.deepEqual(config.bundle.resources, ["resources/rhodes-app", "resources/bin"]);
});

test("Tauri Rust shell starts the existing local server before opening the main window", async () => {
  const source = await readFile(new URL("../src-tauri/src/main.rs", import.meta.url), "utf8");
  assert.match(source, /mod storage;/);
  assert.match(source, /start_node_server/);
  assert.match(source, /app[\\"]\)\.join\("server\.mjs"\)/);
  assert.match(source, /LOCAL_HOST: &str = "localhost"/);
  assert.match(source, /wait_for_server\(LOCAL_HOST, port, Duration::from_secs\(12\)\)/);
  assert.match(source, /WebviewWindowBuilder::new\(app, "main", WebviewUrl::External\(url\)\)/);
  assert.match(source, /#\[tauri::command\]/);
  assert.match(source, /rhodes_storage_target/);
  assert.match(source, /generate_handler!\[rhodes_storage_target\]/);
  assert.match(source, /runtime_storage_target/);
  assert.match(source, /resource_dir\(\)/);
  assert.match(source, /node-\{triple\}/);
});

test("Tauri storage module mirrors the portable storage contract", async () => {
  const source = await readFile(new URL("../src-tauri/src/storage.rs", import.meta.url), "utf8");
  assert.match(source, /PORTABLE_STORAGE_DIRNAME: &str = "RHODES OBS COMMANDER3373 Data"/);
  assert.match(source, /DEV_STORAGE_DIRNAME: &str = "user-data"/);
  assert.match(source, /PORTABLE_EXECUTABLE_FILE/);
  assert.match(source, /ARKNIGHTS_STATE_DIR/);
  assert.match(source, /StorageTargetInfo/);
  assert.match(source, /serde\(rename_all = "camelCase"\)/);
  assert.match(source, /win-unpacked/);
  assert.match(source, /storage_target/);
});

test("Tauri default capability is restricted to the main window core permissions", async () => {
  const capability = JSON.parse(await readFile(new URL("../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.permissions, ["core:default"]);
});

test("Tauri Windows resource icon is present for cargo checks and bundles", async () => {
  await access(new URL("../src-tauri/icons/icon.ico", import.meta.url));
});

test("Tauri resource preparation copies runtime assets without user state", async () => {
  const source = await readFile(new URL("../tools/prepare-tauri-resources.mjs", import.meta.url), "utf8");
  assert.match(source, /process\.execPath/);
  assert.match(source, /node-\$\{triple\}/);
  assert.match(source, /EBUSY/);
  assert.match(source, /overlay-state\.example\.json/);
  assert.doesNotMatch(source, /current-state\.json/);
  assert.doesNotMatch(source, /dataFiles = \[[\s\S]*electron/);
});

test("Tauri installer smoke script installs only under agent work", async () => {
  const source = await readFile(new URL("../tools/smoke-tauri-installer.mjs", import.meta.url), "utf8");
  assert.match(source, /tauri-installed-smoke/);
  assert.match(source, /rhodes-obs-commander3373-tauri\.exe/);
  assert.match(source, /assertChildPath\(agentWork, installDir\)/);
  assert.match(source, /taskkill\.exe/);
  assert.match(source, /RHODES_TAURI_SMOKE_HOST/);
  assert.match(source, /\/api\/master/);
  assert.match(source, /uninstall\.exe/);
});
