import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const maaTasksPath = path.join(root, "data", "recognition", "maa-tasks.json");
const scanProfilesPath = path.join(root, "data", "recognition", "scan-profiles.json");
const outputPath = path.join(
  root,
  "apps",
  "rhodes-suki",
  "resource",
  "base",
  "pipeline",
  "rhodes-generated.json",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function nodeName(prefix, id) {
  const safe = String(id)
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return `${prefix}_${safe}`;
}

function ocrNode(recognition, attach) {
  const node = {
    recognition: "OCR",
    roi: recognition.roi,
    only_rec: recognition.only_rec ?? recognition.onlyRec ?? true,
    threshold: recognition.threshold ?? 0.3,
    action: "DoNothing",
    attach,
  };
  if (recognition.expected?.length) node.expected = recognition.expected;
  if (recognition.ocrReplace?.length) node.replace = recognition.ocrReplace;
  return node;
}

function templateNode(config, attach) {
  const template = String(config.templatePath ?? "")
    .replace(/\\/g, "/")
    .replace(/^assets\/recognition\/templates\//, "");
  return {
    recognition: "TemplateMatch",
    roi: [config.searchRoi.x, config.searchRoi.y, config.searchRoi.width, config.searchRoi.height],
    template,
    threshold: config.threshold ?? 0.7,
    method: config.method ?? 5,
    order_by: config.orderBy ?? "Score",
    action: "DoNothing",
    attach,
  };
}

function generate() {
  const maaTasks = readJson(maaTasksPath);
  const scanProfiles = readJson(scanProfilesPath);
  const pipeline = {
    RhodesGeneratedEmpty: {
      recognition: "DirectHit",
      action: "DoNothing",
      attach: {
        generatedFrom: ["data/recognition/maa-tasks.json", "data/recognition/scan-profiles.json"],
      },
    },
  };

  for (const screen of maaTasks.screens ?? []) {
    if (screen.recognition?.type !== "OCR") continue;
    pipeline[nodeName("RhodesScreen", screen.id)] = ocrNode(screen.recognition, {
      generated: true,
      source: "maa-tasks.screens",
      id: screen.id,
      label: screen.label,
      screenId: screen.screenId,
      profileIds: screen.profileIds ?? [],
    });
  }

  for (const candidate of maaTasks.candidates ?? []) {
    if (candidate.recognition?.type !== "OCR") continue;
    pipeline[nodeName("RhodesCandidate", candidate.id)] = ocrNode(candidate.recognition, {
      generated: true,
      source: "maa-tasks.candidates",
      id: candidate.id,
      label: candidate.label,
      profileIds: candidate.profileIds ?? [],
      candidate: candidate.candidate ?? null,
    });
  }

  for (const region of maaTasks.ocrRegions ?? []) {
    pipeline[nodeName("RhodesOcrRegion", region.id)] = ocrNode(
      {
        roi: region.roi,
        threshold: region.threshold,
        only_rec: true,
        expected: region.expected,
        ocrReplace: region.ocrReplace,
      },
      {
        generated: true,
        source: "maa-tasks.ocrRegions",
        id: region.id,
        profileIds: region.profileIds ?? [],
        scale: region.scale ?? null,
      },
    );
  }

  for (const profile of scanProfiles.profiles ?? []) {
    for (const [index, config] of (profile.templateOcrRegions ?? []).entries()) {
      if (!config.templatePath || !config.searchRoi) continue;
      pipeline[nodeName("RhodesTemplate", `${profile.id}.${config.idPrefix ?? index}`)] = templateNode(config, {
        generated: true,
        source: "scan-profiles.templateOcrRegions",
        profileId: profile.id,
        idPrefix: config.idPrefix ?? null,
        ocrOffset: config.ocrOffset ?? null,
        maxMatches: config.maxMatches ?? null,
        numericFallback: config.numericFallback ?? null,
      });
    }
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(pipeline, null, 2)}\n`);
  console.log(`Generated ${Object.keys(pipeline).length} MAA pipeline nodes: ${outputPath}`);
}

generate();
