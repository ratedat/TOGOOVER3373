import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const styles = fs.readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");

test("operator and relic choice rows keep text columns wider than thumbnails", () => {
  const itemRowIndex = styles.indexOf(".item-row {");
  const choiceOverrideIndex = styles.indexOf(".item-row.operator-choice");

  assert.notEqual(itemRowIndex, -1);
  assert.notEqual(choiceOverrideIndex, -1);
  assert.ok(choiceOverrideIndex > itemRowIndex);
  assert.match(
    styles.slice(choiceOverrideIndex, choiceOverrideIndex + 220),
    /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+auto\s+auto;/,
  );
});
