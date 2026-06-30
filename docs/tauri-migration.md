# Tauri Migration Notes

This project is moving toward a lighter desktop shell where OBS remains the preview and broadcast surface.

## Target split

- Tauri/Rust: desktop shell, local server lifecycle, settings, ADB/OCR runtime management.
- Existing web UI: control, sidecar, and overlay views served over localhost.
- OBS: browser-source preview and production overlay rendering.
- OCR runtimes: optional downloads under the portable state directory, not part of the normal app binary.

## Current slice

The first Tauri slice keeps the existing Node local server and starts it from Rust. This preserves the existing API and OBS URLs while Electron is still available as the stable release path.

Development command:

```bash
npm run tauri:dev
```

Build command:

```bash
npm run tauri:build
```

`tauri:build` first runs `tauri:prepare`, which creates `src-tauri/resources/` from the committed app, assets, clean data files, docs, and the current Node executable. The generated resource directory is ignored by git. It deliberately excludes local runtime state such as `data/current-state.json`, Electron cache files, ADB work folders, GLM-OCR runtime files, and Ollama runtime files.

Rust prerequisites are required before the command can run. The Node server can be pointed at another repository root with `RHODES_APP_ROOT`, another Node binary with `RHODES_NODE_BIN`, and another port with `-- --port 5174`.

The first successful Windows Tauri package with bundled Node resources was about 56 MB as an NSIS installer. This is still far smaller than the Electron portable build and keeps GLM-OCR/Ollama as optional runtime downloads.

Rust-side storage tests can be run with:

```bash
npm run tauri:test
```

The Tauri shell now mirrors the Electron portable storage contract in `src-tauri/src/storage.rs`: development state stays under `user-data/state`, packaged portable state goes beside the executable under `RHODES OBS COMMANDER3373 Data/state`, and `PORTABLE_EXECUTABLE_FILE` / `ARKNIGHTS_STATE_DIR` overrides are honored.

The first desktop IPC command is `rhodes_storage_target`. It returns the resolved app root, portable storage directory, state directory, and packaged/development mode from Rust. The command is intentionally not wired into the web UI yet; it is the bridge for moving Electron-specific storage UI actions into Tauri.

## Next slices

1. Verify installed NSIS output, not just the raw release EXE. The raw EXE needs resources beside it or `RHODES_APP_ROOT` / `RHODES_NODE_BIN` overrides.
2. Connect the storage UI to `rhodes_storage_target` when running inside Tauri.
3. Move portable storage selection UI actions away from Electron-specific code.
4. Move small desktop-only actions from Electron menus to Tauri commands.
5. Keep GLM-OCR and Ollama as optional runtime downloads under `RHODES OBS COMMANDER3373 Data/state`.
