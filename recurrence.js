// Calendar arithmetic uses date-only UTC values: travel never shifts an instance date.
export const validDate = (value) =>
  typeof value === "string" &&
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) &&
  new Date(value).toISOString().slice(0, 10) === value;
export function addDays(date, n) {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function validRule(r) {
  return (
    r &&
    ["daily", "weekly", "monthly"].includes(r.kind) &&
    ["scheduled", "completed"].includes(r.basis) &&
    typeof r.id === "string" &&
    /^[\w-]+$/.test(r.id) &&
    typeof r.paused === "boolean" &&
    Number.isInteger(r.remaining) &&
    r.remaining >= 0 &&
    r.remaining <= 10000 &&
    (r.until === "" || validDate(r.until)) &&
    Number.isInteger(r.monthDay) &&
    r.monthDay >= 1 &&
    r.monthDay <= 31 &&
    Array.isArray(r.weekdays) &&
    r.weekdays.length > 0 &&
    r.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  );
}
export function nextDate(rule, scheduled, completed) {
  if (
    !validRule(rule) ||
    rule.paused ||
    rule.remaining === 1 ||
    !validDate(scheduled)
  )
    return "";
  const base = rule.basis === "completed" ? completed : scheduled;
  let next;
  if (rule.kind === "daily") next = addDays(base, 1);
  if (rule.kind === "weekly") {
    for (let i = 1; i <= 7; i++) {
      const candidate = addDays(base, i);
      if (rule.weekdays.includes(new Date(`${candidate}T12:00Z`).getUTCDay())) {
        next = candidate;
        break;
      }
    }
  }
  if (rule.kind === "monthly") {
    const d = new Date(`${base}T12:00Z`);
    const year = d.getUTCFullYear(),
      month = d.getUTCMonth() + 1;
    next = new Date(
      Date.UTC(
        year,
        month,
        Math.min(
          rule.monthDay,
          new Date(Date.UTC(year, month + 1, 0)).getUTCDate(),
        ),
        12,
      ),
    )
      .toISOString()
      .slice(0, 10);
  }
  return next && (!rule.until || next <= rule.until) ? next : "";
}
export function reconcileTasks(data, before, today, now = Date.now()) {
  data.events ||= [];
  data.trash ||= [];
  data.sessions ||= [];
  const previous = new Map(before.tasks.map((t) => [t.id, t]));
  const identities = new Set(
    [...data.tasks, ...data.trash.map((r) => r.task)]
      .filter((t) => t.repeat)
      .map((t) => `${t.repeat.id}:${t.instanceDate || t.date}`),
  );
  for (const event of data.events)
    if (event.nextInstance) identities.add(event.nextInstance);
  for (const task of [...data.tasks]) {
    const old = previous.get(task.id);
    if (!task.done || !old || old.done) continue;
    const event = {
      id: crypto.randomUUID(),
      taskId: task.id,
      title: task.title,
      date: today,
      overdue: Boolean(task.date && task.date < today),
      at: now,
    };
    data.events.push(event);
    if (!task.repeat) continue;
    const date = nextDate(task.repeat, task.date, today);
    if (!date) continue;
    if (task.generatedDate === date) continue;
    task.generatedDate = date;
    event.nextInstance = `${task.repeat.id}:${date}`;
    if (identities.has(event.nextInstance)) continue;
    const next = structuredClone(task);
    Object.assign(next, {
      id: crypto.randomUUID(),
      date,
      instanceDate: date,
      done: false,
      status: "todo",
      subtasks: task.subtasks.map((s) => ({ ...s, done: false })),
    });
    delete next.generatedDate;
    delete next.completedAt;
    delete next.previousStatus;
    if (next.repeat.remaining > 1) next.repeat.remaining--;
    data.tasks.push(next);
    identities.add(`${next.repeat.id}:${date}`);
  }
  data.events = data.events.slice(-10000);
  data.sessions = data.sessions.slice(-5000);
  data.trash = data.trash.filter((r) => now - r.deletedAt < 30 * 86400000);
}
