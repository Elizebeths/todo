import { stages, statusOf } from "./board-model.js";
import { isOverdue } from "./deadline-model.js";
export function renderTask({
  t,
  icon,
  esc,
  listOf,
  bulkCheckboxHtml,
  deadlineHtml,
  selected,
}) {
  const list = listOf(t);
  return `<article class="task ${t.done ? "done" : ""} ${t.id === selected ? "selected" : ""}" data-task="${t.id}" tabindex="0" aria-label="编辑任务：${esc(t.title)}">${bulkCheckboxHtml(t)}<button class="checkbox p${t.priority} ${t.done ? "checked" : ""}" data-complete="${t.id}" title="${t.done ? "标记为未完成" : "完成任务"}">${t.done ? icon("check", 12) : ""}</button><div class="task-body"><div class="task-title">${esc(t.title)}</div><div class="task-meta">${deadlineHtml(t)}${t.tags.map((tag) => `<span class="tag">${esc(tag)}</span>`).join("")}${t.subtasks.length ? `<span>${icon("list", 12)} ${t.subtasks.filter((s) => s.done).length}/${t.subtasks.length}</span>` : ""}${t.time && !t.date ? `<span class="task-time">${icon("clock", 12)} ${t.time}</span>` : ""}<span class="task-list-name"><i style="background:${list.color}"></i>${esc(list.name)}</span></div></div>${t.priority ? `<span class="priority p${t.priority}" title="${["无优先级", "高优先级", "中优先级", "低优先级"][t.priority]}">${icon("flag", 15)}</span>` : ""}<button class="row-more icon-button" title="编辑任务" data-select="${t.id}">${icon("more", 17)}</button></article>`;
}
