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
- `data/difficulty-variant-sources.json` for adding or updating difficulty-dependent relic groups
- `data/difficulty-tiers.json` for campaign-specific difficulty tier mapping such as IS#4/IS#5/IS#6 多元化珍品
- `data/difficulty-grade-sources.json` for selectable grade ranges and wiki table column mappings
- `data/difficulty-grades.json` for generated grade conditions, score multipliers, and campaign-specific grade effects
- `data/relic-effect-variants.json` for tier-specific relic effect text
- `data/relic-images.json` for the relic image sync audit
- `assets/relics/wikiru/img` for mirrored relic image files referenced by `data/relics.json`
- `data/wikiru-operator-sources.json` for the operator wiki extraction source
- `data/operators.json` for operator names, rarity, class, branch, and image metadata
- `data/operator-images.json` for the operator image sync audit
- `assets/operators/wikiru/img` for mirrored operator image files referenced by `data/operators.json`
- AGENTS.md for agent/development rules
- `CLAUDE.md` for Claude-specific project guidance
- `PLANS.md` for the phased implementation plan
## Local MVP App

The first manual-first MVP is implemented as a dependency-free Node app.

Start the local server:

```powershell
cd O:\Arknights_Rogue_OBSTool
npm run dev
```

Open the control panel:

- http://127.0.0.1:5173/control

Use this URL as an OBS Browser Source:

- http://127.0.0.1:5173/overlay

The default overlay is the compact stream layout. The vertical and horizontal variants use auto-scrolling relic/operator panes so entries are not omitted:

- http://127.0.0.1:5173/overlay?layout=vertical&size=small
- http://127.0.0.1:5173/overlay?layout=vertical&size=medium
- http://127.0.0.1:5173/overlay?layout=vertical&size=large
- http://127.0.0.1:5173/overlay?layout=horizontal&size=small
- http://127.0.0.1:5173/overlay?layout=horizontal&size=medium
- http://127.0.0.1:5173/overlay?layout=horizontal&size=large
- http://127.0.0.1:5173/overlay?layout=full

Runtime state is stored in `data/current-state.json` and is intentionally ignored by Git. The committed example state remains `data/overlay-state.example.json`.
Regenerate selectable difficulty grade data after wiki updates:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File O:\Arknights_Rogue_OBSTool\tools\extract-difficulty-grades.ps1 -ProjectRoot O:\Arknights_Rogue_OBSTool
```
