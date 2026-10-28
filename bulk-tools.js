import { stages, setStatus } from "./board-model.js";

// Validate the entire change before touching any selected task.
export function updateTasks(data, ids, changes, today) {
  if (
    changes.status !== undefined &&
    !stages.some((s) => s.id === changes.status)
  )
    throw new Error("请选择有效状态");
  if (
    changes.list !== undefined &&
    changes.list !== "inbox" &&
    !data.lists.some((l) => l.id === changes.list)
  )
    throw new Error("清单不存在");
  if (
    changes.priority !== undefined &&
    ![0, 1, 2, 3].includes(changes.priority)
  )
    throw new Error("请选择有效优先级");
  if (
    changes.date !== undefined &&
    changes.date !== "" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(changes.date) ||
      !Number.isFinite(Date.parse(changes.date)) ||
      new Date(changes.date).toISOString().slice(0, 10) !== changes.date)
  )
    throw new Error("请选择有效日期");
  const selected = new Set(ids);
  let count = 0;
  for (const task of data.tasks) {
    if (!selected.has(task.id)) continue;
    for (const key of ["list", "date", "priority"])
      if (changes[key] !== undefined) task[key] = changes[key];
    if (changes.status !== undefined) setStatus(task, changes.status, today);
    count++;
  }
  return count;
}

export function deleteTasks(data, ids, now = Date.now()) {
  const selected = new Set(ids);
  const removed = data.tasks.flatMap((task, index) =>
    selected.has(task.id) ? [{ task, index }] : [],
  );
  if (data.schemaVersion) {
    data.trash ||= [];
    data.trash = data.trash.filter((r) => now - r.deletedAt < 30 * 86400000);
    if (data.trash.length + removed.length > 1000)
      throw new Error("回收站已满，请先导出备份或清理回收站");
    data.trash.push(
      ...removed.map((r) => ({ ...structuredClone(r), deletedAt: now })),
    );
  }
  data.tasks = data.tasks.filter((task) => !selected.has(task.id));
  return removed;
}

// Restore only deleted tasks, so edits made since deletion remain intact.
export function restoreDeleted(data, removed) {
  let count = 0;
  for (const { task, index } of [...removed].sort(
    (a, b) => a.index - b.index,
  )) {
    if (data.tasks.some((t) => t.id === task.id)) continue;
    if (task.list !== "inbox" && !data.lists.some((l) => l.id === task.list))
      task.list = "inbox";
    data.tasks.splice(Math.min(index, data.tasks.length), 0, task);
    if (data.trash)
      data.trash = data.trash.filter((r) => r.task.id !== task.id);
    count++;
  }
  return count;
}
