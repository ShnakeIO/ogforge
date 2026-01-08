import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const downloadDir = path.join(rootDir, 'download');
const updatesDir = path.join(downloadDir, 'updates');
const downloadsDir = path.join(downloadDir, 'downloads');
const pkgPath = path.join(rootDir, 'package.json');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(src, dest) {
  fs.copyFileSync(src, dest);
  console.log(`Copied ${path.basename(src)} -> ${path.relative(rootDir, dest)}`);
}

function findFile(files, predicate) {
  return files.find((name) => predicate(name)) || null;
}

ensureDir(updatesDir);
ensureDir(downloadsDir);

const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const appVersion = String(pkg.version || '').trim();

const distFiles = fs.existsSync(distDir) ? fs.readdirSync(distDir) : [];
const versionMatches = (name) => (appVersion ? name.includes(appVersion) : true);

for (const name of fs.readdirSync(updatesDir)) {
  if (name.startsWith('latest') || name.endsWith('.blockmap') || name.endsWith('.zip') || name.endsWith('.exe')) {
    fs.rmSync(path.join(updatesDir, name));
  }
}
for (const name of ['OGforge.exe', 'OGforge.dmg']) {
  const target = path.join(downloadsDir, name);
  if (fs.existsSync(target)) fs.rmSync(target);
}

const updateMetadata = distFiles.filter((name) => name.startsWith('latest') && name.endsWith('.yml'));
for (const name of updateMetadata) {
  copyFile(path.join(distDir, name), path.join(updatesDir, name));
}

const updateAssets = distFiles.filter((name) => {
  if (!versionMatches(name)) return false;
  if (name.endsWith('.zip')) return true;
  if (name.endsWith('.exe')) return true;
  if (name.endsWith('.blockmap')) return !name.endsWith('.dmg.blockmap');
  return false;
});
for (const name of updateAssets) {
  copyFile(path.join(distDir, name), path.join(updatesDir, name));
}

const winInstaller = findFile(distFiles, (name) => name.toLowerCase().endsWith('.exe') && versionMatches(name));
if (winInstaller) {
  copyFile(path.join(distDir, winInstaller), path.join(downloadsDir, 'OGforge.exe'));
}

const macDmg = findFile(
  distFiles,
  (name) => name.toLowerCase().endsWith('.dmg') && !name.toLowerCase().endsWith('.dmg.blockmap') && versionMatches(name)
);
if (macDmg) {
  copyFile(path.join(distDir, macDmg), path.join(downloadsDir, 'OGforge.dmg'));
}
