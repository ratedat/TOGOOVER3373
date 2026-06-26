import test from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../app/server.mjs";

test("app shell and module files are served with strict no-cache headers", async () => {
  const { server, port } = await startServer({ port: 0 });
  try {
    const appJs = await fetch(`http://127.0.0.1:${port}/app/app.js`);
    assert.equal(appJs.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(appJs.headers.get("pragma"), "no-cache");
    assert.equal(appJs.headers.get("expires"), "0");

    const legacyControl = await fetch(`http://127.0.0.1:${port}/control?tab=relics`, { redirect: "manual" });
    assert.equal(legacyControl.status, 302);
    assert.equal(legacyControl.headers.get("location"), "/control-v2?screen=relics");

    const controlV2 = await fetch(`http://127.0.0.1:${port}/control-v2`);
    assert.equal(controlV2.status, 200);
    assert.equal(controlV2.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(controlV2.headers.get("clear-site-data"), '"cache"');

    const licenses = await fetch(`http://127.0.0.1:${port}/licenses`);
    assert.equal(licenses.status, 200);
    assert.equal(licenses.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");

    const licenseText = await fetch(`http://127.0.0.1:${port}/LICENSE`);
    assert.equal(licenseText.status, 200);
    assert.match(licenseText.headers.get("content-type"), /^text\/plain/);

    const thirdPartyNotices = await fetch(`http://127.0.0.1:${port}/THIRD_PARTY_NOTICES.md`);
    assert.equal(thirdPartyNotices.status, 200);
    assert.match(thirdPartyNotices.headers.get("content-type"), /^text\/markdown/);

    const licenseDocs = await fetch(`http://127.0.0.1:${port}/docs/licenses.md`);
    assert.equal(licenseDocs.status, 200);
    assert.match(licenseDocs.headers.get("content-type"), /^text\/markdown/);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
