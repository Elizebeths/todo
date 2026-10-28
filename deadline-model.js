// Compare calendar dates directly so local deadlines do not shift with time zones.
export function isOverdue(task, today) {
  return !task.done && Boolean(task.date) && task.date < today;
}

export function matchesDeadline(task, filter, today) {
  if (filter === "overdue") return isOverdue(task, today);
  if (filter === "today") return !task.done && task.date === today;
  return true;
}

export function deadlineInfo(task, today) {
  if (!task.date) return null;
  const overdue = isOverdue(task, today);
  const date = task.date === today ? "今天" : task.date;
  return {
    overdue,
    label: `${overdue ? "已逾期 · " : ""}${date}${task.time ? " " + task.time : ""}`,
  };
}

export function rescheduleToToday(task, today) {
  if (!isOverdue(task, today)) return false;
  task.date = today;
  return true;
}
