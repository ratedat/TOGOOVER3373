---
name: Control V2 Tactical Workbench
colors:
  bg-deep: '#090A0A'
  bg: '#10100F'
  surface: '#171714'
  surface-raised: '#20201D'
  surface-strong: '#292823'
  surface-glass: 'rgba(24, 24, 22, 0.92)'
  border-low: 'rgba(255, 255, 255, 0.12)'
  border-high: 'rgba(215, 168, 71, 0.46)'
  text-primary: '#F4EFE4'
  text-secondary: '#D9D1C2'
  text-muted: '#B8B1A3'
  tactical-red: '#D8483F'
  command-gold: '#D7A847'
  signal-cyan: '#5BB5B0'
  success-green: '#71B66B'
  warning-amber: '#E1B453'
  special-violet: '#A78BFA'
typography:
  body:
    fontFamily: 'Yu Gothic UI, Meiryo, Hanken Grotesk, system-ui, sans-serif'
    fontSize: 14px
    lineHeight: 20px
  heading:
    fontFamily: 'Yu Gothic UI, Meiryo, Hanken Grotesk, system-ui, sans-serif'
    fontWeight: 800
  mono:
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

## Product Context

RHODES OBS COMMANDER3373 is an Electron desktop app for Arknights Integrated Strategies stream support.
It is used for three related workflows:

1. Personal run support beside an emulator.
2. OBS overlay configuration for live streaming.
3. Tournament/staff input and review workflows.

The UI must feel like a production control desk, not a landing page. It should be quiet, dense, readable, and fast to operate for long streaming sessions.

## Primary Screens

Use these as top-level app sections. They must look like obvious buttons/tabs, not plain text links.

- 共通設定: shared run setup and current run values.
- オペレーター: recruited operator selection and filtering.
- 秘宝: owned relic selection and filtering.
- OBS設定: browser source URLs, split overlay parts, layout presets.
- サイドカー: non-stream support view and future detached windows.

OBS設定 is a real screen switch, not an anchor inside 共通設定.
Operators and relics are independent workspaces, not one shared cramped screen.

## Design Goals

- Make the current run state obvious at all times.
- Separate input, review, and output configuration.
- Keep high data density without making every panel visually equal.
- Avoid large decorative hero sections, marketing composition, or one-note gradients.
- Prefer a tactical workbench aesthetic: dark surfaces, precise borders, compact controls, clear active states.
- Preserve Japanese readability. Do not use negative letter spacing. Do not scale font size by viewport width.
- Buttons, selects, filters, and tabs must clearly look interactive.

## Layout Direction

Target Electron desktop size: 1360x920 and above.

### App Shell

- Sticky top command bar.
- Left side or top row navigation is acceptable, but current section must be visually dominant.
- Current campaign, difficulty, squad, saved state, and reset must remain easy to find.

### 共通設定

Do not make four same-weight panels. Give hierarchy:

1. Run identity and core values: campaign, difficulty, squad, hope, life, shield, command level.
2. Series-specific values: revelations, thoughts, coins, era, collapse value, etc.
3. Enemy effects and boss flags.
4. ADB/OCR scan candidates and review state.

Recommended composition:

- Top KPI strip for current values.
- Main setup area with compact form fields.
- Right-side or lower review rail for boss/effects/ADB candidates.
- Series-specific complex inputs should use nested compact builders, not long dropdowns that cover the screen.

### オペレーター

A dense selection workspace:

- Sticky filter bar.
- Clear selected count.
- Sort controls: rarity, implementation order, class order, name.
- Grid/list density controls.
- Cards should not stretch vertically when only a few results match.
- Selected operators should be visually distinct without relying only on border color.

### 秘宝

A dense relic workspace:

- Search, category, display columns, clear manual relics.
- Relic cards need icon, name, category/range, and compact effect text.
- Owned relics should be clearly marked.
- Template-derived relics should be distinguishable from manually selected relics.

### OBS設定

A configuration screen:

- Group full overlay presets separately from split parts.
- Each URL card should include title, purpose, URL, and copy/open affordance.
- Include notes for OBS browser source sizing and transparent background behavior.
- Avoid hiding this under run setup.

### サイドカー / Tournament

Plan for future detachable windows:

- Operators window.
- Relics window.
- Staff review queue.
- Sidecar run monitor.

Design should leave a clear path for these to become separate Electron BrowserWindow instances.

## Visual Language

Use a tactical command palette:

- Deep black/charcoal base.
- Warm bone text rather than pure white.
- Gold for active navigation and rarity/status emphasis.
- Cyan for neutral technical information and URLs.
- Red only for danger, boss, destructive actions, or critical run state.
- Violet can mark special series mechanics when needed.

Panel hierarchy:

- Base background: almost black.
- Primary panels: dark charcoal with 1px border.
- Active/selected: gold accent border or small left/top accent rail.
- Danger/boss: restrained red accent, not full red panels.

## Component Rules

### Navigation

- Use segmented buttons or tab buttons with a strong active state.
- Do not use plain text links for primary navigation.
- Reset remains secondary and visually separate.

### Forms

- Labels above controls.
- Selects must be readable in dark mode.
- Long Japanese option lists should not dominate the whole screen; use compact pickers or searchable dialogs where appropriate.
- IME input must not lose focus while typing.

### Cards

- Keep border radius at 8px or less.
- Avoid nested cards inside cards.
- Cards should have stable height and not expand based on sparse grid layout.
- Use icon/image, title, metadata, and effect/body in predictable positions.

### Data Review

- Candidate/review items should be visibly separate from confirmed state.
- Pending ADB/OCR suggestions must not look already applied.
- Use clear approve/dismiss affordances when review actions are added.

## Non-Negotiable Functional Requirements

- GUI-first; no command-line assumption for normal users.
- OBS設定 is its own screen.
- Operators and relics are independent screens.
- Current run state remains visible across screens.
- Large data lists must scroll inside their workspace.
- Controls must remain usable in Japanese dark mode.
- Future detachable windows for operators/relics/staff review should be possible without redesigning the whole app.

## What To Improve From Current UI

- Reduce visual equality between all panels.
- Create a stronger current-task focus.
- Make special values less dropdown-heavy.
- Make sparse operator/relic results look intentional, not empty or stretched.
- Add clearer separation between confirmed run state, auto-template state, and pending scan suggestions.
- Make OBS settings feel like a real configuration workspace, not a list of URLs.