import test from "node:test";
import assert from "node:assert/strict";

import {
  mergeRevelationRhetorics,
  normalizeRevelationBoardValue,
} from "../app/domain/special-loadouts.js";
import {
  formatRevelationBoardValue,
  getSelectedSpecialEffectsForField,
} from "../app/domain/special-display.js";

const field = {
  id: "revelation",
  label: "啓示板",
  type: "revelationBoardLoadout",
  effectSlot: "revelationBoard",
  causeGroupLabels: ["本因"],
  structureGroupLabels: ["構成"],
  rhetoricGroupLabels: ["修辞"],
};

const selectableEffectSource = [
  {
    id: "cause-a",
    campaignId: "is4_sami",
    slot: "revelationBoard",
    order: 1,
    groupLabel: "本因",
    name: "本因A",
    effect: "本因の効果",
  },
  {
    id: "structure-a",
    campaignId: "is4_sami",
    slot: "revelationBoard",
    order: 2,
    groupLabel: "構成",
    name: "構成A",
    effect: "構成の効果",
  },
  {
    id: "rhetoric-a",
    campaignId: "is4_sami",
    slot: "revelationBoard",
    order: 3,
    groupLabel: "修辞",
    name: "修辞A",
    effect: "修辞Aの効果",
  },
  {
    id: "rhetoric-b",
    campaignId: "is4_sami",
    slot: "revelationBoard",
    order: 4,
    groupLabel: "修辞",
    name: "修辞B",
    effect: "修辞Bの効果",
  },
];

const selectableEffectMap = new Map(selectableEffectSource.map((item) => [item.id, item]));
const context = { campaignId: "is4_sami", selectableEffectSource, selectableEffectMap };

test("revelation board keeps cause, structure, and rhetoric stacks separate", () => {
  const value = normalizeRevelationBoardValue(field, "is4_sami", {
    causeId: "cause-a",
    structureId: "structure-a",
    rhetorics: [
      { effectId: "rhetoric-a", count: 1 },
      { effectId: "rhetoric-a", count: 2 },
      { effectId: "rhetoric-b", count: 1 },
    ],
  }, selectableEffectSource);

  assert.deepEqual(value, {
    causeId: "cause-a",
    structureId: "structure-a",
    rhetorics: [
      { effectId: "rhetoric-a", count: 3 },
      { effectId: "rhetoric-b", count: 1 },
    ],
  });
});

test("revelation board migrates old stack entries without losing rhetoric effects", () => {
  const value = normalizeRevelationBoardValue(field, "is4_sami", [
    { effectId: "cause-a", count: 1, stateId: "rhetoric-a" },
    { effectId: "structure-a", count: 1, stateId: "rhetoric-b" },
  ], selectableEffectSource);

  assert.equal(value.causeId, "cause-a");
  assert.equal(value.structureId, "structure-a");
  assert.deepEqual(value.rhetorics, [
    { effectId: "rhetoric-a", count: 1 },
    { effectId: "rhetoric-b", count: 1 },
  ]);
});

test("revelation board selected effects include rhetoric effects as their own entries", () => {
  const effects = getSelectedSpecialEffectsForField(field, {
    revelation: {
      causeId: "cause-a",
      structureId: "structure-a",
      rhetorics: [{ effectId: "rhetoric-a", count: 2 }],
    },
  }, context);

  assert.deepEqual(effects.map((item) => [item.slotLabel, item.name, item.effect]), [
    ["啓示板 本因", "本因A", "本因の効果"],
    ["啓示板 構成", "構成A", "構成の効果"],
    ["啓示板 修辞", "修辞A x2", "修辞Aの効果"],
  ]);
});

test("revelation board summary shows separate counts", () => {
  const summary = formatRevelationBoardValue(field, {
    causeId: "cause-a",
    structureId: "structure-a",
    rhetorics: mergeRevelationRhetorics([
      { effectId: "rhetoric-a", count: 2 },
      { effectId: "rhetoric-b", count: 1 },
    ]),
  }, context);

  assert.equal(summary, "本因A / 構成A / 修辞3枚");
});
