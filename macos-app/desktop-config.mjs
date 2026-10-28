export const DESKTOP_PORT=17839;
export const DESKTOP_ORIGIN=`http://127.0.0.1:${DESKTOP_PORT}`;
export function isAppURL(url,origin=DESKTOP_ORIGIN) {
  try{return new URL(url).origin===origin}catch{return false}
}
export const webPreferences={
  nodeIntegration:false,
  contextIsolation:true,
  sandbox:true,
  webSecurity:true,
  backgroundThrottling:false
};
