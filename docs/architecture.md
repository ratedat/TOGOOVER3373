# Architecture Notes

## State Sources

The overlay should eventually combine multiple input sources:

- manual streamer input
- tournament staff input
- optional ADB screenshot capture
- optional OCR/template recognition suggestions

Manual and reviewed tournament input are authoritative.
ADB/OCR-derived values are suggestions until confirmed.

## State Domains

Relic data includes names, numbers, categories, price/exchange fields, effect text, optional flavor text, source anchors, and image metadata. Mirrored relic image files live under `assets/relics/wikiru/img`, with sync audit details in `data/relic-images.json`.

Operator master data includes display name, rarity, class, branch, wiki page, source section, display order, spoiler visibility flags, and image metadata. Mirrored operator image files live under `assets/operators/wikiru/img`, with sync audit details in `data/operator-images.json`. The overlay can sort recruited operators by `rarity`, then use `displayOrder` or name as a stable secondary order. Operators with `hiddenByDefault: true` are Japan-unreleased and should stay hidden unless the user explicitly enables a show-unreleased control.


- relic ownership
- boss flags derived from relics
- squad selection
- squad unlock conditions are intentionally ignored; all squads are selectable
- 奇想天外分隊 and 歳影反響分隊 use squadRandomEffectOptionId to select one entry from randomEffectOptions
- recruited operators
- operator rarity and sorting
- difficulty / grade, plus derived `difficultyTierId` for campaign-specific effect variants
- scenario-specific special values


## Effect Calculation

Calculation is modeled as a separate normalized rule layer on top of the raw wiki/game text.

- `data/effect-taxonomy.json` defines operator classes, target groups, stats, run resources, operations, and phases.
- `data/effect-rules.example.json` shows how relics, squads, squad upgrades, and random squad options become calculable rules.
- `data/effect-summary.example.json` shows the grouped output expected by the OBS overlay.
- `data/wikiru-campaign-sources.json` configures wiki pages for campaign data extraction so future IS campaigns can be added without editing extractor code.
- `data/difficulty-variant-sources.json` configures difficulty-dependent relic extraction and is the source for generated tier mappings.
- `data/difficulty-tiers.json` maps numeric run difficulty to campaign-specific effect variant tiers, generated from `data/difficulty-variant-sources.json`.
- `data/relic-effect-variants.json` stores the corresponding tier-specific relic effect text.
- `docs/effect-calculation.md` describes the full rule model, target selectors, stacking behavior, and coverage workflow.

The overlay should display both calculated summaries and raw source text. Missing normalized rules are reported as unparsed sources rather than treated as errors.

## Supported Campaigns

Campaign definitions live in `data/campaigns.json`.

- `is2_phantom` - 統合戦略#2「ファントムと緋き貴石」
- `is3_mizuki` - 統合戦略#3「ミヅキと紺碧の樹」
- `is4_sami` - 統合戦略#4「探索者と銀氷の果て」
- `is5_sarkaz` - 統合戦略#5「サルカズの炉辺奇談」
- `is6_sui` - 統合戦略#6「歳の界園志異」

## OBS Output

The overlay should be delivered as a browser source.
Important constraints:

- stable 1920x1080 layout
- transparent background support
- readable Japanese labels
- no layout shift during updates
- no dependency on the OBS host having game assets installed

## Variant Effects

For IS#4 No.001-018, IS#5 No.001-020, and IS#6 No.001-015, 多元化珍品 use `data/relic-effect-variants.json` layered over the base relic data. The state stores numeric `run.difficulty`; the app derives `run.difficultyTierId` from `data/difficulty-tiers.json` and selects the matching variant for display and calculation. If the difficulty is unknown, the base effect is shown with an unresolved-variant warning.
