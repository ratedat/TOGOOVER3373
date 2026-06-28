# Data Sources

Generated on 2026-06-22 from arknights.wikiru.jp PukiWiki source pages.

The local data files intentionally keep only the fields needed for overlay state display.
Relic names, numbers, categories, price/exchange fields, effect text, optional flavor text, and source anchors are extracted. Squad effects are extracted for selection display, while squad unlock conditions are ignored because all squads are treated as available.
Long strategy text and comments are not copied. Relic and operator images are mirrored locally for overlay display and are tracked separately from the wiki text extraction.

## Extracted Files

- data/relics.json - relic number, display name, category, campaign ID, price/exchange fields, effect text, optional flavor text, source anchor, and image metadata
- data/relic-images.json - image sync audit manifest, including source URLs, local paths, missing mappings, and failed downloads
- assets/relics/wikiru/img - mirrored relic image files referenced by data/relics.json
- data/squads.json - squad display name, effect, upgrade variants when present, and randomEffectOptions for special squads such as 奇想天外分隊 and 歳影反響分隊
- data/performance-sources.json - wiki section configuration for selectable performance/event-buff extraction such as IS#2 演目
- data/performances.json - generated performance/event-buff names, group labels, effects, optional flavor text, and source image metadata
- data/operators.json - operator display name, rarity, class, branch, obtain/recruitment text, source page, source section, Japan-unreleased spoiler flags, display order, and image metadata
- data/operator-implementation-history.json - Japan implementation dates and implementation order from the operator implementation history page
- data/operator-images.json - operator image sync audit manifest, including source URLs, local paths, and failed downloads
- assets/operators/wikiru/img - mirrored operator image files referenced by data/operators.json
- data/recognition/maa-operator-name-ocr.json - MAA YoStarJP CharsNameOcrReplace operator-name OCR rules, local operator matches, OCR equivalence classes, and public recruitment operator names
- third_party/maa/resource/global/YoStarJP/resource/tasks/tasks.json - vendored MAA YoStarJP task overrides used as the source for CharsNameOcrReplace
- third_party/maa/resource/global/YoStarJP/resource/recruitment.json - vendored MAA YoStarJP public recruitment operator list
## Reviewable Update Runner

Prefer `tools/update-data.ps1` for routine updates. It snapshots `data/` before and after the selected sync steps, then runs `tools/compare-data-update.mjs` to generate `summary.md`, `changes.csv`, and `changes.json` in `review/update-runs/<run-id>/`.

```powershell
npm.cmd run data:update:plan
npm.cmd run data:update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Operators
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Performances
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\update-data.ps1 -Scope Campaigns,Performances,DifficultyVariants,DifficultyGrades,RelicImages
```

Use the generated diff files as the first manual review surface. The older individual commands below are still useful for debugging a single extractor, but normal refreshes should go through the runner so additions, removals, and text/image changes are visible before commit.
## Source Pages

- IS#2 main: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%83%95%E3%82%A1%E3%83%B3%E3%83%88%E3%83%A0%E3%81%A8%E7%B7%8B%E3%81%8D%E8%B2%B4%E7%9F%B3%E3%80%8D
- IS#2 relics: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%83%95%E3%82%A1%E3%83%B3%E3%83%88%E3%83%A0%E3%81%A8%E7%B7%8B%E3%81%8D%E8%B2%B4%E7%9F%B3%E3%80%8D/%E7%A7%98%E5%AE%9D%E4%B8%80%E8%A6%A7
- IS#3 main: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%83%9F%E3%83%85%E3%82%AD%E3%81%A8%E7%B4%BA%E7%A2%A7%E3%81%AE%E6%A8%B9%E3%80%8D
- IS#3 relics: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%83%9F%E3%83%85%E3%82%AD%E3%81%A8%E7%B4%BA%E7%A2%A7%E3%81%AE%E6%A8%B9%E3%80%8D/%E7%A7%98%E5%AE%9D%E4%B8%80%E8%A6%A7
- IS#4 main: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E6%8E%A2%E7%B4%A2%E8%80%85%E3%81%A8%E9%8A%80%E6%B0%B7%E3%81%AE%E6%9E%9C%E3%81%A6%E3%80%8D
- IS#4 relics: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E6%8E%A2%E7%B4%A2%E8%80%85%E3%81%A8%E9%8A%80%E6%B0%B7%E3%81%AE%E6%9E%9C%E3%81%A6%E3%80%8D/%E7%A7%98%E5%AE%9D%E4%B8%80%E8%A6%A7
- IS#5 main: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%82%B5%E3%83%AB%E3%82%AB%E3%82%BA%E3%81%AE%E7%82%89%E8%BE%BA%E5%A5%87%E8%AB%87%E3%80%8D
- IS#5 relics: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E3%82%B5%E3%83%AB%E3%82%AB%E3%82%BA%E3%81%AE%E7%82%89%E8%BE%BA%E5%A5%87%E8%AB%87%E3%80%8D/%E7%A7%98%E5%AE%9D%E4%B8%80%E8%A6%A7
- IS#6 main: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E6%AD%B3%E3%81%AE%E7%95%8C%E5%9C%92%E5%BF%97%E7%95%B0%E3%80%8D
- IS#6 relics: https://arknights.wikiru.jp/?%E7%B5%B1%E5%90%88%E6%88%A6%E7%95%A5%E3%80%8C%E6%AD%B3%E3%81%AE%E7%95%8C%E5%9C%92%E5%BF%97%E7%95%B0%E3%80%8D/%E7%A7%98%E5%AE%9D%E4%B8%80%E8%A6%A7


## Operator Sources

Operator master data is sourced from https://arknights.wikiru.jp/?%E3%82%AD%E3%83%A3%E3%83%A9%E3%82%AF%E3%82%BF%E3%83%BC%E4%B8%80%E8%A6%A7. `tools/sync-operator-data.ps1` reads `data/wikiru-operator-sources.json`, discovers the `テーブル/★6` through `テーブル/★1` include pages, extracts name / rarity / class / branch, marks rows inside each `日本未実装キャラ` collapsed section as `isJapanUnreleased`, downloads the `attach2` icon files, and writes `data/operators.json` plus `data/operator-images.json`. `tools/sync-operator-implementation-history.ps1` reads https://arknights.wikiru.jp/index.php?%E3%82%AA%E3%83%9A%E3%83%AC%E3%83%BC%E3%82%BF%E3%83%BC%E5%AE%9F%E8%A3%85%E5%B1%A5%E6%AD%B4 and writes `data/operator-implementation-history.json`; the app merges this into operator master data at runtime for implementation-order sorting.

Rows inside the wiki `日本未実装キャラ` collapsed sections are treated as spoiler-sensitive. The extractor writes `isJapanUnreleased: true` and `hiddenByDefault: true`; UI surfaces should hide those operators unless the user enables an explicit show-unreleased toggle.

Operator refresh:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-operator-data.ps1 -ProjectRoot .
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\build-operator-image-review.ps1 -ProjectRoot .
```
## Update Workflow

Campaign page sources are configured in `data/wikiru-campaign-sources.json`. Add future campaigns such as IS#7 there before running the main wiki extractor. User-facing campaign metadata still lives in `data/campaigns.json` because it also carries overlay-specific fields such as special counters and boss-flag behavior.

Performance/event-buff section sources are configured in `data/performance-sources.json`. IS#2 演目 currently reads the `#e83e8373` section from the IS#2 main page and writes selectable rows to `data/performances.json`. Add future campaign-specific performance sections there before running `tools/extract-performances.ps1` or `tools/update-data.ps1 -Scope Performances`.

Difficulty-dependent relic sources are configured in `data/difficulty-variant-sources.json`. IS#4 No.001-018, IS#5 No.001-020, and IS#6 No.001-015 多元化珍品 are currently enabled. The generator writes both `data/difficulty-tiers.json` and `data/relic-effect-variants.json`, so tier definitions are not maintained in two places.

Standard refresh:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\extract-wikiru-data.ps1 -ProjectRoot .
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\extract-performances.ps1 -ProjectRoot .
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\sync-relic-images.ps1 -ProjectRoot .
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\extract-difficulty-variants.ps1 -ProjectRoot .
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\tools\build-relic-review.ps1 -ProjectRoot .
```

Relic images are sourced from PukiWiki `attachref`/`ref` entries on each relic list page. `tools/sync-relic-images.ps1` downloads the corresponding `attach2` image files, stores them under `assets/relics/wikiru/img`, adds `image` metadata to `data/relics.json`, and writes `data/relic-images.json` as an audit trail.

For IS#6 updates, adjust the `is6_sui` entry in `data/difficulty-variant-sources.json`, especially `relicRange.maxNumber` and `sourceCategory`, then rerun the last two commands. For IS#7, add a campaign entry to `data/campaigns.json` and `data/wikiru-campaign-sources.json`; if it has 多元化珍品 or another difficulty-dependent relic group, add a matching entry to `data/difficulty-variant-sources.json`.

`tools/extract-is4-difficulty-variants.ps1` remains as a compatibility wrapper for `tools/extract-difficulty-variants.ps1`.
