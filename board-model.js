export const stages = [
  { id: "planning", name: "待规划" },
  { id: "todo", name: "待办" },
  { id: "doing", name: "进行中" },
  { id: "done", name: "已完成" },
];
export function statusOf(task) {
  if (task.done) return "done";
  if (stages.some((s) => s.id === task.status && s.id !== "done"))
    return task.status;
  return task.subtasks?.some((s) => s.done)
    ? "doing"
    : task.date
      ? "todo"
      : "planning";
}
export function setStatus(task, status, date) {
  if (!stages.some((s) => s.id === status)) return;
  const previous = statusOf(task);
  if (status === "done" && previous !== "done") task.previousStatus = previous;
  task.status = status;
  task.done = status === "done";
  if (task.done) task.completedAt = task.completedAt || date;
  else delete task.completedAt;
}
export function moveTask(tasks, id, status, beforeId, date) {
  const index = tasks.findIndex((t) => t.id === id);
  if (index < 0 || id === beforeId || !stages.some((s) => s.id === status))
    return false;
  const [task] = tasks.splice(index, 1);
  setStatus(task, status, date);
  const target = beforeId ? tasks.findIndex((t) => t.id === beforeId) : -1;
  if (target >= 0) tasks.splice(target, 0, task);
  else tasks.push(task);
  return true;
}
