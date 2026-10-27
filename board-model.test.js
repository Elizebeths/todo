import test from 'node:test';
import assert from 'node:assert/strict';
import {statusOf,setStatus,moveTask} from './board-model.js';
test('existing tasks keep their data and get sensible stages',()=>{
 assert.equal(statusOf({done:true}),'done');
 assert.equal(statusOf({done:false,date:'2026-10-27'}),'todo');
 assert.equal(statusOf({done:false,date:''}),'planning');
 assert.equal(statusOf({done:false,subtasks:[{done:true}]}),'doing');
});
test('completion and reopening keep the right state and completion date',()=>{
 const task={done:false,status:'doing'};
 setStatus(task,'done','2026-10-27');
 assert.equal(task.done,true);assert.equal(task.completedAt,'2026-10-27');assert.equal(task.previousStatus,'doing');
 setStatus(task,'doing','2026-10-28');assert.equal(task.done,false);assert.equal(task.completedAt,undefined);
});
test('moving cards between columns and reordering preserves all tasks',()=>{
 const tasks=[{id:'a',status:'todo'},{id:'b',status:'todo'},{id:'c',status:'doing'}];
 moveTask(tasks,'b','doing','c','2026-10-27');
 assert.deepEqual(tasks.map(t=>t.id),['a','b','c']);assert.equal(statusOf(tasks[1]),'doing');
 moveTask(tasks,'c','todo','a','2026-10-27');assert.deepEqual(tasks.map(t=>t.id),['c','a','b']);
 moveTask(tasks,'a','done',undefined,'2026-10-27');assert.equal(tasks[2].done,true);
 assert.equal(moveTask(tasks,'missing','todo'),false);assert.equal(tasks.length,3);
});
