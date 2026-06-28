import test from "node:test";
import assert from "node:assert/strict";

import { buildAgeRecognitionDb, createAgeCandidateExtractor, normalizeAgeRecognitionText } from "../app/domain/recognition/age-candidate-extractor.js";

const ages = [
  { id: "age_formation", campaignId: "is5_sarkaz", slot: "age", name: "天災の時代（形成期）", groupLabel: "天災の時代", effect: "HP+100%", image: { localPath: "assets/age/age_01.png" } },
  { id: "age_prime", campaignId: "is5_sarkaz", slot: "age", name: "天災の時代（全盛期）", groupLabel: "天災の時代", effect: "HP+200%" },
  { id: "thought_01", campaignId: "is5_sarkaz", slot: "thought", name: "築壁", groupLabel: "妙想" },
];

test("age recognition text normalization removes OCR spaces and brackets", () => {
  assert.equal(normalizeAgeRecognitionText(" 天 災 の 時 代（全 盛 期） "), "天災の時代全盛期");
});

test("age recognition DB keeps IS5 age metadata and phase", () => {
  const db = buildAgeRecognitionDb(ages, { campaignId: "is5_sarkaz" });

  assert.deepEqual(db.map((item) => item.ageId), ["age_formation", "age_prime"]);
  assert.equal(db[0].groupLabel, "天災の時代");
  assert.equal(db[0].phase, "形成期");
  assert.equal(db[0].imagePath, "assets/age/age_01.png");
});

test("age candidate extractor matches group and phase from OCR rows", async () => {
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "天 災 の 時 代", roi: { x: 780, y: 60, width: 220, height: 40 }, confidence: 0.72 },
      { text: "全 盛 期", roi: { x: 780, y: 112, width: 120, height: 36 }, confidence: 0.76 },
    ],
  }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].kind, "age");
  assert.equal(candidates[0].ageId, "age_prime");
  assert.equal(candidates[0].phase, "全盛期");
});

test("age candidate extractor requires phase to avoid unsafe auto selection", async () => {
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [{ text: "天 災 の 時 代", roi: { x: 780, y: 60, width: 220, height: 40 }, confidence: 0.72 }],
  }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.deepEqual(candidates, []);
});

test("age candidate extractor infers phase from difficulty grade progress", async () => {
  const difficultyGrades = {
    is5_sarkaz: {
      grades: [
        { grade: 1, ageProgress: "形成期" },
        { grade: 18, ageProgress: "全盛期" },
      ],
    },
  };
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz", difficulty: 18, difficultyGrades });
  const candidates = await extractor({
    ocrResults: [{ text: "天 災 の 時 代", roi: { x: 780, y: 60, width: 220, height: 40 }, confidence: 0.72 }],
  }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].ageId, "age_prime");
  assert.equal(candidates[0].source, "difficulty-age-progress");
});

test("age candidate extractor infers phase from group and effect value", async () => {
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz" });
  const candidates = await extractor({
    ocrResults: [
      { text: "天 災 の 時 代", roi: { x: 780, y: 60, width: 220, height: 40 }, confidence: 0.72 },
      { text: "最 大 HP + 200 %", roi: { x: 780, y: 112, width: 220, height: 40 }, confidence: 0.74 },
    ],
  }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].ageId, "age_prime");
  assert.equal(candidates[0].source, "ocr-effect-text");
});

test("age candidate extractor prefers difficulty progress over effect text", async () => {
  const difficultyGrades = { is5_sarkaz: { grades: [{ grade: 1, ageProgress: "形成期" }] } };
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz", difficulty: 1, difficultyGrades });
  const candidates = await extractor({
    ocrResults: [
      { text: "天 災 の 時 代", roi: { x: 780, y: 60, width: 220, height: 40 }, confidence: 0.72 },
      { text: "最 大 HP + 200 %", roi: { x: 780, y: 112, width: 220, height: 40 }, confidence: 0.74 },
    ],
  }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].ageId, "age_formation");
  assert.equal(candidates[0].source, "difficulty-age-progress");
});

test("age candidate extractor ignores other profiles and OCR outside the scan region", async () => {
  const extractor = createAgeCandidateExtractor({ selectableEffects: ages, campaignId: "is5_sarkaz" });
  const wrongProfile = await extractor({ ocrResults: [{ text: "天災の時代（全盛期）", roi: { x: 780, y: 60, width: 220, height: 40 } }] }, { profile: { id: "relicsFull" } });
  const outside = await extractor({ ocrResults: [{ text: "天災の時代（全盛期）", roi: { x: 10, y: 650, width: 220, height: 40 } }] }, { profile: { id: "is5AgeFull" }, region: { x: 720, y: 0, width: 1120, height: 560 } });

  assert.deepEqual(wrongProfile, []);
  assert.deepEqual(outside, []);
});
