import test from "node:test";
import assert from "node:assert/strict";
import {
  sortTasks,
  matchesSearch,
  updateList,
  removeList,
} from "./task-tools.js";
import { parseBackup } from "./backup.js";

const fixture = () => ({
  lists: [
    { id: "work", name: "工作事务", color: "#123456" },
    { id: "life", name: "生活日常", color: "#654321" },
  ],
  tasks: [
    {
      id: "a",
      title: "方案 10",
      notes: "Design review",
      list: "work",
      date: "2026-12-31",
      time: "14:00",
      priority: 0,
      tags: ["设计"],
      subtasks: [{ text: "收集灵感", done: true }],
      done: false,
      status: "doing",
    },
    {
      id: "b",
      title: "方案 2",
      notes: "",
      list: "work",
      date: "2026-12-31",
      time: "09:00",
      priority: 1,
      tags: [],
      subtasks: [],
      done: true,
      status: "done",
      previousStatus: "todo",
      completedAt: "2026-10-28",
    },
    {
      id: "c",
      title: "方案 3",
      notes: "",
      list: "life",
      date: "",
      priority: 3,
      tags: [],
      subtasks: [],
      done: false,
      status: "planning",
    },
    {
      id: "d",
      title: "方案 4",
      notes: "",
      list: "inbox",
      date: "2027-01-01",
      priority: 2,
      tags: [],
      subtasks: [],
      done: false,
      status: "todo",
    },
  ],
});

test("display sorting handles year boundaries, same-day times and undated tasks without changing manual order", () => {
  const { tasks } = fixture();
  const before = structuredClone(tasks);
  assert.deepEqual(
    sortTasks(tasks, "date").map((t) => t.id),
    ["b", "a", "d", "c"],
  );
  assert.deepEqual(
    sortTasks(tasks, "priority").map((t) => t.id),
    ["b", "d", "c", "a"],
  );
  assert.deepEqual(
    sortTasks(tasks, "title").map((t) => t.id),
    ["b", "c", "d", "a"],
  );
  assert.deepEqual(sortTasks(tasks, "manual"), before);
  assert.deepEqual(tasks, before);
});

test("equal sort keys preserve dragged order and invalid orders use manual order", () => {
  const { tasks } = fixture();
  tasks.forEach((t) => {
    t.date = "";
    t.priority = 1;
  });
  assert.deepEqual(sortTasks(tasks, "date"), tasks);
  assert.deepEqual(sortTasks(tasks, "priority"), tasks);
  assert.deepEqual(sortTasks(tasks, "unknown"), tasks);
});

test("search combines trimmed case-insensitive words across notes, tags, subtasks and list names", () => {
  const { tasks, lists } = fixture();
  for (const query of [
    "  ",
    "design REVIEW",
    "设计 灵感",
    "工作事务 方案",
    "方案 10",
  ]) {
    assert.equal(matchesSearch(tasks[0], query, lists), true, query);
  }
  assert.equal(matchesSearch(tasks[0], "生活日常", lists), false);
  assert.equal(matchesSearch(tasks[0], "design missing", lists), false);
  assert.equal(matchesSearch(tasks[3], "收集箱", lists), true);
});

test("renaming and recoloring a list preserves task references and produces a valid backup", () => {
  const data = fixture(),
    tasks = structuredClone(data.tasks);
  assert.equal(updateList(data, "work", "  项目计划  ", "#aBcDeF"), true);
  assert.equal(data.lists[0].name, "项目计划");
  assert.equal(data.lists[0].color, "#aBcDeF");
  assert.deepEqual(data.tasks, tasks);
  assert.deepEqual(parseBackup(JSON.stringify(data)), data);
  assert.equal(matchesSearch(data.tasks[0], "项目计划", data.lists), true);
});

test("invalid list edits and missing list deletion leave data intact", () => {
  const data = fixture(),
    before = structuredClone(data);
  for (const args of [
    ["work", " ", "#123456"],
    ["work", "a".repeat(31), "#123456"],
    ["work", "名字", "red"],
    ["missing", "名字", "#123456"],
  ]) {
    assert.equal(updateList(data, ...args), false);
    assert.deepEqual(data, before);
  }
  assert.equal(removeList(data, "missing"), false);
  assert.equal(removeList(data, "inbox"), false);
  assert.deepEqual(data, before);
});

test("deleting a list moves unfinished and completed tasks to inbox and preserves all other fields and ordering", () => {
  const data = fixture(),
    before = structuredClone(data);
  assert.equal(removeList(data, "work"), true);
  assert.deepEqual(data.lists, [before.lists[1]]);
  assert.deepEqual(
    data.tasks,
    before.tasks.map((t) => ({
      ...t,
      list: t.list === "work" ? "inbox" : t.list,
    })),
  );
  assert.deepEqual(parseBackup(JSON.stringify(data)), data);
  assert.equal(removeList(data, "work"), false);
});
