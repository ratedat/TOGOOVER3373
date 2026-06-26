import test from "node:test";
import assert from "node:assert/strict";

import { startServer } from "../app/server.mjs";

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("recognition scan API accepts POST profile requests without using the default ADB runner", async () => {
  const { server, port } = await startServer({
    port: 0,
    recognitionRunner: async ({ profile, source }) => ({
      scanId: "api-scan",
      profileId: profile.id,
      source,
      status: "completed",
      suggestions: [],
      candidates: [],
      log: [],
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "operatorsFull", source: "adb" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(payload.result.profileId, "operatorsFull");
    assert.equal(payload.result.source, "adb");
  } finally {
    await closeServer(server);
  }
});

test("external trigger routes map to full scan profiles and return aborted scans as 409", async () => {
  const { server, port } = await startServer({
    port: 0,
    recognitionRunner: async ({ profile }) => ({
      scanId: "api-scan",
      profileId: profile.id,
      source: "adb",
      status: "aborted",
      reason: "unknown_screen",
      suggestions: [],
      candidates: [],
      log: [],
    }),
  });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/trigger/scan/operators/full`);
    const payload = await response.json();

    assert.equal(response.status, 409);
    assert.equal(payload.result.profileId, "operatorsFull");
    assert.equal(payload.result.reason, "unknown_screen");
  } finally {
    await closeServer(server);
  }
});
test("default recognition runner reports missing adb as service unavailable", async () => {
  const previousAdbPath = process.env.ARKNIGHTS_ADB_PATH;
  process.env.ARKNIGHTS_ADB_PATH = "definitely-missing-adb-for-test";
  const { server, port } = await startServer({ port: 0 });
  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/recognition/scan`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: "relicsFull", source: "adb" }),
    });
    const payload = await response.json();

    assert.equal(response.status, 503);
    assert.match(payload.error, /ADB executable was not found/);
    assert.equal(payload.details.code, "adb_not_found");
  } finally {
    await closeServer(server);
    if (previousAdbPath == null) delete process.env.ARKNIGHTS_ADB_PATH;
    else process.env.ARKNIGHTS_ADB_PATH = previousAdbPath;
  }
});