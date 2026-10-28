import { stages, statusOf } from "./board-model.js";
import { validRule } from "./recurrence.js";

const fail = () => {
  throw new Error("备份格式无效，请选择日序导出的 JSON 文件");
};
const object = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => typeof value === "string";
const id = (value) => text(value) && /^[a-zA-Z0-9_-]+$/.test(value);
const date = (value) =>
  text(value) &&
  (value === "" ||
    (/^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) &&
      new Date(value).toISOString().slice(0, 10) === value));
const reserved = new Set([
  "inbox",
  "today",
  "week",
  "all",
  "completed",
  "calendar",
  "kanban",
]);

export function parseBackup(source) {
  let backup;
  try {
    backup = JSON.parse(source);
  } catch {
    fail();
  }
  if (
    object(backup) &&
    backup.schemaVersion !== undefined &&
    (!Number.isInteger(backup.schemaVersion) ||
      backup.schemaVersion < 1 ||
      backup.schemaVersion > 2)
  )
    throw new Error(
      "此备份来自不支持的数据版本，请使用新版日序打开；原数据不会改写",
    );
  if (
    !object(backup) ||
    !Array.isArray(backup.lists) ||
    !Array.isArray(backup.tasks)
  )
    fail();
  const listIds = new Set();
  const lists = backup.lists.map((list) => {
    if (
      !object(list) ||
      !id(list.id) ||
      reserved.has(list.id) ||
      listIds.has(list.id) ||
      !text(list.name) ||
      !list.name.trim() ||
      !/^#[0-9a-f]{6}$/i.test(list.color)
    )
      fail();
    listIds.add(list.id);
    return { id: list.id, name: list.name, color: list.color };
  });
  const taskIds = new Set(),
    instances = new Set();
  const tasks = backup.tasks.map((task) => {
    if (
      !object(task) ||
      !id(task.id) ||
      taskIds.has(task.id) ||
      !text(task.title) ||
      !task.title.trim() ||
      !text(task.notes) ||
      !date(task.date) ||
      ![0, 1, 2, 3].includes(task.priority) ||
      typeof task.done !== "boolean" ||
      (task.list !== "inbox" && !listIds.has(task.list))
    )
      fail();
    if (
      !Array.isArray(task.tags) ||
      !task.tags.every(text) ||
      !Array.isArray(task.subtasks) ||
      !task.subtasks.every(
        (sub) => object(sub) && text(sub.text) && typeof sub.done === "boolean",
      )
    )
      fail();
    if (
      task.status !== undefined &&
      !stages.some((stage) => stage.id === task.status)
    )
      fail();
    if (
      task.previousStatus !== undefined &&
      !stages.some(
        (stage) => stage.id === task.previousStatus && stage.id !== "done",
      )
    )
      fail();
    if (task.completedAt !== undefined && !date(task.completedAt)) fail();
    if (
      task.time !== undefined &&
      (!text(task.time) ||
        (task.time !== "" && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time)))
    )
      fail();
    taskIds.add(task.id);
    const result = {
      id: task.id,
      title: task.title,
      notes: task.notes,
      date: task.date,
      priority: task.priority,
      done: task.done,
      list: task.list,
      tags: [...task.tags],
      subtasks: task.subtasks.map((sub) => ({
        text: sub.text,
        done: sub.done,
      })),
      status: statusOf(task),
    };
    if (task.repeat !== undefined && (!validRule(task.repeat) || !task.date))
      fail();
    if (task.repeat) {
      const identity = task.repeat.id + ":" + (task.instanceDate || task.date);
      if (instances.has(identity)) fail();
      instances.add(identity);
    }
    if (task.instanceDate !== undefined && !date(task.instanceDate)) fail();
    if (task.generatedDate !== undefined && !date(task.generatedDate)) fail();
    for (const key of [
      "generatedDate",
      "repeat",
      "instanceDate",
      "time",
      "completedAt",
      "previousStatus",
    ])
      if (task[key] !== undefined) result[key] = task[key];
    return result;
  });
  const result = { lists, tasks };
  if (backup.schemaVersion !== undefined) {
    Object.assign(result, {
      schemaVersion: 2,
      revision: backup.revision ?? 0,
      source: backup.source ?? "legacy",
      appVersion: backup.appVersion ?? "",
      exportedAt: backup.exportedAt ?? "",
    });
    if (
      !Number.isSafeInteger(result.revision) ||
      result.revision < 0 ||
      !text(result.source) ||
      !text(result.appVersion) ||
      !text(result.exportedAt)
    )
      fail();
    for (const key of ["events", "sessions", "trash"]) {
      const rows = backup[key] ?? [];
      if (
        !Array.isArray(rows) ||
        rows.length >
          (key === "events" ? 10000 : key === "sessions" ? 5000 : 1000)
      )
        fail();
      const rowIds = new Set();
      result[key] = rows.map((row) => {
        if (!object(row)) fail();
        if (key === "trash") {
          if (
            !Number.isFinite(row.deletedAt) ||
            !Number.isInteger(row.index) ||
            row.index < 0 ||
            !object(row.task)
          )
            fail();
          const task = {
            ...row.task,
            list:
              row.task.list === "inbox" || listIds.has(row.task.list)
                ? row.task.list
                : "inbox",
          };
          const validated = parseBackup(
            JSON.stringify({ lists, tasks: [task] }),
          ).tasks[0];
          return { ...row, task: { ...validated, list: row.task.list } };
        }
        if (
          !id(row.id) ||
          !text(row.taskId) ||
          !text(row.title) ||
          !date(row.date) ||
          !row.date
        )
          fail();
        if (
          key === "events" &&
          (!Number.isFinite(row.at) || typeof row.overdue !== "boolean")
        )
          fail();
        if (
          key === "sessions" &&
          (!["completed", "ended", "cancelled"].includes(row.outcome) ||
            !Number.isFinite(row.duration) ||
            row.duration < 0 ||
            !Number.isFinite(row.endedAt))
        )
          fail();
        if (rowIds.has(row.id)) fail();
        rowIds.add(row.id);
        return { ...row };
      });
    }
    result.focus = backup.focus ?? null;
    const f = result.focus;
    if (
      f &&
      (!object(f) ||
        !id(f.id) ||
        !text(f.taskId) ||
        !text(f.title) ||
        !Number.isFinite(f.duration) ||
        f.duration <= 0 ||
        f.duration > 10800000 ||
        !Number.isFinite(f.remaining) ||
        f.remaining < 0 ||
        f.remaining > f.duration ||
        !Number.isFinite(f.deadline) ||
        !Number.isFinite(f.startedAt) ||
        typeof f.paused !== "boolean" ||
        !Number.isFinite(f.breakMinutes))
    )
      fail();
  }
  return result;
}

// Persist first: callers only replace the visible state after this succeeds.
export function restoreBackup(backup, storage) {
  const validated = parseBackup(JSON.stringify(backup));
  storage.setItem("daylight-v1", JSON.stringify(validated));
  return validated;
}

// Reading and migration are side-effect free, including when storage is unavailable.
export function loadData(getStorage, initial) {
  try {
    const source = getStorage().getItem("daylight-v1");
    return {
      data: parseBackup(source === null ? JSON.stringify(initial) : source),
      warning: "",
    };
  } catch (error) {
    return {
      data: parseBackup(JSON.stringify(initial)),
      warning: `${error.message || "无法读取本地数据"}。自动保存已暂停，原存储未改写；请导出原始数据或恢复备份。`,
    };
  }
}

// A failed startup read must never allow sample data to overwrite the original.
export function saveData(getStorage, data, readWarning = "") {
  if (readWarning) return { saved: false, warning: readWarning };
  try {
    getStorage().setItem("daylight-v1", JSON.stringify(data));
    return { saved: true, warning: "" };
  } catch {
    return {
      saved: false,
      warning:
        "修改尚未保存，刷新或关闭页面会丢失。请导出备份，或检查浏览器存储权限和可用空间后重试。",
    };
  }
}
