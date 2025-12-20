import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ogforgeStore', {
  getItem: (key) => ipcRenderer.sendSync('ogforge:getItem', key),
  setItem: (key, value) => ipcRenderer.sendSync('ogforge:setItem', key, String(value)),
  removeItem: (key) => ipcRenderer.sendSync('ogforge:removeItem', key),
  getSavesDir: () => ipcRenderer.sendSync('ogforge:getSavesDir')
});

contextBridge.exposeInMainWorld('ogforgeApp', {
  getVersion: () => ipcRenderer.invoke('ogforge:app:getVersion')
});

contextBridge.exposeInMainWorld('ogforgeUpdate', {
  check: () => ipcRenderer.invoke('ogforge:update:check'),
  openDownload: (url) => ipcRenderer.invoke('ogforge:update:openDownload', url)
});
