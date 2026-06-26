import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { normalizeScanProfiles } from "../app/domain/recognition/profiles.js";

async function profilesById() {
  const raw = JSON.parse(await readFile(new URL("../data/recognition/scan-profiles.json", import.meta.url), "utf8"));
  return new Map(normalizeScanProfiles(raw).map((profile) => [profile.id, profile]));
}

async function recognitionTasks() {
  return JSON.parse(await readFile(new URL("../data/recognition/maa-tasks.json", import.meta.url), "utf8"));
}

const tapLabels = (profile) => (profile.openSteps || []).filter((step) => step.type === "tap").map((step) => step.label);

const firstTapPoint = (profile) => (profile.openSteps || []).find((step) => step.type === "tap")?.point;

test("ADB scan profiles encode the spoken navigation entry points", async () => {
  const profiles = await profilesById();

  assert.deepEqual(tapLabels(profiles.get("runStatusFull")), ["左下の分隊情報を開く"]);
  assert.deepEqual(tapLabels(profiles.get("relicsFull")), ["右側の秘宝を開く"]);
  assert.deepEqual(tapLabels(profiles.get("is5ThoughtFull")), ["思案を開く"]);
  assert.deepEqual(tapLabels(profiles.get("operatorsFull")), ["隊員を開く"]);
});

test("ADB scan profile taps stay inside the 1280x720 base screen", async () => {
  const profiles = await profilesById();
  for (const id of ["runStatusFull", "relicsFull", "is5ThoughtFull", "operatorsFull"]) {
    const point = firstTapPoint(profiles.get(id));
    assert.ok(point, `${id} should have an opening tap`);
    assert.ok(point.x >= 0 && point.x <= 1280, `${id} x out of bounds`);
    assert.ok(point.y >= 0 && point.y <= 720, `${id} y out of bounds`);
  }
});


test("ADB scan profile taps match the annotated 2560x1440 screenshot scaled to 1280x720", async () => {
  const profiles = await profilesById();
  const expected = new Map([
    ["runStatusFull", { x: 54, y: 677 }],
    ["relicsFull", { x: 176, y: 678 }],
    ["is5ThoughtFull", { x: 704, y: 679 }],
    ["operatorsFull", { x: 948, y: 678 }],
  ]);

  for (const [id, point] of expected) {
    assert.deepEqual(firstTapPoint(profiles.get(id)), point);
  }
});


test("idea count ROI matches the annotated thought burden value area", async () => {
  const tasks = await recognitionTasks();
  const ideaRegion = tasks.ocrRegions.find((region) => region.id === "run.idea");

  assert.deepEqual(ideaRegion.roi, [700, 648, 128, 60]);
});
