import test from "node:test";
import assert from "node:assert/strict";

import { summarizeTextEffects } from "../app/domain/effect-metrics.js";

test("summarizeTextEffects omits ally operator summaries by default and keeps enemy summaries", () => {
  const summaries = summarizeTextEffects("秘宝", [
    "味方全員の攻撃力+10%。敵全員の防御力-20%",
  ]);

  assert.equal(summaries.some((item) => item.title === "【オペレーター】"), false);
  assert.deepEqual(
    summaries.filter((item) => item.title === "【敵】").map((item) => item.effect),
    ["【敵全員】 防御力-20%"],
  );
});

test("summarizeTextEffects can still include ally operator summaries when explicitly requested", () => {
  const summaries = summarizeTextEffects("秘宝", [
    "味方全員の攻撃力+10%。敵全員の防御力-20%",
  ], { includeOperatorSummary: true });

  assert.deepEqual(
    summaries.filter((item) => item.title === "【オペレーター】").map((item) => item.effect),
    ["【味方全員】 攻撃力+10%"],
  );
  assert.deepEqual(
    summaries.filter((item) => item.title === "【敵】").map((item) => item.effect),
    ["【敵全員】 防御力-20%"],
  );
});