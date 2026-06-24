import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildStartTemplateSummary, getEffectiveRelicIds, mergeEffectiveSpecial } from "../app/domain/start-templates.js";

const master = { startTemplates: JSON.parse(fs.readFileSync(new URL("../data/start-templates.json", import.meta.url), "utf8")).templates };

test("IS#3 difficulty 16+ adds caregiver genetic relic", () => {
  const summary15 = buildStartTemplateSummary(master, { campaignId: "is3_mizuki", difficulty: 15 });
  assert.equal(summary15.relicIds.includes("is3_mizuki_relic_262"), false);

  const summary16 = buildStartTemplateSummary(master, { campaignId: "is3_mizuki", difficulty: 16 });
  assert.equal(summary16.relicIds.includes("is3_mizuki_relic_262"), true);
});

test("effective relic ids keep manual entries and avoid duplicates", () => {
  const summary = buildStartTemplateSummary(master, { campaignId: "is3_mizuki", difficulty: 16 });
  assert.deepEqual(getEffectiveRelicIds(["is3_mizuki_relic_262", "manual_relic"], summary), ["is3_mizuki_relic_262", "manual_relic"]);
});

test("IS#6 difficulty 3 template merges starting coins with manual coins", () => {
  const summary = buildStartTemplateSummary(master, { campaignId: "is6_sui", difficulty: 3 });
  const special = mergeEffectiveSpecial({ coins: [{ coinId: "is6_sui_selectable_coin_is6_copper_b01", count: 2, face: "front" }] }, summary.specialPatch.is6_sui);
  assert.deepEqual(special.coins, [{ coinId: "is6_sui_selectable_coin_is6_copper_b01", count: 5, statusId: null, face: "front" }]);
});

test("squad option templates only activate for the selected random option", () => {
  const inactive = buildStartTemplateSummary(master, { campaignId: "is6_sui", squadId: "is6_sui_squad_16", squadRandomEffectOptionId: "is6_sui_shadow_echo_02" });
  assert.equal(inactive.relicIds.includes("is6_sui_relic_241"), false);

  const active = buildStartTemplateSummary(master, { campaignId: "is6_sui", squadId: "is6_sui_squad_16", squadRandomEffectOptionId: "is6_sui_shadow_echo_04" });
  assert.equal(active.relicIds.includes("is6_sui_relic_241"), true);
});
