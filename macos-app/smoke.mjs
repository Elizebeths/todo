import {_electron as electron,expect} from '@playwright/test';
import {mkdtemp,readFile,writeFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const executablePath=resolve(process.argv[2]||`macos-app/dist/Daylight-darwin-${process.arch}/Daylight.app/Contents/MacOS/Daylight`);
const temporary=await mkdtemp(join(tmpdir(),'daylight-native-'));
const profile=join(temporary,'profile');
let application;
const errors=[];
const checks=[];
const launch=async()=>{
  application=await electron.launch({executablePath,args:['--daylight-smoke'],env:{...process.env,DAYLIGHT_TEST_PROFILE:profile},timeout:60000});
  const page=await application.firstWindow();
  page.on('pageerror',error=>errors.push(error.message));
  await page.waitForLoadState('domcontentloaded');
  return page;
};
async function saved(page){
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('daylight-v1')||'null')?.schemaVersion)).toBe(2);
  await expect(page.locator('.storage-warning')).toHaveCount(0);
}
try {
  let page=await launch();
  await expect(page.getByRole('button',{name:'空白开始'})).toBeVisible();
  assert.equal(await page.evaluate(()=>Boolean(isSecureContext&&navigator.locks&&crypto.randomUUID&&navigator.serviceWorker)),true);
  assert.equal(await page.evaluate(()=>typeof window.require),'undefined');
  checks.push('secure origin, Web Locks, service worker and Node isolation');
  await page.getByRole('button',{name:'空白开始'}).click();
  await page.locator('[data-action="new-card"]').click();
  await page.locator('[name="title"]').fill('macOS 中文待办验收');
  await page.locator('#new-card-form button[type="submit"]').click();
  await saved(page);
  await page.locator('.kanban-card').click();
  await page.locator('#detail-notes').fill('桌面与网页复用相同业务源码');
  await page.keyboard.press('Escape');
  await saved(page);
  await page.locator('[data-status-task]').selectOption('done');
  await saved(page);
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('daylight-v1')).events.length)).toBe(1);
  checks.push('create, edit, complete and persist schema 2');
  await page.locator('[data-action="theme"]').first().click();
  await page.locator('[data-theme-option="night"]').click();
  await page.locator('.modal-close').click();
  await page.locator('[data-action="focus"]').click();
  await page.locator('#focus-minutes').fill('1');
  await page.locator('#start-timer').click();
  await saved(page);
  await page.locator('.modal-close').click();
  const backupFile=join(temporary,'backup.json');
  await application.evaluate(({BrowserWindow},file)=>{
    BrowserWindow.getAllWindows()[0].webContents.session.once('will-download',(_event,item)=>item.setSavePath(file));
  },backupFile);
  await page.locator('[data-action="export"]').click();
  await expect.poll(async()=>{try{return JSON.parse(await readFile(backupFile,'utf8')).schemaVersion}catch{return null}}).toBe(2);
  const exported=JSON.parse(await readFile(backupFile,'utf8'));
  assert.equal(exported.tasks[0].title,'macOS 中文待办验收');
  assert.equal(exported.focus.duration,60000);
  checks.push('native backup download and persisted focus');
  await page.locator('[data-action="import"]').click();
  await page.locator('#backup-file').setInputFiles(backupFile);
  await page.locator('#confirm-restore').click();
  await saved(page);
  await expect(page.locator('.kanban-card-title')).toHaveText('macOS 中文待办验收');
  checks.push('native file upload and backup restore');
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(navigator.serviceWorker.controller))).toBe(true);
  // Every root web resource is byte-identical inside the signed app bundle.
  const manifest=await application.evaluate(async({app})=>{
    const fs=await import('node:fs/promises');const path=await import('node:path');
    return JSON.parse(await fs.readFile(path.join(app.getAppPath(),'web-manifest.json'),'utf8'));
  });
  for(const [file,hash] of Object.entries(manifest.files)){
    if(file==='server.mjs')continue;
    const response=await page.request.get(`http://127.0.0.1:17839/${file}`);
    assert.equal(response.status(),200,file);
    assert.equal(createHash('sha256').update(await response.body()).digest('hex'),hash,file);
  }
  checks.push('packaged web resource checksums and offline cache activation');
  await application.close();application=null;
  page=await launch();
  await expect(page.locator('.kanban-card-title')).toHaveText('macOS 中文待办验收');
  await expect.poll(()=>page.evaluate(()=>document.documentElement.dataset.theme)).toBe('night');
  assert.equal(await page.evaluate(()=>Boolean(JSON.parse(localStorage.getItem('daylight-v1')).focus)),true);
  assert.deepEqual(errors,[]);
  checks.push('full app exit/relaunch preserves tasks, theme and focus; no page errors');
  await mkdir('macos-app/dist',{recursive:true});
  await page.screenshot({path:`macos-app/dist/smoke-${process.arch}.png`,fullPage:true});
  await writeFile(`macos-app/dist/smoke-${process.arch}.json`,JSON.stringify({platform:process.platform,arch:process.arch,checks,errors},null,2));
  console.log(checks.join('\n'));
} finally {
  await application?.close();
  await rm(temporary,{recursive:true,force:true});
}
