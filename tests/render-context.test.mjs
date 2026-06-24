import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appJs = fs.readFileSync(new URL("../app/app.js", import.meta.url), "utf8");

test("special loadout render context defines coin and stack formatters", () => {
  assert.match(appJs, /function formatCoinLoadoutValue\(field, value\)/);
  assert.match(appJs, /function formatEffectStackValue\(field, value\)/);
  assert.match(appJs, /renderSpecialLoadoutContext\(\)[\s\S]*formatCoinLoadoutValue,[\s\S]*formatEffectStackValue,/);
});
