import { stages, statusOf } from "./board-model.js";
import { isOverdue } from "./deadline-model.js";
export function renderCard({
  t,
  icon,
  esc,
  bulkCheckboxHtml,
  deadlineHtml,
  taskSort,
  bulkMode,
}) {
  const stage = statusOf(t);
  return `<article class="kanban-card ${stage === "done" ? "card-completed" : ""}" draggable="${taskSort === "manual" && !bulkMode}" data-task="${t.id}" tabindex="0" aria-label="编辑任务：${esc(t.title)}"><div class="card-top">${bulkCheckboxHtml(t)}<span class="drag-handle" title="${taskSort === "manual" ? "拖动调整顺序" : "切换到手动顺序后可拖动"}">⠿</span><button class="card-more" data-select="${t.id}" title="编辑${esc(t.title)}">${icon("more", 19)}</button></div><h3 class="kanban-card-title">${esc(t.title)}</h3>${t.notes ? `<p class="kanban-card-description">${esc(t.notes)}</p>` : ""}${deadlineHtml(t)}<div class="card-bottom"><span class="card-caption">${stage === "done" ? (t.completedAt ? `${esc(t.completedAt.slice(5).replace("-", "月"))}日 完成` : "已完成") : t.subtasks.length ? `${t.subtasks.filter((s) => s.done).length} / ${t.subtasks.length} 子任务` : ""}</span><select class="card-status" data-status-task="${t.id}" aria-label="${esc(t.title)}的状态">${stages.map((s) => `<option value="${s.id}" ${s.id === stage ? "selected" : ""}>${s.name}</option>`).join("")}</select></div></article>`;
}
