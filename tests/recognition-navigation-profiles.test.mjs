import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { normalizeScanProfiles, ocrEnginesFromScanProfiles } from "../app/domain/recognition/profiles.js";

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
  assert.deepEqual(tapLabels(profiles.get("is5AgeFull")), ["時代を開く"]);
  assert.deepEqual(tapLabels(profiles.get("operatorsFull")), ["隊員を開く"]);
});

test("ADB scan profile taps stay inside the 1280x720 base screen", async () => {
  const profiles = await profilesById();
  for (const id of ["runStatusFull", "relicsFull", "is5ThoughtFull", "is5AgeFull", "operatorsFull"]) {
    const point = firstTapPoint(profiles.get(id));
    assert.ok(point, `${id} should have an opening tap`);
    assert.ok(point.x >= 0 && point.x <= 1280, `${id} x out of bounds`);
    assert.ok(point.y >= 0 && point.y <= 720, `${id} y out of bounds`);
  }
});

test("scan profiles own the server-side OCR engine routing", async () => {
  const profiles = await profilesById();
  const profileList = [...profiles.values()];
  const engines = ocrEnginesFromScanProfiles(profileList);

  assert.deepEqual(engines, {
    runStatusFull: "windows-paddle",
    operatorsFull: "windows",
    relicsFull: "windows",
    is4RevelationFull: "windows",
    is5ThoughtFull: "windows",
    is5AgeFull: "windows",
    is6CoinsFull: "windows",
  });
  for (const profile of profileList) {
    assert.ok(profile.ocrEngine, `${profile.id} should declare ocrEngine for server routing`);
  }
});


test("ADB scan profile taps match the annotated 2560x1440 screenshot scaled to 1280x720", async () => {
  const profiles = await profilesById();
  const expected = new Map([
    ["runStatusFull", { x: 54, y: 677 }],
    ["relicsFull", { x: 184, y: 655 }],
    ["is5ThoughtFull", { x: 704, y: 679 }],
    ["is5AgeFull", { x: 660, y: 52 }],
    ["operatorsFull", { x: 948, y: 678 }],
  ]);

  for (const [id, point] of expected) {
    assert.deepEqual(firstTapPoint(profiles.get(id)), point);
  }
});


test("difficulty grade ROI targets the opened squad panel, not the closed footer badge", async () => {
  const tasks = await recognitionTasks();
  const difficultyRegion = tasks.ocrRegions.find((region) => region.id === "run.difficulty_grade");

  assert.deepEqual(difficultyRegion.roi, [125, 530, 110, 85]);
});

test("idea count ROI targets the bottom conception counter, not thought burden", async () => {
  const tasks = await recognitionTasks();
  const ideaRegion = tasks.ocrRegions.find((region) => region.id === "run.idea");

  assert.deepEqual(ideaRegion.roi, [730, 650, 58, 66]);
});

test("run status top-bar resource ROIs target narrow digit crops", async () => {
  const tasks = await recognitionTasks();
  const rois = new Map(tasks.ocrRegions.map((region) => [region.id, region.roi]));

  assert.deepEqual(rois.get("run.top_ingot"), [916, 14, 31, 36]);
  assert.deepEqual(rois.get("run.top_hope"), [960, 13, 38, 38]);
  assert.deepEqual(rois.get("run.top_ingot.wide"), [965, 13, 38, 38]);
  assert.deepEqual(rois.get("run.top_hope.wide"), [1004, 13, 38, 38]);
  assert.equal(rois.has("run.top_idea"), false);
});


test("ADB scan profiles keep annotated tap rectangles for randomized execution", async () => {
  const profiles = await profilesById();
  const expected = new Map([
    ["runStatusFull", { x: 12, y: 634, width: 84, height: 86 }],
    ["relicsFull", { x: 170, y: 646, width: 45, height: 26 }],
    ["is5ThoughtFull", { x: 582, y: 649, width: 245, height: 59 }],
    ["is5AgeFull", { x: 585, y: 8, width: 155, height: 84 }],
    ["operatorsFull", { x: 904, y: 645, width: 88, height: 66 }],
  ]);

  for (const [id, area] of expected) {
    const tap = (profiles.get(id).openSteps || []).find((step) => step.type === "tap");
    assert.deepEqual(tap.area, area);
  }
});
test("relic tap area avoids the inactive count edge", async () => {
  const profiles = await profilesById();
  const tap = (profiles.get("relicsFull").openSteps || []).find((step) => step.type === "tap");

  assert.ok(tap.area.x >= 170, "relic tap should avoid the left count/icon edge");
  assert.ok(tap.area.x + tap.area.width <= 215, "relic tap should stay inside the right side of the button");
});

test("vertical full scan profiles sweep the left safe rail down and back up", async () => {
  const profiles = await profilesById();

  for (const id of ["relicsFull", "is4RevelationFull"]) {
    const profile = profiles.get(id);
    assert.equal((profile.openSteps || []).some((step) => step.type === "swipe"), false, `${id} should not rely on a pre-scan reset swipe`);
    assert.equal(profile.scrollPasses.length, 2, `${id} should scan in two vertical passes`);
    assert.deepEqual(profile.scrollPasses.map((pass) => pass.direction), ["down", "up"]);

    const [down, up] = profile.scrollPasses;
    assert.ok(down.scroll.start.y > down.scroll.end.y, `${id} down pass should use an upward drag to move the list toward the bottom`);
    assert.ok(up.scroll.start.y < up.scroll.end.y, `${id} up pass should use a downward drag to move the list toward the top`);
    for (const pass of profile.scrollPasses) {
      assert.ok(pass.scroll.startArea.x <= 16, `${id} start area should stay inside the left safe rail`);
      assert.ok(pass.scroll.startArea.width <= 32, `${id} start area should stay narrow`);
      assert.ok(pass.scroll.endArea.x <= 16, `${id} end area should stay inside the left safe rail`);
      assert.ok(pass.scroll.endArea.width <= 32, `${id} end area should stay narrow`);
    }
  }
});



test("relic full scan skips scroll when the opened relic panel has at most three rows", async () => {
  const profiles = await profilesById();
  const profile = profiles.get("relicsFull");

  assert.deepEqual(profile.scrollGuard, {
    type: "initialCandidateCountAtMost",
    candidateKind: "relic",
    maxCandidates: 9,
    reason: "relic_panel_not_scrollable",
    skipRemainingPasses: true,
  });
});
test("thought full scan uses the central thought list lane for vertical scrolling", async () => {
  const profiles = await profilesById();
  const profile = profiles.get("is5ThoughtFull");

  assert.equal(profile.scrollPasses.length, 2);
  assert.deepEqual(profile.scrollPasses.map((pass) => pass.direction), ["down", "up"]);
  const [down, up] = profile.scrollPasses;
  assert.ok(down.scroll.start.y > down.scroll.end.y, "thought down pass should drag upward");
  assert.ok(up.scroll.start.y < up.scroll.end.y, "thought up pass should drag downward");
  for (const pass of profile.scrollPasses) {
    assert.ok(pass.scroll.startArea.x >= 480, "thought start area should avoid the inactive left edge");
    assert.ok(pass.scroll.endArea.x >= 480, "thought end area should avoid the inactive left edge");
    assert.ok(pass.scroll.startArea.x + pass.scroll.startArea.width <= 820, "thought start area should stay inside the central list lane");
    assert.ok(pass.scroll.endArea.x + pass.scroll.endArea.width <= 820, "thought end area should stay inside the central list lane");
  }
});

test("operators full scan sweeps the operator card frame horizontally both ways", async () => {
  const profiles = await profilesById();
  const profile = profiles.get("operatorsFull");

  assert.equal(profile.scrollAxis, "horizontal");
  assert.equal(profile.scrollDirection, "two-way");
  assert.equal(profile.ocrFullFrame, false);
  assert.equal(profile.ocrRegionIds.length, 8);
  assert.ok(profile.ocrRegionIds.every((id) => id.startsWith("operator.name.")));
  assert.equal(profile.ocrRegionIds.includes("operator.list_text"), false);
  assert.equal(profile.scrollPasses.length, 2);
  assert.deepEqual(profile.scrollPasses.map((pass) => pass.direction), ["right", "left"]);

  const [right, left] = profile.scrollPasses;
  assert.ok(right.scroll.start.x > right.scroll.end.x, "right pass should drag left to reveal operators to the right");
  assert.ok(left.scroll.start.x < left.scroll.end.x, "left pass should drag right to return toward the first operators");
  assert.ok(left.scroll.start.x >= 650, "left return should start inside the operator card body, not the left detail pane");
  for (const pass of profile.scrollPasses) {
    assert.equal(pass.axis, "horizontal");
    assert.ok(pass.scroll.startArea.x >= 360, "operator swipe should stay inside the operator card frame");
    assert.ok(pass.scroll.endArea.x >= 360, "operator swipe should stay inside the operator card frame");
    assert.ok(pass.scroll.startArea.y >= 110 && pass.scroll.endArea.y >= 110, "operator swipe should avoid the top/back controls");
    assert.ok(pass.scroll.startArea.y + pass.scroll.startArea.height <= 610, "operator swipe should avoid the bottom navigation bar");
    assert.ok(pass.scroll.endArea.y + pass.scroll.endArea.height <= 610, "operator swipe should avoid the bottom navigation bar");
  }
});


test("operator list OCR screen and text ROI target the opened operator frame", async () => {
  const tasks = await recognitionTasks();
  const screen = tasks.screens.find((item) => item.id === "run.operator_list");
  const textRegion = tasks.ocrRegions.find((region) => region.id === "operator.list_text");

  assert.ok(tasks.screens.findIndex((item) => item.id === "run.operator_list") < tasks.screens.findIndex((item) => item.id === "run.map_footer"));
  assert.deepEqual(screen.recognition.expected, ["スキル", "職分"]);
  assert.deepEqual(screen.recognition.roi, [0, 130, 360, 260]);
  assert.deepEqual(textRegion.roi, [350, 70, 880, 555]);

  const nameRegions = tasks.ocrRegions.filter((region) => String(region.id).startsWith("operator.name."));
  assert.equal(nameRegions.length, 8);
  assert.ok(nameRegions.every((region) => region.profileIds.includes("operatorsFull")));
  assert.deepEqual(nameRegions.find((region) => region.id === "operator.name.right.4").roi, [1035, 560, 230, 78]);
});


test("ADB scan profiles restore overlays with tap actions instead of Android Back", async () => {
  const profiles = await profilesById();

  for (const [id, profile] of profiles) {
    assert.equal((profile.restoreSteps || []).some((step) => step.type === "back"), false, `${id} must not use Android Back for restore`);

    const opener = (profile.openSteps || []).find((step) => step.type === "tap");
    if (!opener) {
      assert.deepEqual(profile.restoreSteps || [], [], `${id} has no opener tap, so it should not restore via Back`);
      continue;
    }

    const closer = (profile.restoreSteps || []).find((step) => step.type === "tap");
    assert.ok(closer, `${id} should close by tapping the same overlay button`);
    assert.deepEqual(closer.point, opener.point, `${id} restore tap should reuse the opener point`);
    assert.deepEqual(closer.area, opener.area, `${id} restore tap should reuse the opener randomized area`);
  }
});


test("run status profile knows when the squad info panel is already open", async () => {
  const profiles = await profilesById();
  const profile = profiles.get("runStatusFull");
  assert.deepEqual(profile.targetScreenIds, ["run-squad-info-panel"]);
});

test("squad info panel OCR screen is scoped to the opened lower-left panel", async () => {
  const tasks = await recognitionTasks();
  const screen = tasks.screens.find((item) => item.id === "run.squad_info_panel");
  assert.deepEqual(screen.recognition.roi, [0, 392, 540, 270]);
  assert.deepEqual(screen.recognition.expected, ["分隊"]);
});

test("age scan taps the top-center era marker and does not scroll", async () => {
  const profiles = await profilesById();
  const age = profiles.get("is5AgeFull");

  assert.deepEqual(age.scanRegion, { x: 360, y: 0, width: 560, height: 280 });
  assert.equal(age.maxScrolls, 0);
  assert.equal(age.scrollAxis, "none");
});

test("operator and thought scans use bounded passes with mirrored return sweeps", async () => {
  const profiles = await profilesById();
  const operator = profiles.get("operatorsFull");
  const thought = profiles.get("is5ThoughtFull");

  assert.ok(operator.scrollPasses.every((pass) => pass.maxScrolls <= 6));
  assert.ok(operator.scrollPasses.every((pass) => pass.endFingerprintStableCount === 1));
  assert.ok(operator.scrollPasses.every((pass) => pass.candidateStableEndCount === 1));
  assert.ok(operator.scrollPasses.every((pass) => pass.captureDelayMs <= 120));
  assert.equal(operator.scrollPasses[1].mirrorPreviousPassScrolls, true);

  assert.ok(thought.scrollPasses.every((pass) => pass.maxScrolls <= 8));
  assert.ok(thought.scrollPasses.every((pass) => pass.endFingerprintStableCount === 1));
  assert.ok(thought.scrollPasses.every((pass) => pass.candidateStableEndCount === 1));
  assert.ok(thought.scrollPasses.every((pass) => pass.captureDelayMs <= 120));
  assert.equal(thought.scrollPasses[1].mirrorPreviousPassScrolls, true);
});
