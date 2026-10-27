import {stages, statusOf} from './board-model.js';

const fail = () => { throw new Error('备份格式无效，请选择日序导出的 JSON 文件'); };
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string';
const id = value => text(value) && /^[a-zA-Z0-9_-]+$/.test(value);
const date = value => text(value) && (value === '' || (/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0,10) === value));
const reserved = new Set(['inbox','today','week','all','completed','calendar','kanban']);

export function parseBackup(source) {
  let backup;
  try { backup = JSON.parse(source); } catch { fail(); }
  if (!object(backup) || !Array.isArray(backup.lists) || !Array.isArray(backup.tasks)) fail();
  const listIds = new Set();
  const lists = backup.lists.map(list => {
    if (!object(list) || !id(list.id) || reserved.has(list.id) || listIds.has(list.id) || !text(list.name) || !list.name.trim() || !/^#[0-9a-f]{6}$/i.test(list.color)) fail();
    listIds.add(list.id);
    return {id:list.id, name:list.name, color:list.color};
  });
  const taskIds = new Set();
  const tasks = backup.tasks.map(task => {
    if (!object(task) || !id(task.id) || taskIds.has(task.id) || !text(task.title) || !task.title.trim() || !text(task.notes) || !date(task.date) || ![0,1,2,3].includes(task.priority) || typeof task.done !== 'boolean' || (task.list !== 'inbox' && !listIds.has(task.list))) fail();
    if (!Array.isArray(task.tags) || !task.tags.every(text) || !Array.isArray(task.subtasks) || !task.subtasks.every(sub => object(sub) && text(sub.text) && typeof sub.done === 'boolean')) fail();
    if (task.status !== undefined && !stages.some(stage => stage.id === task.status)) fail();
    if (task.previousStatus !== undefined && !stages.some(stage => stage.id === task.previousStatus && stage.id !== 'done')) fail();
    if (task.completedAt !== undefined && !date(task.completedAt)) fail();
    if (task.time !== undefined && (!text(task.time) || (task.time !== '' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(task.time)))) fail();
    taskIds.add(task.id);
    const result = {id:task.id, title:task.title, notes:task.notes, date:task.date, priority:task.priority, done:task.done, list:task.list, tags:[...task.tags], subtasks:task.subtasks.map(sub => ({text:sub.text, done:sub.done})), status:statusOf(task)};
    for (const key of ['time','completedAt','previousStatus']) if (task[key] !== undefined) result[key] = task[key];
    return result;
  });
  return {lists, tasks};
}

// Persist first: callers only replace the visible state after this succeeds.
export function restoreBackup(backup, storage) {
  const validated = parseBackup(JSON.stringify(backup));
  storage.setItem('daylight-v1', JSON.stringify(validated));
  return validated;
}

// Reading and migration are side-effect free, including when storage is unavailable.
export function loadData(getStorage, initial) {
  try {
    const source = getStorage().getItem('daylight-v1');
    return {data:parseBackup(source === null ? JSON.stringify(initial) : source), warning:''};
  } catch {
    return {
      data:parseBackup(JSON.stringify(initial)),
      warning:'无法读取本地数据，已暂时显示示例任务。自动保存已暂停，原存储未改写；请恢复备份后继续。'
    };
  }
}

// A failed startup read must never allow sample data to overwrite the original.
export function saveData(getStorage, data, readWarning = '') {
  if (readWarning) return {saved:false, warning:readWarning};
  try {
    getStorage().setItem('daylight-v1', JSON.stringify(data));
    return {saved:true, warning:''};
  } catch {
    return {saved:false, warning:'修改尚未保存，刷新或关闭页面会丢失。请导出备份，或检查浏览器存储权限和可用空间后重试。'};
  }
}
