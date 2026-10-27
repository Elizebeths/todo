import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBackup, restoreBackup, loadData, saveData} from './backup.js';

const fixture = () => ({lists:[{id:'work',name:'工作',color:'#8b7bda'}],tasks:[
  {id:'first',title:'设计',notes:'保留备注',list:'work',date:'2026-10-27',time:'14:00',priority:1,tags:['设计'],subtasks:[{text:'草稿',done:true}],done:false,status:'doing'},
  {id:'second',title:'已完成',notes:'',list:'inbox',date:'',priority:0,tags:[],subtasks:[],done:true,status:'done',previousStatus:'planning',completedAt:'2026-10-26'}
]});

test('exported backups round trip all fields and ordering', () => {
  const backup=fixture();
  assert.deepEqual(parseBackup(JSON.stringify(backup)),backup);
});

test('legacy exports acquire a stage while preserving completion', () => {
  const backup=fixture();
  delete backup.tasks[0].status;
  delete backup.tasks[1].status;
  const result=parseBackup(JSON.stringify(backup));
  assert.equal(result.tasks[0].status,'doing');
  assert.equal(result.tasks[1].status,'done');
});

test('empty backups can be restored deliberately', () => {
  assert.deepEqual(parseBackup('{"lists":[],"tasks":[]}'),{lists:[],tasks:[]});
});

test('invalid JSON and missing collections are rejected', () => {
  for(const source of ['{','null','[]','{}','{"lists":[],"tasks":null}']) {
    assert.throws(()=>parseBackup(source),/备份格式无效/);
  }
});

test('malformed or unsafe fields, duplicate IDs and broken list references are rejected', () => {
  const corruptions=[
    b=>b.tasks.push({...b.tasks[0]}),
    b=>b.lists.push({...b.lists[0]}),
    b=>b.tasks[0].id='bad" onclick="alert(1)',
    b=>b.tasks[0].tags=null,
    b=>b.tasks[0].subtasks=[null],
    b=>b.tasks[0].title=' ',
    b=>b.tasks[0].list='missing',
    b=>b.tasks[0].date='2026-02-30',
    b=>b.tasks[0].time='25:00',
    b=>b.tasks[0].priority=7,
    b=>b.tasks[0].done='false',
    b=>b.tasks[0].status='missing',
    b=>b.tasks[0].completedAt=123,
    b=>b.lists[0].color='red;display:none',
    b=>b.lists[0].id='today'
  ];
  for(const corrupt of corruptions){
    const backup=fixture();corrupt(backup);
    assert.throws(()=>parseBackup(JSON.stringify(backup)),/备份格式无效/);
  }
});

test('successful restore persists the exact validated data', () => {
  const storage=new Map();
  const result=restoreBackup(fixture(),{setItem:(key,value)=>storage.set(key,value)});
  assert.deepEqual(JSON.parse(storage.get('daylight-v1')),result);
});

test('invalid backup never writes and failed storage never replaces the active state', () => {
  const current=fixture();
  let active=current,writes=0;
  assert.throws(()=>{active=restoreBackup({tasks:[]},{setItem:()=>writes++})});
  assert.equal(writes,0);assert.equal(active,current);
  assert.throws(()=>{active=restoreBackup({lists:[],tasks:[]},{setItem:()=>{throw new Error('QuotaExceededError')}})});
  assert.equal(active,current);
});

test('startup validates corrupt storage without writing over the original', () => {
  for (const source of ['{', '{}', 'null', '{"lists":[],"tasks":[{}]}']) {
    let writes=0;
    const result=loadData(()=>({getItem:()=>source,setItem:()=>writes++}),fixture());
    assert.deepEqual(result.data,fixture());
    assert.ok(result.warning);
    assert.equal(writes,0);
  }
});

test('startup supports first use, empty data, legacy tasks and blocked storage', () => {
  assert.deepEqual(loadData(()=>({getItem:()=>null}),fixture()).data,fixture());
  assert.deepEqual(loadData(()=>({getItem:()=>'{"lists":[],"tasks":[]}'}),fixture()).data,{lists:[],tasks:[]});
  const legacy=fixture();delete legacy.tasks[0].status;
  const loaded=loadData(()=>({getItem:()=>JSON.stringify(legacy)}),fixture());
  assert.equal(loaded.data.tasks[0].status,'doing');
  assert.equal(loaded.warning,'');
  assert.ok(loadData(()=>{throw new Error('SecurityError')},fixture()).warning);
});


test('editing fallback data never overwrites unreadable storage', () => {
  let source='{broken', writes=0;
  const storage={getItem:()=>source,setItem:(_key,value)=>{writes++;source=value}};
  const loaded=loadData(()=>storage,fixture());
  loaded.data.tasks[0].title='Edited sample';
  const result=saveData(()=>storage,loaded.data,loaded.warning);
  assert.equal(result.saved,false);
  assert.equal(result.warning,loaded.warning);
  assert.equal(source,'{broken');
  assert.equal(writes,0);
  // Only an explicit successful restore permits normal saving again.
  const restored=restoreBackup(fixture(),storage);
  restored.tasks[0].title='Real edit';
  assert.equal(saveData(()=>storage,restored).saved,true);
  assert.equal(JSON.parse(source).tasks[0].title,'Real edit');
});

test('failed saves report unsaved changes and can be retried', () => {
  let blocked=true, persisted;
  const storage={setItem:(_key,value)=>{if(blocked)throw new Error('QuotaExceededError');persisted=value}};
  const data=fixture();
  const failed=saveData(()=>storage,data);
  assert.equal(failed.saved,false);
  assert.match(failed.warning,/尚未保存/);
  assert.equal(persisted,undefined);
  assert.deepEqual(data,fixture());
  blocked=false;
  assert.deepEqual(saveData(()=>storage,data),{saved:true,warning:''});
  assert.deepEqual(JSON.parse(persisted),data);
  assert.equal(saveData(()=>{throw new Error('SecurityError')},data).saved,false);
});
