import { app, BrowserWindow, ipcMain, net, shell } from 'electron';
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.join(__dirname, '..');
const DEFAULT_UPDATE_MANIFEST_URLS = [
  'https://shnakeio.github.io/ogforge/download/version.json',
  'https://forge-iye0.onrender.com/version.json'
];

function getUpdateManifestUrls() {
  const env = process.env.OGFORGE_UPDATE_URL;
  if (env && String(env).trim()) {
    return String(env)
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);
  }
  return DEFAULT_UPDATE_MANIFEST_URLS.slice();
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

function fetchJsonViaNet(url, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let requestUrl;
    try {
      requestUrl = new URL(String(url)).toString();
    } catch {
      resolve({ ok: false, error: 'Invalid update URL.' });
      return;
    }

    const req = net.request({
      method: 'GET',
      url: requestUrl
    });

    req.setHeader('accept', 'application/json');
    req.setHeader('user-agent', `OGforge/${app.getVersion()} (Electron)`);

    const timeout = setTimeout(() => {
      try {
        req.abort();
      } catch {}
      resolve({ ok: false, error: 'Update check timed out.' });
    }, timeoutMs);

    req.on('response', (res) => {
      if (!res || !res.statusCode || res.statusCode < 200 || res.statusCode > 299) {
        clearTimeout(timeout);
        resolve({ ok: false, error: `Update server error (${res?.statusCode || 'no status'}).` });
        return;
      }

      let body = '';
      res.on('data', (chunk) => {
        body += chunk.toString('utf8');
        if (body.length > 512_000) {
          try {
            req.abort();
          } catch {}
          clearTimeout(timeout);
          resolve({ ok: false, error: 'Update manifest too large.' });
        }
      });
      res.on('end', () => {
        clearTimeout(timeout);
        try {
          resolve({ ok: true, data: JSON.parse(body) });
        } catch {
          resolve({ ok: false, error: 'Invalid update manifest JSON.' });
        }
      });
    });

    req.on('error', () => {
      clearTimeout(timeout);
      resolve({ ok: false, error: 'Unable to reach update server.' });
    });

    req.end();
  });
}

function fetchJsonViaNode(url, { timeoutMs = 8000 } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      resolve({ ok: false, error: 'Invalid update URL.' });
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
          resolve({ ok: false, error: `Update server error (${res?.statusCode || 'no status'}).` });
          return;
        }

        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          body += chunk;
          if (body.length > 512_000) {
            req.destroy();
            resolve({ ok: false, error: 'Update manifest too large.' });
          }
        });
        res.on('end', () => {
          try {
            resolve({ ok: true, data: JSON.parse(body) });
          } catch {
            resolve({ ok: false, error: 'Invalid update manifest JSON.' });
          }
        });
      }
    );

    req.on('error', () => resolve({ ok: false, error: 'Unable to reach update server.' }));
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve({ ok: false, error: 'Update check timed out.' });
    });
    req.end();
  });
}

async function fetchUpdateManifest(urls, opts) {
  const list = Array.isArray(urls) ? urls : [urls];
  for (const url of list) {
    try {
      const r = await fetchJsonViaNet(url, opts);
      if (r && r.ok) return { ...r, manifestUrl: url };
    } catch {}
    try {
      const r = await fetchJsonViaNode(url, opts);
      if (r && r.ok) return { ...r, manifestUrl: url };
    } catch {}
  }
  return { ok: false, error: 'Unable to reach update server.' };
}

function registerUpdateIpc() {
  ipcMain.handle('ogforge:app:getVersion', () => app.getVersion());

  ipcMain.handle('ogforge:update:check', async () => {
    const currentVersion = app.getVersion();
    const manifestUrls = getUpdateManifestUrls();
    const manifestResult = await fetchUpdateManifest(manifestUrls, { timeoutMs: 9000 });
    const manifestUrl = manifestResult?.manifestUrl || manifestUrls[0] || '';

    if (!manifestResult || !manifestResult.ok) {
      return {
        ok: false,
        currentVersion,
        error: manifestResult?.error || 'Unable to load update info.',
        manifestUrl
      };
    }

    const manifest = manifestResult.data;
    if (!manifest || !manifest.version) {
      return {
        ok: false,
        currentVersion,
        error: 'Update manifest missing version.',
        manifestUrl
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
      required: Boolean(manifest.required),
      manifestUrl
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
