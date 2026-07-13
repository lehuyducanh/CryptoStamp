#!/usr/bin/env node
// VecMotion CLI — điều khiển project hoạt hình bằng dòng lệnh / AI agent.
// Mọi output là JSON trên stdout (dễ parse); lỗi → {ok:false,error} + exit 1.

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { opsNewProject, applyOps } from '../src/cli/ops.js';
import { decodePNG, scaleImageData } from '../src/cli/png.js';
import { vectorizeImageData } from '../src/vector/vectorize.js';
import { evalProjectAtFrame } from '../src/core/eval.js';
import { projectSVG } from '../src/core/markup.js';
import { animatedSVGString } from '../src/export/exporters.js';

const USAGE = `VecMotion CLI — công cụ hoạt hình vector cho AI agent

  vecmotion new -o project.json [--width 960] [--height 540] [--fps 30] [--duration 5]
  vecmotion info project.json
  vecmotion edit project.json --ops ops.json|-   [-o out.json]
  vecmotion vectorize input.png [--colors 8] [--detail 1.5] [--size 256]
            [--no-smooth] [--keep-bg] [-o trace.json]
            [--add project.json --name X [--split] [--x N --y N --scale S]]
  vecmotion render project.json --frame N -o frame.svg
  vecmotion render project.json -o outdir/ [--format svg|png] [--from F] [--to F] [--step 1]
  vecmotion render project.json --animated-svg -o anim.svg

Xem docs/CLI.md cho schema ops JSON (addShape, key, poseKey, parent, …).`;

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--') || (next.startsWith('-') && next.length > 1 && Number.isNaN(+next))) {
        args[k] = true;
      } else { args[k] = next; i++; }
    } else if (a === '-o') { args.o = argv[++i]; }
    else args._.push(a);
  }
  return args;
}

function out(obj) { process.stdout.write(JSON.stringify(obj, null, 1) + '\n'); }
function fail(msg) { out({ ok: false, error: msg }); process.exit(1); }

function loadProject(path) {
  const j = JSON.parse(readFileSync(path, 'utf8'));
  const p = j.project || j;
  if (!p.nodes || !p.tracks) throw new Error(path + ' không phải file dự án VecMotion');
  return p;
}
function saveProject(path, project) {
  writeFileSync(path, JSON.stringify({ app: 'vecmotion', version: 1, project }));
}

function readStdin() {
  try { return readFileSync(0, 'utf8'); } catch { return ''; }
}

// ---- Lệnh ----

function cmdNew(args) {
  if (!args.o) fail('Cần -o <project.json>');
  const p = opsNewProject({
    width: +args.width || undefined, height: +args.height || undefined,
    fps: +args.fps || undefined, durationS: +args.duration || undefined,
    name: args.name,
  });
  saveProject(args.o, p);
  out({ ok: true, file: args.o, width: p.width, height: p.height, fps: p.fps, durFrames: p.durFrames });
}

function cmdInfo(args) {
  const p = loadProject(args._[0] || fail('Cần đường dẫn project.json'));
  const tree = (list) => list.map((n) => ({
    id: n.id, name: n.name, type: n.type,
    ...(n.type === 'vector' ? { paths: n.paths.length } : {}),
    ...(n.children ? { children: tree(n.children) } : {}),
  }));
  out({
    ok: true, name: p.name, width: p.width, height: p.height, fps: p.fps,
    durFrames: p.durFrames, durationS: +(p.durFrames / p.fps).toFixed(3),
    nodes: tree(p.nodes),
    tracks: p.tracks.map((t) => ({
      nodeId: t.nodeId, prop: t.prop,
      keys: t.keys.map((k) => ({ t: k.t, e: k.e, ...(Array.isArray(k.v) ? { pts: k.v.length / 2 } : { v: k.v }) })),
    })),
    assets: (p.assets || []).map((a) => ({ id: a.id, name: a.name, w: a.w, h: a.h })),
  });
}

function cmdEdit(args) {
  const file = args._[0] || fail('Cần đường dẫn project.json');
  if (!args.ops) fail('Cần --ops <ops.json> (hoặc - để đọc stdin)');
  const raw = args.ops === '-' ? readStdin() : readFileSync(args.ops, 'utf8');
  const ops = JSON.parse(raw);
  const p = loadProject(file);
  const res = applyOps(p, ops);
  saveProject(args.o || file, p);
  out({ ok: true, file: args.o || file, applied: res.count, created: res.created });
}

function cmdVectorize(args) {
  const file = args._[0] || fail('Cần đường dẫn input.png');
  const img = scaleImageData(decodePNG(readFileSync(file)), +args.size || 256);
  const res = vectorizeImageData(img, {
    colors: +args.colors || 8,
    tolerance: args.detail ? Math.max(0.2, 4.5 - +args.detail) : 1.5,
    smooth: !args['no-smooth'],
    dropBg: !args['keep-bg'],
  });
  if (args.add) {
    const p = loadProject(args.add);
    const r = applyOps(p, [{
      op: 'addTraced', trace: res, ref: 'traced',
      split: !!args.split, seal: !args['no-seal'], name: args.name || 'Vector',
      x: args.x != null ? +args.x : undefined,
      y: args.y != null ? +args.y : undefined,
      scale: args.scale != null ? +args.scale : undefined,
    }]);
    saveProject(args.add, p);
    out({ ok: true, file: args.add, nodeId: r.created.traced, pieces: res.items.length, traceSize: [res.w, res.h] });
  } else {
    const json = JSON.stringify(res);
    if (args.o) { writeFileSync(args.o, json); out({ ok: true, file: args.o, pieces: res.items.length }); }
    else process.stdout.write(json + '\n');
  }
}

async function cmdRender(args) {
  const p = loadProject(args._[0] || fail('Cần đường dẫn project.json'));
  if (!args.o) fail('Cần -o <file|thư mục>');

  if (args['animated-svg']) {
    const svg = animatedSVGString(p);
    if (!svg) fail('Dự án chưa có keyframe nào');
    writeFileSync(args.o, svg);
    out({ ok: true, file: args.o, bytes: svg.length });
    return;
  }

  if (args.frame != null) {
    evalProjectAtFrame(p, +args.frame);
    const svg = projectSVG(p);
    writeFileSync(args.o, svg);
    out({ ok: true, file: args.o, frame: +args.frame });
    return;
  }

  const from = args.from != null ? +args.from : 0;
  const to = args.to != null ? +args.to : p.durFrames;
  const step = +args.step || 1;
  const format = args.format || 'svg';
  mkdirSync(args.o, { recursive: true });

  const frames = [];
  for (let f = from; f <= to; f += step) frames.push(f);

  if (format === 'svg') {
    frames.forEach((f, i) => {
      evalProjectAtFrame(p, f);
      writeFileSync(join(args.o, `frame_${String(i).padStart(5, '0')}.svg`), projectSVG(p));
    });
    out({ ok: true, dir: args.o, frames: frames.length, format: 'svg', fps: p.fps });
    return;
  }

  if (format !== 'png') fail("--format phải là 'svg' hoặc 'png'");
  // PNG cần Chromium headless (playwright-core)
  let chromium;
  try { ({ chromium } = await import('playwright-core')); }
  catch { fail('Xuất PNG cần playwright-core: npm i playwright-core (SVG không cần)'); }
  const execPath = process.env.VECMOTION_CHROMIUM || findChromium();
  const browser = await chromium.launch({
    ...(execPath ? { executablePath: execPath } : {}), args: ['--no-sandbox'],
  });
  const page = await browser.newPage({ viewport: { width: p.width, height: p.height } });
  for (let i = 0; i < frames.length; i++) {
    evalProjectAtFrame(p, frames[i]);
    await page.setContent(
      `<!DOCTYPE html><html><body style="margin:0">${projectSVG(p)}</body></html>`,
      { waitUntil: 'load' });
    await page.screenshot({ path: join(args.o, `frame_${String(i).padStart(5, '0')}.png`) });
  }
  await browser.close();
  out({
    ok: true, dir: args.o, frames: frames.length, format: 'png', fps: p.fps,
    hint: `ffmpeg -framerate ${p.fps} -i ${args.o}/frame_%05d.png -c:v libx264 -pix_fmt yuv420p out.mp4`,
  });
}

function findChromium() {
  for (const base of ['/opt/pw-browsers']) {
    if (!existsSync(base)) continue;
    for (const d of readdirSync(base)) {
      const c = join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium') && existsSync(c)) return c;
    }
  }
  return null;
}

// ---- main ----
const args = parseArgs(process.argv.slice(2));
const cmd = args._.shift();
try {
  switch (cmd) {
    case 'new': cmdNew(args); break;
    case 'info': cmdInfo(args); break;
    case 'edit': cmdEdit(args); break;
    case 'vectorize': cmdVectorize(args); break;
    case 'render': await cmdRender(args); break;
    default:
      process.stdout.write(USAGE + '\n');
      process.exit(cmd ? 1 : 0);
  }
} catch (e) {
  fail(e.message);
}
