import { app, BrowserWindow, ipcMain, shell } from 'electron';
import updaterPkg from 'electron-updater';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
let mainWindow = null;
let updaterEnabled = false;
let updaterReady = false;
const { autoUpdater } = updaterPkg;

function ensureDirSync(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function canWriteDirSync(dirPath) {
  try {
    ensureDirSync(dirPath);
    const testFile = path.join(dirPath, `.ogforge_write_test_${Date.now()}_${Math.random().toString(16).slice(2)}.tmp`);
    fs.writeFileSync(testFile, 'ok');
    fs.unlinkSync(testFile);
    return true;
  } catch {
    return false;
  }
}

function getSavesDir() {
  const candidates = [
    path.join(app.getPath('documents'), 'OGforge', 'Saves'),
    path.join(app.getPath('userData'), 'Saves')
  ];

  for (const dirPath of candidates) {
    if (canWriteDirSync(dirPath)) return dirPath;
  }

  return path.join(os.tmpdir(), 'OGforge', 'Saves');
}

function keyToFileName(key) {
  if (key === 'ogforge-saves-index-v1') return 'index.json';
  if (key === 'ogforge-save-v1') return 'legacy.json';
  const slotPrefix = 'ogforge-save-slot-v1:';
  if (typeof key === 'string' && key.startsWith(slotPrefix)) {
    const id = key.slice(slotPrefix.length).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80) || 'unknown';
    return `world-${id}.json`;
  }
  const safe = String(key).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'key';
  return `kv-${safe}.json`;
}

function getKeyPath(key) {
  const savesDir = getSavesDir();
  ensureDirSync(savesDir);
  return path.join(savesDir, keyToFileName(key));
}

function registerStorageIpc() {
  ipcMain.on('ogforge:getItem', (event, key) => {
    try {
      const p = getKeyPath(key);
      if (!fs.existsSync(p)) {
        event.returnValue = null;
        return;
      }
      event.returnValue = fs.readFileSync(p, 'utf8');
    } catch {
      event.returnValue = null;
    }
  });

  ipcMain.on('ogforge:setItem', (event, key, value) => {
    try {
      const p = getKeyPath(key);
      fs.writeFileSync(p, String(value), 'utf8');
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.on('ogforge:removeItem', (event, key) => {
    try {
      const p = getKeyPath(key);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      event.returnValue = true;
    } catch {
      event.returnValue = false;
    }
  });

  ipcMain.on('ogforge:getSavesDir', (event) => {
    try {
      event.returnValue = getSavesDir();
    } catch {
      event.returnValue = null;
    }
  });
}

function pickUpdateInfo(info) {
  if (!info) return null;
  return {
    version: info.version || '',
    releaseName: info.releaseName || '',
    releaseDate: info.releaseDate || ''
  };
}

function sendUpdaterStatus(payload) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('ogforge-updater:status', payload);
}

function initAutoUpdater() {
  if (updaterReady) return;
  updaterReady = true;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendUpdaterStatus({ state: 'checking' });
  });
  autoUpdater.on('update-available', (info) => {
    sendUpdaterStatus({ state: 'available', info: pickUpdateInfo(info) });
  });
  autoUpdater.on('update-not-available', (info) => {
    sendUpdaterStatus({ state: 'none', info: pickUpdateInfo(info) });
  });
  autoUpdater.on('error', (err) => {
    sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
  });
  autoUpdater.on('download-progress', (progress) => {
    sendUpdaterStatus({
      state: 'downloading',
      progress: {
        percent: Number.isFinite(progress?.percent) ? progress.percent : 0,
        transferred: progress?.transferred || 0,
        total: progress?.total || 0
      }
    });
  });
  autoUpdater.on('update-downloaded', (info) => {
    sendUpdaterStatus({ state: 'downloaded', info: pickUpdateInfo(info) });
    setTimeout(() => {
      try {
        autoUpdater.quitAndInstall();
      } catch {}
    }, 2500);
  });
}

function registerUpdaterIpc() {
  ipcMain.handle('ogforge-updater:enable', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
    updaterEnabled = true;
    initAutoUpdater();
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
      return { ok: false, reason: 'check_failed' };
    }
  });

  ipcMain.handle('ogforge-updater:check', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
    if (!updaterEnabled) return { ok: false, reason: 'disabled' };
    initAutoUpdater();
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (err) {
      sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
      return { ok: false, reason: 'check_failed' };
    }
  });

  ipcMain.handle('ogforge-updater:install', async () => {
    if (!app.isPackaged) return { ok: false, reason: 'not_packaged' };
    try {
      autoUpdater.quitAndInstall();
      return { ok: true };
    } catch (err) {
      sendUpdaterStatus({ state: 'error', message: err?.message || String(err) });
      return { ok: false, reason: 'install_failed' };
    }
  });
}

function createWindow() {
  const preloadPath = path.join(__dirname, 'preload.mjs');
  const iconPath = path.join(appRoot, 'build', 'icon.png');

  const win = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: '#07070a',
    show: false,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath
    }
  });

  win.once('ready-to-show', () => win.show());
  mainWindow = win;

  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const u = new URL(url);
      if (u.protocol === 'http:' || u.protocol === 'https:') {
        shell.openExternal(url);
        return { action: 'deny' };
      }
    } catch {}
    return { action: 'allow' };
  });

  win.loadFile(path.join(appRoot, 'index.html'));
}

app.whenReady().then(() => {
  registerStorageIpc();
  registerUpdaterIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
