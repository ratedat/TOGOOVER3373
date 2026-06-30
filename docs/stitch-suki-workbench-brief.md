# Stitch Brief: Suki MAA Workbench

This brief is the shared source for redesigning the Suki/Avalonia verification shell with Google Stitch (`https://stitch.withgoogle.com/create`) and then reflecting the result back into `apps/rhodes-suki/Views/MainWindow.axaml`.

Before expanding this prompt, use `docs/suki-product-ui-information-architecture.md` as the scope reference. The screen below is the current operational foundation; the final app must also cover run base values, campaign-specific special values, recognition review, OBS/sidecar output, and runtime settings without mixing those jobs into one list.

## Stitch Prompt

Design a desktop application screen for RHODES OBS COMMANDER3373, an Arknights Integrated Strategies OCR and ADB verification workbench.

Canvas: 1360 x 820 desktop window. Dark operational UI. Dense but readable. This is not a landing page, hero page, or marketing site.

Primary users: debuggers and maintainers validating Integrated Strategies run state, ADB connection, MAAFramework recognition tasks, OCR candidates, screenshots, and diagnostics.

Layout:
- Top bar: app title, subtitle, current IS campaign selector such as `IS#5 サルカズの炉辺奇談`, current base coordinate system badge such as `1280x720 / 16:9`, and a truncated resource path.
- Main area: three columns.
- Left column, width about 330 px: run setup and MAA ADB connection. Include runtime status, run setup controls or summary for squad/difficulty when available, ADB preset selector, ADB path input, serial/connection target input, config JSON input, buttons for connect, device list refresh, capture, probe all, device list rows, and compact migration notes.
- Center column: operational run-state workbench with tabs for `オペレーター`, `秘宝`, and `認識タスク`.
  - Operator tab: search input, rarity/class/branch filters, selected-first toggle, hide-excluded toggle, selected-only toggle, selected count, and scrollable operator rows. Each row must show name, rarity, class, branch, selected state, selection toggle, and display-exclusion toggle.
  - Relic tab: search input, category filter, selected-first toggle, hide-excluded toggle, selected-only toggle, owned count, and scrollable relic rows. Each row must show relic name, number/category, effect, selected state, selection toggle, and display-exclusion toggle.
  - Recognition task tab: profile selector, recognition run button, run all button, export JSON button, candidate API URL input, convert button, current profile/source summary, and a scrollable list of recognition task rows. Each row has label, purpose, entry id, source/profile summaries, and a run button.
- Right column, width about 380 px: diagnostics and results. Top diagnostics panel lists MAA task summary and log lines. Bottom panel shows the latest ADB screenshot preview, candidate rows, resource task result rows, probe payload rows, and probe result rows.
- Footer: one-line status message.

Visual rules:
- Use a restrained dark palette: background near `#0F1415`, surfaces `#101617` and `#151D1E`, borders `#2B3638`, text near white, muted text at 55-75 percent opacity, green/teal accent only for active status.
- Border radius 6-8 px. No decorative gradients, hero art, large empty cards, or floating marketing sections.
- Keep controls close to the data they affect. Use stable fixed widths for side columns and scroll the task/result lists.
- Avoid nested cards as a page structure. Top-level panels are allowed; repeated device/task/result rows can be framed.
- Text must wrap or truncate predictably. Long paths and JSON strings should not expand the layout.
- Make the screen feel like a professional debugging console, not a consumer dashboard.

Required visible interaction states:
- disconnected / connected / failed ADB state
- empty device list
- last screenshot missing vs available
- IS campaign selected and switchable
- operator/relic selected, excluded, selected-first, hide-excluded, and selected-only states
- task running / completed / failed
- candidate API unavailable but local preview available

Implementation mapping:
- Stitch output should be treated as visual direction, not a new framework.
- The production implementation remains SukiUI/Avalonia XAML in `apps/rhodes-suki/Views/MainWindow.axaml`.
- Preserve bindings: `Campaigns`, `SelectedCampaign`, `FilteredOperators`, `FilteredRelics`, operator/relic search and filter bindings, `AdbPath`, `AdbSerial`, `AdbPresets`, `AdbDevices`, `LastCaptureImage`, `ResourceProfiles`, `SelectedResourceProfile`, `ResourceTasks`, `ResourceTaskDiagnostics`, `CandidateResults`, `ResourceTaskResults`, `ProbePayloads`, `ProbeResults`, and `RecognitionDetailJson`.
