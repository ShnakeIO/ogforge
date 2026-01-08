import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('ogforgeStore', {
  getItem: (key) => ipcRenderer.sendSync('ogforge:getItem', key),
  setItem: (key, value) => ipcRenderer.sendSync('ogforge:setItem', key, String(value)),
  removeItem: (key) => ipcRenderer.sendSync('ogforge:removeItem', key),
  getSavesDir: () => ipcRenderer.sendSync('ogforge:getSavesDir')
});

contextBridge.exposeInMainWorld('ogforgeUpdater', {
  enable: () => ipcRenderer.invoke('ogforge-updater:enable'),
  check: () => ipcRenderer.invoke('ogforge-updater:check'),
  install: () => ipcRenderer.invoke('ogforge-updater:install'),
  download: () => ipcRenderer.invoke('ogforge-updater:download'),
  onStatus: (cb) => {
    if (typeof cb !== 'function') return () => {};
    const handler = (_event, payload) => cb(payload);
    ipcRenderer.on('ogforge-updater:status', handler);
    return () => ipcRenderer.removeListener('ogforge-updater:status', handler);
  }
});
