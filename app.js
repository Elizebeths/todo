import {sortOptions, sortTasks, matchesSearch, updateList, removeList} from './task-tools.js';
import {createFocusTimer} from './focus-timer.js';
import {isOverdue, matchesDeadline, deadlineInfo, rescheduleToToday} from './deadline-model.js';
import {parseBackup, restoreBackup, loadData, saveData} from './backup.js';
import {stages, statusOf, setStatus, moveTask} from './board-model.js';
// One floating tooltip also serves controls created by later renders and dialogs.
const tooltip = document.createElement('div');
tooltip.id = 'icon-tooltip';
tooltip.className = 'icon-tooltip';
tooltip.setAttribute('role', 'tooltip');
tooltip.hidden = true;
document.body.append(tooltip);
let owner = null;

function hideTooltip() {
  if (owner) {
    const ids = (owner.getAttribute('aria-describedby') || '').split(' ').filter(id => id && id !== tooltip.id);
    if (ids.length) owner.setAttribute('aria-describedby', ids.join(' '));
    else owner.removeAttribute('aria-describedby');
  }
  owner = null;
  tooltip.hidden = true;
}

function showTooltip(target) {
  const control = target instanceof Element ? target.closest('[title], [data-tooltip]') : null;
  if (control === owner) return;
  hideTooltip();
  if (!control) return;
  const label = control.getAttribute('data-tooltip') || control.getAttribute('title');
  if (!label) return;
  // Suppress the delayed native tooltip so the label only appears once.
  control.setAttribute('data-tooltip', label);
  control.removeAttribute('title');
  if (control.matches('button') && !control.textContent.trim() && !control.hasAttribute('aria-label')) {
    control.setAttribute('aria-label', label);
  }
  owner = control;
  control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'), tooltip.id].filter(Boolean).join(' '));
  tooltip.textContent = label;
  tooltip.hidden = false;
  const rect = control.getBoundingClientRect();
  const box = tooltip.getBoundingClientRect();
  let left = rect.left + (rect.width - box.width) / 2;
  let top = rect.bottom + 8;
  if (top + box.height > window.innerHeight - 8) top = rect.top - box.height - 8;
  tooltip.style.left = `${Math.max(8, Math.min(left, window.innerWidth - box.width - 8))}px`;
  tooltip.style.top = `${Math.max(8, top)}px`;
}

document.addEventListener('pointerover', event => {
  if (event.pointerType !== 'touch') showTooltip(event.target);
});
document.addEventListener('pointerout', event => {
  if (owner?.contains(event.target) && !owner.contains(event.relatedTarget)) hideTooltip();
});
document.addEventListener('focusin', event => showTooltip(event.target));
document.addEventListener('focusout', hideTooltip);
document.addEventListener('pointerdown', hideTooltip);
document.addEventListener('keydown', event => { if (event.key === 'Escape') hideTooltip(); });
document.addEventListener('scroll', hideTooltip, true);
window.addEventListener('resize', hideTooltip);
// Rendering a new view must not leave a detached control's label on screen.
new MutationObserver(() => { if (owner && !owner.isConnected) hideTooltip(); })
  .observe(document.querySelector('#app'), {childList:true, subtree:true});

const paths={check:'m5 12 4 4L19 6',sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 1.4 1.4m10 10 1.4 1.4M5.6 18.4 1.4-1.4m10-10 1.4-1.4M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',calendar:'M5 5h14v15H5zM8 3v4m8-4v4M5 10h14m-10 4h1m4 0h1',inbox:'M4 5h16l2 13H2L4 5zm-1 8h5l2 3h4l2-3h5',grid:'M4 4h6v6H4zm10 0h6v6h-6zM4 14h6v6H4zm10 0h6v6h-6z',search:'M21 21l-5-5m2-6a7 7 0 1 1-14 0 7 7 0 0 1 14 0',plus:'M12 5v14M5 12h14',chevron:'m9 5 7 7-7 7',down:'m6 9 6 6 6-6',flag:'M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0',more:'M5 12h.01M12 12h.01M19 12h.01',bell:'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-11 12h4',clock:'M12 8v5l3 2m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0',list:'M9 6h12M9 12h12M9 18h12M3 6h1M3 12h1M3 18h1',close:'m6 6 12 12M6 18 18 6',trash:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',tag:'M3 3h8l10 10-8 8L3 11zM7 7h.01',folder:'M3 7V4h6l3 3h9v13H3z',arrow:'M5 12h14m-5-5 5 5-5 5',leaf:'M20 3C7 2 2 9 7 17c8 5 15 0 13-14zM4 21 16 9',logout:'M9 4H4v16h5m4-13 5 5-5 5m-5-5h10',download:'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5',moon:'M20 15A9 9 0 0 1 9 3a9 9 0 1 0 11 12',board:'M4 4h16v16H4zM12 4v16M4 10h8m0 4h8'};
const icon=(name,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name]||paths.list}"/></svg>`;
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const day=(offset=0)=>{const d=new Date();d.setDate(d.getDate()+offset);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
let today=day();
const initial={lists:[{id:'work',name:'工作事务',color:'#8b7bda'},{id:'life',name:'生活日常',color:'#68b397'},{id:'learn',name:'自我成长',color:'#d5a466'}],tasks:[{id:'1',title:'完成品牌官网的设计方案',list:'work',date:today,priority:1,notes:'整理设计思路，让每一个细节都有迹可循。\n\n设计方向：简洁、自然、有温度。',tags:['设计'],subtasks:[{text:'收集灵感与参考',done:true},{text:'梳理页面结构',done:true},{text:'完成首页视觉设计',done:false}],done:false},{id:'2',title:'和产品团队同步本周进度',list:'work',date:today,priority:2,time:'14:00',notes:'回顾本周进展，确认下一步的优先事项。',tags:['会议'],subtasks:[],done:false},{id:'3',title:'阅读《原子习惯》30 分钟',list:'learn',date:today,priority:0,notes:'每天进步一点点。',tags:['阅读'],subtasks:[],done:false},{id:'4',title:'傍晚去公园散步',list:'life',date:today,priority:0,time:'18:30',notes:'放下手机，给自己一点留白。',tags:[],subtasks:[],done:false},{id:'5',title:'整理下周的工作计划',list:'work',date:today,priority:3,notes:'',tags:[],subtasks:[],done:false},{id:'6',title:'喝一杯温水，开启新的一天',list:'life',date:today,priority:0,notes:'',tags:[],subtasks:[],done:true},{id:'7',title:'整理桌面，给专注留一点空间',list:'life',date:today,priority:0,notes:'',tags:[],subtasks:[],done:true},{id:'8',title:'准备周末的短途旅行',list:'life',date:day(2),priority:2,notes:'选一处安静的地方走走。',tags:['生活'],subtasks:[],done:false},{id:'9',title:'学习一个新的交互设计技巧',list:'learn',date:day(1),priority:0,notes:'',tags:[],subtasks:[],done:false},{id:'10',title:'记录突然想到的好点子',list:'inbox',date:'',priority:0,notes:'',tags:[],subtasks:[],done:false}]};
const loaded=loadData(()=>localStorage,initial);
let data=loaded.data;
let readWarning=loaded.warning, saveWarning=loaded.warning;
let deadlineFilter='all', taskSort='manual';
let view='kanban',selected=null,query='',priorityOnly=false,board=false,showDone=true,month=new Date(new Date().getFullYear(),new Date().getMonth(),1),timer=null;
const focusTimer=createFocusTimer();
const app=document.querySelector('#app'),overlay=document.querySelector('#overlay');
// Loaded tasks already have a stable stage; startup never overwrites stored data.
function save(){
  const result=saveData(()=>localStorage,data,readWarning);
  saveWarning=result.warning;
  updateStorageStatus();
  if(!result.saved)toast(readWarning?'自动保存已暂停，请先恢复备份':'修改尚未保存，请导出备份或重试');
  return result.saved;
}
function updateStorageStatus(){
  app.querySelectorAll('[data-save-status]').forEach(el=>{
    el.classList.toggle('save-failed',Boolean(saveWarning));
    el.innerHTML=`<span class="status-dot"></span>${saveWarning?'修改尚未保存':'已自动保存到此设备'}`;
  });
  app.querySelector('.storage-warning')?.remove();
  if(!saveWarning)return;
  const container=view==='kanban'?app.querySelector('.kanban-toolbar'):app.querySelector('.content');
  container.insertAdjacentHTML(view==='kanban'?'beforebegin':'afterbegin',`<div class="storage-warning" role="status"><span>${esc(saveWarning)}</span><button type="button">${readWarning?'从备份恢复':'重试保存'}</button></div>`);
  app.querySelector('.storage-warning button').onclick=()=>readWarning?importBackup():save();
}

function toast(msg){const el=document.querySelector('#toast');el.textContent=msg;el.classList.add('visible');clearTimeout(window.toastTimeout);window.toastTimeout=setTimeout(()=>el.classList.remove('visible'),2500)}
function listOf(t){return data.lists.find(l=>l.id===t.list)||{name:'收集箱',color:'#8e99aa'}}
function filtered(){return sortTasks(data.tasks.filter(t=>{const matches=view==='@overdue'?isOverdue(t,today):view==='today'?t.date===today:view==='week'?t.date&&t.date>=today&&t.date<=day(6):view==='all'||view==='calendar'?true:view==='completed'?t.done:view==='inbox'?t.list==='inbox':t.list===view;return matches&&matchesSearch(t,query,data.lists)&&(!priorityOnly||t.priority===1)}),taskSort)}
function count(v){return data.tasks.filter(t=>!t.done&&(v==='@overdue'?isOverdue(t,today):v==='today'?t.date===today:v==='week'?t.date&&t.date>=today&&t.date<=day(6):v==='all'?true:t.list===v)).length}
function nav(v,label,ico){return `<button class="nav-item ${view===v?'active':''}" data-view="${v}" ${view===v?'aria-current="page"':''}>${icon(ico)}<span class="nav-label">${label}</span>${['kanban','calendar','completed'].includes(v)?'':`<span class="count">${count(v)||''}</span>`}</button>`}
function sortControl(){return `<label class="task-sort"><span>排序</span><select data-task-sort aria-label="任务排序">${sortOptions.map(([id,label])=>`<option value="${id}" ${taskSort===id?'selected':''}>${label}</option>`).join('')}</select></label>`}
function activeFiltersHtml(){
  const labels=[query.trim()?`搜索：${query.trim()}`:'',priorityOnly?'仅高优先级':'',view==='kanban'&&deadlineFilter!=='all'?(deadlineFilter==='today'?'今天到期':'逾期任务'):''].filter(Boolean);
  return labels.length?`<div class="active-filters" role="status"><span>${labels.map(esc).join(' · ')}</span><button data-clear-filters>清除筛选</button></div>`:'';
}
function emptyTasksHtml(completedCount=0){
  const filtered=Boolean(query.trim()||priorityOnly);
  return `<div class="empty">${icon(filtered?'search':'check',35)}<h3>${filtered?'没有匹配的任务':view==='completed'?'还没有完成记录':completedCount?'待办都已完成':'这里还没有任务'}</h3><p>${filtered?'试试其他关键词，或清除筛选条件。':view==='completed'?'完成一项任务后，就能在这里找到它。':'添加一件想做的小事，或者享受片刻留白。'}</p></div>`;
}
function bindTaskTools(){
  app.querySelectorAll('[data-task-sort]').forEach(el=>el.onchange=()=>{taskSort=el.value;render()});
  app.querySelectorAll('[data-clear-filters]').forEach(el=>el.onclick=()=>{query='';priorityOnly=false;deadlineFilter='all';render()});
  app.querySelectorAll('[data-edit-list]').forEach(el=>el.onclick=()=>editList(el.dataset.editList));
  app.querySelectorAll('.task[data-task]').forEach(el=>el.onkeydown=e=>{if(e.target===el&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selected=el.dataset.task;render()}});
}
function editList(id){
  const list=data.lists.find(l=>l.id===id);
  if(!list)return;
  modal(`<div class="modal-icon">${icon('folder',26)}</div><h2>管理清单</h2><p>调整名称和颜色，让事情更容易找到。</p><form id="edit-list-form"><label class="field-label">清单名称<input name="name" value="${esc(list.name)}" required maxlength="30"></label><label class="field-label">清单颜色<input name="color" type="color" value="${list.color}"></label><button class="primary-button" type="submit">保存修改</button></form><div class="list-danger-zone"><span>不再需要这个清单？任务可以移回收集箱。</span><button class="text-button danger-text" id="delete-list">删除清单</button></div>`);
  overlay.querySelector('form').onsubmit=e=>{
    e.preventDefault();
    if(!updateList(data,id,e.target.elements.name.value,e.target.elements.color.value))return;
    save();closeModal();render();toast('清单已更新');
  };
  overlay.querySelector('#delete-list').onclick=()=>confirmDeleteList(id);
}
function confirmDeleteList(id){
  const list=data.lists.find(l=>l.id===id);
  if(!list)return;
  const count=data.tasks.filter(t=>t.list===id).length;
  modal(`<div class="modal-icon">${icon('folder',26)}</div><h2>删除“${esc(list.name)}”？</h2><p>${count?`其中 ${count} 项任务将移至收集箱（包含已完成任务）。日期、备注、状态和子任务都会保留。`:'这是一个空清单，删除后不会影响其他任务。'}</p><div class="list-confirm-actions"><button class="text-button" id="cancel-delete-list">返回编辑</button><button class="primary-button danger" id="confirm-delete-list">${count?'移至收集箱并删除清单':'删除空清单'}</button></div>`);
  overlay.querySelector('#cancel-delete-list').onclick=()=>editList(id);
  overlay.querySelector('#confirm-delete-list').onclick=()=>{
    if(!removeList(data,id))return;
    if(view===id)view='inbox';
    save();closeModal();render();toast(count?`清单已删除，${count} 项任务已移至收集箱`:'空清单已删除');
  };
}
function workspaceHtml(){return `
  <aside class="sidebar" aria-label="工作空间导航">
    <div class="workspace"><div class="workspace-name"><strong>日序<span>Daylight</span></strong><small>我的空间</small></div><span class="personal">个人</span></div>
    <label class="search">${icon('search',17)}<input id="search" aria-label="搜索任务" placeholder="搜索任务" value="${esc(query)}"><kbd>⌘ K</kbd></label>
    <nav class="workspace-views" aria-label="任务视图">${nav('kanban','看板','board')}${nav('all','清单','list')}</nav>
    <div class="sidebar-scroll">
      <div class="nav-heading">任务安排</div>
      <nav class="schedule-nav" aria-label="任务安排">${nav('inbox','收集箱','inbox')}${nav('today','今天','sun')}${nav('@overdue','逾期任务','clock')}${nav('week','最近 7 天','calendar')}${nav('calendar','日历','calendar')}</nav>
      <div class="list-heading"><span>我的清单</span><button class="icon-button" title="新建清单" aria-label="新建清单" data-action="new-list">${icon('plus',16)}</button></div>
      <nav class="collection-nav" aria-label="我的清单">${data.lists.map(l=>`<div class="collection-item"><button class="nav-item ${view===l.id?'active':''}" data-view="${l.id}" ${view===l.id?'aria-current="page"':''}><span class="list-square" style="--list-color:${l.color}" aria-hidden="true"></span><span class="nav-label">${esc(l.name)}</span><span class="count">${count(l.id)||''}</span></button><button class="collection-edit icon-button" data-edit-list="${l.id}" aria-label="管理清单：${esc(l.name)}" title="管理清单">${icon('more',16)}</button></div>`).join('')}</nav>
      <button class="new-list" data-action="new-list">${icon('plus',16)}添加清单</button>
    </div>
    <div class="sidebar-bottom">
      <nav aria-label="记录与工具">${nav('completed','已完成','check')}<button class="nav-item" data-action="focus">${icon('clock')}<span class="nav-label">番茄专注</span></button><button class="nav-item" data-action="theme">${icon('sun')}<span class="nav-label">外观主题</span></button></nav>
      <div class="backup-tools"><button data-action="export">${icon('download',16)}<span>导出备份</span></button><button data-action="import">${icon('folder',16)}<span>从备份恢复</span></button></div>
      <div class="saved" data-save-status role="status"><span class="status-dot"></span>已自动保存到此设备</div>
    </div>
  </aside>`}
function workspaceHeader(title){return `<header class="main-header"><button class="mobile-menu icon-button" title="打开工作空间导航" data-action="mobile-menu">${icon('list',18)}</button><div class="breadcrumb">我的空间 <span>/</span> ${esc(title)}</div><div class="header-actions"><button class="theme-trigger" title="外观主题" data-action="theme">${icon('sun',18)}<span>主题</span></button><span class="today-date">${new Date().toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'})}</span><button class="icon-button" title="查看快捷键" data-action="shortcuts">${icon('more')}</button></div></header>`}
function render(){today=day();document.body.classList.toggle('kanban-home',view==='kanban');if(view==='kanban'){renderKanban();return}const tasks=filtered(),done=tasks.filter(t=>t.done),pending=tasks.filter(t=>!t.done),percent=tasks.length?Math.round(done.length/tasks.length*100):0;const title={'@overdue':'逾期任务',today:'今天',week:'最近 7 天',all:'清单',inbox:'收集箱',completed:'已完成',calendar:'日历'}[view]||data.lists.find(l=>l.id===view)?.name||'今天';app.innerHTML=`${workspaceHtml()}<main class="main">${workspaceHeader(title)}<div class="content"><div class="page-heading"><div><div class="eyebrow">${view==='today'?'MAKE ROOM FOR WHAT MATTERS':'A LITTLE MORE ORGANIZED'}</div><h1>${view==='today'?`<span class="sun-symbol">${icon('sun',29)}</span>`:''}${esc(title)}<span class="heading-count">${pending.length}</span></h1><p>${view==='today'?'新的一天，从一件小事开始。':view==='inbox'?'先记下来，再慢慢安排。':'让每一件重要的小事，都有着落。'}</p></div></div>${view==='today'?`<section class="daily-card"><div class="daily-icon">${icon('leaf',25)}</div><div class="daily-copy"><strong>不必匆忙，按自己的节奏来。</strong><p>每完成一件小事，都是向前的一步。</p></div><div class="progress-circle" style="--progress:${percent}%"><span>${percent}<small>%</small></span></div></section>`:''}<form id="add-task" class="add-task">${icon('plus',21)}<input name="title" autocomplete="off" placeholder="添加任务，开启有序的一天" required maxlength="200"><button type="submit" title="添加任务">${icon('arrow',18)}</button></form>${view==='calendar'?activeFiltersHtml()+calendarHtml():`<div class="section-bar"><span>${icon('down',14)}${view==='completed'?'完成记录':'待办任务'} <b>${view==='completed'?done.length:pending.length}</b></span>${sortControl()}<button class="filter-button ${priorityOnly?'on':''}" data-action="filter">${icon('flag',14)}${priorityOnly?'仅高优先级':'筛选高优先级'}</button></div>${activeFiltersHtml()}<div class="task-list ${board?'board':''}">${view==='completed'?(done.length?done.map(taskHtml).join(''):emptyTasksHtml()):pending.length?pending.map(taskHtml).join(''):emptyTasksHtml(done.length)}</div>${view!=='completed'&&done.length?`<button class="completed-heading" data-action="toggle-done">${icon(showDone?'down':'chevron',14)}已完成 <span>${done.length}</span></button>${showDone?`<div class="completed-tasks">${done.map(taskHtml).join('')}</div>`:''}`:''}`}<footer class="main-footer"><span class="tiny-leaf">${icon('leaf',14)}</span> 给重要的事，一点专属的时间。<span>日序 · Daylight</span></footer></div></main>${detailHtml()}`;bind();updateStorageStatus();}
function deadlineHtml(t){const info=deadlineInfo(t,today);return info?`<span class="task-deadline ${info.overdue?'is-overdue':t.date===today&&!t.done?'is-due-today':''}">${icon('calendar',12)}${esc(info.label)}</span>`:''}
function taskHtml(t){const list=listOf(t);return `<article class="task ${t.done?'done':''} ${t.id===selected?'selected':''}" data-task="${t.id}" tabindex="0" aria-label="编辑任务：${esc(t.title)}"><button class="checkbox p${t.priority} ${t.done?'checked':''}" data-complete="${t.id}" title="${t.done?'标记为未完成':'完成任务'}">${t.done?icon('check',12):''}</button><div class="task-body"><div class="task-title">${esc(t.title)}</div><div class="task-meta">${deadlineHtml(t)}${t.tags.map(tag=>`<span class="tag">${esc(tag)}</span>`).join('')}${t.subtasks.length?`<span>${icon('list',12)} ${t.subtasks.filter(s=>s.done).length}/${t.subtasks.length}</span>`:''}${t.time&&!t.date?`<span class="task-time">${icon('clock',12)} ${t.time}</span>`:''}<span class="task-list-name"><i style="background:${list.color}"></i>${esc(list.name)}</span></div></div>${t.priority?`<span class="priority p${t.priority}" title="${['无优先级','高优先级','中优先级','低优先级'][t.priority]}">${icon('flag',15)}</span>`:''}<button class="row-more icon-button" title="编辑任务" data-select="${t.id}">${icon('more',17)}</button></article>`}
function detailHtml(){const t=data.tasks.find(t=>t.id===selected);if(!t)return `<aside class="detail empty-detail">${icon('leaf',42)}<p>选择一项任务，查看它的细节</p></aside>`;const l=listOf(t);return `<aside class="detail"><div class="detail-top"><span><i style="background:${l.color}"></i>${esc(l.name)}</span><button class="icon-button" data-action="close-detail" title="关闭详情">${icon('close',18)}</button></div><div class="detail-content"><div class="detail-title"><button class="checkbox p${t.priority} ${t.done?'checked':''}" data-complete="${t.id}" title="切换完成状态">${t.done?icon('check',12):''}</button><textarea id="detail-title" aria-label="任务名称" rows="2" maxlength="200">${esc(t.title)}</textarea></div><div class="detail-fields">${isOverdue(t,today)?`<div class="deadline-notice"><span>${deadlineHtml(t)}</span><button type="button" data-reschedule="${t.id}">安排到今天</button></div>`:''}<label>${icon('board',17)}<span>状态</span><select id="detail-status" aria-label="任务状态">${stages.map(s=>`<option value="${s.id}" ${statusOf(t)===s.id?'selected':''}>${s.name}</option>`).join('')}</select></label><label>${icon('calendar',17)}<span>日期</span><input type="date" id="detail-date" value="${esc(t.date)}" aria-label="任务日期"></label><label>${icon('flag',17)}<span>优先级</span><select id="detail-priority" class="p${t.priority}" aria-label="优先级">${['无优先级','高优先级','中优先级','低优先级'].map((v,i)=>`<option value="${i}" ${t.priority===i?'selected':''}>${v}</option>`).join('')}</select></label><label>${icon('folder',17)}<span>清单</span><select id="detail-list" aria-label="所属清单">${[{id:'inbox',name:'收集箱'},...data.lists].map(l=>`<option value="${l.id}" ${l.id===t.list?'selected':''}>${esc(l.name)}</option>`).join('')}</select></label><label>${icon('clock',17)}<span>时间</span><input type="time" id="detail-time" aria-label="任务时间" value="${esc(t.time||'')}"></label></div><div class="notes-label">备注</div><textarea id="detail-notes" class="notes" aria-label="任务备注" placeholder="添加描述，记录你的想法…">${esc(t.notes)}</textarea><div class="subtask-heading"><span>子任务</span><span>${t.subtasks.filter(s=>s.done).length} / ${t.subtasks.length}</span></div><div class="subtasks">${t.subtasks.map((s,i)=>`<div class="subtask ${s.done?'done':''}"><button class="checkbox ${s.done?'checked':''}" data-sub="${i}" title="${s.done?'标记子任务为未完成':'完成子任务'}" aria-label="切换子任务完成状态">${s.done?icon('check',11):''}</button><span>${esc(s.text)}</span><button class="delete-sub" data-delete-sub="${i}" title="删除子任务">${icon('close',13)}</button></div>`).join('')}</div><form id="add-subtask">${icon('plus',16)}<input placeholder="添加子任务" name="subtask" maxlength="200" aria-label="新子任务"></form><div class="detail-tags">${icon('tag',15)}<input id="detail-tags" value="${esc(t.tags.join(', '))}" placeholder="添加标签，用逗号分隔" aria-label="标签"></div></div><div class="detail-bottom"><span>${t.done?'已完成 · 做得不错！':'每一个小步骤，都算数。'}</span><button class="icon-button" title="删除任务" data-action="delete-task">${icon('trash',16)}</button></div></aside>`}
function calendarHtml(){const year=month.getFullYear(),m=month.getMonth(),offset=(new Date(year,m,1).getDay()+6)%7,days=new Date(year,m+1,0).getDate();return `<div class="calendar-top"><h2>${year} 年 ${m+1} 月</h2><div><button class="icon-button" data-month="-1" title="上个月">‹</button><button class="text-button" data-action="this-month">本月</button><button class="icon-button" data-month="1" title="下个月">›</button></div></div><div class="calendar-grid">${['一','二','三','四','五','六','日'].map(d=>`<div class="weekday">${d}</div>`).join('')}${Array.from({length:offset},()=>'<div class="calendar-day muted"></div>').join('')}${Array.from({length:days},(_,i)=>{let d=`${year}-${String(m+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;return `<div class="calendar-day ${d===today?'is-today':''}"><span class="day-number">${i+1}</span>${filtered().filter(t=>t.date===d).map(t=>`<button class="calendar-task ${t.done?'done':''}" data-select="${t.id}">${esc(t.title)}</button>`).join('')}</div>`}).join('')}</div>`}
function bind(){bindTaskTools();app.querySelectorAll('[data-reschedule]').forEach(el=>el.onclick=()=>{const t=data.tasks.find(t=>t.id===el.dataset.reschedule);if(t&&rescheduleToToday(t,day())){save();render();toast('已安排到今天')}});app.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>{view=el.dataset.view;selected=null;query='';board=false;priorityOnly=false;document.body.classList.remove('nav-open');render()});app.querySelectorAll('[data-task]').forEach(el=>el.onclick=e=>{if(!e.target.closest('button, select, input, a')){selected=el.dataset.task;render()}});app.querySelectorAll('[data-select]').forEach(el=>el.onclick=()=>{selected=el.dataset.select;render()});app.querySelectorAll('[data-complete]').forEach(el=>el.onclick=()=>{const t=data.tasks.find(t=>t.id===el.dataset.complete);setStatus(t,t.done?(t.previousStatus||'todo'):'done',today);save();render();if(t.done)toast('又完成了一件事，做得不错！')});app.querySelectorAll('[data-action]').forEach(el=>el.onclick=()=>action(el.dataset.action));const search=app.querySelector('#search');
let composing=false;
const applySearch=e=>{if(composing||e.isComposing||query===e.target.value)return;query=e.target.value;const pos=e.target.selectionStart;render();const input=app.querySelector('#search');input.focus();input.setSelectionRange(pos,pos)};
search.oncompositionstart=()=>{composing=true};
search.oncompositionend=e=>{composing=false;applySearch(e)};
search.oninput=applySearch;if(app.querySelector('#add-task'))app.querySelector('#add-task').onsubmit=e=>{e.preventDefault();const input=e.target.elements.title;const title=input.value.trim();if(!title)return;const t={id:crypto.randomUUID(),title,list:data.lists.some(l=>l.id===view)?view:'inbox',date:['today','week','calendar','@overdue'].includes(view)?today:'',priority:0,notes:'',tags:[],subtasks:[],done:false};setStatus(t,statusOf(t),today);if(view==='completed')view='inbox';else if(view==='@overdue')view='today';data.tasks.push(t);selected=t.id;save();render();app.querySelector('#add-task input').focus()};const t=data.tasks.find(t=>t.id===selected);if(t){app.querySelector('#detail-status').onchange=e=>{setStatus(t,e.target.value,today);save();render()};const updates={'detail-title':'title','detail-date':'date','detail-priority':'priority','detail-list':'list','detail-time':'time','detail-notes':'notes','detail-tags':'tags'};Object.entries(updates).forEach(([id,key])=>{app.querySelector('#'+id).onchange=e=>{if(key==='title'&&!e.target.value.trim()){e.target.value=t.title;return}t[key]=key==='priority'?Number(e.target.value):key==='tags'?e.target.value.split(/[,，]/).map(v=>v.trim()).filter(Boolean):e.target.value.trim();save();if(!['title','notes','tags'].includes(key)){render()}else if(key==='title'){app.querySelectorAll(`[data-task="${t.id}"] .task-title, .calendar-task[data-select="${t.id}"], [data-task="${t.id}"] .kanban-card-title`).forEach(el=>el.textContent=t.title)}}});app.querySelectorAll('[data-sub]').forEach(el=>el.onclick=()=>{t.subtasks[+el.dataset.sub].done=!t.subtasks[+el.dataset.sub].done;save();render()});app.querySelectorAll('[data-delete-sub]').forEach(el=>el.onclick=()=>{t.subtasks.splice(+el.dataset.deleteSub,1);save();render()});app.querySelector('#add-subtask').onsubmit=e=>{e.preventDefault();const text=e.target.elements.subtask.value.trim();if(text){t.subtasks.push({text,done:false});save();render();app.querySelector('#add-subtask input').focus()}}}app.querySelectorAll('[data-month]').forEach(el=>el.onclick=()=>{month.setMonth(month.getMonth()+Number(el.dataset.month));render()})}
let modalTrigger=null;
function modal(html){hideTooltip();if(!overlay.innerHTML)modalTrigger=document.activeElement;app.inert=true;overlay.innerHTML=`<div class="modal-backdrop"><section class="modal" role="dialog" aria-modal="true"><button class="modal-close icon-button" title="关闭">${icon('close')}</button>${html}</section></div>`;const heading=overlay.querySelector('h2');if(heading){heading.id=heading.id||'dialog-heading';overlay.querySelector('.modal').setAttribute('aria-labelledby',heading.id)}overlay.querySelector('.modal-close').onclick=closeModal;overlay.querySelector('.modal-backdrop').onclick=e=>{if(e.target===e.currentTarget)closeModal()};(overlay.querySelector('input')||overlay.querySelector('.modal-close')).focus();overlay.querySelector('.modal').onkeydown=e=>{if(e.key!=='Tab')return;const controls=[...overlay.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(el=>!el.disabled);const first=controls[0],last=controls.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}}
function closeModal(){overlay.innerHTML='';app.inert=false;if(modalTrigger?.isConnected)modalTrigger.focus();modalTrigger=null}
function action(a){if(a==='theme'){themeSettings()}if(a==='import'){importBackup()}if(a==='kanban-home'){view='kanban';selected=null;query='';render()}if(a==='new-card'){newCard('planning')}if(a==='refresh-board'){render();toast('看板已刷新')} if(a==='mobile-menu'){document.body.classList.toggle('nav-open')}if(a==='close-detail'){selected=null;render()}if(a==='list-view'||a==='board-view'){board=a==='board-view';if(view==='calendar')view='today';render()}if(a==='filter'){priorityOnly=!priorityOnly;render()}if(a==='toggle-done'){showDone=!showDone;render()}if(a==='this-month'){month=new Date(new Date().getFullYear(),new Date().getMonth(),1);render()}if(a==='new-list'){modal(`<div class="modal-icon">${icon('folder',26)}</div><h2>给生活，多一点条理</h2><p>创建一个清单，收纳同一类事情。</p><form id="new-list-form"><label class="field-label">清单名称<input name="name" placeholder="例如：旅行计划" required maxlength="30"></label><label class="field-label">清单颜色<input name="color" type="color" value="#8b7bda"></label><button class="primary-button">创建清单</button></form>`);overlay.querySelector('form').onsubmit=e=>{e.preventDefault();const name=e.target.elements.name.value.trim();if(!name)return;const l={id:crypto.randomUUID(),name,color:e.target.elements.color.value};data.lists.push(l);view=l.id;save();closeModal();render();toast('清单已创建')}}if(a==='delete-task'){modal(`<h2>删除这项任务？</h2><p>“${esc(data.tasks.find(t=>t.id===selected)?.title)}”将从此设备移除。</p><button class="primary-button danger" id="confirm-delete">删除任务</button>`);overlay.querySelector('#confirm-delete').onclick=()=>{data.tasks=data.tasks.filter(t=>t.id!==selected);selected=null;save();closeModal();render();toast('任务已删除')}}if(a==='shortcuts')modal(`<h2>让操作，更顺手</h2><div class="shortcut-row"><span>搜索任务</span><kbd>⌘ / Ctrl + K</kbd></div><div class="shortcut-row"><span>新建任务</span><kbd>N</kbd></div><div class="shortcut-row"><span>关闭弹窗或详情</span><kbd>Esc</kbd></div>`);if(a==='export'){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download=`日序备份-${today}.json`;link.click();setTimeout(()=>URL.revokeObjectURL(url),5000);toast('任务备份已导出')}if(a==='focus')showFocus()}

function themeSettings(){
  const theme=window.daylightTheme;
  modal(`<div class="modal-icon">${icon('sun',26)}</div><h2 id="theme-heading">外观主题</h2><p>选一种喜欢的颜色，让整个工作空间保持一致。</p><div class="theme-options" role="group" aria-label="选择外观主题">${theme.themes.map(t=>`<button class="theme-option" data-theme-option="${t.id}" aria-pressed="${theme.current===t.id}"><span class="theme-preview preview-${t.id}" aria-hidden="true"><i></i><span><b></b><b></b></span><span><b></b></span></span><span class="theme-option-info"><strong>${t.name}</strong><span class="theme-selected">${icon('check',15)}</span></span><span class="theme-description">${t.description}</span></button>`).join('')}</div><p class="theme-save-hint" role="status">立即生效，自动记住此设备上的选择。</p>`);
  overlay.querySelector('.modal').setAttribute('aria-labelledby','theme-heading');
  overlay.querySelectorAll('[data-theme-option]').forEach(button=>button.onclick=()=>{
    const saved=theme.apply(button.dataset.themeOption,true);
    updateThemeSelection();
    overlay.querySelector('.theme-save-hint').textContent=saved?'主题已应用，下次打开时会保留。':'主题已应用；浏览器未允许保存，刷新后将恢复默认。';
  });
  overlay.querySelector('[aria-pressed="true"]').focus();
}
function updateThemeSelection(){
  overlay.querySelectorAll('[data-theme-option]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.themeOption===window.daylightTheme.current)));
}
window.addEventListener('daylight-theme-change',updateThemeSelection);

function importBackup(){
  modal(`<div class="modal-icon">${icon('folder',26)}</div><h2>从备份恢复</h2><p>选择日序导出的 JSON 文件。校验通过后，可以预览任务数量并确认恢复。</p><label class="field-label">备份文件<input id="backup-file" type="file" accept=".json,application/json"></label><p id="backup-error" role="alert"></p>`);
  const input=overlay.querySelector('#backup-file');
  const error=overlay.querySelector('#backup-error');
  input.onchange=async()=>{
    const file=input.files[0];
    if(!file)return;
    error.textContent='';
    if(file.size>5*1024*1024){error.textContent='文件超过 5 MB，请选择较小的备份文件';return}
    input.disabled=true;
    let backup;
    try{backup=parseBackup(await file.text())}catch(err){
      if(input.isConnected){error.textContent=err.message||'无法读取备份文件';input.disabled=false}
      return;
    }
    if(!input.isConnected)return;
    modal(`<h2>确认恢复备份？</h2><p>备份包含 ${backup.tasks.length} 项任务、${backup.lists.length} 个清单。</p><p>恢复将替换当前的 ${data.tasks.length} 项任务和 ${data.lists.length} 个清单。建议先导出当前数据。</p><div class="timer-actions"><button class="text-button" id="export-before-restore">先导出当前数据</button><button class="text-button" id="cancel-restore">取消</button></div><button class="primary-button" id="confirm-restore">替换并恢复</button><p id="restore-error" role="alert"></p>`);
    overlay.querySelector('#export-before-restore').onclick=()=>action('export');
    overlay.querySelector('#cancel-restore').onclick=closeModal;
    overlay.querySelector('#confirm-restore').onclick=()=>{
      try{data=restoreBackup(backup,localStorage)}catch{
        overlay.querySelector('#restore-error').textContent='恢复失败，当前数据未替换。请检查浏览器存储权限或可用空间后重试。';
        return;
      }
      readWarning='';saveWarning='';
      selected=null;view='kanban';query='';priorityOnly=false;deadlineFilter='all';
      closeModal();render();toast('备份已恢复');
    };
  };
}
function timerText(seconds){return `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`}
function updateFocus(state=focusTimer.read()){
  if(!state.running){clearInterval(timer);timer=null}
  const display=overlay.querySelector('#timer');
  if(display)display.textContent=timerText(state.seconds);
  const button=overlay.querySelector('#start-timer');
  if(button)button.textContent=state.running?'暂停专注':state.seconds===0||state.seconds===25*60?'开始专注':'继续专注';
  if(state.completed)toast('专注完成，休息一下吧');
  return state;
}
function showFocus(){
  const state=focusTimer.read();
  modal(`<div class="focus-leaf">${icon('leaf',35)}</div><h2 id="focus-heading">此刻，只专注一件事</h2><p>${esc(data.tasks.find(t=>t.id===selected)?.title||'给自己一段不被打扰的时间')}</p><div class="timer" id="timer" role="timer" aria-label="专注剩余时间">${timerText(state.seconds)}</div><div class="timer-actions"><button class="primary-button" id="start-timer"></button><button class="text-button" id="reset-timer">重新开始</button></div><p class="focus-hint">25 分钟专注，然后好好休息。关闭弹窗后仍会继续计时，刷新页面会重置。</p>`);
  overlay.querySelector('.modal').setAttribute('aria-labelledby','focus-heading');
  updateFocus(state);
  overlay.querySelector('#start-timer').onclick=()=>{
    const current=updateFocus();
    const next=current.running?focusTimer.pause():focusTimer.start();
    if(next.running&&timer===null)timer=setInterval(updateFocus,250);
    updateFocus(next);
  };
  overlay.querySelector('#reset-timer').onclick=()=>updateFocus(focusTimer.reset());
}
// Catch up immediately after background throttling or device sleep.
// The timer model emits completion only once, even if several events arrive.
window.addEventListener('focus',()=>updateFocus());
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateFocus()});
document.addEventListener('keydown',e=>{if(e.isComposing||e.keyCode===229)return;const editing=/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);if(!overlay.innerHTML&&(e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();document.querySelector('#search').focus()}if(e.key==='Escape'){if(overlay.innerHTML)closeModal();else{selected=null;render()}}if(!editing&&!overlay.innerHTML&&e.key.toLowerCase()==='n'&&!e.metaKey&&!e.ctrlKey){e.preventDefault();view==='kanban'?newCard('planning'):document.querySelector('#add-task input').focus()}});
function kanbanTasks(){return sortTasks(data.tasks.filter(t=>matchesDeadline(t,deadlineFilter,today)&&matchesSearch(t,query,data.lists)&&(!priorityOnly||t.priority===1)),taskSort)}
function renderKanban(){
  const tasks=kanbanTasks();
  app.innerHTML=`${workspaceHtml()}<main class="main kanban-main">${workspaceHeader('看板')}<div class="kanban-page">
    <header class="kanban-heading"><div><h1>看板</h1></div><button class="kanban-add" data-action="new-card">${icon('plus',18)}添加任务</button></header>
    <div class="kanban-toolbar"><label class="deadline-filter"><span>截止日期</span><select id="deadline-filter" aria-label="按截止日期筛选">${[['all','全部任务'],['today','今天到期'],['overdue','逾期任务']].map(([value,label])=>`<option value="${value}" ${deadlineFilter===value?'selected':''}>${label}${value==='overdue'?` (${data.tasks.filter(t=>isOverdue(t,today)).length})`:''}</option>`).join('')}</select></label>${sortControl()}<span class="kanban-summary" aria-live="polite">${query.trim()||deadlineFilter!=='all'||priorityOnly?`找到 ${tasks.length} 项任务`:`${data.tasks.length} 项任务 · ${taskSort==='manual'?'拖动卡片调整状态与顺序':'已按'+sortOptions.find(([id])=>id===taskSort)[1]+'排序'}`}</span><button class="board-refresh" data-action="refresh-board">刷新</button></div>
    ${activeFiltersHtml()}<div class="kanban-columns">${stages.map(stage=>{const items=tasks.filter(t=>statusOf(t)===stage.id);return `<section class="kanban-column stage-${stage.id}" data-stage="${stage.id}" aria-label="${stage.name}"><header class="column-heading"><span class="stage-dot"></span><h2>${stage.name}</h2><span class="stage-count">${items.length}</span><button class="column-add" title="添加到${stage.name}" data-new-stage="${stage.id}">${icon('plus',20)}</button></header><div class="column-cards">${items.map(kanbanCard).join('')}${!items.length?`<div class="column-empty">${query.trim()||deadlineFilter!=='all'||priorityOnly?'没有匹配的任务':'暂无任务'}</div>`:''}</div>${stage.id==='done'?`<footer class="column-footer">已显示 ${items.length} / ${data.tasks.filter(t=>statusOf(t)==='done').length}</footer>`:''}</section>`}).join('')}</div>
    <footer class="kanban-footer"><span data-save-status><i class="status-dot"></i>已自动保存到此设备</span><span>日序 · Daylight</span></footer>
  </div></main>${selected?`<div class="board-detail-shade" data-action="close-detail"></div>${detailHtml()}`:''}`;
  bind();bindKanban();updateStorageStatus();
}
function kanbanCard(t){const stage=statusOf(t);return `<article class="kanban-card ${stage==='done'?'card-completed':''}" draggable="${taskSort==='manual'}" data-task="${t.id}" tabindex="0" aria-label="编辑任务：${esc(t.title)}"><div class="card-top"><span class="drag-handle" title="${taskSort==='manual'?'拖动调整顺序':'切换到手动顺序后可拖动'}">⠿</span><button class="card-more" data-select="${t.id}" title="编辑${esc(t.title)}">${icon('more',19)}</button></div><h3 class="kanban-card-title">${esc(t.title)}</h3>${t.notes?`<p class="kanban-card-description">${esc(t.notes)}</p>`:''}${deadlineHtml(t)}<div class="card-bottom"><span class="card-caption">${stage==='done'?(t.completedAt?`${esc(t.completedAt.slice(5).replace('-','月'))}日 完成`:'已完成'):t.subtasks.length?`${t.subtasks.filter(s=>s.done).length} / ${t.subtasks.length} 子任务`:''}</span><select class="card-status" data-status-task="${t.id}" aria-label="${esc(t.title)}的状态">${stages.map(s=>`<option value="${s.id}" ${s.id===stage?'selected':''}>${s.name}</option>`).join('')}</select></div></article>`}
function newCard(status){modal(`<div class="kanban-eyebrow">A NEW LITTLE THING</div><h2>添加任务</h2><form id="new-card-form"><label class="field-label">任务名称<input name="title" placeholder="想做点什么？" maxlength="200" required></label><label class="field-label">说明<textarea name="notes" placeholder="补充一些想法或细节…" rows="3"></textarea></label><div class="new-card-fields"><label class="field-label">状态<select name="status">${stages.map(s=>`<option value="${s.id}" ${s.id===status?'selected':''}>${s.name}</option>`).join('')}</select></label><label class="field-label">日期<input type="date" name="date"></label></div><button class="primary-button" type="submit">添加任务</button></form>`);overlay.querySelector('form').onsubmit=e=>{e.preventDefault();const fields=e.target.elements;const title=fields.title.value.trim();if(!title)return;const task={id:crypto.randomUUID(),title,notes:fields.notes.value.trim(),date:fields.date.value,list:'inbox',priority:0,tags:[],subtasks:[],done:false};setStatus(task,fields.status.value,today);data.tasks.push(task);save();closeModal();render();toast('任务已添加')}}
function bindKanban(){
  app.querySelector('#deadline-filter').onchange=e=>{deadlineFilter=e.target.value;render()};
  app.querySelectorAll('[data-new-stage]').forEach(el=>el.onclick=()=>newCard(el.dataset.newStage));
  app.querySelectorAll('[data-status-task]').forEach(el=>el.onchange=e=>{const task=data.tasks.find(t=>t.id===el.dataset.statusTask);setStatus(task,e.target.value,today);save();render();toast('任务状态已更新')});
  let draggedId=null;
  app.querySelectorAll('.kanban-card').forEach(card=>{
    card.onkeydown=e=>{if(e.target===card&&(e.key==='Enter'||e.key===' ')){e.preventDefault();selected=card.dataset.task;render()}};
    card.ondragstart=e=>{if(e.target.closest('select,button,input')){e.preventDefault();return}draggedId=card.dataset.task;e.dataTransfer.setData('text/plain',draggedId);e.dataTransfer.effectAllowed='move';card.classList.add('dragging')};
    card.ondragend=()=>{draggedId=null;app.querySelectorAll('.dragging,.drag-over,.drop-before').forEach(el=>el.classList.remove('dragging','drag-over','drop-before'))};
  });
  app.querySelectorAll('[data-stage]').forEach(column=>{
    column.ondragover=e=>{if(!draggedId)return;e.preventDefault();e.dataTransfer.dropEffect='move';app.querySelectorAll('.drag-over,.drop-before').forEach(el=>el.classList.remove('drag-over','drop-before'));column.classList.add('drag-over');const target=[...column.querySelectorAll('.kanban-card:not(.dragging)')].find(card=>e.clientY<card.getBoundingClientRect().top+card.getBoundingClientRect().height/2);target?.classList.add('drop-before')};
    column.ondrop=e=>{e.preventDefault();if(!draggedId)return;const target=column.querySelector('.drop-before');moveTask(data.tasks,draggedId,column.dataset.stage,target?.dataset.task,today);save();draggedId=null;render();toast('看板已更新')};
  });
}

render();
if(loaded.warning)toast(loaded.warning);

// Refresh date-based views after midnight and when returning to the app.
setInterval(()=>{if(day()!==today&&!overlay.innerHTML&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)){render()}},30000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&day()!==today&&!overlay.innerHTML&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName))render()});
