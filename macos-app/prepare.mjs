import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {createHash} from 'node:crypto';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
export async function prepare(destination=resolve(here,'build')) {
  const source=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
  const desktop=JSON.parse(await readFile(resolve(here,'package.json'),'utf8'));
  if(source.version!==desktop.version)throw new Error('网页和桌面版本号不一致，请同步 macos-app/package.json');
  await rm(destination,{recursive:true,force:true});
  await mkdir(resolve(destination,'web'),{recursive:true});
  // Copy every shipped root module, never tests, server secrets or dependencies.
  const files=(await readdir(root)).filter(name =>
    (name.endsWith('.js')&&!name.endsWith('.test.js')&&!name.endsWith('.config.js')) ||
    ['index.html','style.css','manifest.webmanifest','icon.svg','server.mjs'].includes(name)).sort();
  const manifest={version:source.version,files:{}};
  for(const name of files){
    const content=await readFile(resolve(root,name));
    await cp(resolve(root,name),resolve(destination,'web',name));
    manifest.files[name]=createHash('sha256').update(content).digest('hex');
  }
  for(const name of ['main.mjs','desktop-config.mjs'])await cp(resolve(here,name),resolve(destination,name));
  await cp(resolve(root,'LICENSE'),resolve(destination,'LICENSE'));
  const {devDependencies,scripts,...runtime}=desktop;
  await writeFile(resolve(destination,'package.json'),JSON.stringify(runtime,null,2)+'\n');
  await writeFile(resolve(destination,'web-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
  return {destination,manifest};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const {manifest}=await prepare();console.log(`已复制网页版 ${manifest.version}，${Object.keys(manifest.files).length} 个文件，内容未经修改。`);
}
