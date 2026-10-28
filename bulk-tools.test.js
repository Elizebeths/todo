import test from "node:test";
import assert from "node:assert/strict";
import { updateTasks, deleteTasks, restoreDeleted } from "./bulk-tools.js";
import { parseBackup } from "./backup.js";
const fixture = () => ({
  lists: [{ id: "work", name: "工作", color: "#123456" }],
  tasks: Array.from({ length: 5 }, (_, i) => ({
    id: String(i),
    title: `任务${i}`,
    list: "work",
    date: "2026-12-31",
    time: "09:30",
    notes: "保留备注",
    priority: 1,
    tags: ["标签"],
    subtasks: [{ text: "步骤", done: true }],
    done: false,
    status: "doing",
  })),
});

test("batch changes only selected fields and tasks, preserves order and backup compatibility", () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.equal(
    updateTasks(
      data,
      ["1", "3", "missing", "1"],
      { list: "inbox", date: "2027-01-01", priority: 0 },
      "2026-10-28",
    ),
    2,
  );
  assert.deepEqual(
    data.tasks.map((t) => t.id),
    before.tasks.map((t) => t.id),
  );
  for (let i = 0; i < 5; i++)
    assert.deepEqual(
      data.tasks[i],
      [1, 3].includes(i)
        ? { ...before.tasks[i], list: "inbox", date: "2027-01-01", priority: 0 }
        : before.tasks[i],
    );
  assert.deepEqual(parseBackup(JSON.stringify(data)), data);
});

test("batch completion records previous status, reopening clears completion, clearing dates keeps time", () => {
  const data = fixture();
  updateTasks(data, ["0", "2"], { status: "done" }, "2026-10-28");
  assert.equal(data.tasks[0].previousStatus, "doing");
  assert.equal(data.tasks[0].completedAt, "2026-10-28");
  updateTasks(data, ["0"], { status: "done" }, "2026-10-29");
  assert.equal(data.tasks[0].completedAt, "2026-10-28");
  updateTasks(data, ["0"], { status: "planning", date: "" }, "2026-10-29");
  assert.equal(data.tasks[0].done, false);
  assert.equal(data.tasks[0].completedAt, undefined);
  assert.equal(data.tasks[0].date, "");
  assert.equal(data.tasks[0].time, "09:30");
  assert.equal(data.tasks[2].done, true);
});

test("invalid batch input is rejected before any partial mutation", () => {
  for (const changes of [
    { list: "missing", status: "done" },
    { status: "invalid" },
    { priority: 4 },
    { date: "2026-02-30" },
    { date: "bad" },
  ]) {
    const data = fixture(),
      before = structuredClone(data);
    assert.throws(() => updateTasks(data, ["0", "1"], changes, "2026-10-28"));
    assert.deepEqual(data, before);
  }
});

test("delete and undo restore non-contiguous tasks and exact manual order without reverting later edits", () => {
  const data = fixture(),
    before = structuredClone(data);
  const removed = deleteTasks(data, ["1", "3", "1", "missing"]);
  assert.deepEqual(
    data.tasks.map((t) => t.id),
    ["0", "2", "4"],
  );
  data.tasks[1].notes = "删除后的编辑";
  assert.equal(restoreDeleted(data, removed), 2);
  before.tasks[2].notes = "删除后的编辑";
  assert.deepEqual(data, before);
  assert.equal(restoreDeleted(data, removed), 0);
});

test("undo after deleting a collection restores tasks to inbox and supports full and empty deletion", () => {
  const data = fixture();
  assert.deepEqual(deleteTasks(data, []), []);
  const removed = deleteTasks(
    data,
    data.tasks.map((t) => t.id),
  );
  assert.equal(data.tasks.length, 0);
  data.lists = [];
  assert.equal(restoreDeleted(data, removed), 5);
  assert.ok(data.tasks.every((t) => t.list === "inbox"));
  assert.deepEqual(parseBackup(JSON.stringify(data)), data);
});
