import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const BUILD_DIR = path.join(ROOT, 'build');
const ICON_PNG = path.join(BUILD_DIR, 'icon.png');
const ICON_ICO = path.join(BUILD_DIR, 'icon.ico');

function clampByte(n) {
  return Math.max(0, Math.min(255, n | 0));
}

function blend(dst, src, alpha) {
  return clampByte(dst + (src - dst) * alpha);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  const crcVal = crc32(Buffer.concat([typeBuf, data]));
  crcBuf.writeUInt32BE(crcVal, 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePngRgba(outPath, width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.writeUInt8(8, 8); // bit depth
  ihdr.writeUInt8(6, 9); // color type: RGBA
  ihdr.writeUInt8(0, 10); // compression
  ihdr.writeUInt8(0, 11); // filter
  ihdr.writeUInt8(0, 12); // interlace

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idatData = zlib.deflateSync(raw, { level: 9 });

  const out = Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idatData),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
  fs.writeFileSync(outPath, out);
}

function distToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const abLen2 = abx * abx + aby * aby;
  const t = abLen2 === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLen2));
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  const dx = px - cx;
  const dy = py - cy;
  return Math.sqrt(dx * dx + dy * dy);
}

function drawLine(img, w, h, ax, ay, bx, by, radius, rgb, opacity) {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 2));
  const maxX = Math.min(w - 1, Math.ceil(Math.max(ax, bx) + radius + 2));
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 2));
  const maxY = Math.min(h - 1, Math.ceil(Math.max(ay, by) + radius + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const d = distToSegment(x + 0.5, y + 0.5, ax, ay, bx, by);
      if (d > radius + 1) continue;
      const a = Math.max(0, Math.min(1, (radius + 1 - d))) * opacity;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      img[i + 0] = blend(img[i + 0], rgb[0], a);
      img[i + 1] = blend(img[i + 1], rgb[1], a);
      img[i + 2] = blend(img[i + 2], rgb[2], a);
      img[i + 3] = 255;
    }
  }
}

function drawCircle(img, w, h, cx, cy, r, rgb, opacity) {
  const minX = Math.max(0, Math.floor(cx - r - 2));
  const maxX = Math.min(w - 1, Math.ceil(cx + r + 2));
  const minY = Math.max(0, Math.floor(cy - r - 2));
  const maxY = Math.min(h - 1, Math.ceil(cy + r + 2));

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dx = (x + 0.5) - cx;
      const dy = (y + 0.5) - cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > r + 1) continue;
      const a = Math.max(0, Math.min(1, (r + 1 - d))) * opacity;
      if (a <= 0) continue;
      const i = (y * w + x) * 4;
      img[i + 0] = blend(img[i + 0], rgb[0], a);
      img[i + 1] = blend(img[i + 1], rgb[1], a);
      img[i + 2] = blend(img[i + 2], rgb[2], a);
      img[i + 3] = 255;
    }
  }
}

function makeIconPng(outPath) {
  const w = 1024;
  const h = 1024;
  const img = new Uint8Array(w * h * 4);

  for (let y = 0; y < h; y++) {
    const t = y / (h - 1);
    const r = Math.round(7 + (12 - 7) * t);
    const g = Math.round(7 + (12 - 7) * t);
    const b = Math.round(10 + (18 - 10) * t);
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      img[i + 0] = r;
      img[i + 1] = g;
      img[i + 2] = b;
      img[i + 3] = 255;
    }
  }

  const shadow = [0, 0, 0];
  const wood = [143, 92, 43];
  const woodDark = [97, 62, 30];
  const steel = [200, 210, 225];
  const steelDark = [130, 140, 160];
  const ruby = [255, 77, 109];

  drawLine(img, w, h, 290, 800, 720, 310, 64, shadow, 0.25);
  drawLine(img, w, h, 305, 815, 735, 325, 46, woodDark, 0.95);
  drawLine(img, w, h, 305, 815, 735, 325, 36, wood, 0.95);
  drawLine(img, w, h, 305, 815, 735, 325, 18, [210, 170, 120], 0.18);

  drawLine(img, w, h, 520, 260, 840, 440, 78, shadow, 0.20);
  drawLine(img, w, h, 520, 260, 840, 440, 62, steelDark, 0.95);
  drawLine(img, w, h, 520, 260, 840, 440, 50, steel, 0.95);
  drawLine(img, w, h, 520, 260, 840, 440, 26, [255, 255, 255], 0.13);

  drawCircle(img, w, h, 640, 385, 42, [0, 0, 0], 0.30);
  drawCircle(img, w, h, 640, 385, 30, ruby, 0.95);
  drawCircle(img, w, h, 630, 375, 10, [255, 210, 220], 0.35);

  writePngRgba(outPath, w, h, Buffer.from(img.buffer));
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function resizePng(input, size, output) {
  run('sips', ['-z', String(size), String(size), input, '--out', output]);
}

function createIcoFromPngs(pngPaths, outPath) {
  const images = pngPaths.map((p) => ({
    size: Number(path.basename(p).match(/(\\d+)/)?.[1] || 256),
    data: fs.readFileSync(p)
  }));

  const count = images.length;
  const headerSize = 6;
  const dirEntrySize = 16;
  let offset = headerSize + dirEntrySize * count;

  const parts = [];
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(count, 4);
  parts.push(header);

  const dir = Buffer.alloc(dirEntrySize * count);
  images.forEach((img, idx) => {
    const widthByte = img.size >= 256 ? 0 : img.size;
    const heightByte = img.size >= 256 ? 0 : img.size;
    const base = idx * dirEntrySize;
    dir.writeUInt8(widthByte, base + 0);
    dir.writeUInt8(heightByte, base + 1);
    dir.writeUInt8(0, base + 2);
    dir.writeUInt8(0, base + 3);
    dir.writeUInt16LE(1, base + 4);
    dir.writeUInt16LE(32, base + 6);
    dir.writeUInt32LE(img.data.length, base + 8);
    dir.writeUInt32LE(offset, base + 12);
    offset += img.data.length;
  });
  parts.push(dir);

  for (const img of images) parts.push(img.data);
  fs.writeFileSync(outPath, Buffer.concat(parts));
}

function makeIco() {
  const tmpDir = path.join(BUILD_DIR, '.ico');
  fs.rmSync(tmpDir, { recursive: true, force: true });
  fs.mkdirSync(tmpDir, { recursive: true });

  const sizes = [16, 32, 48, 64, 128, 256];
  const pngPaths = sizes.map((s) => {
    const p = path.join(tmpDir, `win-${s}.png`);
    resizePng(ICON_PNG, s, p);
    return p;
  });

  createIcoFromPngs(pngPaths, ICON_ICO);
}

fs.mkdirSync(BUILD_DIR, { recursive: true });
makeIconPng(ICON_PNG);
makeIco();

console.log(`Wrote ${path.relative(ROOT, ICON_PNG)}`);
console.log(`Wrote ${path.relative(ROOT, ICON_ICO)}`);
