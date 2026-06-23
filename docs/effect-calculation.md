# Effect Calculation Model

## Purpose

Relic and squad option text should stay close to the source data used for display. Calculation uses a separate normalized rule layer so the overlay can answer questions such as "which operator types are affected" and "what total modifiers are active" without rewriting the original text.

This is designed for manual-first operation. ADB/OCR can later suggest owned relics, selected squad, and special values, but the confirmed state remains the calculation input.

## Files

- `data/relics.json`: source relic data, including name, number, category, price/exchange, effect text, flavor text, and source anchor.
- `data/squads.json`: source squad data, including squad effects, upgrades, and random effect options for 奇想天外分隊 / 歳影反響分隊.
- `data/effect-taxonomy.json`: shared enum-like definitions for operator classes, target groups, stats, run resources, operations, and phases.
- `data/effect-rules.example.json`: normalized rule examples showing how source relics or squad random options become calculable effects.
- `data/effect-summary.example.json`: expected output shape after aggregation.
- `data/difficulty-variant-sources.json`: source configuration for difficulty-dependent relic groups.`n- `data/difficulty-tiers.json`: generated campaign-specific mapping from numeric difficulty to tier ID.
- `data/relic-effect-variants.json`: source-text variants for relics whose effects change by tier, currently IS#4 No.001-018, IS#5 No.001-020, and IS#6 No.001-015 多元化珍品.
- `data/overlay-state.example.json`: runtime state shape, including the selected squad random option and calculated effect summary placeholder.

## Data Flow

1. Receive confirmed state: `campaignId`, owned `relics`, selected `squad`, optional `squadRandomEffectOptionId`, recruited operators, difficulty, boss flags, and campaign-specific values.
2. Resolve applicable sources from `data/relics.json` and `data/squads.json`.
3. Load normalized rules for those sources.
4. Expand each rule's target selector against the current operator roster and taxonomy.
5. Aggregate effects by domain, target group, stat/resource, operation, and phase.
6. Return a display-ready summary plus source IDs that still need manual classification.

## Rule Source Types

A rule may come from several kinds of source objects:

- `relic`: a specific owned relic.
- `squad`: a selected squad's base effect.
- `squad_upgrade`: an upgraded squad effect, if this is later tracked.
- `squad_random_option`: a selected random effect from 奇想天外分隊 or 歳影反響分隊.
- `manual_adjustment`: tournament/staff override or temporary correction.

Each normalized rule should keep source metadata so the UI can show why a calculated effect exists.

## Target Selectors

Rules use selectors instead of hardcoded UI labels. The calculator can then group results consistently.

Common selector fields:

- `scope`: `run`, `operator`, `recruitment`, `battle`, or `map`.
- `classes`: one or more operator class IDs such as `guard`, `sniper`, or `medic`.
- `position`: `melee`, `ranged`, or `any`.
- `rarity`: optional `min`, `max`, or exact rarity list.
- `tags`: future extension for profession branches, summons, elite state, or custom labels.
- `operatorIds`: future extension for named-operator effects.

For OBS display, class targets should usually be grouped as 全員, 近距離, 遠距離, or each class label.

## Effect Domains

The first calculator implementation should support these domains:

- `run_resource`: life, hope, ingot, key, dice, squad size, deployment limit, collapse value, thought, age, coins, and similar run-level values.
- `operator_stat`: ATK, DEF, max HP, RES, ASPD, block, redeploy time, DP cost, SP recovery, dodge, healing, damage dealt, and damage taken.
- `recruitment`: recruit cost, promotion cost, free promotion, initial promotion, temporary recruit rules.
- `battle_trigger`: effects that happen at battle start, during battle, after battle, or on deploy/retreat/kill.
- `map_trigger`: shop, event, floor, area, node, or exploration effects.

Unrecognized text remains visible through `unparsedSourceIds` and should not block the overlay.


## Difficulty Variants

Some relics have different source text depending on the run difficulty. The current known cases are IS#4 No.001-018, IS#5 No.001-020, and IS#6 No.001-015 多元化珍品.

Difficulty is stored as the confirmed numeric input `run.difficulty`. The resolver derives `run.difficultyTierId` from `data/difficulty-tiers.json`:

- `normal` / 通常化: difficulty 0-2
- `cold` / 寒冷化: difficulty 3-5, name suffix `α`
- `frozen` / 凍土化: difficulty 6-8, name suffix `β`
- `polar` / 極地化: difficulty 9+, name suffix `γ`

IS#5 uses the same numeric ranges with campaign-specific tier IDs and labels:

- `realistic` / 現実的: difficulty 0-2
- `original` / 独創的: difficulty 3-5, name suffix `α`
- `fantastical` / 幻想的: difficulty 6-8, name suffix `β`
- `imaginary` / 空想的: difficulty 9+, name suffix `γ`

IS#6 uses the same numeric ranges with campaign-specific tier IDs and labels:

- `modern` / 現代: difficulty 0-2
- `recent` / 近代: difficulty 3-5, name suffix `α`
- `ancient` / 古代: difficulty 6-8, name suffix `β`
- `prehistoric` / 先史: difficulty 9+, name suffix `γ`

Relics with difficulty-dependent text keep the base `effect` in `data/relics.json` as the normal-tier display text. Variant text lives in `data/relic-effect-variants.json`. Each variant stores `tierId`, label, min/max difficulty, optional name suffix, and the effect text for that tier.

Resolution order:

1. Resolve `difficultyTierId` from `campaignId` and `run.difficulty`.
2. If an owned relic has a matching entry in `data/relic-effect-variants.json`, select the variant matching `difficultyTierId`.
3. Use the selected variant text for overlay display and normalized effect-rule lookup.
4. If difficulty is missing, fall back to the base `effect` and report the relic in `unresolvedVariantRelicIds`.
5. If a normalized rule has `conditions.difficultyTierId`, apply it only when the selected tier matches.

The overlay should show the selected tier near the difficulty field for campaigns with difficulty variants so tournament staff and streamers can quickly verify that 多元化珍品 effects are using the intended version.

## Stacking Rules

The default stacking model should be deterministic and conservative:

- Flat numeric effects with `operation: add` are summed.
- Percent effects with `operation: add_percent` are summed within the same stat and target bucket.
- Multipliers use `operation: multiply` and retain source order for auditability.
- Unique effects should carry `stacking: unique` and collapse duplicate sources.
- Mutually exclusive effects should carry `stacking: max_only`, `min_only`, or a future explicit `exclusiveGroup`.

The summary should always keep source references, because stream overlays and tournament review both need explainability.

## Display Summary Shape

The calculator output should be grouped for rendering rather than for storage:

- `runResources`: compact list of run-level totals.
- `operatorGroups`: grouped by affected class/group, then stat and phase.
- `recruitment`: cost and promotion modifiers grouped by class and rarity condition.
- `battleTriggers`: non-stat battle effects that need text display.
- `mapTriggers`: exploration/shop/event effects that need text display.
- `unparsedRelicIds` / `unparsedSourceIds`: owned sources that still only have raw text.
- `warnings`: conflicts, missing rules, or values requiring manual confirmation.

This lets the OBS browser source render a calculated panel without understanding every relic sentence.

## Rule Coverage Workflow

Rule data can be completed incrementally:

1. `unparsed`: source exists but has no normalized rule yet.
2. `draft`: generated or manually entered rule; usable but not reviewed.
3. `verified`: reviewed against in-game/wiki text and safe for tournament display.

The first practical target is to cover common numeric effects, class-specific stat effects, recruitment/promotion effects, and special squad random options. Complex trigger effects can remain raw-text display until their calculation value is worth modeling.