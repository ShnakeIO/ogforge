import { app, BrowserWindow, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
const DEFAULT_UPDATE_MANIFEST_URL = 'https://forge-iye0.onrender.com/version.json';

function getUpdateManifestUrl() {
  const u = process.env.OGFORGE_UPDATE_URL || DEFAULT_UPDATE_MANIFEST_URL;
  return String(u);
}

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

function parseSemver(version) {
  const s = String(version || '').trim().replace(/^v/i, '');
  const parts = s.split('.');
  if (parts.length === 0) return null;
  const nums = parts.slice(0, 3).map((p) => Number.parseInt(p, 10));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  while (nums.length < 3) nums.push(0);
  return nums;
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return 0;
  for (let i = 0; i < 3; i++) {
    if (av[i] < bv[i]) return -1;
    if (av[i] > bv[i]) return 1;
  }
  return 0;
}

function resolveUrl(baseUrl, maybeRelativeUrl) {
  try {
    return new URL(String(maybeRelativeUrl), String(baseUrl)).toString();
  } catch {
    return null;
  }
}

function fetchJson(url, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve(null);
      return;
    }

    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.request(
      parsed,
      {
        method: 'GET',
        headers: {
          accept: 'application/json',
          'user-agent': `OGforge/${app.getVersion()} (Electron)`
        }
      },
      (res) => {
        if (!res || !res.statusCode || res.statusCode < 200 || res.statusCode > 299) {
          res?.resume?.();
          resolve(null);
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 512_000) {
            req.destroy();
            resolve(null);
          }
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(null);
    });
    req.end();
  });
}

function registerUpdateIpc() {
  ipcMain.handle('ogforge:app:getVersion', () => app.getVersion());

  ipcMain.handle('ogforge:update:check', async () => {
    const currentVersion = app.getVersion();
    const manifestUrl = getUpdateManifestUrl();
    const manifest = await fetchJson(manifestUrl);

    if (!manifest || !manifest.version) {
      return {
        ok: false,
        currentVersion,
        error: 'Unable to load update info.'
      };
    }

    const latestVersion = String(manifest.version);
    const updateAvailable = compareSemver(currentVersion, latestVersion) < 0;
    const platformKey = process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'mac' : process.platform;

    const rawUrl =
      (manifest.downloads && typeof manifest.downloads === 'object' && manifest.downloads[platformKey]) ||
      manifest.downloadUrl ||
      null;

    const downloadUrl = rawUrl ? resolveUrl(manifestUrl, rawUrl) : null;

    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable,
      downloadUrl,
      notes: typeof manifest.notes === 'string' ? manifest.notes : null,
      required: Boolean(manifest.required)
    };
  });

  ipcMain.handle('ogforge:update:openDownload', async (_event, url) => {
    try {
      const u = new URL(String(url));
      if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
      await shell.openExternal(u.toString());
      return true;
    } catch {
      return false;
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
  registerUpdateIpc();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
