const { contextBridge, ipcRenderer, webUtils } = require('electron');

async function call(channel, ...args) {
  const r = await ipcRenderer.invoke(channel, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

contextBridge.exposeInMainWorld('umbra', {
  call,
  on: (channel, fn) => {
    const listener = (_e, payload) => fn(payload);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  },
  splashDone: () => ipcRenderer.send('splash:done'),
  pathForFile: (file) => webUtils.getPathForFile(file),
  platform: process.platform,
});
