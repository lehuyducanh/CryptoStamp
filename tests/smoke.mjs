// Smoke test: chạy app trong Chromium thật, kiểm tra toàn pipeline qua window.__vm
// Chạy: node tests/smoke.mjs [--shot đường/dẫn/ảnh.png]

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
};

const server = http.createServer(async (req, res) => {
  try {
    const path = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'Content-Type': MIME[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404); res.end('not found');
  }
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const shotIdx = process.argv.indexOf('--shot');
const shotPath = shotIdx > 0 ? process.argv[shotIdx + 1] : null;

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const loc = m.location()?.url || '';
  if (loc.includes('favicon')) return; // 404 favicon không phải lỗi app
  errors.push('console: ' + m.text() + ' @ ' + loc);
});

await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForFunction(() => window.__vm, null, { timeout: 10000 });

const result = await page.evaluate(async () => {
  const A = window.__vm;
  localStorage.clear();

  // 1. Tạo shape + animate bằng autokey
  const n = A.makeNode('shape', {
    shape: 'rect', w: 120, h: 90, fill: '#ff5566',
    x: 100, y: 100, pivotX: 60, pivotY: 45, name: 'Khối test',
  });
  A.addNode(n);
  A.setSelection([n.id]);
  A.state.autokey = true;
  A.setFrame(0); A.setProps(n.id, { x: 100 });
  A.setFrame(30); A.setProps(n.id, { x: 500, rotation: 180 });
  A.setFrame(15);
  const midX = A.findNode(n.id).x;
  if (Math.abs(midX - 300) > 1) throw new Error('nội suy giữa sai: ' + midX);

  // 2. AI mock → vector hóa → thêm node (tách mảnh)
  const url = await A.AI_PROVIDERS.mock.generate({ prompt: 'robot', width: 300, height: 300, seed: 7 });
  const img = await A.loadImage(url);
  const idat = A.imageToImageData(img, 220);
  const res = A.vectorizeImageData(idat, { colors: 6 });
  if (res.items.length < 3) throw new Error('vectorize quá ít mảnh: ' + res.items.length);
  const vn = A.addTraceResult(res, { split: true, seal: true, name: 'Robot' });
  if (!vn || vn.type !== 'group') throw new Error('addTraceResult không ra group');

  // 3. Xuất
  const svg = A.projectSVG(A.state.project);
  if (!svg.includes('<path')) throw new Error('SVG tĩnh thiếu path');
  const anim = A.animatedSVGString();
  if (!anim || !anim.includes('@keyframes')) throw new Error('SVG động thiếu keyframes');

  // 4. Undo hoạt động
  const before = A.state.project.nodes.length;
  A.undo();
  const after = A.state.project.nodes.length;
  if (after >= before) throw new Error('undo không giảm node');
  A.redo?.();

  A.setFrame(12);
  return {
    nodes: A.state.project.nodes.length,
    tracks: A.state.project.tracks.length,
    pieces: res.items.length,
    svgLen: svg.length,
    animLen: anim.length,
  };
});

await page.waitForTimeout(300);
if (shotPath) await page.screenshot({ path: shotPath });
await browser.close();
server.close();

if (errors.length) {
  console.error('LỖI TRANG:\n' + errors.join('\n'));
  process.exit(1);
}
console.log('SMOKE OK', JSON.stringify(result));
