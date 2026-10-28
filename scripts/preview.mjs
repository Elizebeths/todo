import { chromium } from "@playwright/test";
import { createServer } from "../server.mjs";
import { once } from "node:events";
import { mkdir } from "node:fs/promises";
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.getByRole("button", { name: "体验示例" }).click();
  await page.locator(".storage-warning").waitFor({ state: "detached" });
  await mkdir("previews", { recursive: true });
  await page.screenshot({
    path: "previews/iteration-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "previews/iteration-mobile.png",
    fullPage: true,
  });
  await page.locator(".kanban-card").first().click();
  await page.screenshot({
    path: "previews/iteration-detail-mobile.png",
    fullPage: true,
  });
  console.log("Saved previews/iteration-{desktop,mobile,detail-mobile}.png");
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
