import { summarize } from "./review-model.js";
import { addDays, validRule } from "./recurrence.js";
import { restoreDeleted } from "./bulk-tools.js";
import { envelope, APP_VERSION } from "./storage.js";
export let preferences = {};
try {
  preferences = JSON.parse(
    localStorage.getItem("daylight-preferences") || "{}",
  );
} catch {}
if (
  !preferences ||
  typeof preferences !== "object" ||
  Array.isArray(preferences)
)
  preferences = {};
if (!["manual", "date", "priority", "title"].includes(preferences.sort))
  delete preferences.sort;
for (const key of ["view", "tag", "list"])
  if (typeof preferences[key] !== "string") delete preferences[key];
preferences.filters = Array.isArray(preferences.filters)
  ? preferences.filters
      .filter(
        (f) => f && typeof f.name === "string" && typeof f.query === "string",
      )
      .slice(0, 20)
  : [];
export function persistPreferences(patch) {
  Object.assign(preferences, patch);
  try {
    localStorage.setItem("daylight-preferences", JSON.stringify(preferences));
  } catch {}
}
export function matchesExtra(task) {
  return (
    (!preferences.tag || task.tags.includes(preferences.tag)) &&
    (!preferences.list || task.list === preferences.list)
  );
}
export function installWorkspaceTools(ctx) {
  const {
    getData,
    save,
    render,
    modal,
    closeModal,
    toast,
    esc,
    download,
    getSelected,
    newCard,
    setView,
    getFilters,
    setFilters,
    app,
    overlay,
    initial,
    getDirty,
  } = ctx;
  const weekStart = (date) => {
    const s = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return addDays(s, -(date.getDay() + 6) % 7);
  };
  function bind() {
    const host = app.querySelector(".kanban-toolbar, .page-heading");
    if (host) {
      const data = getData(),
        tags = [...new Set(data.tasks.flatMap((t) => t.tags))].sort();
      host.insertAdjacentHTML(
        "afterend",
        `<div class="planning-filters"><label>搜索范围<select data-scope><option value="">当前视图</option><option value="global" ${preferences.global ? "selected" : ""}>全局任务</option></select></label><label>标签<select data-tag><option value="">全部标签</option>${tags.map((t) => `<option ${preferences.tag === t ? "selected" : ""} value="${esc(t)}">${esc(t)}</option>`).join("")}</select></label><label>清单<select data-list-filter><option value="">全部清单</option>${[{ id: "inbox", name: "收集箱" }, ...data.lists].map((l) => `<option ${preferences.list === l.id ? "selected" : ""} value="${l.id}">${esc(l.name)}</option>`).join("")}</select></label><button data-save-filter>保存筛选</button><button data-load-filter>常用筛选</button><button data-clear-extra>清除组合</button></div>`,
      );
      app.querySelector("[data-scope]").onchange = (e) => {
        persistPreferences({ global: e.target.value === "global" });
        render();
      };
      app.querySelector("[data-tag]").onchange = (e) => {
        persistPreferences({ tag: e.target.value });
        render();
      };
      app.querySelector("[data-list-filter]").onchange = (e) => {
        persistPreferences({ list: e.target.value });
        render();
      };
      app.querySelector("[data-clear-extra]").onclick = () => {
        persistPreferences({ tag: "", list: "", global: false });
        setFilters({});
      };
      app.querySelector("[data-save-filter]").onclick = () => {
        modal(
          `<h2>保存常用筛选</h2><form><label class="field-label">名称<input name="name" required maxlength="40"></label><button class="primary-button">保存</button></form>`,
        );
        overlay.querySelector("form").onsubmit = (e) => {
          e.preventDefault();
          const filters = preferences.filters || [];
          if (filters.length >= 20) {
            toast("最多保留 20 个筛选");
            return;
          }
          persistPreferences({
            filters: [
              ...filters,
              {
                name: e.target.elements.name.value,
                ...getFilters(),
                tag: preferences.tag,
                list: preferences.list,
                global: preferences.global,
              },
            ],
          });
          closeModal();
          toast("筛选已保存");
        };
      };
      app.querySelector("[data-load-filter]").onclick = () => {
        modal(
          `<h2>常用筛选</h2>${(preferences.filters || []).map((f, i) => `<div class="tool-row"><button data-filter="${i}">${esc(f.name)}</button><button data-remove-filter="${i}" aria-label="删除筛选 ${esc(f.name)}">删除</button></div>`).join("") || "<p>还没有保存筛选。</p>"}`,
        );
        overlay.querySelectorAll("[data-filter]").forEach(
          (el) =>
            (el.onclick = () => {
              const f = preferences.filters[+el.dataset.filter];
              persistPreferences({
                tag: f.tag,
                list: f.list,
                global: f.global,
              });
              closeModal();
              setFilters(f);
            }),
        );
        overlay.querySelectorAll("[data-remove-filter]").forEach(
          (el) =>
            (el.onclick = () => {
              preferences.filters.splice(+el.dataset.removeFilter, 1);
              persistPreferences({ filters: preferences.filters });
              closeModal();
              render();
            }),
        );
      };
    }
    const detail = app.querySelector(".detail-content");
    if (detail) {
      const t = getData().tasks.find((t) => t.id === getSelected());
      if (t) {
        detail.insertAdjacentHTML(
          "beforeend",
          `<div class="detail-tools"><button data-repeat>重复规则${t.repeat ? " · " + (t.repeat.paused ? "已暂停" : { daily: "每天", weekly: "每周", monthly: "每月" }[t.repeat.kind]) : ""}</button><button data-task-focus>专注此任务</button></div>`,
        );
        detail.querySelector("[data-repeat]").onclick = () => repeat(t);
        detail.querySelector("[data-task-focus]").onclick = () =>
          document.querySelector('[data-action="focus"]').click();
      }
    }
    const quick = app.querySelector("#add-task");
    if (quick)
      quick.insertAdjacentHTML(
        "afterend",
        '<button class="text-button" data-quick-create>新建并安排日期、清单与优先级</button>',
      );
    app
      .querySelector("[data-quick-create]")
      ?.addEventListener("click", () => newCard());
  }
  function repeat(t) {
    const r = t.repeat || {
      kind: "daily",
      basis: "scheduled",
      weekdays: [
        new Date(
          `${t.date || new Date().toISOString().slice(0, 10)}T12:00Z`,
        ).getUTCDay(),
      ],
      monthDay: Number((t.date || "2000-01-01").slice(-2)),
      until: "",
      remaining: 0,
      paused: false,
    };
    modal(
      `<h2>重复规则</h2><p>当前实例完成后才生成下一项。按计划日期计算会逐次补做逾期任务；每月遇短月取月末。规则使用日期，不随时区平移。父任务完成不会改写本次子任务。</p><form><label class="field-label">频率<select name="kind">${[
        ["", "不重复"],
        ["daily", "每天"],
        ["weekly", "每周指定星期"],
        ["monthly", "每月指定日期"],
      ]
        .map(
          ([v, label]) =>
            `<option value="${v}" ${v === r.kind ? "selected" : ""}>${label}</option>`,
        )
        .join(
          "",
        )}</select></label><label class="field-label">计算基准<select name="basis"><option value="scheduled">计划日期</option><option value="completed" ${r.basis === "completed" ? "selected" : ""}>完成日期</option></select></label><label class="field-label">星期（0 周日，1 周一 … 6 周六，逗号分隔）<input name="weekdays" value="${r.weekdays.join(",")}" required></label><label class="field-label">每月日期<input name="monthDay" type="number" min="1" max="31" value="${r.monthDay}" required></label><label class="field-label">截止日期<input name="until" type="date" value="${r.until}"></label><label class="field-label">剩余次数（含本次，0 为不限）<input name="remaining" type="number" min="0" max="10000" value="${r.remaining}" required></label><label><input name="paused" type="checkbox" ${r.paused ? "checked" : ""}>暂停续生</label><p>修改仅影响本次及由它生成的后续任务，已经生成的其他实例不变。完成记录和回收站中的实例不会重复生成。</p><p id="repeat-error" role="alert"></p><button class="primary-button">应用规则</button></form>`,
    );
    overlay.querySelector("form").onsubmit = (e) => {
      e.preventDefault();
      const f = e.target.elements;
      if (!f.kind.value) {
        delete t.repeat;
        delete t.instanceDate;
      } else {
        if (!t.date) {
          overlay.querySelector("#repeat-error").textContent =
            "请先为任务设置日期";
          return;
        }
        const next = {
          id: t.repeat?.id || crypto.randomUUID(),
          kind: f.kind.value,
          basis: f.basis.value,
          weekdays: f.weekdays.value
            .split(/[,，]/)
            .map((s) => Number(s.trim())),
          monthDay: Number(f.monthDay.value),
          until: f.until.value,
          remaining: Number(f.remaining.value),
          paused: f.paused.checked,
        };
        if (!validRule(next)) {
          overlay.querySelector("#repeat-error").textContent =
            "请检查星期、日期和次数";
          return;
        }
        t.repeat = next;
        t.instanceDate ||= t.date;
      }
      save();
      closeModal();
      render();
    };
  }
  function open() {
    modal(
      `<h2>规划与数据工具</h2><div class="tool-menu"><button data-tool="trash">回收站（${getData().trash?.length || 0}）</button><button data-tool="recovery">恢复点</button><button data-tool="review">专注与复盘</button><button data-tool="diagnostics">存储与离线诊断</button><button data-tool="notifications">开启浏览器通知</button></div><p>数据只保存在本地。备份包含回收站、重复规则、专注会话及完成事件；外观和筛选偏好单独保存。</p>`,
    );
    overlay
      .querySelectorAll("[data-tool]")
      .forEach(
        (el) =>
          (el.onclick = () =>
            ({ trash, recovery, review, diagnostics, notifications })[
              el.dataset.tool
            ]()),
      );
  }
  function trash() {
    const data = getData(),
      rows = (data.trash || []).filter(
        (r) => Date.now() - r.deletedAt < 30 * 86400000,
      );
    modal(
      `<h2>回收站</h2><p>保留 30 天，最多 1,000 项；原清单不存在时恢复到收集箱。ID 已存在时保留回收站副本，避免覆盖。</p>${rows.map((r, i) => `<div class="tool-row"><span>${esc(r.task.title)}</span><button data-restore="${i}">恢复</button><button data-purge="${i}">彻底删除</button></div>`).join("") || "<p>回收站为空。</p>"}`,
    );
    overlay.querySelectorAll("[data-restore]").forEach(
      (el) =>
        (el.onclick = () => {
          const r = rows[+el.dataset.restore];
          const n = restoreDeleted(data, [r]);
          save();
          if (!n) toast("相同 ID 的任务已存在，请先导出备份检查");
          trash();
          render();
        }),
    );
    overlay.querySelectorAll("[data-purge]").forEach(
      (el) =>
        (el.onclick = () => {
          const r = rows[+el.dataset.purge];
          modal(
            `<h2>彻底删除？</h2><p>${esc(r.task.title)} 删除后只能从外部备份恢复。</p><button id="purge-confirm" class="primary-button danger">彻底删除</button>`,
          );
          overlay.querySelector("#purge-confirm").onclick = () => {
            data.trash = data.trash.filter((row) => row !== r);
            save();
            trash();
          };
        }),
    );
  }
  function recovery() {
    let points = [];
    try {
      points = JSON.parse(localStorage.getItem("daylight-recovery") || "[]");
    } catch {}
    modal(
      `<h2>恢复点</h2><p>升级和替换前自动保留，最多 5 份、约 2 MB UTF-16 字符存储。与任务同源，清除浏览器数据也会丢失。导出后通过「从备份恢复」预览并恢复。</p>${points.map((p, i) => `<div class="tool-row"><span>${esc(new Date(p.at).toLocaleString())} · ${esc(p.reason)}</span><button data-point="${i}">导出</button></div>`).join("") || "<p>暂无恢复点。</p>"}<button id="raw-export" class="text-button">导出当前原始存储</button>`,
    );
    overlay
      .querySelectorAll("[data-point]")
      .forEach(
        (el) =>
          (el.onclick = () =>
            download(points[+el.dataset.point].source, "日序恢复点.json")),
      );
    overlay.querySelector("#raw-export").onclick = () => {
      try {
        download(
          localStorage.getItem("daylight-v1") || "{}",
          "日序原始存储.json",
        );
      } catch {
        toast("浏览器禁止读取存储");
      }
    };
  }
  function review() {
    const data = getData(),
      today = ctxDate(),
      start = weekStart(new Date()),
      events = data.events || [],
      sessions = data.sessions || [];
    const metrics = (date) => summarize(data, date, today);
    const a = metrics(today),
      b = metrics(start);
    modal(
      `<h2>专注与复盘</h2><p>自然日按设备本地日期，周一为周起点。只统计启用记录后的事件；重新完成计为一次新事件。</p><div class="review-grid"><div>今天完成<strong>${a.completed}</strong>专注 ${a.minutes} 分钟</div><div>本周完成<strong>${b.completed}</strong>专注 ${b.minutes} 分钟</div></div><h3>最近 7 天完成时逾期</h3>${Array.from(
        { length: 7 },
        (_, i) => {
          const d = addDays(today, i - 6);
          return `<p>${d}：${events.filter((e) => e.date === d && e.overdue).length} 次</p>`;
        },
      ).join("")}<h3>最近会话</h3>${
        sessions
          .slice(-10)
          .reverse()
          .map(
            (s) =>
              `<p>${esc(s.date)} · ${esc(s.title)} · ${{ completed: "完成", ended: "提前结束", cancelled: "取消" }[s.outcome]} · ${Math.floor(s.duration / 60000)} 分钟</p>`,
          )
          .join("") || "<p>暂无会话。</p>"
      }<button id="export-history" class="text-button">导出完整备份</button><button id="clear-history" class="text-button danger-text">清理历史</button>`,
    );
    overlay.querySelector("#export-history").onclick = () =>
      download(envelope(data), "日序含历史备份.json");
    overlay.querySelector("#clear-history").onclick = () => {
      modal(
        '<h2>清理完成事件和专注历史？</h2><p>当前任务与正在进行的计时不受影响，清理后只能从备份恢复。</p><button id="clear-confirm" class="primary-button danger">确认清理</button>',
      );
      overlay.querySelector("#clear-confirm").onclick = () => {
        data.events = [];
        data.sessions = [];
        save();
        review();
      };
    };
  }
  function diagnostics() {
    let bytes = 0;
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith("daylight"))
          bytes += (k.length + (localStorage.getItem(k) || "").length) * 2;
      }
    } catch {}
    modal(
      `<h2>存储与离线诊断</h2><p>日序 ${APP_VERSION} · 数据格式 2</p><p>来源：${esc(location.origin)}</p><p>在线：${navigator.onLine ? "是" : "否"}；本地数据约 ${(bytes / 1024).toFixed(1)} KB</p><p>安全写入锁：${navigator.locks ? "支持" : "不支持，禁止写回，请导出备份"}</p><p>离线缓存：${navigator.serviceWorker?.controller ? "已控制当前页面" : "尚未控制，首次在线加载后刷新验证"}</p><p>推荐固定使用 http://localhost:5173。127.0.0.1、其他端口和托管域名是不同数据源，迁移必须先导出再恢复。离线能力取决于浏览器缓存，不能替代文件备份。</p><button id="check-update" class="primary-button">检查资源更新</button><button id="export-diagnostics" class="text-button">导出备份</button>`,
    );
    overlay.querySelector("#export-diagnostics").onclick = () =>
      download(envelope(getData()), "日序备份.json");
    overlay.querySelector("#check-update").onclick = async () => {
      try {
        const r = await navigator.serviceWorker?.getRegistration();
        await r?.update();
        toast(r?.waiting ? "更新已就绪，请先保存并刷新页面" : "已检查资源更新");
      } catch {
        toast("更新检查失败，请联网重试");
      }
    };
  }
  async function notifications() {
    if (!("Notification" in window)) {
      toast("此浏览器不支持系统通知");
      return;
    }
    const permission = await Notification.requestPermission();
    toast(
      permission === "granted"
        ? "已授权：仅页面运行时提醒"
        : "未开启通知，保留页面内提示",
    );
  }
  function notify(title) {
    if ("Notification" in window && Notification.permission === "granted")
      try {
        new Notification(title, { tag: "daylight-focus" });
      } catch {}
  }
  const announced = new Set();
  setInterval(() => {
    if (document.hidden) return;
    const now = new Date(),
      today = ctxDate(),
      time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const due = getData().tasks.filter(
      (t) =>
        !t.done &&
        t.date === today &&
        t.time &&
        t.time <= time &&
        !announced.has(`${t.id}:${today}`),
    );
    if (due.length) {
      due.forEach((t) => announced.add(`${t.id}:${today}`));
      toast(`${due.length} 项任务已到计划时间`);
    }
  }, 30000);
  function welcome() {
    let first = false;
    try {
      first = !localStorage.getItem("daylight-v1");
    } catch {}
    if (!first) return;
    modal(
      '<h2>让重要的小事有着落</h2><p>选择空白开始，或用示例了解日序。任务保存在当前浏览器，请定期导出备份。</p><button class="primary-button" id="start-empty">空白开始</button><button class="text-button" id="start-demo">体验示例</button>',
    );
    overlay.querySelector("#start-empty").onclick = () => {
      Object.assign(getData(), {
        lists: [],
        tasks: [],
        trash: [],
        events: [],
        sessions: [],
        focus: null,
      });
      save();
      closeModal();
      render();
    };
    overlay.querySelector("#start-demo").onclick = () => {
      Object.assign(getData(), structuredClone(initial));
      save();
      closeModal();
      render();
    };
  }
  if ("serviceWorker" in navigator)
    navigator.serviceWorker
      .register("/sw.js", { updateViaCache: "none" })
      .then((reg) => {
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          worker?.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            )
              toast("资源更新已就绪，保存后关闭所有日序页面再打开");
          });
        });
      })
      .catch(() => {});
  return { bind, open, welcome, weekStart, addDays, notify };
}
function ctxDate() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
