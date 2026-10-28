import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const pageErrors = new WeakMap();
test.beforeEach(async ({ page }) => {
  const errors = [];
  pageErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page)).toEqual([]);
});
const legacy = JSON.parse(
  readFileSync(new URL("../fixtures/legacy.json", import.meta.url)),
);
async function menu(page) {
  const button = page.locator('[data-action="mobile-menu"]');
  if (await button.isVisible()) await button.click();
}
async function navigate(page, view) {
  await menu(page);
  await page.locator(`[data-view="${view}"]`).click();
}
async function tools(page) {
  await menu(page);
  await page.locator('[data-action="workspace-tools"]').click();
}
async function seed(page) {
  await page.addInitScript((data) => {
    if (!localStorage.getItem("daylight-v1"))
      localStorage.setItem("daylight-v1", JSON.stringify(data));
  }, legacy);
  await page.goto("/");
}
async function saved(page) {
  await expect
    .poll(() =>
      page.evaluate(() => {
        try {
          return JSON.parse(localStorage.getItem("daylight-v1"))?.schemaVersion;
        } catch {
          return null;
        }
      }),
    )
    .toBe(2);
  await expect(page.locator(".storage-warning")).toHaveCount(0);
}
async function closeDetail(page) {
  const close = page.locator('[data-action="close-detail"]').last();
  if (await close.isVisible()) await close.click();
}

test("first visit chooses blank, creates task, preserves edit through Escape/reload and records completion", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "空白开始" }).click();
  await page.locator('[data-action="new-card"]').click();
  await page.locator('[name="title"]').fill("测试创建");
  await page.locator('#new-card-form button[type="submit"]').click();
  await saved(page);
  await page.locator(".kanban-card").click();
  await page.locator("#detail-title").fill("中文修改");
  await page.locator("#detail-notes").fill("无需失焦保存\n完整备注");
  await page.keyboard.press("Escape");
  await saved(page);
  await page.reload();
  await expect(page.locator(".kanban-card-title")).toHaveText("中文修改");
  await page.locator("[data-status-task]").selectOption("done");
  await saved(page);
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("daylight-v1")).events.length,
      ),
    )
    .toBe(1);
  await page.locator("[data-status-task]").selectOption("todo");
  await saved(page);
});

test("legacy migration, IME input, subtask edit, repeat generation, persistent trash and restore", async ({
  page,
}) => {
  await seed(page);
  await page.locator(".kanban-card").click();
  const title = page.locator("#detail-title");
  await title.dispatchEvent("compositionstart");
  await title.fill("中文输入完成");
  await title.dispatchEvent("compositionend");
  await saved(page);
  await page.locator('[data-subtext="0"]').fill("可编辑子任务");
  await page.locator("[data-repeat]").click();
  await page.locator('[name="kind"]').selectOption("daily");
  await page.getByRole("button", { name: "应用规则" }).click();
  await closeDetail(page);
  await page.locator('[data-status-task="old"]').selectOption("done");
  await saved(page);
  await expect(page.locator(".kanban-card")).toHaveCount(2);
  await page.locator('[data-task="old"]').click();
  await page.locator('[data-action="delete-task"]').click();
  await page.locator("#confirm-delete").click();
  await saved(page);
  await page.reload();
  await tools(page);
  await page.getByRole("button", { name: /回收站/ }).click();
  await page.getByRole("button", { name: "恢复", exact: true }).click();
  await saved(page);
  await page.locator(".modal-close").click();
  await expect(page.locator(".kanban-card")).toHaveCount(2);
});

test("search combinations, saved filter, bulk changes and undo preserve manual tasks", async ({
  page,
}) => {
  await seed(page);
  await page.locator("[data-tag]").selectOption("设计");
  await menu(page);
  await page.locator("#search").fill("旧版 工作");
  if (await page.locator("body.nav-open").count()) await menu(page);
  await expect(page.locator(".kanban-card")).toHaveCount(1);
  await page.locator("[data-save-filter]").click();
  await page.locator('[name="name"]').fill("设计工作");
  await page.getByRole("button", { name: "保存", exact: true }).click();
  await page.locator("[data-bulk-toggle]").click();
  await page.locator("[data-bulk-all]").check();
  await page.locator("[data-bulk-edit]").click();
  await page.locator('[name="priority"]').selectOption("2");
  await page.getByRole("button", { name: "应用修改" }).click();
  await saved(page);
  await page.locator("[data-bulk-all]").check();
  await page.locator("[data-bulk-delete]").click();
  await page.locator("#confirm-bulk-delete").click();
  await saved(page);
  await expect(page.locator(".kanban-card")).toHaveCount(0);
  await page.locator("[data-undo-delete]").click();
  await saved(page);
  await expect(page.locator(".kanban-card")).toHaveCount(1);
  await page.reload();
  await expect(page.locator("[data-tag]")).toHaveValue("设计");
});

test("quota failure retains edits, external update conflicts, explicit recovery never silently overwrites", async ({
  page,
  context,
}) => {
  await seed(page);
  await page.locator(".kanban-card").click();
  await page.evaluate(() => {
    const set = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      if (k === "daylight-v1")
        throw new DOMException("quota", "QuotaExceededError");
      return set.call(this, k, v);
    };
  });
  await page.locator("#detail-notes").fill("保留本页未保存版本");
  await expect(page.locator(".storage-warning")).toContainText("quota");
  const other = await context.newPage();
  await other.goto("/");
  await other.locator(".kanban-card").click();
  await other.locator("#detail-title").fill("来自另一页");
  await saved(other);
  await expect(page.locator(".storage-warning")).toContainText("其他页面");
  await expect(page.locator("#detail-notes")).toHaveValue("保留本页未保存版本");
  await page.locator(".storage-warning button").click();
  await page.locator("#use-remote").click();
  await expect(page.locator(".kanban-card-title")).toHaveText("来自另一页");
});

test("calendar date creation and focus survive reload; backup contains extended schema", async ({
  page,
}) => {
  await seed(page);
  await navigate(page, "calendar");
  await page.locator("[data-new-date]").first().click();
  const date = await page.locator('[name="date"]').inputValue();
  await page.locator('#new-card-form [name="title"]').fill("日历创建");
  await page.locator('#new-card-form button[type="submit"]').click();
  await saved(page);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("daylight-v1")).tasks.find(
            (t) => t.title === "日历创建",
          ).date,
      ),
    )
    .toBe(date);
  await tools(page);
  await page.locator(".modal-close").click();
  await menu(page);
  await page.locator('[data-action="focus"]').click();
  await page.locator("#focus-minutes").fill("1");
  await page.locator("#start-timer").click();
  await saved(page);
  await page.locator(".modal-close").click();
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() =>
        Boolean(JSON.parse(localStorage.getItem("daylight-v1")).focus),
      ),
    )
    .toBe(true);
  await menu(page);
  const downloadPromise = page.waitForEvent("download");
  await page.locator('[data-action="export"]').click();
  const file = await downloadPromise;
  const content = JSON.parse(readFileSync(await file.path(), "utf8"));
  expect(content.schemaVersion).toBe(2);
  expect(content.focus.duration).toBe(60000);
});

test("themes and responsive layouts avoid document overflow at planned widths", async ({
  page,
}) => {
  await seed(page);
  for (const width of [390, 768, 1440, 2560]) {
    await page.setViewportSize({ width, height: 1000 });
    for (const theme of ["leaf", "iris", "night"]) {
      await page.evaluate(
        (theme) => window.daylightTheme.apply(theme, true),
        theme,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
  }
});

test("offline reload serves a complete release without losing tasks", async ({
  page,
  context,
}) => {
  await seed(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".kanban-card-title")).toHaveText("旧版任务");
  await context.setOffline(false);
});

test("backup restore round-trip checkpoints current state and rejects unsupported future data", async ({
  page,
}) => {
  await seed(page);
  await menu(page);
  await page.locator('[data-action="import"]').click();
  await page.locator("#backup-file").setInputFiles({
    name: "future.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ ...legacy, schemaVersion: 999 })),
  });
  await expect(page.locator("#backup-error")).toContainText("不支持");
  await page.locator("#backup-file").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({
        ...legacy,
        tasks: legacy.tasks.map((t) => ({ ...t, title: "恢复后的内容" })),
      }),
    ),
  });
  await page.locator("#confirm-restore").click();
  await saved(page);
  await expect(page.locator(".kanban-card-title")).toHaveText("恢复后的内容");
  await expect
    .poll(() =>
      page.evaluate(
        () => JSON.parse(localStorage.getItem("daylight-recovery")).length,
      ),
    )
    .toBe(1);
});

test("near-simultaneous pages keep one committed version and one explicit conflict", async ({
  page,
  context,
}) => {
  await seed(page);
  const other = await context.newPage();
  await other.goto("/");
  await page.locator(".kanban-card").click();
  await other.locator(".kanban-card").click();
  await page.evaluate(() => {
    window.releaseWrite = null;
    navigator.locks.request(
      "daylight-write",
      () =>
        new Promise((resolve) => {
          window.releaseWrite = resolve;
        }),
    );
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(window.releaseWrite)))
    .toBe(true);
  await Promise.all([
    page.locator("#detail-notes").fill("页面 A"),
    other.locator("#detail-title").fill("页面 B"),
  ]);
  await page.evaluate(() => window.releaseWrite());
  await expect
    .poll(async () => {
      const a = await page
        .locator(".storage-warning")
        .allTextContents()
        .catch(() => null);
      const b = await other
        .locator(".storage-warning")
        .allTextContents()
        .catch(() => null);
      return String(a) + String(b);
    })
    .toContain("其他页面");
  const persisted = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("daylight-v1")),
  );
  expect(
    persisted.tasks[0].notes === "页面 A" ||
      persisted.tasks[0].title === "页面 B",
  ).toBe(true);
});

test("keyboard opens task and returns focus after closing detail", async ({
  page,
}) => {
  await seed(page);
  await page.locator(".kanban-card").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#detail-title")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator(".kanban-card")).toBeFocused();
});

test("corrupt startup never overwrites raw data and explicit restore checkpoints corruption", async ({
  page,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem("daylight-v1", "{broken"),
  );
  await page.goto("/");
  await expect(page.locator(".storage-warning")).toContainText(
    "自动保存已暂停",
  );
  expect(await page.evaluate(() => localStorage.getItem("daylight-v1"))).toBe(
    "{broken",
  );
  await page.locator(".storage-warning button").click();
  await page.locator("#backup-file").setInputFiles({
    name: "legacy.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(legacy)),
  });
  await page.locator("#confirm-restore").click();
  await saved(page);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("daylight-recovery"))[0].source,
    ),
  ).toBe("{broken");
});
