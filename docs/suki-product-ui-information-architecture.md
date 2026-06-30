# Suki Product UI Information Architecture

This document records the product UI coverage needed before the Suki/Avalonia shell can replace the current Electron Control v2 surface.

The Japanese design philosophy summary is recorded in `docs/suki-design-philosophy-ja.md`.

## Current Assessment

The current Suki shell is a useful operational foundation, but it is not yet a complete UI model for RHODES OBS COMMANDER3373. It covers the first layer of ADB connection, campaign switching, operator/relic filtering, and MAA resource task execution. It does not yet fully cover the number of input types, review states, and run-state dependencies that the production workflow requires.

Treating the current screen as the final structure would be a mistake. The app needs an explicit information architecture before more OCR work is layered on top.

## Product Surface Size

- Campaigns: 5 Integrated Strategies campaigns.
- Operators: 430 entries across 8 classes.
- Relics: 1327 entries across campaign catalogs; IS#5 currently has 296 relics.
- Run base fields: squad, difficulty/tier, random squad effect, performance, hope/current max hope, ingot, life points, shield, command level, campaign.
- IS-specific fields:
  - IS#2: no special field in current catalog.
  - IS#3: rejection reaction, revelations, horde calls.
  - IS#4: collapse value, paradigm lost, revelation board.
  - IS#5: thought, idea, age.
  - IS#6: coins, seasonal hours.
- Recognition and evidence: profiles, task runs, OCR/template results, candidate conversion, screenshots, logs, recognition detail JSON, pending suggestions.
- Output and runtime: OBS overlay, sidecar, ADB presets/devices, MAA resources, optional GLM-OCR/Ollama runtime, Hyper-V/device diagnostics.

## Design Risk

The main risk is not visual polish. The main risk is mixing unrelated jobs into one panel:

- Selecting persistent run state.
- Correcting OCR results.
- Inspecting evidence.
- Managing ADB/runtime setup.
- Controlling OBS/sidecar output.
- Editing campaign-specific special values.

If these jobs share one undifferentiated list, the user cannot tell whether they are editing state, reviewing a candidate, changing a runtime setting, or changing what OBS displays.

Future feature growth makes this risk larger. More campaigns, special values, OCR engines, recognition profiles, operator metadata, relic effects, tournament fields, sidecar modes, and debugger tools are expected. The UI must therefore treat new elements as schema-driven entries inside stable workspaces, not as reasons to add another top-level tab every time.

## Required App Structure

Use a stable desktop workbench with four persistent zones.

### 1. Run Context Header

Always visible. Shows the state that affects every other panel.

- Campaign selector.
- Squad/difficulty/performance summary.
- Base coordinate/aspect status, normally 1280x720 / 16:9.
- ADB/device status.
- OCR engine status.
- Unsaved/dirty state.

This should stay compact. It is not the place for deep editing.

### 2. Primary Navigation

Group screens by job, not data type only.

- Run: base values and IS-specific values.
- Choices: operators and relics.
- Recognition: scans, candidates, review queue, evidence.
- Output: OBS overlay and sidecar.
- Runtime: ADB, MAA resources, GLM-OCR/Ollama, Hyper-V diagnostics.

The current top tab set should expand in this direction. Operators and relics should not be the only first-class workspaces.

Top-level navigation should be added only when the user job is genuinely new. A new field, catalog, recognition profile, or display variant should normally land inside an existing workspace.

### 3. Work Area

The center area should be a task-specific workspace.

- Operators: virtualized list/table, search, class/branch/rarity filters, selected-first, hide-excluded, selected-only, selection toggle, exclusion toggle, details inspector.
- Relics: virtualized list/table, campaign/category filters, search by name/number/effect, selected-first, hide-excluded, selected-only, manual count if needed, details inspector.
- Run values: compact field groups for base values, plus campaign-specific editors selected from the campaign catalog field type.
- Recognition: profile/task list, run controls, screenshot preview, candidate queue, apply/reject actions, detail JSON export.
- OBS/Sidecar: overlay parts, scroll behavior, preview, detach controls, tournament/debug view settings.
- Runtime: ADB presets, connected devices, screenshot test, MAA resource path, optional GLM/Ollama install/status/uninstall.

### 4. Inspector / Evidence Pane

The right side should explain the selected thing.

- For an operator or relic: source record, selected/excluded state, OCR aliases, last recognition evidence if present.
- For a special value: field type, current value, expected input constraints, overlay visibility.
- For an OCR candidate: source profile, raw result, normalized value, confidence, crop/screenshot reference, apply/reject controls.
- For runtime: last command, stderr/stdout summary, log file path.

This pane prevents large rows from becoming unreadable and keeps advanced evidence available without bloating every list item.

## Extensibility Model

New UI elements should enter through an explicit extension model. The app should classify an element by what job it supports, what state it owns, and what evidence it can display.

### Extension Categories

- Run field: a value stored on the active run, such as difficulty, hope, shield, command level, or a future campaign stat.
- Campaign special field: a campaign-scoped value described by catalog schema, such as number, single effect, multi effect, ranked effect, board loadout, stack loadout, or coin loadout.
- Choice catalog: selectable run inventory such as operators, relics, future recruitable groups, temporary units, or campaign-specific collectibles.
- Recognition profile: a scan task that produces raw observations, normalized values, candidates, or auto-applied state.
- Candidate review type: an OCR/template result that needs apply/reject, confidence display, source screenshot/crop, and detail JSON.
- Output part: something rendered to OBS or sidecar, including overlay sections, tournament fields, scroll behavior, and future detached views.
- Runtime capability: external tool state such as ADB, MAA resources, OCR engines, optional downloads, model status, and platform diagnostics.
- Debug artifact: logs, screenshots, trace files, resource probe payloads, and bug-report bundles.

### Required Metadata

Every new element should define:

- Stable id.
- Human label.
- Owning workspace: Run, Choices, Recognition, Output, Runtime, or Debug.
- State path, if it edits persistent state.
- Source provenance: catalog, manual, OCR/template, GLM, imported state, runtime probe, or generated diagnostic.
- Display priority.
- Inspector renderer.
- Empty/error state text.
- Whether it can be shown on OBS/sidecar.
- Whether it can be auto-applied or must enter review.

### Navigation Rules

- Do not add a top-level tab for a single field or a small group of related fields.
- Add a new top-level workspace only when the user goal, state ownership, and evidence needs do not fit an existing workspace.
- Prefer adding a section or subtab inside Run, Choices, Recognition, Output, or Runtime.
- If a new element needs a different editor shape, add a renderer to the field/editor registry instead of hardcoding a screen.
- If a new element needs new evidence, extend the inspector and review queue instead of enlarging list rows.

### Implementation Seams

The UI should converge on these modules:

- Run field registry: maps run and campaign schema fields to editor models.
- Choice catalog registry: maps selectable catalog entries to filter models, list rows, and inspector summaries.
- Recognition result registry: maps MAA/GLM/template results to candidate types and review actions.
- Output part registry: maps state slices to OBS/sidecar display blocks.
- Runtime capability registry: maps external tools to install/status/test/uninstall controls.

These modules should be deep: callers ask for "render this workspace from the active state" or "convert this recognition result to review items" instead of knowing every campaign and field type.

## Data Editing Principles

- State editing and OCR review must be separate. OCR candidates should not silently become state without a visible review path unless confidence and profile policy explicitly allow it.
- Filters must be consistent across operators and relics: priority display, hide exclusions, selected-only.
- Empty state text should state what filter or runtime condition caused the empty result.
- Long text, paths, JSON, and effects must truncate or wrap inside fixed-width regions.
- The UI should expose "where this value came from": manual, OCR/template, auto-applied, imported current-state, or default catalog.
- Campaign-specific special values should be generated from the campaign field schema, not hardcoded per screen.

## Immediate Implementation Direction

1. Add a Run workspace for base values and campaign-specific special values.
2. Split Recognition into scan execution and candidate review subpanels.
3. Add an inspector pane pattern and route operator/relic/candidate selection into it.
4. Move GLM-OCR/Ollama/ADB/Hyper-V into a Runtime workspace instead of burying them under OBS settings.
5. Keep OBS and sidecar output separate from data editing.
6. Preserve the current operator/relic filters, but prepare them for virtualization and details inspection.
7. Introduce schema/registry seams before adding more one-off UI sections.
8. Require every new field or catalog item to declare its workspace, state path, provenance, inspector view, and review policy.

## Figma Alignment

The Figma design file should show two things separately:

- The current Suki foundation screen.
- The full information architecture that the product must grow into.

The latter is more important for preventing future UI drift: it defines the jobs, data groups, evidence paths, and state ownership before visual polish.
