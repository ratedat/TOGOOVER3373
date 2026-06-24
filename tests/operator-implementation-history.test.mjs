import test from "node:test";
import assert from "node:assert/strict";
import {
  extractImplementationHistory,
  mergeImplementationHistory,
} from "../app/domain/operator-implementation-history.js";

const sampleSource = `
#sortabletable(Number|String|String|String|String|String|String|String|String,1){{
|~★&br;|~職業&br;|~職分&br;|~名前&br;|~実装日&br;|~人材発掘&br;|~公開求人&br;|~他入手法&br;|~大陸実装日&br;|h
|CENTER:||||RIGHT:|CENTER:|CENTER:||RIGHT:|c
|6|補助|緩速師|[[アンジェリーナ]]|2020/01/16|BGCOLOR(#99ffff):中堅|BGCOLOR(#dddddd):-||2019/04/30|
|5|術師|中堅術師|[[アーミヤ]]|2020/01/16|BGCOLOR(#dddddd):-|BGCOLOR(#dddddd):-|メインテーマ|2019/04/30|
|6|前衛|勇士|[[スカジ]]|2020/02/05|BGCOLOR(#99ffff):中堅|〇||2019/05/30|
}}
`;

test("extractImplementationHistory parses wiki table rows", () => {
  const rows = extractImplementationHistory(sampleSource);
  assert.deepEqual(rows.map((item) => [item.name, item.implementationDate, item.cnImplementationDate, item.implementationOrder]), [
    ["アンジェリーナ", "2020-01-16", "2019-04-30", 0],
    ["アーミヤ", "2020-01-16", "2019-04-30", 1],
    ["スカジ", "2020-02-05", "2019-05-30", 2],
  ]);
});

test("mergeImplementationHistory enriches matching operators", () => {
  const operators = [
    { id: "angelina", name: "アンジェリーナ", wikiPage: "アンジェリーナ", displayOrder: 3 },
    { id: "skadi", name: "スカジ", wikiPage: "スカジ", displayOrder: 1 },
    { id: "missing", name: "未掲載", wikiPage: "未掲載", displayOrder: 2 },
  ];
  const result = mergeImplementationHistory(operators, extractImplementationHistory(sampleSource));
  assert.equal(result.operators[0].implementationDate, "2020-01-16");
  assert.equal(result.operators[1].implementationOrder, 2);
  assert.equal(result.operators[2].implementationDate, undefined);
  assert.equal(result.summary.matchedOperators, 2);
  assert.equal(result.summary.operatorsWithoutImplementationDate, 1);
});
