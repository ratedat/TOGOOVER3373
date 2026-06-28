import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const operatorOcrMap = JSON.parse(await fs.readFile(new URL("../data/recognition/maa-operator-name-ocr.json", import.meta.url), "utf8"));

test("MAA Japanese operator OCR map keeps raw CharsNameOcrReplace rules", () => {
  assert.equal(operatorOcrMap.source.project, "MaaAssistantArknights/MaaAssistantArknights");
  assert.equal(operatorOcrMap.source.taskId, "CharsNameOcrReplace");
  assert.equal(operatorOcrMap.replaceFull, true);
  assert.ok(operatorOcrMap.summary.rawRuleCount >= 1000);
  assert.ok(operatorOcrMap.rawOcrReplace.some(([pattern, replacement]) => pattern === "アーミヤ" && replacement === "阿米娅"));
});

test("MAA Japanese operator OCR map links representative rules to local operators", () => {
  const blaze = operatorOcrMap.rules.find((rule) => rule.pattern === "^ブレイ(ズ|ス)");
  assert.ok(blaze);
  assert.equal(blaze.maaReplacement, "煌");
  assert.deepEqual(blaze.localMatches.map((operator) => operator.id), ["blaze"]);

  const silverAsh = operatorOcrMap.rules.find((rule) => rule.maaReplacement === "银灰");
  assert.ok(silverAsh.localMatches.some((operator) => operator.id === "silverash"));

  const hoederer = operatorOcrMap.rules.find((rule) => rule.maaReplacement === "赫德雷");
  assert.ok(hoederer.localMatches.some((operator) => operator.id === "hoederer"));
});

test("MAA Japanese operator OCR map includes OCR equivalence classes and recruitment names", () => {
  assert.ok(operatorOcrMap.equivalenceClasses.some((group) => group.includes("夕") && group.includes("タ")));
  assert.ok(operatorOcrMap.publicRecruitmentOperators.some((operator) => operator.name === "ジャスティスナイト"));
  assert.ok(operatorOcrMap.summary.publicRecruitmentOperatorCount >= 150);
});
