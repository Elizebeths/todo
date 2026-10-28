import { editTask } from "./task-commands.js";
import { renderCard } from "./card-view.js";
import { renderTask } from "./task-view.js";
import { renderCalendar } from "./calendar-view.js";
import { renderDetail } from "./detail-view.js";
import { createRepository, envelope, APP_VERSION } from "./storage.js";
import { reconcileTasks } from "./recurrence.js";
import {
  installWorkspaceTools,
  preferences,
  persistPreferences,
  matchesExtra,
} from "./workspace-tools.js";
import {
  startSession,
  sessionState,
  pauseSession,
  resumeSession,
  finishSession,
} from "./focus-session.js";
import { updateTasks, deleteTasks, restoreDeleted } from "./bulk-tools.js";
import {
  sortOptions,
  sortTasks,
  matchesSearch,
  updateList,
  removeList,
} from "./task-tools.js";
import {
  isOverdue,
  matchesDeadline,
  deadlineInfo,
  rescheduleToToday,
} from "./deadline-model.js";
import { parseBackup, loadData } from "./backup.js";
import { stages, statusOf, setStatus, moveTask } from "./board-model.js";
// One floating tooltip also serves controls created by later renders and dialogs.
const tooltip = document.createElement("div");
tooltip.id = "icon-tooltip";
tooltip.className = "icon-tooltip";
tooltip.setAttribute("role", "tooltip");
tooltip.hidden = true;
document.body.append(tooltip);
let owner = null;

function hideTooltip() {
  if (owner) {
    const ids = (owner.getAttribute("aria-describedby") || "")
      .split(" ")
      .filter((id) => id && id !== tooltip.id);
    if (ids.length) owner.setAttribute("aria-describedby", ids.join(" "));
    else owner.removeAttribute("aria-describedby");
  }
  owner = null;
  tooltip.hidden = true;
}

function showTooltip(target) {
  const control =
    target instanceof Element
      ? target.closest("[title], [data-tooltip]")
      : null;
  if (control === owner) return;
  hideTooltip();
  if (!control) return;
  const label =
    control.getAttribute("data-tooltip") || control.getAttribute("title");
  if (!label) return;
  // Suppress the delayed native tooltip so the label only appears once.
  control.setAttribute("data-tooltip", label);
  control.removeAttribute("title");
  if (
    control.matches("button") &&
    !control.textContent.trim() &&
    !control.hasAttribute("aria-label")
  ) {
    control.setAttribute("aria-label", label);
  }
  owner = control;
  control.setAttribute(
    "aria-describedby",
    [control.getAttribute("aria-describedby"), tooltip.id]
      .filter(Boolean)
      .join(" "),
  );
  tooltip.textContent = label;
  tooltip.hidden = false;
  const rect = control.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width - box.width) / 2;
  let top = rect.bottom + 8;
  if (top + box.height > window.innerHeight - 8)
    top = rect.top - box.height - 8;
  tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

document.addEventListener("pointerover", (event) => {
  if (event.pointerType !== "touch") showTooltip(event.target);
});
document.addEventListener("pointerout", (event) => {
  if (owner?.contains(event.target) && !owner.contains(event.relatedTarget))
    hideTooltip();
});
document.addEventListener("focusin", (event) => showTooltip(event.target));
document.addEventListener("focusout", hideTooltip);
document.addEventListener("pointerdown", hideTooltip);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") hideTooltip();
});
document.addEventListener("scroll", hideTooltip, true);
window.addEventListener("resize", hideTooltip);
// Rendering a new view must not leave a detached control's label on screen.
new MutationObserver(() => {
  if (owner && !owner.isConnected) hideTooltip();
}).observe(document.querySelector("#app"), { childList: true, subtree: true });

const paths = {
  check: "m5 12 4 4L19 6",
  sun: "M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 1.4 1.4m10 10 1.4 1.4M5.6 18.4 1.4-1.4m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0",
  calendar: "M5 5h14v15H5zM8 3v4m8-4v4M5 10h14m-10 4h1m4 0h1",
  inbox: "M4 5h16l2 13H2L4 5zm-1 8h5l2 3h4l2-3h5",
  grid: "M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z",
  search: "M21 21l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0",
  plus: "M12 5v14M5 12h14",
  chevron: "m9 5 7 7-7 7",
  down: "m6 9 6 6 6-6",
  flag: "M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12h4",
  clock: "M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  list: "M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1",
  close: "m6 6 12 12M6 18 18 6",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  tag: "M3 3h8l10 10-8 8L3 11zM7 7h.01",
  folder: "M3 7V4h6l3 3h9v13H3z",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  leaf: "M20 3C7 2 2 9 7 17c8 5 15 0 13-14zM4 21 16 9",
  logout: "M9 4H4v16h5m4-13 5 5-5 5m-5-5h10",
  download: "M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5",
  moon: "M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12",
  board: "M4 4h16v16H4zM12 4v16M4 10h8m0 4h8",
};
const icon = (name, size = 20) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.list}"/></svg>`;
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const day = (offset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
let today = day();
const initial = {
  lists: [
    { id: "work", name: "工作事务", color: "#8b7bda" },
    { id: "life", name: "生活日常", color: "#68b397" },
    { id: "learn", name: "自我成长", color: "#d5a466" },
  ],
  tasks: [
    {
      id: "1",
      title: "完成品牌官网的设计方案",
      list: "work",
      date: today,
      priority: 1,
      notes:
        "整理设计思路，让每一个细节都有迹可循。\n\n设计方向：简洁、自然、有温度。",
      tags: ["设计"],
      subtasks: [
        { text: "收集灵感与参考", done: true },
        { text: "梳理页面结构", done: true },
        { text: "完成首页视觉设计", done: false },
      ],
      done: false,
    },
    {
      id: "2",
      title: "和产品团队同步本周进度",
      list: "work",
      date: today,
      priority: 2,
      time: "14:00",
      notes: "回顾本周进展，确认下一步的优先事项。",
      tags: ["会议"],
      subtasks: [],
      done: false,
    },
    {
      id: "3",
      title: "阅读《原子习惯》30 分钟",
      list: "learn",
      date: today,
      priority: 0,
      notes: "每天进步一点点。",
      tags: ["阅读"],
      subtasks: [],
      done: false,
    },
    {
      id: "4",
      title: "傍晚去公园散步",
      list: "life",
      date: today,
      priority: 0,
      time: "18:30",
      notes: "放下手机，给自己一点留白。",
      tags: [],
      subtasks: [],
      done: false,
    },
    {
      id: "5",
      title: "整理下周的工作计划",
      list: "work",
      date: today,
      priority: 3,
      notes: "",
      tags: [],
      subtasks: [],
      done: false,
    },
    {
      id: "6",
      title: "喝一杯温水，开启新的一天",
      list: "life",
      date: today,
      priority: 0,
      notes: "",
      tags: [],
      subtasks: [],
      done: true,
    },
    {
      id: "7",
      title: "整理桌面，给专注留一点空间",
      list: "life",
      date: today,
      priority: 0,
      notes: "",
      tags: [],
      subtasks: [],
      done: true,
    },
    {
      id: "8",
      title: "准备周末的短途旅行",
      list: "life",
      date: day(2),
      priority: 2,
      notes: "选一处安静的地方走走。",
      tags: ["生活"],
      subtasks: [],
      done: false,
    },
    {
      id: "9",
      title: "学习一个新的交互设计技巧",
      list: "learn",
      date: day(1),
      priority: 0,
      notes: "",
      tags: [],
      subtasks: [],
      done: false,
    },
    {
      id: "10",
      title: "记录突然想到的好点子",
      list: "inbox",
      date: "",
      priority: 0,
      notes: "",
      tags: [],
      subtasks: [],
      done: false,
    },
  ],
};
const loaded = loadData(() => localStorage, initial);
let data = envelope(loaded.data);
let baseline = structuredClone(data),
  repository,
  externalRaw = null,
  conflictPending = false,
  dirty = false,
  draftComposing = false;
try {
  repository = createRepository({
    storage: localStorage,
    locks: navigator.locks,
    onExternal: handleExternal,
  });
} catch {}
let readWarning = loaded.warning,
  saveWarning = loaded.warning;
let deadlineFilter = "all",
  taskSort = preferences.sort || "manual";
let weekMode = !!preferences.weekMode;
let bulkMode = false,
  bulkIds = new Set(),
  deletedTasks = [];
let view = preferences.view || "kanban",
  selected = null,
  query = "",
  priorityOnly = false,
  board = false,
  showDone = preferences.showDone ?? true,
  month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const app = document.querySelector("#app"),
  overlay = document.querySelector("#overlay");
// Loaded tasks already have a stable stage; startup never overwrites stored data.
function save() {
  dirty = true;
  if (conflictPending) {
    updateStorageStatus();
    return Promise.resolve(false);
  }
  if (readWarning || !repository) {
    saveWarning = readWarning || "无法访问存储，请导出备份";
    updateStorageStatus();
    return Promise.resolve(false);
  }
  reconcileTasks(data, baseline, day());
  baseline = structuredClone(data);
  const snapshot = structuredClone(data);
  saveWarning = "正在保存…";
  updateStorageStatus();
  return repository
    .write(snapshot)
    .then((saved) => {
      data.revision = saved.revision;
      if (repository.pending <= 1) {
        dirty = false;
        saveWarning = "";
      }
      updateStorageStatus();
      return true;
    })
    .catch((error) => {
      if (error.code === "STALE_WRITE") return false;
      saveWarning = error.message.includes("其他页面")
        ? error.message
        : `保存失败，请导出备份并检查权限、可用空间：${error.message}`;
      if (error.message.includes("其他页面")) conflictPending = true;
      updateStorageStatus();
      toast(error.message);
      return false;
    });
}
function handleExternal(raw) {
  if (!dirty && !repository.pending && !draftComposing && !overlay.innerHTML) {
    try {
      if (raw === null) throw new Error("其他页面清除了数据");
      data = envelope(parseBackup(raw));
      baseline = structuredClone(data);
      repository.accept(raw);
      render();
      toast("已同步其他页面的修改");
      return;
    } catch (error) {
      saveWarning = error.message.includes("其他页面")
        ? error.message
        : `保存失败，请导出备份并检查权限、可用空间：${error.message}`;
    }
  }
  externalRaw = raw;
  conflictPending = true;
  saveWarning = "其他页面已更新数据，本页修改已保留，请处理冲突";
  updateStorageStatus();
}
window.addEventListener("storage", (event) => {
  if (event.key === "daylight-v1" || event.key === null)
    repository?.external(event.newValue);
});
window.addEventListener("beforeunload", (event) => {
  if (dirty || draftComposing) {
    event.preventDefault();
    event.returnValue = "";
  }
});
function download(value, name) {
  const url = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type: "application/json" },
    ),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function resolveConflict() {
  let remote;
  try {
    remote = localStorage.getItem("daylight-v1");
  } catch {
    return toast("无法读取存储，请导出本页数据");
  }
  modal(
    `<h2>选择保留的数据</h2><p>两个页面的修改不会自动合并。先导出两份数据，再选择继续使用的版本。</p><button id="export-both" class="primary-button">导出两份数据</button><button id="use-remote" class="text-button">使用存储中的版本</button><button id="use-local" class="text-button">用本页版本替换（先建恢复点）</button><p id="conflict-error" role="alert"></p>`,
  );
  overlay.querySelector("#export-both").onclick = () => {
    download(envelope(data), `日序-本页-${today}.json`);
    download(remote || "{}", `日序-其他页面-${today}.json`);
  };
  overlay.querySelector("#use-remote").onclick = () => {
    try {
      if (remote === null) throw new Error("存储已清空，请导出本页数据");
      const next = envelope(parseBackup(remote));
      repository.accept(remote);
      data = next;
      baseline = structuredClone(data);
      dirty = false;
      readWarning = saveWarning = "";
      externalRaw = null;
      conflictPending = false;
      closeModal();
      render();
    } catch (e) {
      overlay.querySelector("#conflict-error").textContent = e.message;
    }
  };
  overlay.querySelector("#use-local").onclick = async () => {
    try {
      await repository.write(data, {
        replace: true,
        expected: remote,
        reason: "冲突选择本页",
      });
      baseline = structuredClone(data);
      dirty = false;
      readWarning = saveWarning = "";
      externalRaw = null;
      conflictPending = false;
      closeModal();
      render();
    } catch (e) {
      overlay.querySelector("#conflict-error").textContent = e.message;
    }
  };
}
function updateStorageStatus() {
  app.querySelectorAll("[data-save-status]").forEach((el) => {
    el.classList.toggle("save-failed", Boolean(saveWarning));
    el.innerHTML = `<span class="status-dot"></span>${saveWarning ? (saveWarning === "正在保存…" ? "正在保存…" : "修改尚未保存") : "已自动保存到此设备"}`;
  });
  app.querySelector(".storage-warning")?.remove();
  if (!saveWarning) return;
  const container =
    view === "kanban"
      ? app.querySelector(".kanban-toolbar")
      : app.querySelector(".content");
  if (!container) return;
  app.insertAdjacentHTML(
    "beforeend",
    `<div class="storage-warning" role="status"><span>${esc(saveWarning)}</span><button type="button">${readWarning || saveWarning.includes("其他页面") ? "处理数据问题" : "重试保存"}</button></div>`,
  );
  app.querySelector(".storage-warning button").onclick = () =>
    readWarning
      ? importBackup()
      : saveWarning.includes("其他页面")
        ? resolveConflict()
        : save();
}

function toast(msg) {
  const el = document.querySelector("#toast");
  el.textContent = msg;
  el.classList.add("visible");
  clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => el.classList.remove("visible"), 2500);
}
function listOf(t) {
  return (
    data.lists.find((l) => l.id === t.list) || {
      name: "收集箱",
      color: "#8e99aa",
    }
  );
}
function filtered() {
  return sortTasks(
    data.tasks.filter((t) => {
      const matches =
        view === "@overdue"
          ? isOverdue(t, today)
          : view === "today"
            ? t.date === today
            : view === "week"
              ? t.date && t.date >= today && t.date <= day(6)
              : view === "all" || view === "calendar"
                ? true
                : view === "completed"
                  ? t.done
                  : view === "inbox"
                    ? t.list === "inbox"
                    : t.list === view;
      return (
        (preferences.global || matches) &&
        matchesExtra(t) &&
        matchesSearch(t, query, data.lists) &&
        (!priorityOnly || t.priority === 1)
      );
    }),
    taskSort,
  );
}
function count(v) {
  return data.tasks.filter(
    (t) =>
      !t.done &&
      (v === "@overdue"
        ? isOverdue(t, today)
        : v === "today"
          ? t.date === today
          : v === "week"
            ? t.date && t.date >= today && t.date <= day(6)
            : v === "all"
              ? true
              : t.list === v),
  ).length;
}
function nav(v, label, ico) {
  return `<button class="nav-item ${view === v ? "active" : ""}" data-view="${v}" ${view === v ? 'aria-current="page"' : ""}>${icon(ico)}<span class="nav-label">${label}</span>${["kanban", "calendar", "completed"].includes(v) ? "" : `<span class="count">${count(v) || ""}</span>`}</button>`;
}
function sortControl() {
  return `<label class="task-sort"><span>排序</span><select data-task-sort aria-label="任务排序">${sortOptions.map(([id, label]) => `<option value="${id}" ${taskSort === id ? "selected" : ""}>${label}</option>`).join("")}</select></label>`;
}
function activeFiltersHtml() {
  const labels = [
    query.trim() ? `搜索：${query.trim()}` : "",
    priorityOnly ? "仅高优先级" : "",
    view === "kanban" && deadlineFilter !== "all"
      ? deadlineFilter === "today"
        ? "今天到期"
        : "逾期任务"
      : "",
  ].filter(Boolean);
  return labels.length
    ? `<div class="active-filters" role="status"><span>${labels.map(esc).join(" · ")}</span><button data-clear-filters>清除筛选</button></div>`
    : "";
}
function emptyTasksHtml(completedCount = 0) {
  const filtered = Boolean(query.trim() || priorityOnly);
  return `<div class="empty">${icon(filtered ? "search" : "check", 35)}<h3>${filtered ? "没有匹配的任务" : view === "completed" ? "还没有完成记录" : completedCount ? "待办都已完成" : "这里还没有任务"}</h3><p>${filtered ? "试试其他关键词，或清除筛选条件。" : view === "completed" ? "完成一项任务后，就能在这里找到它。" : "添加一件想做的小事，或者享受片刻留白。"}</p></div>`;
}
function bindTaskTools() {
  app.querySelectorAll("[data-task-sort]").forEach(
    (el) =>
      (el.onchange = () => {
        taskSort = el.value;
        render();
      }),
  );
  app.querySelectorAll("[data-clear-filters]").forEach(
    (el) =>
      (el.onclick = () => {
        query = "";
        priorityOnly = false;
        deadlineFilter = "all";
        render();
      }),
  );
  app
    .querySelectorAll("[data-edit-list]")
    .forEach((el) => (el.onclick = () => editList(el.dataset.editList)));
  app.querySelectorAll(".task[data-task]").forEach(
    (el) =>
      (el.onkeydown = (e) => {
        if (e.target === el && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          selected = el.dataset.task;
          render();
        }
      }),
  );
}
function editList(id) {
  const list = data.lists.find((l) => l.id === id);
  if (!list) return;
  modal(
    `<div class="modal-icon">${icon("folder", 26)}</div><h2>管理清单</h2><p>调整名称和颜色，让事情更容易找到。</p><form id="edit-list-form"><label class="field-label">清单名称<input name="name" value="${esc(list.name)}" required maxlength="30"></label><label class="field-label">清单颜色<input name="color" type="color" value="${list.color}"></label><button class="primary-button" type="submit">保存修改</button></form><div class="list-danger-zone"><span>不再需要这个清单？任务可以移回收集箱。</span><button class="text-button danger-text" id="delete-list">删除清单</button></div>`,
  );
  overlay.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    if (
      !updateList(
        data,
        id,
        e.target.elements.name.value,
        e.target.elements.color.value,
      )
    )
      return;
    save();
    closeModal();
    render();
    toast("清单已更新");
  };
  overlay.querySelector("#delete-list").onclick = () => confirmDeleteList(id);
}
function confirmDeleteList(id) {
  const list = data.lists.find((l) => l.id === id);
  if (!list) return;
  const count = data.tasks.filter((t) => t.list === id).length;
  modal(
    `<div class="modal-icon">${icon("folder", 26)}</div><h2>删除“${esc(list.name)}”？</h2><p>${count ? `其中 ${count} 项任务将移至收集箱（包含已完成任务）。日期、备注、状态和子任务都会保留。` : "这是一个空清单，删除后不会影响其他任务。"}</p><div class="list-confirm-actions"><button class="text-button" id="cancel-delete-list">返回编辑</button><button class="primary-button danger" id="confirm-delete-list">${count ? "移至收集箱并删除清单" : "删除空清单"}</button></div>`,
  );
  overlay.querySelector("#cancel-delete-list").onclick = () => editList(id);
  overlay.querySelector("#confirm-delete-list").onclick = () => {
    if (!removeList(data, id)) return;
    if (view === id) view = "inbox";
    save();
    closeModal();
    render();
    toast(count ? `清单已删除，${count} 项任务已移至收集箱` : "空清单已删除");
  };
}
function workspaceHtml() {
  return `
  <aside class="sidebar" aria-label="工作空间导航">
    <div class="workspace"><div class="workspace-name"><strong>日序<span>Daylight</span></strong><small>我的空间</small></div><span class="personal">个人</span></div>
    <label class="search">${icon("search", 17)}<input id="search" aria-label="搜索任务" placeholder="搜索任务" value="${esc(query)}"><kbd>⌘ K</kbd></label>
    <nav class="workspace-views" aria-label="任务视图">${nav("kanban", "看板", "board")}${nav("all", "清单", "list")}</nav>
    <div class="sidebar-scroll">
      <div class="nav-heading">任务安排</div>
      <nav class="schedule-nav" aria-label="任务安排">${nav("inbox", "收集箱", "inbox")}${nav("today", "今天", "sun")}${nav("@overdue", "逾期任务", "clock")}${nav("week", "最近 7 天", "calendar")}${nav("calendar", "日历", "calendar")}${nav("@plan", "周计划", "calendar")}</nav>
      <div class="list-heading"><span>我的清单</span><button class="icon-button" title="新建清单" aria-label="新建清单" data-action="new-list">${icon("plus", 16)}</button></div>
      <nav class="collection-nav" aria-label="我的清单">${data.lists.map((l) => `<div class="collection-item"><button class="nav-item ${view === l.id ? "active" : ""}" data-view="${l.id}" ${view === l.id ? 'aria-current="page"' : ""}><span class="list-square" style="--list-color:${l.color}" aria-hidden="true"></span><span class="nav-label">${esc(l.name)}</span><span class="count">${count(l.id) || ""}</span></button><button class="collection-edit icon-button" data-edit-list="${l.id}" aria-label="管理清单：${esc(l.name)}" title="管理清单">${icon("more", 16)}</button></div>`).join("")}</nav>
      <button class="new-list" data-action="new-list">${icon("plus", 16)}添加清单</button>
    </div>
    <div class="sidebar-bottom">
      <nav aria-label="记录与工具">${nav("completed", "已完成", "check")}<button class="nav-item" data-action="workspace-tools">${icon("grid")}<span class="nav-label">规划与数据工具</span></button><button class="nav-item" data-action="focus">${icon("clock")}<span class="nav-label">番茄专注</span></button><button class="nav-item" data-action="theme">${icon("sun")}<span class="nav-label">外观主题</span></button></nav>
      <div class="backup-tools"><button data-action="export">${icon("download", 16)}<span>导出备份</span></button><button data-action="import">${icon("folder", 16)}<span>从备份恢复</span></button></div>
      <div class="saved" data-save-status role="status"><span class="status-dot"></span>已自动保存到此设备</div>
    </div>
  </aside>`;
}
function workspaceHeader(title) {
  return `<header class="main-header"><button class="mobile-menu icon-button" title="打开工作空间导航" data-action="mobile-menu">${icon("list", 18)}</button><div class="breadcrumb">我的空间 <span>/</span> ${esc(title)}</div><div class="header-actions"><button class="theme-trigger" title="外观主题" data-action="theme">${icon("sun", 18)}<span>主题</span></button><span class="today-date">${new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" })}</span><button class="icon-button" title="查看快捷键" data-action="shortcuts">${icon("more")}</button></div></header>`;
}
let renderedSelected = null,
  renderQueued = false;
function render() {
  if (draftComposing) {
    renderQueued = true;
    return;
  }
  const active = document.activeElement;
  const id = active?.id;
  const action = active?.getAttribute("data-action");
  const status = active?.getAttribute("data-status-task");
  const priorSelected = renderedSelected;
  renderContents();
  let target;
  if (selected && selected !== priorSelected)
    target = app.querySelector("#detail-title");
  else if (id) target = app.querySelector("#" + CSS.escape(id));
  else if (status)
    target = app.querySelector(`[data-status-task="${CSS.escape(status)}"]`);
  else if (action)
    target = app.querySelector(`[data-action="${CSS.escape(action)}"]`);
  if (!selected && priorSelected)
    target = app.querySelector(`[data-task="${CSS.escape(priorSelected)}"]`);
  target?.focus({ preventScroll: true });
  renderedSelected = selected;
}
function renderContents() {
  if (view === "@plan") {
    view = "calendar";
    weekMode = true;
  } else if (view !== "calendar") weekMode = false;
  persistPreferences({ view, sort: taskSort, showDone, weekMode });
  today = day();
  syncBulkSelection();
  document.body.classList.toggle("bulk-mode", bulkMode);
  document.body.classList.toggle("kanban-home", view === "kanban");
  if (view === "kanban") {
    renderKanban();
    return;
  }
  const tasks = filtered(),
    done = tasks.filter((t) => t.done),
    pending = tasks.filter((t) => !t.done),
    percent = tasks.length ? Math.round((done.length / tasks.length) * 100) : 0;
  const title =
    {
      "@overdue": "逾期任务",
      today: "今天",
      week: "最近 7 天",
      all: "清单",
      inbox: "收集箱",
      completed: "已完成",
      calendar: "日历",
    }[view] ||
    data.lists.find((l) => l.id === view)?.name ||
    "今天";
  app.innerHTML = `${workspaceHtml()}<main class="main">${workspaceHeader(title)}<div class="content"><div class="page-heading"><div><div class="eyebrow">${view === "today" ? "MAKE ROOM FOR WHAT MATTERS" : "A LITTLE MORE ORGANIZED"}</div><h1>${view === "today" ? `<span class="sun-symbol">${icon("sun", 29)}</span>` : ""}${esc(title)}<span class="heading-count">${pending.length}</span></h1><p>${view === "today" ? "新的一天，从一件小事开始。" : view === "inbox" ? "先记下来，再慢慢安排。" : "让每一件重要的小事，都有着落。"}</p></div></div>${view === "today" ? `<section class="daily-card"><div class="daily-icon">${icon("leaf", 25)}</div><div class="daily-copy"><strong>不必匆忙，按自己的节奏来。</strong><p>每完成一件小事，都是向前的一步。</p></div><div class="progress-circle" style="--progress:${percent}%"><span>${percent}<small>%</small></span></div></section>` : ""}<form id="add-task" class="add-task">${icon("plus", 21)}<input name="title" autocomplete="off" placeholder="添加任务，开启有序的一天" required maxlength="200"><button type="submit" title="添加任务">${icon("arrow", 18)}</button></form>${view === "calendar" ? activeFiltersHtml() + bulkBarHtml() + calendarHtml() : `<div class="section-bar"><span>${icon("down", 14)}${view === "completed" ? "完成记录" : "待办任务"} <b>${view === "completed" ? done.length : pending.length}</b></span>${sortControl()}${bulkToggleHtml()}<button class="filter-button ${priorityOnly ? "on" : ""}" data-action="filter">${icon("flag", 14)}${priorityOnly ? "仅高优先级" : "筛选高优先级"}</button></div>${activeFiltersHtml()}${bulkBarHtml()}<div class="task-list ${board ? "board" : ""}">${view === "completed" ? (done.length ? done.map(taskHtml).join("") : emptyTasksHtml()) : pending.length ? pending.map(taskHtml).join("") : emptyTasksHtml(done.length)}</div>${view !== "completed" && done.length ? `<button class="completed-heading" data-action="toggle-done">${icon(showDone ? "down" : "chevron", 14)}已完成 <span>${done.length}</span></button>${showDone ? `<div class="completed-tasks">${done.map(taskHtml).join("")}</div>` : ""}` : ""}`}<footer class="main-footer"><span class="tiny-leaf">${icon("leaf", 14)}</span> 给重要的事，一点专属的时间。<span>日序 · Daylight</span></footer></div></main>${detailHtml()}`;
  bind();
  updateStorageStatus();
}
function deadlineHtml(t) {
  const info = deadlineInfo(t, today);
  return info
    ? `<span class="task-deadline ${info.overdue ? "is-overdue" : t.date === today && !t.done ? "is-due-today" : ""}">${icon("calendar", 12)}${esc(info.label)}</span>`
    : "";
}
function taskHtml(t) {
  return renderTask({
    t,
    icon,
    esc,
    listOf,
    bulkCheckboxHtml,
    deadlineHtml,
    selected,
  });
}

function detailHtml() {
  return renderDetail({
    data,
    selected,
    icon,
    esc,
    today,
    deadlineHtml,
    listOf,
  });
}

function calendarHtml() {
  return renderCalendar({
    filtered,
    month,
    weekMode,
    today,
    esc,
    workspaceTools,
  });
}

// Keep composing text in its existing control until the IME commits it.
function bindDraft(control, apply, readValue) {
  let original,
    wasDirty = false;
  control.oninput = (e) => {
    if (!e.isComposing && !draftComposing) apply(e);
  };
  control.onchange = (e) => {
    if (!draftComposing) apply(e);
  };
  control.oncompositionstart = () => {
    original = JSON.stringify(readValue());
    wasDirty = dirty;
    draftComposing = true;
    dirty = true;
  };
  control.oncompositionend = (e) => {
    draftComposing = false;
    apply(e);
    if (JSON.stringify(readValue()) === original)
      dirty = wasDirty || Boolean(repository?.pending);
    if (renderQueued) {
      renderQueued = false;
      render();
    }
  };
}
function bind() {
  workspaceTools.bind();
  app.querySelector("[data-calendar-today]")?.addEventListener("click", () => {
    month = new Date();
    render();
  });
  app.querySelector("[data-calendar-mode]")?.addEventListener("click", () => {
    weekMode = !weekMode;
    month = new Date();
    render();
  });
  app
    .querySelectorAll("[data-new-date]")
    .forEach((el) => (el.onclick = () => newCard("todo", el.dataset.newDate)));
  bindTaskTools();
  bindBulk();
  app.querySelectorAll("[data-reschedule]").forEach(
    (el) =>
      (el.onclick = () => {
        const t = data.tasks.find((t) => t.id === el.dataset.reschedule);
        if (t && rescheduleToToday(t, day())) {
          save();
          render();
          toast("已安排到今天");
        }
      }),
  );
  app.querySelectorAll("[data-view]").forEach(
    (el) =>
      (el.onclick = () => {
        view = el.dataset.view;
        selected = null;
        query = "";
        board = false;
        priorityOnly = false;
        document.body.classList.remove("nav-open");
        render();
      }),
  );
  app.querySelectorAll("[data-task]").forEach(
    (el) =>
      (el.onclick = (e) => {
        if (!e.target.closest("button, select, input, a, label")) {
          selected = el.dataset.task;
          render();
        }
      }),
  );
  app.querySelectorAll("[data-select]").forEach(
    (el) =>
      (el.onclick = () => {
        selected = el.dataset.select;
        render();
      }),
  );
  app.querySelectorAll("[data-complete]").forEach(
    (el) =>
      (el.onclick = () => {
        const t = data.tasks.find((t) => t.id === el.dataset.complete);
        setStatus(t, t.done ? t.previousStatus || "todo" : "done", today);
        save();
        render();
        if (t.done) toast("又完成了一件事，做得不错！");
      }),
  );
  app
    .querySelectorAll("[data-action]")
    .forEach((el) => (el.onclick = () => action(el.dataset.action)));
  const search = app.querySelector("#search");
  let composing = false;
  const applySearch = (e) => {
    if (composing || e.isComposing || query === e.target.value) return;
    query = e.target.value;
    const pos = e.target.selectionStart;
    render();
    const input = app.querySelector("#search");
    input.focus();
    input.setSelectionRange(pos, pos);
  };
  search.oncompositionstart = () => {
    composing = true;
  };
  search.oncompositionend = (e) => {
    composing = false;
    applySearch(e);
  };
  search.oninput = applySearch;
  if (app.querySelector("#add-task"))
    app.querySelector("#add-task").onsubmit = (e) => {
      e.preventDefault();
      const input = e.target.elements.title;
      const title = input.value.trim();
      if (!title) return;
      const t = {
        id: crypto.randomUUID(),
        title,
        list: data.lists.some((l) => l.id === view) ? view : "inbox",
        date: ["today", "week", "calendar", "@overdue"].includes(view)
          ? today
          : "",
        priority: 0,
        notes: "",
        tags: [],
        subtasks: [],
        done: false,
      };
      setStatus(t, statusOf(t), today);
      if (view === "completed") view = "inbox";
      else if (view === "@overdue") view = "today";
      data.tasks.push(t);
      selected = t.id;
      save();
      render();
      app.querySelector("#add-task input").focus();
    };
  const t = data.tasks.find((t) => t.id === selected);
  if (t) {
    app.querySelector("#detail-status").onchange = (e) => {
      editTask(data, t.id, { status: e.target.value }, today);
      save();
      render();
    };
    const updates = {
      "detail-title": "title",
      "detail-date": "date",
      "detail-priority": "priority",
      "detail-list": "list",
      "detail-time": "time",
      "detail-notes": "notes",
      "detail-tags": "tags",
    };
    Object.entries(updates).forEach(([id, key]) => {
      const control = app.querySelector("#" + id);
      const apply = (e) => {
        if (key === "title" && !e.target.value.trim()) {
          if (e.type !== "input") e.target.value = t.title;
          return;
        }
        const nextValue =
          key === "priority"
            ? Number(e.target.value)
            : key === "tags"
              ? e.target.value
                  .split(/[,，]/)
                  .map((v) => v.trim())
                  .filter(Boolean)
              : e.target.value;
        if (JSON.stringify(t[key]) === JSON.stringify(nextValue)) return;
        try {
          editTask(data, t.id, { [key]: nextValue }, today);
        } catch (error) {
          toast(error.message);
          return;
        }
        save();
        if (!["title", "notes", "tags"].includes(key)) {
          render();
        } else if (key === "title") {
          app
            .querySelectorAll(
              `[data-task="${t.id}"] .task-title, .calendar-task[data-select="${t.id}"], [data-task="${t.id}"] .kanban-card-title`,
            )
            .forEach((el) => (el.textContent = t.title));
        }
      };
      if (["title", "notes", "tags"].includes(key))
        bindDraft(control, apply, () => t[key]);
      else control.onchange = apply;
    });
    app.querySelectorAll("[data-subtext]").forEach((el) => {
      const sub = t.subtasks[+el.dataset.subtext];
      const apply = (e) => {
        if (!el.value.trim()) {
          if (e.type !== "input") el.value = sub.text;
          return;
        }
        if (sub.text === el.value) return;
        sub.text = el.value;
        save();
      };
      bindDraft(el, apply, () => sub.text);
    });
    app.querySelectorAll("[data-submove]").forEach(
      (el) =>
        (el.onclick = () => {
          const i = +el.dataset.submove,
            j = i + Number(el.dataset.direction);
          [t.subtasks[i], t.subtasks[j]] = [t.subtasks[j], t.subtasks[i]];
          save();
          render();
          app.querySelector(`[data-subtext="${j}"]`)?.focus();
        }),
    );
    app.querySelectorAll("[data-sub]").forEach(
      (el) =>
        (el.onclick = () => {
          t.subtasks[+el.dataset.sub].done = !t.subtasks[+el.dataset.sub].done;
          save();
          render();
        }),
    );
    app.querySelectorAll("[data-delete-sub]").forEach(
      (el) =>
        (el.onclick = () => {
          t.subtasks.splice(+el.dataset.deleteSub, 1);
          save();
          render();
        }),
    );
    app.querySelector("#add-subtask").onsubmit = (e) => {
      e.preventDefault();
      const text = e.target.elements.subtask.value.trim();
      if (text) {
        t.subtasks.push({ text, done: false });
        save();
        render();
        app.querySelector("#add-subtask input").focus();
      }
    };
  }
  app.querySelectorAll("[data-month]").forEach(
    (el) =>
      (el.onclick = () => {
        weekMode
          ? month.setDate(month.getDate() + 7 * Number(el.dataset.month))
          : month.setMonth(month.getMonth() + Number(el.dataset.month));
        render();
      }),
  );
}
let modalTrigger = null;
function modal(html) {
  document.body.classList.add("modal-open");
  document.body.classList.remove("nav-open");
  hideTooltip();
  if (!overlay.innerHTML) modalTrigger = document.activeElement;
  app.inert = true;
  overlay.innerHTML = `<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close icon-button" title="关闭">${icon("close")}</button>${html}</section></div>`;
  const heading = overlay.querySelector("h2");
  if (heading) {
    heading.id = heading.id || "dialog-heading";
    overlay.querySelector(".modal").setAttribute("aria-labelledby", heading.id);
  }
  overlay.querySelector(".modal-close").onclick = closeModal;
  overlay.querySelector(".modal-backdrop").onclick = (e) => {
    if (e.target === e.currentTarget) closeModal();
  };
  (
    [...overlay.querySelectorAll("input,select,textarea")].find(
      (el) => !el.disabled && el.getClientRects().length,
    ) || overlay.querySelector(".modal-close")
  ).focus();
  overlay.querySelector(".modal").onkeydown = (e) => {
    if (e.key !== "Tab") return;
    const controls = [
      ...overlay.querySelectorAll(
        'button,input,select,textarea,[tabindex="0"]',
      ),
    ].filter((el) => !el.disabled && el.getClientRects().length);
    const first = controls[0],
      last = controls.at(-1);
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
}
function closeModal() {
  document.body.classList.remove("modal-open");
  overlay.innerHTML = "";
  app.inert = false;
  if (modalTrigger?.isConnected) modalTrigger.focus();
  else
    app
      .querySelector(
        selected ? `[data-task="${CSS.escape(selected)}"]` : "#search",
      )
      ?.focus({ preventScroll: true });
  modalTrigger = null;
}
function action(a) {
  if (a === "workspace-tools") workspaceTools.open();
  if (a === "theme") {
    themeSettings();
  }
  if (a === "import") {
    importBackup();
  }
  if (a === "kanban-home") {
    view = "kanban";
    selected = null;
    query = "";
    render();
  }
  if (a === "new-card") {
    newCard("planning");
  }
  if (a === "refresh-board") {
    render();
    toast("看板已刷新");
  }
  if (a === "mobile-menu") {
    document.body.classList.toggle("nav-open");
  }
  if (a === "close-detail") {
    selected = null;
    render();
  }
  if (a === "list-view" || a === "board-view") {
    board = a === "board-view";
    if (view === "calendar") view = "today";
    render();
  }
  if (a === "filter") {
    priorityOnly = !priorityOnly;
    render();
  }
  if (a === "toggle-done") {
    showDone = !showDone;
    render();
  }
  if (a === "this-month") {
    month = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    render();
  }
  if (a === "new-list") {
    modal(
      `<div class="modal-icon">${icon("folder", 26)}</div><h2>给生活，多一点条理</h2><p>创建一个清单，收纳同一类事情。</p><form id="new-list-form"><label class="field-label">清单名称<input name="name" placeholder="例如：旅行计划" required maxlength="30"></label><label class="field-label">清单颜色<input name="color" type="color" value="#8b7bda"></label><button class="primary-button">创建清单</button></form>`,
    );
    overlay.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const name = e.target.elements.name.value.trim();
      if (!name) return;
      const l = {
        id: crypto.randomUUID(),
        name,
        color: e.target.elements.color.value,
      };
      data.lists.push(l);
      view = l.id;
      save();
      closeModal();
      render();
      toast("清单已创建");
    };
  }
  if (a === "delete-task") {
    modal(
      `<h2>删除这项任务？</h2><p>“${esc(data.tasks.find((t) => t.id === selected)?.title)}”将移入回收站，保留 30 天。</p><button class="primary-button danger" id="confirm-delete">删除任务</button>`,
    );
    overlay.querySelector("#confirm-delete").onclick = () => {
      try {
        deletedTasks = deleteTasks(data, [selected]);
      } catch (e) {
        toast(e.message);
        return;
      }
      selected = null;
      save();
      closeModal();
      render();
      toast("任务已删除，可在工具栏撤销");
    };
  }
  if (a === "shortcuts")
    modal(
      `<h2>让操作，更顺手</h2><div class="shortcut-row"><span>搜索任务</span><kbd>⌘ / Ctrl + K</kbd></div><div class="shortcut-row"><span>新建任务</span><kbd>N</kbd></div><div class="shortcut-row"><span>关闭弹窗或详情</span><kbd>Esc</kbd></div>`,
    );
  if (a === "export") {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(envelope(data), null, 2)], {
        type: "application/json",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `日序备份-${today}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast("任务备份已导出");
  }
  if (a === "focus") showFocus();
}

function themeSettings() {
  const theme = window.daylightTheme;
  modal(
    `<div class="modal-icon">${icon("sun", 26)}</div><h2 id="theme-heading">外观主题</h2><p>选一种喜欢的颜色，让整个工作空间保持一致。</p><div class="theme-options" role="group" aria-label="选择外观主题">${theme.themes.map((t) => `<button class="theme-option" data-theme-option="${t.id}" aria-pressed="${theme.current === t.id}"><span class="theme-preview preview-${t.id}" aria-hidden="true"><i></i><span><b></b><b></b></span><span><b></b></span></span><span class="theme-option-info"><strong>${t.name}</strong><span class="theme-selected">${icon("check", 15)}</span></span><span class="theme-description">${t.description}</span></button>`).join("")}</div><p class="theme-save-hint" role="status">立即生效，自动记住此设备上的选择。</p>`,
  );
  overlay
    .querySelector(".modal")
    .setAttribute("aria-labelledby", "theme-heading");
  overlay.querySelectorAll("[data-theme-option]").forEach(
    (button) =>
      (button.onclick = () => {
        const saved = theme.apply(button.dataset.themeOption, true);
        updateThemeSelection();
        overlay.querySelector(".theme-save-hint").textContent = saved
          ? "主题已应用，下次打开时会保留。"
          : "主题已应用；浏览器未允许保存，刷新后将恢复默认。";
      }),
  );
  overlay.querySelector('[aria-pressed="true"]').focus();
}
function updateThemeSelection() {
  overlay
    .querySelectorAll("[data-theme-option]")
    .forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.themeOption === window.daylightTheme.current),
      ),
    );
}
window.addEventListener("daylight-theme-change", updateThemeSelection);

function importBackup() {
  modal(
    `<div class="modal-icon">${icon("folder", 26)}</div><h2>从备份恢复</h2><p>选择日序导出的 JSON 文件。校验通过后，可以预览任务数量并确认恢复。</p><label class="field-label">备份文件<input id="backup-file" type="file" accept=".json,application/json"></label><p id="backup-error" role="alert"></p>`,
  );
  const input = overlay.querySelector("#backup-file");
  const error = overlay.querySelector("#backup-error");
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    error.textContent = "";
    if (file.size > 5 * 1024 * 1024) {
      error.textContent = "文件超过 5 MB，请选择较小的备份文件";
      return;
    }
    input.disabled = true;
    let backup;
    try {
      backup = parseBackup(await file.text());
    } catch (err) {
      if (input.isConnected) {
        error.textContent = err.message || "无法读取备份文件";
        input.disabled = false;
      }
      return;
    }
    if (!input.isConnected) return;
    modal(
      `<h2>确认恢复备份？</h2><p>备份包含 ${backup.tasks.length} 项任务、${backup.lists.length} 个清单。</p><p>恢复将替换当前的 ${data.tasks.length} 项任务和 ${data.lists.length} 个清单。建议先导出当前数据。</p><div class="timer-actions"><button class="text-button" id="export-before-restore">先导出当前数据</button><button class="text-button" id="cancel-restore">取消</button></div><button class="primary-button" id="confirm-restore">替换并恢复</button><p id="restore-error" role="alert"></p>`,
    );
    overlay.querySelector("#export-before-restore").onclick = () =>
      action("export");
    overlay.querySelector("#cancel-restore").onclick = closeModal;
    overlay.querySelector("#confirm-restore").onclick = async () => {
      try {
        const restored = envelope(backup);
        await repository.write(restored, {
          replace: true,
          expected: repository.raw,
        });
        data = restored;
        baseline = structuredClone(data);
        dirty = false;
      } catch (error) {
        overlay.querySelector("#restore-error").textContent =
          `恢复失败，当前数据未替换：${error.message}`;
        return;
      }
      readWarning = "";
      saveWarning = "";
      selected = null;
      view = "kanban";
      query = "";
      priorityOnly = false;
      deadlineFilter = "all";
      bulkMode = false;
      bulkIds.clear();
      deletedTasks = [];
      closeModal();
      render();
      toast("备份已恢复");
    };
  };
}
function timerText(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}
function updateFocus() {
  const state = sessionState(data.focus);
  if (state.completed && !dirty && !repository?.pending) {
    finishSession(data, "completed", day());
    save().then((ok) => {
      if (ok) {
        toast("专注完成，休息一下吧");
        workspaceTools.notify("专注完成");
      }
    });
  }
  const display = overlay.querySelector("#timer");
  if (display) display.textContent = timerText(state.seconds);
  const button = overlay.querySelector("#start-timer");
  if (button)
    button.textContent = state.running
      ? "暂停专注"
      : data.focus
        ? "继续专注"
        : "开始专注";
  return state;
}
function showFocus() {
  const state = sessionState(data.focus),
    task = data.tasks.find((t) => t.id === selected);
  modal(
    `<h2>此刻，只专注一件事</h2><p>${esc(data.focus?.title || task?.title || "自由专注")}</p><div class="timer" id="timer" role="timer">${timerText(state.seconds)}</div><label class="field-label">专注分钟<input id="focus-minutes" type="number" min="1" max="180" value="25" ${data.focus ? "disabled" : ""}></label><label class="field-label">休息分钟<input id="break-minutes" type="number" min="1" max="60" value="5"></label><div class="timer-actions"><button class="primary-button" id="start-timer">开始专注</button><button class="text-button" id="end-timer">提前结束</button><button class="text-button" id="reset-timer">取消</button></div><button class="text-button" id="start-break">开始休息</button><p>支持刷新与休眠恢复。系统时钟调整会影响截止时间；关闭页面后不保证提醒。</p>`,
  );
  updateFocus();
  overlay.querySelector("#start-timer").onclick = () => {
    if (!data.focus)
      data.focus = startSession(
        task,
        Number(overlay.querySelector("#focus-minutes").value) || 25,
        Number(overlay.querySelector("#break-minutes").value) || 5,
      );
    else if (data.focus.paused) resumeSession(data.focus);
    else pauseSession(data.focus);
    save();
    updateFocus();
  };
  overlay.querySelector("#end-timer").onclick = () => {
    finishSession(data, "ended", day());
    save();
    showFocus();
  };
  overlay.querySelector("#reset-timer").onclick = () => {
    finishSession(data, "cancelled", day());
    save();
    showFocus();
  };
  overlay.querySelector("#start-break").onclick = () => {
    if (data.focus) {
      toast("请先结束当前专注");
      return;
    }
    const minutes = Math.max(
      1,
      Math.min(60, Number(overlay.querySelector("#break-minutes").value) || 5),
    );
    data.focus = startSession({ id: "", title: "休息" }, minutes, 5);
    data.focus.isBreak = true;
    save();
    showFocus();
  };
}
setInterval(updateFocus, 1000);
// Catch up immediately after background throttling or device sleep.
// The timer model emits completion only once, even if several events arrive.
window.addEventListener("focus", () => updateFocus());
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) updateFocus();
});
document.addEventListener("keydown", (e) => {
  if (e.isComposing || e.keyCode === 229 || draftComposing) return;
  const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (
    !overlay.innerHTML &&
    (e.metaKey || e.ctrlKey) &&
    e.key.toLowerCase() === "k"
  ) {
    e.preventDefault();
    document.querySelector("#search").focus();
  }
  if (e.key === "Escape") {
    if (overlay.innerHTML) closeModal();
    else {
      selected = null;
      bulkMode = false;
      bulkIds.clear();
      render();
    }
  }
  if (
    !editing &&
    !overlay.innerHTML &&
    e.key.toLowerCase() === "n" &&
    !e.metaKey &&
    !e.ctrlKey
  ) {
    e.preventDefault();
    view === "kanban"
      ? newCard("planning")
      : document.querySelector("#add-task input").focus();
  }
});
function kanbanTasks() {
  return sortTasks(
    data.tasks.filter(
      (t) =>
        matchesExtra(t) &&
        matchesDeadline(t, deadlineFilter, today) &&
        matchesSearch(t, query, data.lists) &&
        (!priorityOnly || t.priority === 1),
    ),
    taskSort,
  );
}
function renderKanban() {
  const tasks = kanbanTasks();
  app.innerHTML = `${workspaceHtml()}<main class="main kanban-main">${workspaceHeader("看板")}<div class="kanban-page">
    <header class="kanban-heading"><div><h1>看板</h1></div><button class="kanban-add" data-action="new-card">${icon("plus", 18)}添加任务</button></header>
    <div class="kanban-toolbar"><label class="deadline-filter"><span>截止日期</span><select id="deadline-filter" aria-label="按截止日期筛选">${[
      ["all", "全部任务"],
      ["today", "今天到期"],
      ["overdue", "逾期任务"],
    ]
      .map(
        ([value, label]) =>
          `<option value="${value}" ${deadlineFilter === value ? "selected" : ""}>${label}${value === "overdue" ? ` (${data.tasks.filter((t) => isOverdue(t, today)).length})` : ""}</option>`,
      )
      .join(
        "",
      )}</select></label>${sortControl()}${bulkToggleHtml()}<span class="kanban-summary" aria-live="polite">${query.trim() || deadlineFilter !== "all" || priorityOnly ? `找到 ${tasks.length} 项任务` : `${data.tasks.length} 项任务 · ${bulkMode ? "勾选任务批量整理" : taskSort === "manual" ? "拖动卡片调整状态与顺序" : "已按" + sortOptions.find(([id]) => id === taskSort)[1] + "排序"}`}</span><button class="board-refresh" data-action="refresh-board">刷新</button></div>
    ${activeFiltersHtml()}${bulkBarHtml()}<div class="kanban-columns">${stages
      .map((stage) => {
        const items = tasks.filter((t) => statusOf(t) === stage.id);
        return `<section class="kanban-column stage-${stage.id}" data-stage="${stage.id}" aria-label="${stage.name}"><header class="column-heading"><span class="stage-dot"></span><h2>${stage.name}</h2><span class="stage-count">${items.length}</span><button class="column-add" title="添加到${stage.name}" data-new-stage="${stage.id}">${icon("plus", 20)}</button></header><div class="column-cards">${items.map(kanbanCard).join("")}${!items.length ? `<div class="column-empty">${query.trim() || deadlineFilter !== "all" || priorityOnly ? "没有匹配的任务" : "暂无任务"}</div>` : ""}</div>${stage.id === "done" ? `<footer class="column-footer">已显示 ${items.length} / ${data.tasks.filter((t) => statusOf(t) === "done").length}</footer>` : ""}</section>`;
      })
      .join("")}</div>
    <footer class="kanban-footer"><span data-save-status><i class="status-dot"></i>已自动保存到此设备</span><span>日序 · Daylight</span></footer>
  </div></main>${selected ? `<div class="board-detail-shade" data-action="close-detail"></div>${detailHtml()}` : ""}`;
  bind();
  bindKanban();
  updateStorageStatus();
}
function kanbanCard(t) {
  return renderCard({
    t,
    icon,
    esc,
    bulkCheckboxHtml,
    deadlineHtml,
    taskSort,
    bulkMode,
  });
}

function newCard(
  status = "planning",
  date = "",
  list = data.lists.some((l) => l.id === view) ? view : "inbox",
) {
  modal(
    `<div class="kanban-eyebrow">A NEW LITTLE THING</div><h2>添加任务</h2><form id="new-card-form"><label class="field-label">任务名称<input name="title" placeholder="想做点什么？" maxlength="200" required></label><label class="field-label">说明<textarea name="notes" placeholder="补充一些想法或细节…" rows="3"></textarea></label><div class="new-card-fields"><label class="field-label">状态<select name="status">${stages.map((s) => `<option value="${s.id}" ${s.id === status ? "selected" : ""}>${s.name}</option>`).join("")}</select></label><label class="field-label">日期<input type="date" name="date" value="${esc(date)}"></label><label class="field-label">清单<select name="list">${[{ id: "inbox", name: "收集箱" }, ...data.lists].map((l) => `<option value="${l.id}" ${l.id === list ? "selected" : ""}>${esc(l.name)}</option>`).join("")}</select></label><label class="field-label">优先级<select name="priority">${["无优先级", "高优先级", "中优先级", "低优先级"].map((v, i) => `<option value="${i}">${v}</option>`).join("")}</select></label></div><button class="primary-button" type="submit">添加任务</button></form>`,
  );
  overlay.querySelector("form").onsubmit = (e) => {
    e.preventDefault();
    const fields = e.target.elements;
    const title = fields.title.value.trim();
    if (!title) return;
    const task = {
      id: crypto.randomUUID(),
      title,
      notes: fields.notes.value.trim(),
      date: fields.date.value,
      list: fields.list.value,
      priority: Number(fields.priority.value),
      tags: [],
      subtasks: [],
      done: false,
    };
    setStatus(task, fields.status.value, today);
    data.tasks.push(task);
    save();
    closeModal();
    render();
    toast("任务已添加");
  };
}
function bindKanban() {
  app.querySelector("#deadline-filter").onchange = (e) => {
    deadlineFilter = e.target.value;
    render();
  };
  app
    .querySelectorAll("[data-new-stage]")
    .forEach((el) => (el.onclick = () => newCard(el.dataset.newStage)));
  app.querySelectorAll("[data-status-task]").forEach(
    (el) =>
      (el.onchange = (e) => {
        const task = data.tasks.find((t) => t.id === el.dataset.statusTask);
        editTask(data, task.id, { status: e.target.value }, today);
        save();
        render();
        toast("任务状态已更新");
      }),
  );
  let draggedId = null;
  app.querySelectorAll(".kanban-card").forEach((card) => {
    card.onkeydown = (e) => {
      if (e.target === card && (e.key === "Enter" || e.key === " ")) {
        e.preventDefault();
        selected = card.dataset.task;
        render();
      }
    };
    card.ondragstart = (e) => {
      if (
        bulkMode ||
        taskSort !== "manual" ||
        e.target.closest("select,button,input")
      ) {
        e.preventDefault();
        return;
      }
      draggedId = card.dataset.task;
      e.dataTransfer.setData("text/plain", draggedId);
      e.dataTransfer.effectAllowed = "move";
      card.classList.add("dragging");
    };
    card.ondragend = () => {
      draggedId = null;
      app
        .querySelectorAll(".dragging,.drag-over,.drop-before")
        .forEach((el) =>
          el.classList.remove("dragging", "drag-over", "drop-before"),
        );
    };
  });
  app.querySelectorAll("[data-stage]").forEach((column) => {
    column.ondragover = (e) => {
      if (!draggedId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      app
        .querySelectorAll(".drag-over,.drop-before")
        .forEach((el) => el.classList.remove("drag-over", "drop-before"));
      column.classList.add("drag-over");
      const target = [
        ...column.querySelectorAll(".kanban-card:not(.dragging)"),
      ].find(
        (card) =>
          e.clientY <
          card.getBoundingClientRect().top +
            card.getBoundingClientRect().height / 2,
      );
      target?.classList.add("drop-before");
    };
    column.ondrop = (e) => {
      e.preventDefault();
      if (!draggedId) return;
      const target = column.querySelector(".drop-before");
      moveTask(
        data.tasks,
        draggedId,
        column.dataset.stage,
        target?.dataset.task,
        today,
      );
      save();
      draggedId = null;
      render();
      toast("看板已更新");
    };
  });
}

let bulkView = "kanban";
function visibleBulkTasks() {
  if (view === "calendar") return [];
  const tasks = view === "kanban" ? kanbanTasks() : filtered();
  return tasks.filter(
    (t) => view === "kanban" || view === "completed" || !t.done || showDone,
  );
}
function syncBulkSelection() {
  if (bulkView !== view) {
    bulkMode = false;
    bulkIds.clear();
    bulkView = view;
  }
  const visible = new Set(visibleBulkTasks().map((t) => t.id));
  bulkIds = new Set([...bulkIds].filter((id) => visible.has(id)));
}
function bulkToggleHtml() {
  return `<button class="bulk-toggle ${bulkMode ? "on" : ""}" data-bulk-toggle aria-pressed="${bulkMode}">${icon("check", 15)}${bulkMode ? "退出多选" : "批量整理"}</button>`;
}
function bulkCheckboxHtml(t) {
  return bulkMode
    ? `<label class="bulk-check"><input type="checkbox" data-bulk-id="${t.id}" ${bulkIds.has(t.id) ? "checked" : ""} aria-label="选择任务：${esc(t.title)}"></label>`
    : "";
}
function bulkBarHtml() {
  if (!bulkMode && !deletedTasks.length) return "";
  const total = visibleBulkTasks().length;
  return `<div class="bulk-bar" aria-label="批量操作">${bulkMode ? `<label class="bulk-select-all"><input type="checkbox" data-bulk-all ${total && bulkIds.size === total ? "checked" : ""} ${!total ? "disabled" : ""}>全选当前结果</label><span role="status">已选 ${bulkIds.size} / ${total} 项</span><button data-bulk-edit ${!bulkIds.size ? "disabled" : ""}>批量修改</button><button class="danger-text" data-bulk-delete ${!bulkIds.size ? "disabled" : ""}>删除所选</button>` : ""}${deletedTasks.length ? `<button class="undo-delete" data-undo-delete>撤销删除（${deletedTasks.length} 项）</button>` : ""}</div>`;
}
function bindBulk() {
  app.querySelector("[data-bulk-toggle]")?.addEventListener("click", () => {
    bulkMode = !bulkMode;
    bulkIds.clear();
    selected = null;
    render();
    app.querySelector("[data-bulk-toggle]")?.focus();
  });
  app.querySelectorAll("[data-bulk-id]").forEach(
    (input) =>
      (input.onchange = () => {
        const id = input.dataset.bulkId;
        input.checked ? bulkIds.add(id) : bulkIds.delete(id);
        render();
        app.querySelector(`[data-bulk-id="${id}"]`)?.focus();
      }),
  );
  const all = app.querySelector("[data-bulk-all]");
  if (all) {
    all.indeterminate =
      bulkIds.size > 0 && bulkIds.size < visibleBulkTasks().length;
    all.onchange = () => {
      bulkIds = all.checked
        ? new Set(visibleBulkTasks().map((t) => t.id))
        : new Set();
      render();
      app.querySelector("[data-bulk-all]")?.focus();
    };
  }
  app
    .querySelector("[data-bulk-edit]")
    ?.addEventListener("click", editBulkTasks);
  app.querySelector("[data-bulk-delete]")?.addEventListener("click", () => {
    const ids = [...bulkIds];
    if (!ids.length) return;
    modal(
      `<h2>删除选中的 ${ids.length} 项任务？</h2><p>本次删除后可以撤销。再次删除将替换上一次的撤销记录，刷新后仍可在「规划与数据工具 → 回收站」中恢复，保留 30 天。</p><div class="list-confirm-actions"><button class="text-button" id="cancel-bulk-delete">取消</button><button class="primary-button danger" id="confirm-bulk-delete">删除 ${ids.length} 项任务</button></div>`,
    );
    overlay.querySelector("#cancel-bulk-delete").onclick = closeModal;
    overlay.querySelector("#confirm-bulk-delete").onclick = () => {
      try {
        deletedTasks = deleteTasks(data, ids);
      } catch (e) {
        toast(e.message);
        return;
      }
      bulkIds.clear();
      selected = null;
      save();
      closeModal();
      render();
      toast("已删除，可在工具栏撤销");
    };
  });
  app.querySelector("[data-undo-delete]")?.addEventListener("click", () => {
    const count = restoreDeleted(data, deletedTasks);
    deletedTasks = [];
    save();
    render();
    toast(`已恢复 ${count} 项任务`);
  });
}
function editBulkTasks() {
  const ids = [...bulkIds];
  if (!ids.length) return;
  modal(
    `<h2>批量修改 ${ids.length} 项任务</h2><p>只应用你选择的字段，其余内容保持原样。</p><form id="bulk-edit-form"><div class="new-card-fields"><label class="field-label">状态<select name="status"><option value="">保持原样</option>${stages.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}</select></label><label class="field-label">优先级<select name="priority"><option value="">保持原样</option>${["无优先级", "高优先级", "中优先级", "低优先级"].map((name, i) => `<option value="${i}">${name}</option>`).join("")}</select></label></div><label class="field-label">移至清单<select name="list"><option value="">保持原样</option>${[{ id: "inbox", name: "收集箱" }, ...data.lists].map((l) => `<option value="${l.id}">${esc(l.name)}</option>`).join("")}</select></label><div class="new-card-fields"><label class="field-label">截止日期<select name="dateMode"><option value="">保持原样</option><option value="today">安排到今天</option><option value="custom">指定日期</option><option value="clear">清除日期</option></select></label><label class="field-label" id="bulk-date-label" hidden>指定日期<input type="date" name="date" disabled></label></div><p id="bulk-error" role="alert"></p><button class="primary-button" type="submit">应用修改</button></form>`,
  );
  const form = overlay.querySelector("form"),
    fields = form.elements;
  fields.dateMode.onchange = () => {
    const custom = fields.dateMode.value === "custom";
    fields.date.disabled = !custom;
    fields.date.required = custom;
    overlay.querySelector("#bulk-date-label").hidden = !custom;
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    const changes = {};
    for (const key of ["status", "list", "priority"])
      if (fields[key].value !== "")
        changes[key] =
          key === "priority" ? Number(fields[key].value) : fields[key].value;
    if (fields.dateMode.value)
      changes.date =
        fields.dateMode.value === "clear"
          ? ""
          : fields.dateMode.value === "today"
            ? day()
            : fields.date.value;
    if (!Object.keys(changes).length) {
      overlay.querySelector("#bulk-error").textContent = "请至少选择一项修改";
      return;
    }
    try {
      updateTasks(data, ids, changes, day());
    } catch (err) {
      overlay.querySelector("#bulk-error").textContent = err.message;
      return;
    }
    bulkIds.clear();
    selected = null;
    save();
    closeModal();
    render();
    toast(`已更新 ${ids.length} 项任务`);
  };
}

const workspaceTools = installWorkspaceTools({
  getData: () => data,
  save,
  render,
  modal,
  closeModal,
  toast,
  esc,
  download,
  getSelected: () => selected,
  newCard,
  setView: (v) => {
    view = v;
    selected = null;
    query = "";
    render();
  },
  getFilters: () => ({ query, priorityOnly, deadlineFilter, view }),
  setFilters: (f) => {
    if (f.view) view = f.view;
    query = f.query || "";
    priorityOnly = !!f.priorityOnly;
    deadlineFilter = f.deadlineFilter || "all";
    render();
  },
  app,
  overlay,
  repository,
  initial,
  getDirty: () => dirty,
});
render();
workspaceTools.welcome();
if (loaded.warning) toast(loaded.warning);

// Refresh date-based views after midnight and when returning to the app.
setInterval(() => {
  if (
    day() !== today &&
    !overlay.innerHTML &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
  ) {
    render();
  }
}, 30000);
document.addEventListener("visibilitychange", () => {
  if (
    !document.hidden &&
    day() !== today &&
    !overlay.innerHTML &&
    !/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)
  )
    render();
});
