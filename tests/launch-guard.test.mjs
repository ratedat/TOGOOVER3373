import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { appUrl, isLocalServerReady } from "../app/runtime/local-server.mjs";
import { launchRequestData, resolveSecondInstanceView } from "../app/runtime/launch-guard.mjs";

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      resolve(server.address().port);
    });
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

test("isLocalServerReady detects a responsive local server", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  const port = await listen(server);
  try {
    assert.equal(await isLocalServerReady(appUrl(port, "control"), 2), true);
  } finally {
    await close(server);
  }
});

test("isLocalServerReady returns false when the local server is unavailable", async () => {
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/plain" });
    res.end("ok");
  });
  const port = await listen(server);
  await close(server);
  assert.equal(await isLocalServerReady(appUrl(port, "control"), 1), false);
});

test("launchRequestData normalizes port and view for second Electron launches", () => {
  assert.deepEqual(launchRequestData({ port: "5188", view: "sidecar" }), { port: 5188, view: "sidecar" });
  assert.deepEqual(launchRequestData({ port: "bad", view: "unknown" }), { port: 5173, view: "control" });
});

test("resolveSecondInstanceView prefers Electron additionalData before command line args", () => {
  assert.equal(resolveSecondInstanceView(["electron", ".", "--view", "overlay"], { view: "sidecar" }, "control"), "sidecar");
  assert.equal(resolveSecondInstanceView(["electron", ".", "--view", "overlay"], {}, "control"), "overlay");
  assert.equal(resolveSecondInstanceView(["electron", "."], {}, "sidecar"), "sidecar");
});
