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

    const control = await fetch(`http://127.0.0.1:${port}/control`);
    assert.equal(control.headers.get("cache-control"), "no-store, max-age=0, must-revalidate");
    assert.equal(control.headers.get("clear-site-data"), '"cache"');
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
