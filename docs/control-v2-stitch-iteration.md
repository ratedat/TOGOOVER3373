# Control v2 Stitch Iteration Notes

Stitch project: `projects/2573887213808412165`

## Inputs Sent To Stitch

- `docs/control-v2-design-handoff.md`: current implementation handoff for humans and design tools.
- `docs/control-v2-stitch-design.md`: compact DESIGN.md used by Stitch.

## Generated Design System

Stitch generated a new design system from `docs/control-v2-stitch-design.md`.

- Asset ID: `cbdeb8b0ac6c4bdcb0864f87a7fd801d`
- Applied to:
  - `Control v2 - Common Settings`
  - `Control v2 - Operators`

## Generated Screen Candidates

- Common Settings refined screen:
  - Screen: `projects/2573887213808412165/screens/3389b43779a04a28bc24f677d14982ae`
  - Purpose: common run setup, KPIs, series-specific values, boss/effect review, ADB/OCR queue.
- Operators refined screen:
  - Screen: `projects/2573887213808412165/screens/176d7753f9be4b9cb75b9dac57bd2727`
  - Purpose: dense operator roster, sticky filters, selected state, class/rarity/release sorting.

## Stitch Direction Summary

Stitch converged on a `Tactical / Corporate Modern` design language:

- Dark tactical workbench rather than decorative game UI.
- Current run state and KPI visibility are central.
- Operators, relics, and OBS settings are separate workspaces.
- Top-level navigation must be segmented button/tabs, not text links.
- Large lists scroll internally, with filters pinned.
- Gold is primary for active state and command emphasis.
- Cyan is technical metadata / URLs.
- Red is restricted to danger, boss, destructive actions, or critical state.
- Violet can mark special series mechanics.
- Japanese readability takes priority over stylized typography.

## Implementation Implications

When translating this back into the Electron app, avoid a pure CSS repaint only. The layout should change structurally:

1. Create a stronger app shell.
   - Persistent top command bar.
   - Current campaign/difficulty/squad and run stats visible across screens.
   - Navigation as button tabs with unmistakable active state.

2. Rebuild `共通設定` around hierarchy.
   - KPI strip first.
   - Run identity/core values second.
   - Series-specific values as compact builders.
   - Boss/effects/ADB review as a distinct review rail or lower panel.

3. Keep `オペレーター` and `秘宝` as independent workspaces.
   - Sticky filters.
   - Internal scroll list/grid.
   - No card stretching when filtered results are sparse.
   - Selected state should use icon/rail/background, not border color alone.

4. Treat `OBS設定` as a configuration workspace.
   - Separate overlay presets and split parts.
   - URL cards need purpose, copy/open actions, and OBS sizing hints.

5. Leave room for detached windows.
   - Operators window.
   - Relics window.
   - Staff review queue.
   - Sidecar run monitor.

## Design Decisions To Carry Forward

- Keep panel radius at 8px or less.
- Use 4px/8px spacing rhythm.
- Avoid heavy shadows; prefer tonal surfaces and borders.
- Keep dark background, but increase contrast between panel levels.
- Make pending scan suggestions visually distinct from confirmed state.
- Do not use negative letter spacing because Japanese text readability suffers.
- Long Japanese dropdowns should become searchable pickers or compact builders where possible.

## Open Questions Before Implementation

- Should the main app shell use left navigation or top segmented navigation? Current app uses top; Stitch accepts either.
- Should run KPIs be always visible on operator/relic screens, or collapsed into a compact strip?
- Should ADB/OCR candidate review become a right rail in every screen, or remain only in common settings?
- Should `OBS設定` be optimized for copy/open operations first, or for visual preview first?