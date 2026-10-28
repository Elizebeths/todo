import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { createServer } from "./server.mjs";

test("server serves browser assets, supports HEAD and rejects private files and malformed paths", async (t) => {
  const server = createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "/",
    "/index.html",
    "/style.css",
    "/app.js",
    "/theme.js",
    "/board-model.js",
    "/backup.js",
    "/deadline-model.js",
    "/focus-timer.js",
    "/task-tools.js",
    "/bulk-tools.js",
    "/storage.js",
    "/recurrence.js",
    "/focus-session.js",
    "/workspace-tools.js",
    "/task-commands.js",
    "/review-model.js",
    "/detail-view.js",
    "/calendar-view.js",
    "/card-view.js",
    "/task-view.js",
    "/sw.js",
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get("content-type"), /text\//);
    assert.ok((await response.text()).length > 0);
  }
  for (const [path, type] of [
    ["/manifest.webmanifest", "application/manifest+json"],
    ["/icon.svg", "image/svg+xml"],
  ]) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200);
    assert.match(
      response.headers.get("content-type"),
      new RegExp(type.replace("+", "\\+")),
    );
    assert.equal(response.headers.get("cache-control"), "no-cache");
  }
  const head = await fetch(base + "/app.js", { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.ok(Number(head.headers.get("content-length")) > 0);
  assert.equal(await head.text(), "");
  for (const path of [
    "/package.json",
    "/backup.test.js",
    "/server.mjs",
    "/.env",
    "/%2e%2e%2fpackage.json",
  ]) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
  assert.equal((await fetch(base + "/%ZZ")).status, 400);
  const post = await fetch(base + "/app.js", { method: "POST" });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get("allow"), "GET, HEAD");
});

test("CLI serves its own directory from a different cwd and reports its actual port", async (t) => {
  const child = spawn(
    process.execPath,
    [new URL("./server.mjs", import.meta.url).pathname],
    {
      cwd: "/tmp",
      env: { ...process.env, PORT: "0" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  t.after(() => {
    child.kill();
  });
  const output = await new Promise((resolve, reject) => {
    const timeout = setTimeout(
      () => reject(new Error("Server startup timed out")),
      5000,
    );
    child.once("error", reject);
    child.stdout.once("data", (chunk) => {
      clearTimeout(timeout);
      resolve(String(chunk));
    });
    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(new Error(`Server exited: ${code}`));
    });
  });
  const url = output.match(/http:\/\/localhost:(\d+)/);
  assert.ok(url, output);
  assert.notEqual(Number(url[1]), 0);
  const response = await fetch(`http://127.0.0.1:${url[1]}/`);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /日序 Daylight/);
});
