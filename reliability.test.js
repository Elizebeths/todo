import test from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "./backup.js";
import { createRepository, envelope, checkpoint } from "./storage.js";
import { nextDate, reconcileTasks } from "./recurrence.js";
import { deleteTasks, restoreDeleted } from "./bulk-tools.js";
import {
  startSession,
  sessionState,
  pauseSession,
  resumeSession,
  finishSession,
} from "./focus-session.js";
const task = () => ({
  id: "a",
  title: "事项",
  notes: "",
  list: "inbox",
  date: "2024-01-31",
  priority: 0,
  tags: [],
  subtasks: [],
  done: false,
  status: "todo",
});
const data = () =>
  envelope({ lists: [], tasks: [task()], trash: [], events: [], sessions: [] });
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
};
const locks = () => {
  let chain = Promise.resolve();
  return {
    request: (_name, fn) => {
      const result = chain.then(fn);
      chain = result.catch(() => {});
      return result;
    },
  };
};
const rule = (patch = {}) => ({
  id: "r",
  kind: "monthly",
  basis: "scheduled",
  weekdays: [1, 3],
  monthDay: 31,
  until: "",
  remaining: 0,
  paused: false,
  ...patch,
});
test("versioned exports round-trip extended state, migrate v1, reject future versions", () => {
  const d = data();
  d.tasks[0].repeat = rule();
  d.tasks[0].instanceDate = d.tasks[0].date;
  assert.deepEqual(parseBackup(JSON.stringify(d)), { ...d, focus: null });
  assert.equal(
    parseBackup(JSON.stringify({ ...d, schemaVersion: 1 })).schemaVersion,
    2,
  );
  assert.throws(
    () => parseBackup(JSON.stringify({ ...d, schemaVersion: 99 })),
    /不支持/,
  );
  for (const patch of [
    { revision: -1 },
    { trash: [null] },
    { events: [{}] },
    { focus: { id: "bad" } },
  ])
    assert.throws(() => parseBackup(JSON.stringify({ ...d, ...patch })));
});
test("Web Locks serialize simultaneous pages; losing page retains edits without overwrite", async () => {
  const storage = memory(),
    lock = locks(),
    a = createRepository({ storage, locks: lock }),
    b = createRepository({ storage, locks: lock });
  const d = data(),
    e = data();
  e.tasks[0].title = "另一页";
  const result = await Promise.allSettled([a.write(d), b.write(e)]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    JSON.parse(storage.getItem("daylight-v1")).tasks[0].title,
    "事项",
  );
  assert.equal(e.tasks[0].title, "另一页");
  const current = storage.getItem("daylight-v1");
  await b.write(e, { replace: true, expected: current });
  assert.equal(JSON.parse(storage.getItem("daylight-v1")).revision, 2);
  assert.equal(JSON.parse(storage.getItem("daylight-recovery")).length, 1);
});
test("queued edits preserve latest state and unsupported locks never silently write", async () => {
  const storage = memory(),
    repo = createRepository({ storage, locks: locks() });
  const d = data(),
    one = repo.write(d);
  d.tasks[0].title = "二";
  const two = repo.write(d);
  await Promise.all([one, two]);
  assert.equal(repo.read().tasks[0].title, "二");
  const readOnly = createRepository({ storage });
  await assert.rejects(readOnly.write(data()), /只读/);
});
test("failed checkpoint or quota leaves current data and revision unchanged", async () => {
  const storage = memory();
  storage.setItem("daylight-v1", JSON.stringify(data()));
  const previous = storage.getItem("daylight-v1");
  const repo = createRepository({ storage, locks: locks() });
  storage.setItem = () => {
    throw new Error("quota");
  };
  await assert.rejects(repo.write(data(), { replace: true }), /quota/);
  assert.equal(storage.getItem("daylight-v1"), previous);
  assert.equal(repo.raw, previous);
});
test("recovery points bounded and oversized snapshot rejects replacement", () => {
  const s = memory();
  for (let i = 0; i < 9; i++) checkpoint(s, "{}", "import");
  assert.equal(JSON.parse(s.getItem("daylight-recovery")).length, 5);
  assert.throws(() => checkpoint(s, "x".repeat(1000001), "import"), /容量/);
});
test("persistent trash survives backup and restoration, preserves position and orphan lists", () => {
  const d = data();
  d.tasks.push({ ...task(), id: "b" });
  const removed = deleteTasks(d, ["a"], 100);
  const restored = parseBackup(JSON.stringify(d));
  assert.equal(restored.trash.length, 1);
  restoreDeleted(restored, restored.trash);
  assert.deepEqual(
    restored.tasks.map((t) => t.id),
    ["a", "b"],
  );
  assert.equal(restored.trash.length, 0);
  assert.equal(removed[0].index, 0);
});
test("trash expiry and ID collisions do not overwrite live tasks", () => {
  const d = data();
  deleteTasks(d, ["a"], 0);
  d.tasks.push(task());
  assert.equal(restoreDeleted(d, d.trash), 0);
  assert.equal(d.trash.length, 1);
  reconcileTasks(d, d, "2024-03-02", 31 * 86400000);
  assert.equal(d.trash.length, 0);
});
test("repeat calendar handles month ends, leap years, year changes and limits", () => {
  assert.equal(nextDate(rule(), "2024-01-31", "2024-02-05"), "2024-02-29");
  assert.equal(nextDate(rule(), "2024-02-29", "2024-03-06"), "2024-03-31");
  assert.equal(nextDate(rule(), "2023-01-31", "2023-01-31"), "2023-02-28");
  assert.equal(
    nextDate(rule({ kind: "daily" }), "2024-12-31", "2024-12-31"),
    "2025-01-01",
  );
  assert.equal(
    nextDate(rule({ kind: "weekly" }), "2024-12-31", "2024-12-31"),
    "2025-01-01",
  );
  assert.equal(
    nextDate(
      rule({ kind: "daily", basis: "completed" }),
      "2024-01-01",
      "2024-02-10",
    ),
    "2024-02-11",
  );
  assert.equal(
    nextDate(rule({ remaining: 1 }), "2024-01-31", "2024-01-31"),
    "",
  );
  assert.equal(
    nextDate(rule({ until: "2024-02-01" }), "2024-01-31", "2024-01-31"),
    "",
  );
  assert.equal(
    nextDate(rule({ paused: true }), "2024-01-31", "2024-01-31"),
    "",
  );
});
test("completion generation idempotent across reopen, backup and deleted next instance", () => {
  const d = data();
  d.tasks[0].repeat = rule();
  const before = structuredClone(d);
  d.tasks[0].done = true;
  reconcileTasks(d, before, "2024-02-02");
  assert.equal(d.tasks.length, 2);
  assert.equal(d.events.length, 1);
  const restored = parseBackup(JSON.stringify(d));
  reconcileTasks(restored, d, "2024-02-02");
  assert.equal(restored.tasks.length, 2);
  deleteTasks(restored, [restored.tasks[1].id]);
  restored.tasks[0].done = false;
  const old = structuredClone(restored);
  restored.tasks[0].done = true;
  reconcileTasks(restored, old, "2024-02-02");
  assert.equal(restored.tasks.length, 1);
});
test("persisted focus restores after sleep, pause, resume and records exactly once", () => {
  const d = data();
  d.focus = startSession(d.tasks[0], 1, 5, 0);
  assert.equal(sessionState(d.focus, 15000).seconds, 45);
  pauseSession(d.focus, 15000);
  assert.equal(sessionState(d.focus, 90000).seconds, 45);
  resumeSession(d.focus, 90000);
  assert.equal(sessionState(d.focus, 135000).completed, true);
  const restored = parseBackup(JSON.stringify(d));
  finishSession(restored, "completed", "2024-01-31", 135000);
  finishSession(restored, "completed", "2024-01-31", 135000);
  assert.equal(restored.sessions.length, 1);
  assert.equal(restored.sessions[0].duration, 60000);
});

test("explicit validated restore checkpoints corrupt bytes; future versions cannot be downgraded", async () => {
  const s = memory();
  s.setItem("daylight-v1", "{broken");
  const r = createRepository({ storage: s, locks: locks() });
  await r.write(data(), { replace: true });
  assert.equal(JSON.parse(s.getItem("daylight-recovery"))[0].source, "{broken");
  s.setItem("daylight-v1", JSON.stringify({ ...data(), schemaVersion: 99 }));
  r.accept(null);
  await assert.rejects(
    r.write(data(), { replace: true, expected: s.getItem("daylight-v1") }),
    /不支持/,
  );
});

test("task command rejects invalid content before status mutation", async () => {
  const { editTask } = await import("./task-commands.js");
  const d = data();
  assert.throws(() =>
    editTask(d, "a", { title: "", status: "done" }, "2024-02-01"),
  );
  assert.equal(d.tasks[0].done, false);
  editTask(d, "a", { title: "更名", status: "done" }, "2024-02-01");
  assert.equal(d.tasks[0].completedAt, "2024-02-01");
});

test("accepting an external version invalidates queued older local snapshots", async () => {
  const s = memory(),
    lock = locks(),
    r = createRepository({ storage: s, locks: lock });
  const queued = r.write(data());
  const remote = JSON.stringify({ ...data(), revision: 10 });
  s.setItem("daylight-v1", remote);
  r.accept(remote);
  await assert.rejects(queued, (error) => error.code === "STALE_WRITE");
  assert.equal(s.getItem("daylight-v1"), remote);
});

test("purged recurring next instance is not regenerated after clearing event history", () => {
  const d = data();
  d.tasks[0].repeat = rule();
  let before = structuredClone(d);
  d.tasks[0].done = true;
  reconcileTasks(d, before, "2024-02-01");
  d.tasks.pop();
  d.events = [];
  d.tasks[0].done = false;
  before = structuredClone(d);
  d.tasks[0].done = true;
  reconcileTasks(d, before, "2024-02-02");
  assert.equal(d.tasks.length, 1);
});

test("review totals include ended focus, exclude cancelled/break/future sessions and honor date range", async () => {
  const { summarize } = await import("./review-model.js");
  const d = {
    events: [
      { date: "2026-10-27", overdue: true },
      { date: "2026-10-28", overdue: false },
      { date: "2026-10-29", overdue: false },
    ],
    sessions: [
      { date: "2026-10-28", outcome: "completed", duration: 60000 },
      { date: "2026-10-28", outcome: "ended", duration: 30000 },
      { date: "2026-10-28", outcome: "cancelled", duration: 90000 },
      {
        date: "2026-10-28",
        outcome: "completed",
        duration: 60000,
        kind: "break",
      },
    ],
  };
  assert.deepEqual(summarize(d, "2026-10-27", "2026-10-28"), {
    completed: 2,
    minutes: 1,
    overdue: 1,
  });
});

test("schema 1 upgrade keeps raw recovery point before writing schema 2", async () => {
  const s = memory(),
    legacy = JSON.stringify({ ...data(), schemaVersion: 1 });
  s.setItem("daylight-v1", legacy);
  const r = createRepository({ storage: s, locks: locks() });
  await r.write(data());
  assert.equal(JSON.parse(s.getItem("daylight-recovery"))[0].source, legacy);
  assert.equal(r.read().schemaVersion, 2);
});
