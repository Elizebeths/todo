import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = fileURLToPath(new URL(".", import.meta.url));
const assets = new Map([
  ["/manifest.webmanifest", "application/manifest+json"],
  ["/icon.svg", "image/svg+xml"],
  ["/index.html", "text/html; charset=utf-8"],
  ["/style.css", "text/css; charset=utf-8"],
  ...[
    "app.js",
    "theme.js",
    "board-model.js",
    "backup.js",
    "deadline-model.js",
    "focus-timer.js",
    "task-tools.js",
    "bulk-tools.js",
    "recurrence.js",
    "storage.js",
    "focus-session.js",
    "workspace-tools.js",
    "task-commands.js",
    "review-model.js",
    "detail-view.js",
    "calendar-view.js",
    "task-view.js",
    "card-view.js",
    "sw.js",
  ].map((name) => [`/${name}`, "text/javascript; charset=utf-8"]),
]);

export function createServer() {
  return http.createServer(async (req, res) => {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405, { Allow: "GET, HEAD" });
      res.end();
      return;
    }
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
    } catch {
      res.writeHead(400);
      res.end("Bad request");
      return;
    }
    if (pathname === "/") pathname = "/index.html";
    if (!assets.has(pathname)) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    try {
      const content = await readFile(resolve(root, "." + pathname));
      res.writeHead(200, {
        "Content-Type": assets.get(pathname),
        "Content-Length": content.length,
        "Cache-Control": "no-cache",
        ...(pathname === "/sw.js" ? { "Service-Worker-Allowed": "/" } : {}),
      });
      res.end(req.method === "HEAD" ? undefined : content);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  });
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const port = process.env.PORT === undefined ? 5173 : Number(process.env.PORT);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    console.error("PORT must be an integer between 0 and 65535");
    process.exitCode = 1;
  } else {
    const server = createServer();
    server.on("error", (error) => {
      console.error(
        `无法启动日序：${error.code === "EADDRINUSE" ? "端口已被占用，请先打开已有的 http://localhost:" + port + "，或停止旧服务。更换端口会改变数据来源。" : error.message}`,
      );
      process.exitCode = 1;
    });
    server.listen(port, "127.0.0.1", () => {
      console.log(
        `Daylight is ready at http://localhost:${server.address().port}`,
      );
    });
  }
}
