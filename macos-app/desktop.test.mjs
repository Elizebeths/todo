import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {pathToFileURL} from 'node:url';
import {prepare} from './prepare.mjs';
import {DESKTOP_PORT,DESKTOP_ORIGIN,isAppURL,webPreferences} from './desktop-config.mjs';
import {adHocSignOptions} from './signing-config.mjs';

test('ad-hoc signing replaces inherited flags and permits loading frameworks without a Team ID',()=>{
  assert.equal(adHocSignOptions.identity,'-');
  for(const file of ['Daylight.app','Daylight.app/Contents/Frameworks/Electron Framework.framework','Daylight Helper.app']){
    const options=adHocSignOptions.optionsForFile(file);
    assert.equal(options.signatureFlags,'0');
    assert.equal(options.hardenedRuntime,false);
    assert.equal(options.timestamp,'none');
    assert.ok(options.entitlements.includes('com.apple.security.cs.disable-library-validation'));
    assert.ok(options.entitlements.includes('com.apple.security.cs.allow-jit'));
  }
});

test('desktop ships unchanged web resources and serves every SW asset with the original server',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'daylight-build-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {manifest}=await prepare(join(dir,'app'));
  for(const [file,hash] of Object.entries(manifest.files)){
    assert.equal(createHash('sha256').update(await readFile(join(dir,'app/web',file))).digest('hex'),hash,file);
  }
  const {createServer}=await import(pathToFileURL(join(dir,'app/web/server.mjs')));
  const server=createServer();server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(()=>new Promise(resolve=>{server.close(resolve);server.closeAllConnections()}));
  const base=`http://127.0.0.1:${server.address().port}`;
  const sw=await readFile(join(dir,'app/web/sw.js'),'utf8');
  const assets=[...sw.matchAll(/"(\/[^"\s]*)"/g)].map(m=>m[1]);
  for(const path of new Set([...assets,'/sw.js',...Object.keys(manifest.files).filter(f=>f!=='server.mjs').map(f=>'/'+f)])){
    const response=await fetch(base+path);assert.equal(response.status,200,path);
    const file=path==='/'?'index.html':path.slice(1);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()),await readFile(join(dir,'app/web',file)),path);
  }
  assert.equal((await fetch(base+'/main.mjs')).status,404);
  assert.equal((await fetch(base+'/package.json')).status,404);
  const runtime=JSON.parse(await readFile(join(dir,'app/package.json'),'utf8'));
  assert.equal(manifest.files['playwright.config.js'],undefined);
  assert.equal(runtime.version,manifest.version);assert.equal(runtime.devDependencies,undefined);
});

test('desktop keeps a fixed origin and isolates web code from Node and external navigation',()=>{
  assert.equal(DESKTOP_PORT,17839);
  assert.equal(isAppURL(DESKTOP_ORIGIN+'/app.js'),true);
  for(const url of ['https://example.com','http://127.0.0.1:5173','file:///etc/passwd','javascript:alert(1)','not-a-url'])assert.equal(isAppURL(url),false);
  assert.equal(webPreferences.nodeIntegration,false);assert.equal(webPreferences.contextIsolation,true);
  assert.equal(webPreferences.sandbox,true);assert.equal(webPreferences.webSecurity,true);
});
