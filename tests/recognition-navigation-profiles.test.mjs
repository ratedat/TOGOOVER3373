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

async function pngSize(pathname) {
  const bytes = await readFile(new URL(`../${pathname}`, import.meta.url));
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  };
}

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
    runStatusFull: "hybrid",
    operatorsFull: "hybrid",
    relicsFull: "hybrid",
    is4RevelationFull: "hybrid",
    is5ThoughtFull: "hybrid",
    is5AgeFull: "hybrid",
    is6CoinsFull: "hybrid",
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

test("run status profile reads conception through the icon template, not thought burden OCR", async () => {
  const profiles = await profilesById();
  const tasks = await recognitionTasks();
  const profile = profiles.get("runStatusFull");
  const ideaTemplate = profile.templateOcrRegions.find((region) => region.idPrefix === "run.idea.current");

  assert.ok(ideaTemplate);
  assert.equal(ideaTemplate.templatePath, "assets/recognition/templates/run/IdeaIcon.png");
  assert.deepEqual(ideaTemplate.ocrOffset, { x: -2, y: 35, width: 44, height: 34 });
  assert.equal(ideaTemplate.numericFallback, true);
  assert.equal(profile.ocrRegionIds.includes("run.idea"), false);
  assert.equal(profile.ocrRegionIds.includes("run.idea.current"), false);
  assert.ok(tasks.ocrRegions.find((region) => region.id === "run.idea"), "legacy fallback ROI remains documented but is not active for runStatusFull");
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

test("run status profile includes template anchors for map resources", async () => {
  const profiles = await profilesById();
  const profile = profiles.get("runStatusFull");
  const byPrefix = new Map(profile.templateOcrRegions.map((region) => [region.idPrefix + ":" + region.templatePath, region]));
  const hopeIconTemplates = profile.templateOcrRegions.filter((region) => region.templatePath === "assets/recognition/templates/run/HopeIcon.png");

  for (const key of [
    "run.ingot:assets/recognition/templates/run/IngotIcon.png",
    "run.life_points:assets/recognition/templates/run/LifeIcon.png",
    "run.shield:assets/recognition/templates/run/ShieldIcon.png",
  ]) {
    assert.equal(byPrefix.get(key)?.numericFallback, true);
  }
  assert.equal(hopeIconTemplates.length, 4);
  assert.deepEqual(hopeIconTemplates.map((region) => [region.idPrefix, region.ocrOffset]), [
    ["run.hope.current", { x: 70, y: -10, width: 26, height: 36 }],
    ["run.hope.current.full", { x: 124, y: -10, width: 22, height: 36 }],
    ["run.hope.max", { x: 126, y: -10, width: 26, height: 36 }],
    ["run.hope.max.full", { x: 150, y: -10, width: 22, height: 36 }],
  ]);
  assert.ok(hopeIconTemplates.every((region) => region.numericFallback));
  assert.ok(hopeIconTemplates.every((region) => region.threshold === 0.74));
  assert.deepEqual(hopeIconTemplates.map((region) => region.suppressStaticRegionIdPattern), [
    "^run\\.hope\\.current$",
    "^run\\.hope\\.current$",
    "^run\\.hope\\.max$",
    "^run\\.hope\\.max$",
  ]);
  assert.deepEqual(byPrefix.get("run.life_points:assets/recognition/templates/run/LifeIcon.png")?.ocrOffset, { x: 31, y: 25, width: 18, height: 35 });
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
  assert.deepEqual(down.collectWindow, { minYRatio: 0.26 });
  assert.equal(up.collectCandidates, false);
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
  assert.equal(profile.ocrRegionIds.length, 12);
  assert.ok(profile.ocrRegionIds.every((id) => id.startsWith("operator.name.")));
  assert.ok(profile.ocrRegionIds.includes("operator.name.center.2"));
  assert.equal(profile.ocrRegionIds.includes("operator.list_text"), false);
  assert.equal(profile.templateOcrRegions.length, 2);
  const recruitTemplate = profile.templateOcrRegions.find((region) => region.idPrefix === "operator.recruit.name");
  const cardTemplate = profile.templateOcrRegions.find((region) => region.idPrefix === "operator.card.name");
  assert.equal(recruitTemplate.templatePath, "third_party/maa/resource/template/Roguelike/base/RoguelikeRecruitOcrFlag.png");
  assert.deepEqual(recruitTemplate.searchRoi, { x: 525, y: 110, width: 640, height: 500 });
  assert.deepEqual(recruitTemplate.ocrOffset, { x: 0, y: 22, width: 240, height: 30 });
  assert.equal(cardTemplate.templatePath, "assets/recognition/templates/run/OperatorCardCodeNameFlag.png");
  assert.deepEqual(cardTemplate.searchRoi, { x: 380, y: 95, width: 850, height: 545 });
  assert.deepEqual(cardTemplate.ocrOffset, { x: -7, y: -9, width: 188, height: 29 });
  assert.equal(cardTemplate.threshold, 0.7);
  assert.equal(cardTemplate.maxMatches, 16);
  assert.equal(recruitTemplate.suppressStaticRegionIdPattern, undefined);
  assert.equal(cardTemplate.suppressStaticRegionIdPattern, undefined);
  assert.equal(profile.scrollPasses.length, 2);
  assert.deepEqual(profile.scrollPasses.map((pass) => pass.direction), ["right", "left"]);

  const [right, left] = profile.scrollPasses;
  assert.ok(right.scroll.start.x > right.scroll.end.x, "right pass should drag left to reveal operators to the right");
  assert.ok(left.scroll.start.x < left.scroll.end.x, "left pass should drag right to return toward the first operators");
  assert.ok(left.scroll.start.x >= 650, "left return should start inside the operator card body, not the left detail pane");
  assert.ok(right.scroll.start.x - right.scroll.end.x <= 330, "right pass should use short swipes so edge cards are not skipped");
  assert.ok(left.scroll.end.x - left.scroll.start.x <= 330, "left pass should use short swipes so edge cards are not skipped");
  for (const pass of profile.scrollPasses) {
    assert.equal(pass.axis, "horizontal");
    assert.ok(pass.scroll.startArea.x >= 360, "operator swipe should stay inside the operator card frame");
    assert.ok(pass.scroll.endArea.x >= 360, "operator swipe should stay inside the operator card frame");
    assert.ok(pass.scroll.startArea.y >= 110 && pass.scroll.endArea.y >= 110, "operator swipe should avoid the top/back controls");
    assert.ok(pass.scroll.startArea.y + pass.scroll.startArea.height <= 610, "operator swipe should avoid the bottom navigation bar");
    assert.ok(pass.scroll.endArea.y + pass.scroll.endArea.height <= 610, "operator swipe should avoid the bottom navigation bar");
  }
});

test("local run template assets keep the expected 1280x720 crop sizes", async () => {
  assert.deepEqual(await pngSize("assets/recognition/templates/run/OperatorCardCodeNameFlag.png"), { width: 29, height: 22 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/IdeaIcon.png"), { width: 39, height: 41 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/LifeIcon.png"), { width: 28, height: 51 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/HopeIcon.png"), { width: 54, height: 27 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/IngotIcon.png"), { width: 54, height: 27 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/ShieldIcon.png"), { width: 19, height: 28 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/RelicButton.png"), { width: 89, height: 25 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/OperatorButton.png"), { width: 90, height: 26 });
  assert.deepEqual(await pngSize("assets/recognition/templates/run/ThoughtButton.png"), { width: 117, height: 30 });
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
  assert.equal(nameRegions.length, 12);
  assert.ok(nameRegions.every((region) => region.profileIds.includes("operatorsFull")));
  assert.deepEqual(nameRegions.find((region) => region.id === "operator.name.center.2").roi, [640, 305, 285, 43]);
  assert.deepEqual(nameRegions.find((region) => region.id === "operator.name.right.4").roi, [1070, 580, 205, 43]);
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

test("operator and thought scans use bounded passes tuned for their scroll surfaces", async () => {
  const profiles = await profilesById();
  const operator = profiles.get("operatorsFull");
  const thought = profiles.get("is5ThoughtFull");

  assert.ok(operator.scrollPasses.every((pass) => pass.maxScrolls >= 30));
  assert.ok(operator.scrollPasses.every((pass) => pass.minScrolls >= 10));
  assert.ok(operator.scrollPasses.every((pass) => pass.endFingerprintStableCount === 2));
  assert.ok(operator.scrollPasses.every((pass) => pass.candidateStableEndCount === 3));
  assert.ok(operator.scrollPasses.every((pass) => pass.captureDelayMs <= 120));
  assert.equal(operator.scrollPasses[1].mirrorPreviousPassScrolls, false);

  assert.ok(thought.scrollPasses.every((pass) => pass.maxScrolls <= 8));
  assert.ok(thought.scrollPasses.every((pass) => pass.endFingerprintStableCount === 1));
  assert.ok(thought.scrollPasses.every((pass) => pass.candidateStableEndCount === 1));
  assert.ok(thought.scrollPasses.every((pass) => pass.captureDelayMs <= 120));
  assert.equal(thought.scrollPasses[1].mirrorPreviousPassScrolls, true);
});
