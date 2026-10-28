import { updateTasks } from "./bulk-tools.js";
import { validDate } from "./recurrence.js";
export const TASK_FIELDS = Object.freeze([
  "title",
  "notes",
  "list",
  "date",
  "time",
  "priority",
  "tags",
  "subtasks",
  "status",
]);
export function editTask(data, id, patch, today) {
  const task = data.tasks.find((t) => t.id === id);
  if (!task) throw new Error("任务不存在");
  for (const key of Object.keys(patch))
    if (!TASK_FIELDS.includes(key)) throw new Error("不支持的任务字段");
  if (
    patch.title !== undefined &&
    (typeof patch.title !== "string" ||
      !patch.title.trim() ||
      patch.title.length > 200)
  )
    throw new Error("任务名称应为 1–200 个字符");
  if (patch.notes !== undefined && typeof patch.notes !== "string")
    throw new Error("备注格式无效");
  if (patch.date !== undefined && patch.date !== "" && !validDate(patch.date))
    throw new Error("日期无效");
  if (
    patch.time !== undefined &&
    patch.time !== "" &&
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(patch.time)
  )
    throw new Error("时间无效");
  if (
    patch.tags !== undefined &&
    (!Array.isArray(patch.tags) ||
      !patch.tags.every((s) => typeof s === "string"))
  )
    throw new Error("标签格式无效");
  if (
    patch.subtasks !== undefined &&
    (!Array.isArray(patch.subtasks) ||
      !patch.subtasks.every(
        (s) => s && typeof s.text === "string" && typeof s.done === "boolean",
      ))
  )
    throw new Error("子任务格式无效");
  // Validate all fields before mutating either completion state or task content.
  updateTasks(data, [id], patch, today);
  for (const key of ["title", "notes", "time", "tags", "subtasks"])
    if (patch[key] !== undefined) task[key] = structuredClone(patch[key]);
  return task;
}
