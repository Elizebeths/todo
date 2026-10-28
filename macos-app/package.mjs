import {packager} from '@electron/packager';
import {prepare} from './prepare.mjs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
const here=dirname(fileURLToPath(import.meta.url));
const arch=process.argv[2]||process.arch;
if(!['arm64','x64'].includes(arch))throw new Error('仅支持 arm64 或 x64');
const {destination}=await prepare();
const outputs=await packager({
  dir:destination,out:resolve(here,'dist'),name:'Daylight',
  platform:'darwin',arch,electronVersion:'45.1.0',
  appBundleId:'com.elizebeths.daylight',appCategoryType:'public.app-category.productivity',
  appVersion:'1.7.0',buildVersion:'1.7.0',overwrite:true,asar:true,
  // Native ad-hoc signing on macOS; no Developer ID or notarization credentials.
  ...(process.platform==='darwin'?{osxSign:{identity:'-',identityValidation:false,hardenedRuntime:false,continueOnError:false}}:{}),
  extendInfo:{CFBundleDisplayName:'日序 Daylight',NSHumanReadableCopyright:'Daylight contributors; Apache-2.0'}
});
console.log(outputs.join('\n'));
