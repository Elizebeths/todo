import { stages, statusOf } from "./board-model.js";
import { isOverdue } from "./deadline-model.js";
export function renderCalendar({
  filtered,
  month,
  weekMode,
  today,
  esc,
  workspaceTools,
}) {
  const buckets = new Map();
  for (const t of filtered()) {
    if (!buckets.has(t.date)) buckets.set(t.date, []);
    buckets.get(t.date).push(t);
  }
  const year = month.getFullYear(),
    m = month.getMonth(),
    offset = weekMode ? 0 : (new Date(year, m, 1).getDay() + 6) % 7,
    days = weekMode ? 7 : new Date(year, m + 1, 0).getDate();
  const start = weekMode
    ? workspaceTools.weekStart(month)
    : `${year}-${String(m + 1).padStart(2, "0")}-01`;
  return `<div class="calendar-top"><h2>${weekMode ? "周计划 · " + start : year + " 年 " + (m + 1) + " 月"}</h2><div><button class="icon-button" data-month="-1" aria-label="上一期">‹</button><button class="text-button" data-calendar-today>今天</button><button class="text-button" data-calendar-mode>${weekMode ? "月历" : "周计划"}</button><button class="icon-button" data-month="1" aria-label="下一期">›</button></div></div><div class="calendar-grid">${["一", "二", "三", "四", "五", "六", "日"].map((d) => `<div class="weekday">${d}</div>`).join("")}${Array.from({ length: offset }, () => '<div class="calendar-day muted"></div>').join("")}${Array.from(
    { length: days },
    (_, i) => {
      const d = workspaceTools.addDays(start, i),
        items = buckets.get(d) || [];
      return `<div class="calendar-day ${d === today ? "is-today" : ""}"><button class="day-number" data-new-date="${d}" aria-label="${d} 新建任务">${Number(d.slice(-2))} +</button>${items
        .slice(0, 3)
        .map(
          (t) =>
            `<button class="calendar-task ${t.done ? "done" : ""}" data-select="${t.id}">${esc(t.title)}</button>`,
        )
        .join("")}${
        items.length > 3
          ? `<details><summary>还有 ${items.length - 3} 项</summary>${items
              .slice(3)
              .map(
                (t) =>
                  `<button class="calendar-task" data-select="${t.id}">${esc(t.title)}</button>`,
              )
              .join("")}</details>`
          : ""
      }</div>`;
    },
  ).join("")}</div>`;
}
