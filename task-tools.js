// Display sorting never changes the manual order stored in backups.
export const sortOptions = [
  ['manual', '手动顺序'], ['date', '截止日期'],
  ['priority', '优先级'], ['title', '任务名称']
];

export function sortTasks(tasks, order = 'manual') {
  const result = [...tasks];
  const priority = task => task.priority || 4;
  if (order === 'date') result.sort((a, b) =>
    (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99') ||
    (a.date && b.date ? (a.time || '23:59:59').localeCompare(b.time || '23:59:59') : 0));
  if (order === 'priority') result.sort((a, b) => priority(a) - priority(b));
  if (order === 'title') result.sort((a, b) => a.title.localeCompare(b.title, 'zh-CN', {numeric:true}));
  return result;
}

export function matchesSearch(task, query, lists = []) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const content = [task.title, task.notes, ...task.tags, ...task.subtasks.map(s => s.text),
    task.list === 'inbox' ? '收集箱' : lists.find(l => l.id === task.list)?.name || ''].join(' ').toLocaleLowerCase();
  return terms.every(term => content.includes(term));
}

export function updateList(data, id, name, color) {
  const list = data.lists.find(l => l.id === id);
  const trimmed = name.trim();
  if (!list || !trimmed || trimmed.length > 30 || !/^#[0-9a-f]{6}$/i.test(color)) return false;
  Object.assign(list, {name:trimmed, color});
  return true;
}

// Removing a collection keeps every task, including completed tasks and metadata.
export function removeList(data, id) {
  const index = data.lists.findIndex(l => l.id === id);
  if (index < 0) return false;
  data.lists.splice(index, 1);
  data.tasks.forEach(task => { if (task.list === id) task.list = 'inbox'; });
  return true;
}
