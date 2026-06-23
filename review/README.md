# Review Files

Generated review artifacts for manual data verification.

Files:

- `relic-image-review.html`: browser-based visual check for relic-to-image mapping.
- `operator-image-review.html`: browser-based visual check for operator name / rarity / image mapping.
- `relic-effects-review.html`: browser-based searchable table for relic effect text.
- `relic-effects-review.csv`: editable review sheet with checkStatus and memo columns.
- `relic-effects-summary.csv`: per-campaign counts and missing number ranges.

Suggested relic image check workflow:

1. Open `relic-image-review.html` in a browser.
2. Filter by campaign or search by relic name, number, ID, effect, or image path.
3. Use OK / NG / 保留 and memo fields while checking; these are stored in browser localStorage.
4. Report NG relic IDs or image paths so the source mapping can be corrected.
Suggested operator image check workflow:

1. Open `operator-image-review.html` in a browser.
2. Filter by rarity or class, or search by operator name, ID, branch, or image path.
3. Change the sort mode to verify rarity ordering.
4. Keep `日本未実装を表示` off for spoiler-safe checking, or enable it when validating unreleased rows.
5. Use OK / NG / 保留 and memo fields while checking; these are stored in browser localStorage.
6. Report NG operator IDs or image paths so the source mapping can be corrected.
