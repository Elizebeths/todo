import test from 'node:test';
import assert from 'node:assert/strict';
import {isOverdue, matchesDeadline, deadlineInfo, rescheduleToToday} from './deadline-model.js';

const today='2026-01-01';
const task=(date,done=false)=>({date,done,time:'09:00',status:'doing',subtasks:[{text:'准备',done:true}]});

test('overdue uses calendar dates across year boundaries and excludes undated and completed tasks',()=>{
  assert.equal(isOverdue(task('2025-12-31'),today),true);
  for(const t of [task(today),task('2026-01-02'),task(''),task('2025-12-31',true)])assert.equal(isOverdue(t,today),false);
});
test('deadline filters compose with other filters without including completed tasks',()=>{
  const tasks=[task('2025-12-31'),task(today),task(today,true),task('')];
  assert.deepEqual(tasks.filter(t=>matchesDeadline(t,'overdue',today)),[tasks[0]]);
  assert.deepEqual(tasks.filter(t=>matchesDeadline(t,'today',today)),[tasks[1]]);
  assert.equal(tasks.filter(t=>matchesDeadline(t,'all',today)).length,4);
});
test('date labels include the year and time, with overdue styling only for unfinished tasks',()=>{
  assert.deepEqual(deadlineInfo(task('2025-12-31'),today),{overdue:true,label:'已逾期 · 2025-12-31 09:00'});
  assert.equal(deadlineInfo(task(today),today).label,'今天 09:00');
  assert.equal(deadlineInfo(task('2025-12-31',true),today).overdue,false);
  assert.equal(deadlineInfo(task(''),today),null);
});
test('rescheduling changes only the date and ignores tasks that are not overdue',()=>{
  const t=task('2025-12-31'),original=structuredClone(t);
  assert.equal(rescheduleToToday(t,today),true);
  assert.deepEqual(t,{...original,date:today});
  assert.equal(isOverdue(t,today),false);
  assert.equal(rescheduleToToday(t,today),false);
  const completed=task('2025-12-31',true);
  assert.equal(rescheduleToToday(completed,today),false);
  assert.equal(completed.date,'2025-12-31');
});
