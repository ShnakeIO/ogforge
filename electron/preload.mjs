import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ogforgeStore', {
  getItem: (key) => ipcRenderer.sendSync('ogforge:getItem', key),
  setItem: (key, value) => ipcRenderer.sendSync('ogforge:setItem', key, String(value)),
  removeItem: (key) => ipcRenderer.sendSync('ogforge:removeItem', key),
  getSavesDir: () => ipcRenderer.sendSync('ogforge:getSavesDir')
});

contextBridge.exposeInMainWorld('ogforgeUpdater', {
  enable: (opts) => ipcRenderer.invoke('ogforge-updater:enable', opts),
  check: (opts) => ipcRenderer.invoke('ogforge-updater:check', opts),
  install: (opts) => ipcRenderer.invoke('ogforge-updater:install', opts),
  download: (opts) => ipcRenderer.invoke('ogforge-updater:download', opts),
  onStatus: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('ogforge-updater:status', handler);
    return () => ipcRenderer.removeListener('ogforge-updater:status', handler);
  }
});
