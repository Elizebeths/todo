import { chromium } from "@playwright/test";
import { createServer } from "../server.mjs";
import { once } from "node:events";
import { writeFile } from "node:fs/promises";
import os from "node:os";
const server = createServer();
server.listen(0, "127.0.0.1");
await once(server, "listening");
const browser = await chromium.launch(
  process.env.DAYLIGHT_CHROME ? { channel: "chrome" } : {},
);
const report = {
  at: new Date().toISOString(),
  device: `${os.platform()} ${os.arch()} ${os.cpus()[0]?.model}`,
  browser: browser.version(),
  method:
    "JS synchronous filter/render duration (excludes paint); save measures repository validation, locks and localStorage; no artificial CPU throttling",
  samples: 10,
  rows: [],
};
try {
  for (const count of [100, 1000, 5000]) {
    const context = await browser.newContext({ serviceWorkers: "block" }),
      page = await context.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}`);
    await page.evaluate((n) => {
      const tasks = Array.from({ length: n }, (_, i) => ({
        id: `t${i}`,
        title: `性能任务 ${i}`,
        notes: "备注样本",
        date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`,
        list: "inbox",
        priority: i % 4,
        tags: ["测试"],
        subtasks: [],
        done: false,
        status: "todo",
      }));
      localStorage.setItem("daylight-v1", JSON.stringify({ lists: [], tasks }));
      localStorage.setItem("daylight-preferences", "{}");
    }, count);
    await page.reload();
    await page.locator(".kanban-card").first().waitFor();
    const times = { search: [], view: [], calendar: [], save: [] };
    for (let i = 0; i < 10; i++) {
      times.search.push(
        await page.evaluate((i) => {
          const start = performance.now(),
            el = document.querySelector("#search");
          el.value = i % 2 ? "性能" : "性能任务";
          el.dispatchEvent(new Event("input", { bubbles: true }));
          return performance.now() - start;
        }, i),
      );
      times.view.push(
        await page.evaluate(() => {
          const start = performance.now();
          document.querySelector('[data-view="all"]').click();
          return performance.now() - start;
        }),
      );
      times.calendar.push(
        await page.evaluate(() => {
          const start = performance.now();
          document.querySelector('[data-view="calendar"]').click();
          return performance.now() - start;
        }),
      );
      times.save.push(
        await page.evaluate(async () => {
          const { createRepository } = await import("/storage.js");
          const repository = createRepository({
            storage: localStorage,
            locks: navigator.locks,
          });
          const data = JSON.parse(localStorage.getItem("daylight-v1"));
          const start = performance.now();
          await repository.write(data);
          return performance.now() - start;
        }),
      );
      await page.locator('[data-view="kanban"]').click();
    }
    const summary = Object.fromEntries(
      Object.entries(times).map(([k, values]) => {
        values.sort((a, b) => a - b);
        return [
          k,
          {
            p50: Number(values[4].toFixed(2)),
            p95: Number(values[9].toFixed(2)),
          },
        ];
      }),
    );
    report.rows.push({ count, ...summary });
    await context.close();
  }
  await writeFile("BENCHMARK.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
