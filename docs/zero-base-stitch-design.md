---
name: RHODES OBS COMMANDER3373 Zero Base UX
colors:
  base: '#080A0B'
  canvas: '#0D0F10'
  surface: '#151719'
  surface-raised: '#1D2022'
  surface-pressed: '#262A2D'
  line: 'rgba(255,255,255,0.12)'
  line-strong: 'rgba(255,255,255,0.22)'
  text: '#F3EFE7'
  text-soft: '#D6CEC0'
  text-muted: '#9F978B'
  command: '#D6A84F'
  info: '#62B7B4'
  danger: '#D8574C'
  success: '#78B86F'
  caution: '#E0B95C'
  mechanic: '#9D8CF2'
typography:
  ui:
    fontFamily: 'Yu Gothic UI, Meiryo, system-ui, sans-serif'
    fontSize: 14px
    lineHeight: 20px
  title:
    fontFamily: 'Yu Gothic UI, Meiryo, system-ui, sans-serif'
    fontWeight: 800
    lineHeight: 1.2
  data:
    fontFamily: 'JetBrains Mono, Consolas, ui-monospace, monospace'
    fontWeight: 700
rounded:
  control: 6px
  panel: 8px
  chip: 999px
spacing:
  xs: 4px
  sm: 8px
  md: 12px
  lg: 16px
  xl: 24px
---

## Zero-Base Rule

Do not reuse any previous experimental Stitch layout or visual composition.
Design from the product model, item counts, OBS output needs, and sidecar workflow.
The current implementation can inform functional requirements only; it should not constrain the visual layout.

## Product

Desktop Electron app for Arknights Integrated Strategies live-stream support.
The app has three distinct product surfaces:

1. Control app: streamer/staff input and review.
2. OBS overlay: viewer-facing stream graphics, compact and source-splittable.
3. Sidecar: private support window beside an emulator.

The app must be GUI-first. Normal users should not need command-line operations.

## Actual Data Scale

Design around these current counts:

- Campaigns: 5 current Integrated Strategies modes.
- Operators: 430.
- Relics: 1327 total.
  - IS#2: 245.
  - IS#3: 262.
  - IS#4: 263.
  - IS#5: 296.
  - IS#6: 261.
- Squads: 69 total.
- Difficulty grades: 81 total.
- Selectable special effects: 290 total.
- Start templates: 28.
- ADB scan profiles: 4.
- OBS split parts: status, relics, operators, effects, bosses, special.

Implication: operators, relics, and special mechanics must be separate workspaces. They cannot share one dense page.

## Top-Level Navigation

Use obvious persistent navigation. Plain links are not acceptable.
Recommended top-level app screens:

1. 共通設定: campaign, difficulty, squad, run stats, start templates, saved state.
2. オペレーター: recruited operator roster, filters, sorting, detached-window option.
3. 秘宝: owned relic archive, filters, search, template/manual ownership distinction.
4. 特殊値: IS-specific mechanics such as rejection reaction, revelations, paradigm, thought, era, coins, seasonal effects.
5. OBS設定: overlay presets, split browser-source parts, source sizes, preview/copy workflow.
6. サイドカー: private run support and review queue, plus detached windows.

The nav may be a left rail for desktop, or a strong top segmented bar. It must keep the current run state visible.

## Information Architecture

### Persistent Run Header

Must be visible across all screens:

- Campaign and mode number.
- Difficulty / grade.
- Squad.
- Hope.
- Life.
- Shield.
- Command level.
- Relic count.
- Operator count.
- Boss flag count.
- Pending review count.
- Last updated / save state.

This is not a hero area. It is a compact operational status bar.

### 共通設定 Screen

Purpose: establish the run identity and core values.

Contains:

- Campaign selector.
- Difficulty selector.
- Squad selector.
- Random squad effect selector.
- Performance selector for IS#2.
- Hope / life / shield / command level numeric inputs.
- Start template summary.
- Current boss route summary.

Do not include large operator/relic grids here.
Do not include full special mechanics editors here.
Show summary chips and deep links to the relevant workspaces.

### オペレーター Screen

Purpose: choose recruited operators from 430 operators.

Required structure:

- Sticky filter header.
- Release-state filter.
- Rarity filter.
- Class and branch filters.
- Sort by rarity, implementation order, class order, name.
- Grid columns 1-6.
- Selected count and clear/reset action.
- Detach button for tournament staff.

Cards need stable height. Sparse filter results must align to the top and not stretch.
Selection state needs more than color: check mark, accent rail, or filled badge.

### 秘宝 Screen

Purpose: choose owned relics from 1327 relic records.

Required structure:

- Campaign-scoped relic list by default.
- Search by name, number, category, effect.
- Category filter.
- Column density control.
- Owned count.
- Manual vs start-template-derived ownership distinction.
- Clear manual relic action.
- Detach button for tournament staff.

Relic cards need icon, name, category/range, and compact effect text.
Long effect text can clamp but should be inspectable.

### 特殊値 Screen

Purpose: edit IS-specific mechanics with correct input models.
This is a dedicated workspace, not a subsection hidden in common settings.

Sub-models:

- IS#3: rejection reaction, revelations, horde calls.
  - Multi-select effects with state summary.
- IS#4: collapse value, paradigm lost, revelation board.
  - Revelation board has cause and structure as fixed slots.
  - Rhetoric is a stack with count and independent effect contribution.
- IS#5: thought, idea, era.
  - Thought entries are name + state slots.
  - Same thought with a different state is a separate slot.
  - Idea is numeric.
  - Era is single-select.
- IS#6: coins, seasonal hours.
  - Coin entries are coin name + status + face + count.
  - Same name can repeat if status or face differs.
  - Same name/status/face stacks by count.
  - Seasonal hours use ranked/phase-style toggles; same stage does not duplicate.

The Special Values screen should use a model selector/sidebar and a focused editor area.
Do not use one huge dropdown for all choices.
Use compact builders, rows, steppers, segmented controls, and review states.

### OBS設定 Screen

Purpose: configure viewer-facing browser sources.

OBS output needs are separate from control-app inputs.
Required groups:

- Full overlay presets.
  - Standard.
  - Compact.
  - Horizontal small/medium/large.
  - Vertical small/medium/large.
- Split parts.
  - status.
  - relics.
  - operators.
  - effects.
  - bosses.
  - special.
- Per-part guidance.
  - Recommended browser-source size.
  - Transparent background support.
  - Scroll speed if applicable.
  - Copy URL and open preview actions.
- Preview panel showing approximate stream footprint.

OBS UI should not look like another data-entry screen. It is an output studio.

### サイドカー Screen

Purpose: private support, not stream output.

Contains:

- Run monitor.
- ADB/OCR scan controls and status.
- Pending suggestions review.
- Effect inspector.
- Detachable windows launcher.
  - Operator picker window.
  - Relic picker window.
  - Special values window.
  - Staff review queue.

Sidecar should prioritize operator ergonomics over beauty. It can be denser than OBS overlay.

## Overlay Design Philosophy

Overlay is viewer-facing. It must not copy the control app's dense panels.

Rules:

- Minimal screen footprint.
- Text legible at stream resolution.
- Can be split into individual OBS browser sources.
- Relics and operators should not be omitted; use compact scrolling areas if needed.
- Effects and boss flags are summaries, not full edit views.
- Special mechanics display should show only selected/active values.
- All overlay layouts must tolerate future growth of items.

Overlay layout families:

- Horizontal lower-third: compact strip, relic/operator auto-scroll.
- Vertical sidebar: status stacked with relic/operator lists.
- Modular parts: independent source boxes for status, relics, operators, effects, bosses, special.

## Sidecar Design Philosophy

Sidecar is private and operational.

Rules:

- Keep emulator-adjacent workflows fast.
- Prioritize search, scan, review, and correction.
- Allow larger panels and denser lists than OBS overlay.
- Maintain the same state model as Control app.
- Candidate data from ADB/OCR must be visually separate from confirmed state.

## Visual Direction

Style: operational dark workbench.
Avoid decorative sci-fi excess. Avoid marketing visuals. Avoid huge hero sections.

Use:

- Deep neutral background.
- Warm readable text.
- Gold for active section and confirmed important state.
- Cyan for technical links, URLs, ADB/OCR, neutral info.
- Red only for boss, danger, destructive action, critical warning.
- Violet only for special mechanics categories.
- Green for success/approved.

Panel hierarchy:

- Level 0: base app canvas.
- Level 1: workspace surface.
- Level 2: panels.
- Level 3: active editor / selected card / pending review.

Do not make every panel equally prominent.

## Component Guidance

- Buttons: clear border, visible focus, active state not color-only.
- Inputs: visible labels above fields, no placeholder-only labels.
- Selects: dark-mode readable; long lists should become searchable pickers or compact selectors.
- Cards: max 8px radius; stable dimensions; no card-in-card nesting.
- Lists: internal scroll, sticky filter/header areas, no page-wide giant scroll for primary workspaces.
- Review candidates: dashed or distinct border, pending label, approve/dismiss affordance.
- Detach actions: visible but secondary; use window icon/label, not hidden menu only.

## Screen Concepts To Generate

Generate concept screens as separate desktop artboards:

1. App Shell + 共通設定.
2. オペレーター workspace.
3. 秘宝 workspace.
4. 特殊値 workspace showing thought and coin models.
5. OBS設定 output studio.
6. サイドカー / Review queue.
7. OBS horizontal overlay preview.
8. OBS vertical/sidebar overlay preview.

The control-app screens should target 1360x920 minimum.
Overlay previews should target stream composition, not full desktop app layout.