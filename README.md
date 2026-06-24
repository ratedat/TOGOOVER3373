# Arknights Rogue OBS Tool

OBS overlay tool for displaying Arknights Integrated Strategies run state.

The project is planned around manual-first operation, with optional semi-automatic ADB/OCR assistance later.

Target campaigns:

- IS#2: ファントムと緋き貴石
- IS#3: ミヅキと紺碧の樹
- IS#4: 探索者と銀氷の果て
- IS#5: サルカズの炉辺奇談
- IS#6: 歳の界園志異

See:

- `docs/architecture.md` for state and overlay architecture
- `docs/data-sources.md` for source extraction notes
- `docs/data-summary.md` for extracted campaign data coverage
- `docs/effect-calculation.md` for relic/squad effect calculation design
- `data/wikiru-campaign-sources.json` for adding or updating campaign wiki extraction targets
- `data/performance-sources.json` for adding or updating campaign performance/event-buff extraction targets such as IS#2 演目
- `data/performances.json` for generated selectable performance/event-buff names and effects
- `data/difficulty-variant-sources.json` for adding or updating difficulty-dependent relic groups
- `data/difficulty-tiers.json` for campaign-specific difficulty tier mapping such as IS#4/IS#5/IS#6 多元化珍品
- `data/difficulty-grade-sources.json` for selectable grade ranges and wiki table column mappings
- `data/difficulty-grades.json` for generated grade conditions, score multipliers, and campaign-specific grade effects
- `data/relic-effect-variants.json` for tier-specific relic effect text
- `data/relic-images.json` for the relic image sync audit
- `assets/relics/wikiru/img` for mirrored relic image files referenced by `data/relics.json`
- `data/wikiru-operator-sources.json` for the operator wiki extraction source
- `data/operators.json` for operator names, rarity, class, branch, and image metadata
- `data/operator-implementation-history.json` for Japan implementation dates/order merged into operator sorting
- `data/operator-images.json` for the operator image sync audit
- `assets/operators/wikiru/img` for mirrored operator image files referenced by `data/operators.json`

## Local MVP App

The first manual-first MVP is implemented as a dependency-free Node app.

For streamers and tournament staff, use the Windows desktop app build when available: download `Arknights Rogue OBS Tool.exe` from the release package and double-click it.

When running from the source folder on Windows, double-click this file instead of typing commands:

- `start-windows.vbs`

The first launch may run a one-time setup if dependencies are missing. After that, the desktop app asks which local server port to use before starting. The default is `5173`, and the last selected port is reused on the next launch. The top menu can switch between Control and Overlay Preview, and can open common OBS overlay URLs in the system browser.

The desktop app uses a single-instance guard. Launching it again brings the existing window to the front instead of starting another local server. The web launcher also reuses an already-running server on the selected port and exits after opening the existing URL.

Developer fallback commands:

```powershell
cd O:\Arknights_Rogue_OBSTool
npm.cmd run app
```

To bypass the desktop port picker during development, pass a port explicitly:

```powershell
npm.cmd run app -- --port 5174
```

Build a portable Windows exe for distribution:

```powershell
npm.cmd run dist:win
```

Start only the local server without the desktop window:

```powershell
cd O:\Arknights_Rogue_OBSTool
npm.cmd run dev
```

Open the control panel:

- http://127.0.0.1:5173/control

The examples below use the default port `5173`. If you selected another port in the desktop app, replace `5173` with that port in OBS Browser Source URLs.

Open the sidecar support window when you want a compact emulator-adjacent view for run state, effects, relics, operators, boss flags, and review queues:

- http://127.0.0.1:5173/sidecar

Use this URL as an OBS Browser Source:

- http://127.0.0.1:5173/overlay

The desktop shell is intentionally thin: OBS still uses browser-source URLs, while the app window is the sidecar for control, review, and future recognition support. The default overlay is the compact stream layout. The vertical and horizontal variants use auto-scrolling relic/operator panes so entries are not omitted:

- http://127.0.0.1:5173/overlay?layout=vertical&size=small
- http://127.0.0.1:5173/overlay?layout=vertical&size=medium
- http://127.0.0.1:5173/overlay?layout=vertical&size=large
- http://127.0.0.1:5173/overlay?layout=horizontal&size=small
- http://127.0.0.1:5173/overlay?layout=horizontal&size=medium
- http://127.0.0.1:5173/overlay?layout=horizontal&size=large
- http://127.0.0.1:5173/overlay?layout=full

OBS parts can be added as separate Browser Sources when you want to arrange each element freely:

- http://127.0.0.1:5173/overlay/part/status
- http://127.0.0.1:5173/overlay/part/relics
- http://127.0.0.1:5173/overlay/part/operators
- http://127.0.0.1:5173/overlay/part/effects
- http://127.0.0.1:5173/overlay/part/bosses
- http://127.0.0.1:5173/overlay/part/special

Runtime state is stored in `data/current-state.json` and is intentionally ignored by Git. The committed example state remains `data/overlay-state.example.json`.

## Data Update Workflow

Use the data update runner when refreshing wiki-derived data. It snapshots the current data, runs the selected sync steps, snapshots the result, and writes a diff report under `review/update-runs/<run-id>/`.

Preview the planned full update:

```powershell
npm.cmd run data:update:plan
```

Run the standard full update:

```powershell
npm.cmd run data:update
```

Run only part of the flow when checking a specific source:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Operators
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Performances
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Campaigns,Performances,DifficultyVariants,DifficultyGrades,RelicImages
```

Each run produces:

- `summary.md` - human-readable counts and changed item list
- `changes.csv` - spreadsheet-friendly review file
- `changes.json` - full machine-readable diff
- `before/data` and `after/data` - snapshots used for comparison
- `run.log` - executed commands and script output

Generated update runs are intentionally ignored by Git. Commit data and asset changes only after reviewing the diff and the generated review pages.
