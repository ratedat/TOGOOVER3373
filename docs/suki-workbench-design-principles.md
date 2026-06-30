# Suki MAA Workbench Design Principles

This document records the current UI direction for the Suki/Avalonia verification shell and keeps it aligned with the Figma summary and Stitch brief.

For the full product surface and information architecture, see `docs/suki-product-ui-information-architecture.md`. This document describes the current screen direction; the information architecture document defines the larger UI scope that the Suki shell still needs to cover.

## Product Role

The Suki shell is a maintainer/debugger workbench for validating and correcting Integrated Strategies run state: IS selection, recruited operators, owned relics, ADB connection, MAAFramework resource tasks, OCR candidates, screenshots, and diagnostics. It is not a public landing page, a consumer dashboard, or a tutorial-first setup wizard.

## Core Principles

- Operational selection first: IS switching, operator selection, relic selection, and their filters must be first-class UI, not hidden inside developer diagnostics.
- Debugger-first density: the first screen must expose the controls and evidence needed to validate recognition behavior repeatedly.
- Three-pane workspace: ADB/run setup belongs on the left, operational selection and recognition task execution in the center, diagnostics and evidence on the right.
- MAA as the source of truth: UI names and grouping should map directly to MAA task/profile concepts where possible.
- Stitch as a visual contract: Stitch output is used to refine visual direction, while production implementation remains SukiUI/Avalonia XAML.
- Low-chrome dark UI: the interface should stay quiet, readable, and focused on logs, captures, and task rows.
- No nested page cards: top-level panels are allowed; repeated rows can be framed, but page sections should not become stacked cards inside cards.
- Stable dimensions: side columns, toolbar rows, screenshot preview, and task/result rows should not shift when text, paths, or JSON change.

## Current Layout

- Top band: title, subtitle, campaign selector, base coordinate/aspect badge, and truncated MAA resource path.
- Left pane: runtime status, run setup summary, ADB preset/path/serial/config controls, connect/refresh/capture/probe actions, device rows, and compact migration notes.
- Center pane: tabbed operational workspace. Operator and relic tabs expose search, filters, selected-first, hidden exclusions, selected-only, selection toggles, and exclusion toggles. Recognition task controls remain available as a developer tab.
- Right pane: task diagnostics, latest ADB screenshot preview, candidate rows, resource results, probe payloads, and probe results.
- Footer: current status message.

## Visual Tokens

- App background: `#0F1415`
- Panel surface: `#101617`
- Row surface: `#151D1E`
- Elevated candidate surface: `#132021`
- Border: `#2B3638`
- Active/accent: teal/green from the Suki theme, used sparingly
- Radius: 6-8 px
- Typography: system UI in app; Figma uses Inter as a neutral documentation stand-in unless a concrete Avalonia font is later specified.

## State Coverage

The design must make these states legible:

- ADB disconnected, connected, and failed
- Empty device list
- Missing vs available latest screenshot
- IS campaign selected and changed
- Operator/relic selected, excluded, filtered, and selected-only views
- Resource task idle, running, completed, and failed
- Candidate API unavailable with local preview fallback

## Implementation Notes

- Production UI lives in `apps/rhodes-suki/Views/MainWindow.axaml`.
- Run catalog and choice filtering live in `apps/rhodes-suki/Services/RhodesRunCatalog.cs` and `apps/rhodes-suki/Services/RhodesChoiceFilter.cs`.
- Stitch prompt lives in `docs/stitch-suki-workbench-brief.md`.
- Full product UI coverage is tracked in `docs/suki-product-ui-information-architecture.md`.
- Figma summary file should mirror these decisions and stay as a design/reference artifact, not the runtime source of truth.
