# Zero-Base Stitch Iteration

This pass intentionally ignores the previous experimental Stitch direction. It uses only product requirements, current data scale, OBS constraints, and sidecar workflow.

## Stitch Project

- Project: `9705201906657185561`
- Title: `RHODES OBS COMMANDER3373 Zero Base UX`
- Uploaded source: `docs/zero-base-stitch-design.md`
- Design system asset: `036eacdf41e44b1c81ebecc704a78a16`

The currently exposed Stitch tools created a design system from `DESIGN.md`. They did not expose a direct screen-generation tool in this session, so local screenshotable mockups were created under `docs/previews`.

## Local Preview Screens

- `docs/previews/zero-base-common.html`
- `docs/previews/zero-base-choice.html`
- `docs/previews/zero-base-special.html`
- `docs/previews/zero-base-output.html`

Expected screenshots:

- `docs/previews/zero-base-common.png`
- `docs/previews/zero-base-choice.png`
- `docs/previews/zero-base-special.png`
- `docs/previews/zero-base-output.png`

## Refined IA

Top-level navigation should be explicit button navigation, not plain links:

1. 共通設定
2. オペレーター
3. 秘宝
4. 特殊値
5. OBS設定
6. サイドカー

The previous single-screen approach is rejected because the product now has 430 operators, 1327 relics, 290 selectable special effects, and multiple stateful mechanics.

## Surface Boundaries

- Control app: input and confirmation.
- OBS overlay: viewer-facing display only.
- Sidecar: private scan/review/correction support near the emulator.

## Special Value Model

- IS#3: rejection reaction, revelations, horde calls.
- IS#4: collapse value, paradigm lost, revelation board. Revelation board has separate fixed slots for 本因 and 構成. 修辞 can stack, and each rhetoric entry needs an independent effect contribution.
- IS#5: thought, idea, era. Thought is name + state/condition, not a plain name list.
- IS#6: coins, seasonal hours. Coin entry is name + state + face + count. Same name can repeat when state or face differs. Exact name/state/face matches stack by count.

## Implementation Direction

Do not patch the current `control-v2` screen directly from these previews. First convert the app shell and navigation, then migrate one workspace at a time.
