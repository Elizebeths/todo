import {app,BrowserWindow,Menu,dialog} from 'electron';
import {createServer} from './web/server.mjs';
import {DESKTOP_PORT,DESKTOP_ORIGIN,isAppURL,webPreferences} from './desktop-config.mjs';

// A dedicated persistent profile and a fixed loopback origin keep localStorage,
// Web Locks, notifications, file import/export and the original SW unchanged.
app.setName('Daylight');
const smoke=process.argv.includes('--daylight-smoke');
if(smoke&&process.env.DAYLIGHT_TEST_PROFILE)app.setPath('userData',process.env.DAYLIGHT_TEST_PROFILE);
let window,server;
if(!app.requestSingleInstanceLock())app.quit();
else {
  app.on('second-instance',()=>{if(window){if(window.isMinimized())window.restore();window.show();window.focus()}});
  app.on('activate',()=>{if(BrowserWindow.getAllWindows().length===0&&server)createWindow()});
  app.on('window-all-closed',()=>{if(process.platform!=='darwin')app.quit()});
  app.on('will-quit',()=>{server?.closeAllConnections();server?.close()});
  app.whenReady().then(async()=>{
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      {label:'日序',submenu:[{role:'about'},{type:'separator'},{role:'hide'},{role:'hideOthers'},{role:'unhide'},{type:'separator'},{role:'quit'}]},
      {label:'编辑',submenu:[{role:'undo'},{role:'redo'},{type:'separator'},{role:'cut'},{role:'copy'},{role:'paste'},{role:'selectAll'}]},
      {label:'显示',submenu:[{role:'reload'},{role:'resetZoom'},{role:'zoomIn'},{role:'zoomOut'},{role:'togglefullscreen'}]},
      {label:'窗口',submenu:[{role:'minimize'},{role:'zoom'},{role:'front'}]}
    ]));
    server=createServer();
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(DESKTOP_PORT,'127.0.0.1',resolve)});
    createWindow();
  }).catch(error=>{
    dialog.showErrorBox('无法启动日序',error.code==='EADDRINUSE'?
      `桌面版端口 ${DESKTOP_PORT} 已被占用。请关闭占用该端口的程序后重试；为保护数据，日序不会改用其他端口或打开未知服务。`:error.message);
    app.exit(1);
  });
}
function createWindow(){
  window=new BrowserWindow({width:1440,height:940,minWidth:860,minHeight:600,title:'日序 Daylight',show:false,backgroundColor:'#f5f7f4',webPreferences});
  const session=window.webContents.session;
  session.setPermissionCheckHandler((contents,permission,origin)=>permission==='notifications'&&isAppURL(origin)&&isAppURL(contents?.getURL()));
  session.setPermissionRequestHandler((contents,permission,callback)=>callback(permission==='notifications'&&isAppURL(contents.getURL())));
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',(event,url)=>{if(!isAppURL(url))event.preventDefault()});
  window.once('ready-to-show',()=>window.show());
  window.on('closed',()=>{window=null});
  window.loadURL(DESKTOP_ORIGIN).catch(error=>{dialog.showErrorBox('页面加载失败',error.message);app.quit()});
}
