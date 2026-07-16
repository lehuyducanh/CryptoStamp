// Dựng nhân vật "Vẹt Xanh" (vector hóa tay từ character sheet) + thư viện
// chuyển động. Chạy: node tools/build-parrot-library.mjs
// Xuất ra library/parrot/: base + 7 motion (.vecmotion.json + .svg động) + gallery.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { opsNewProject, applyOps } from '../src/cli/ops.js';
import { animatedSVGString } from '../src/export/exporters.js';
import { projectSVG } from '../src/core/markup.js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'library', 'parrot');
mkdirSync(OUT, { recursive: true });

const F = (v) => Math.round(v * 100) / 100;

// Blob 4 đỉnh trơn (trên/phải/dưới/trái) — ryT/ryB tách để làm hình trứng
function blob(cx, cy, rx, ryT, ryB = ryT, k = 0.552) {
  return `M${F(cx)} ${F(cy - ryT)}`
    + `C${F(cx + rx * k)} ${F(cy - ryT)} ${F(cx + rx)} ${F(cy - ryT * k)} ${F(cx + rx)} ${F(cy)}`
    + `C${F(cx + rx)} ${F(cy + ryB * k)} ${F(cx + rx * k)} ${F(cy + ryB)} ${F(cx)} ${F(cy + ryB)}`
    + `C${F(cx - rx * k)} ${F(cy + ryB)} ${F(cx - rx)} ${F(cy + ryB * k)} ${F(cx - rx)} ${F(cy)}`
    + `C${F(cx - rx)} ${F(cy - ryT * k)} ${F(cx - rx * k)} ${F(cy - ryT)} ${F(cx)} ${F(cy - ryT)}Z`;
}

// ---- Bảng màu (khớp character sheet) ----
const GREEN = '#7cba43', GREEN_D = '#5f9a31', CREAM = '#f6e8ce', RED = '#e8502a';
const BROWN = '#9b7653', BROWN_D = '#5b4436', DARK = '#33291f', PINK = '#f3b4a1';

// ---- Ops dựng nhân vật (tọa độ cục bộ 0..400 x 0..450) ----
function characterOps() {
  const vec = (id, name, paths, extra = {}) => ({ op: 'addVector', id, name, paths, seal: true, ...extra });
  const piv = (node, px, py) => ({ op: 'setPivot', node, px, py });
  return [
    // Chân (đứng ngoài Thân để thân squash mà chân vẫn bám đất)
    vec('footL', 'Chân trái', [{ d: blob(158, 425, 30, 11, 13), fill: BROWN }]),
    vec('footR', 'Chân phải', [{ d: blob(242, 425, 30, 11, 13), fill: BROWN }]),
    piv('footL', 158, 414), piv('footR', 242, 414),

    // Thân + bụng
    vec('body', 'Mình', [{ d: blob(200, 330, 92, 70, 84) }].map((p) => ({ ...p, fill: GREEN }))),
    vec('belly', 'Bụng', [{ d: blob(200, 352, 58, 48, 56), fill: CREAM }]),

    // Cánh (pivot tại vai — góc trong-trên, ôm sát mép thân)
    vec('wingL', 'Cánh trái', [{ d: blob(116, 330, 27, 48, 62), fill: GREEN_D }]),
    vec('wingR', 'Cánh phải', [{ d: blob(284, 330, 27, 48, 62), fill: GREEN_D }]),
    piv('wingL', 128, 286), piv('wingR', 272, 286),
    { op: 'setProps', node: 'wingL', props: { rotation: 9 } },
    { op: 'setProps', node: 'wingR', props: { rotation: -9 } },

    // Đầu
    vec('head', 'Đầu', [{ d: blob(200, 150, 128, 118, 112), fill: GREEN }]),
    vec('crest', 'Mào', [{
      d: 'M196 62C176 40 178 8 196 4C200 2 206 6 206 14C212 2 228 6 228 22C228 40 216 56 204 64C200 66 198 65 196 62Z',
      fill: GREEN,
    }]),
    piv('crest', 205, 60),
    vec('face', 'Mặt', [{ d: blob(200, 162, 90, 60, 78), fill: CREAM }]),
    vec('browL', 'Mày trái', [{ d: blob(150, 103, 24, 5.5), fill: DARK }]),
    vec('browR', 'Mày phải', [{ d: blob(250, 103, 24, 5.5), fill: DARK }]),
    vec('eyeL', 'Mắt trái', [
      { d: blob(150, 141, 20, 21), fill: DARK },
      { d: blob(143, 133, 6.5, 7), fill: '#ffffff' },
    ]),
    vec('eyeR', 'Mắt phải', [
      { d: blob(250, 141, 20, 21), fill: DARK },
      { d: blob(243, 133, 6.5, 7), fill: '#ffffff' },
    ]),
    vec('cheekL', 'Má trái', [{ d: blob(112, 183, 16, 9), fill: PINK }]),
    vec('cheekR', 'Má phải', [{ d: blob(288, 183, 16, 9), fill: PINK }]),
    vec('beak', 'Mỏ', [{
      d: 'M175 160C187 151 213 151 225 160C222 178 208 191 200 194C192 191 178 178 175 160Z',
      fill: BROWN,
    }]),
    vec('mouth', 'Miệng', [{
      d: 'M181 198C190 194 210 194 219 198C215 214 207 221 200 221C193 221 185 214 181 198Z',
      fill: BROWN_D,
    }]),
    piv('mouth', 200, 196),
    // Khăn đỏ (vẽ sau cùng trong nhóm Đầu để che khớp cổ)
    vec('scarf', 'Khăn', [
      {
        d: 'M132 250C155 262 245 262 268 250C266 274 236 312 200 326C164 312 134 274 132 250Z',
        fill: RED,
      },
      { d: blob(266, 260, 19, 11, 13), fill: RED },
      { d: 'M278 262C298 258 312 268 312 282C299 278 290 286 285 296C276 290 271 272 278 262Z', fill: RED },
    ]),

    // Cây rig FK
    {
      op: 'addGroup', id: 'dau', name: 'Đầu (khớp)',
      children: ['head', 'crest', 'face', 'browL', 'browR', 'eyeL', 'eyeR',
        'cheekL', 'cheekR', 'beak', 'mouth', 'scarf'],
    },
    piv('dau', 200, 252),
    { op: 'addGroup', id: 'than', name: 'Thân (khớp)', children: ['body', 'belly', 'wingL', 'wingR', 'dau'] },
    piv('than', 200, 412),
    { op: 'addGroup', id: 'viet', name: 'Vẹt Xanh', children: ['footL', 'footR', 'than'] },
    piv('viet', 200, 438),
    { op: 'setProps', node: 'viet', props: { x: 280, y: 60 } },
  ];
}

// ---- Helper keyframe ----
const K = (node, prop, keys) =>
  keys.map(([frame, value, ease]) => ({ op: 'key', node, prop, frame, value, ...(ease ? { ease } : {}) }));
const blink = (at) => ['eyeL', 'eyeR'].flatMap((e) =>
  K(e, 'scaleY', [[at, 1], [at + 3, 0.08, 'easeOut'], [at + 6, 1]]));

// ---- Thư viện chuyển động ----
const MOTIONS = {
  'idle-breathe': {
    label: 'Đứng thở (idle)', dur: 90,
    ops: () => [
      ...K('than', 'scaleY', [[0, 1], [45, 1.03], [90, 1]]),
      ...K('than', 'scaleX', [[0, 1], [45, 0.988], [90, 1]]),
      ...K('dau', 'rotation', [[0, 0], [45, -2.5], [90, 0]]),
      ...K('dau', 'y', [[0, 0], [45, 3], [90, 0]]),
      ...K('wingL', 'rotation', [[0, 9], [45, 14], [90, 9]]),
      ...K('wingR', 'rotation', [[0, -9], [45, -14], [90, -9]]),
      ...K('crest', 'rotation', [[0, 0], [50, 5], [90, 0]]),
      ...blink(24), ...blink(64),
    ],
  },
  'hop': {
    label: 'Nhảy lò cò (di chuyển)', dur: 60,
    ops: () => [
      ...K('viet', 'y', [[0, 150, 'easeOut'], [15, 95, 'easeIn'], [30, 150, 'easeOut'], [45, 95, 'easeIn'], [60, 150]]),
      ...K('than', 'scaleY', [[0, 0.88], [8, 1.09], [15, 1], [24, 1.05, 'easeIn'], [29, 0.85], [30, 0.88],
        [38, 1.09], [45, 1], [54, 1.05, 'easeIn'], [59, 0.85], [60, 0.88]]),
      ...K('wingL', 'rotation', [[0, 9], [12, 66, 'easeOut'], [26, 9], [42, 66, 'easeOut'], [56, 9]]),
      ...K('wingR', 'rotation', [[0, -9], [12, -66, 'easeOut'], [26, -9], [42, -66, 'easeOut'], [56, -9]]),
      ...K('footL', 'rotation', [[0, 0], [13, -24], [26, 0], [43, -24], [56, 0]]),
      ...K('footR', 'rotation', [[0, 0], [13, 24], [26, 0], [43, 24], [56, 0]]),
      ...K('dau', 'rotation', [[0, 3], [15, -4], [30, 3], [45, -4], [60, 3]]),
      ...K('crest', 'rotation', [[0, 4], [15, -8], [30, 4], [45, -8], [60, 4]]),
    ],
  },
  'wave': {
    label: 'Vẫy chào', dur: 78,
    ops: () => [
      ...K('wingR', 'rotation', [[0, -9, 'easeOut'], [14, -160], [24, -135], [34, -162], [44, -135],
        [54, -160, 'easeInOut'], [76, -9]]),
      ...K('dau', 'rotation', [[0, 0], [14, 7], [54, 7], [76, 0]]),
      ...K('than', 'rotation', [[0, 0], [14, -3.5], [54, -3.5], [76, 0]]),
      ...K('wingL', 'rotation', [[0, 9], [14, 16], [54, 16], [76, 9]]),
      ...blink(30),
      ...K('mouth', 'scaleY', [[0, 1], [12, 1.25], [60, 1.25], [76, 1]]),
    ],
  },
  'jump-happy': {
    label: 'Nhảy mừng', dur: 66,
    ops: () => [
      ...K('viet', 'y', [[0, 150], [10, 150, 'easeOut'], [24, 30], [26, 30, 'easeIn'], [40, 150, 'backOut'], [66, 150]]),
      ...K('than', 'scaleY', [[0, 1, 'easeIn'], [8, 0.82, 'easeOut'], [14, 1.12], [24, 1.04], [38, 1.04, 'easeIn'],
        [42, 0.8], [54, 1, 'backOut'], [66, 1]]),
      ...K('wingL', 'rotation', [[0, 9], [9, -8, 'easeOut'], [16, 145], [38, 130], [46, 22], [56, 9]]),
      ...K('wingR', 'rotation', [[0, -9], [9, 8, 'easeOut'], [16, -145], [38, -130], [46, -22], [56, -9]]),
      ...K('crest', 'scaleY', [[8, 0.85], [18, 1.3], [40, 1.1], [46, 0.8], [58, 1]]),
      ...K('dau', 'rotation', [[0, 0], [8, 4], [20, -6], [44, 5], [58, 0]]),
      ...K('eyeL', 'scaleY', [[0, 1], [40, 1], [43, 0.15], [50, 1]]),
      ...K('eyeR', 'scaleY', [[0, 1], [40, 1], [43, 0.15], [50, 1]]),
      ...K('mouth', 'scaleY', [[0, 1], [14, 1.35], [46, 1.35], [60, 1]]),
    ],
  },
  'look-around': {
    label: 'Nhìn quanh', dur: 120,
    ops: () => [
      ...K('dau', 'rotation', [[0, 0, 'easeInOut'], [18, -15, 'hold'], [48, -15, 'easeInOut'],
        [66, 15, 'hold'], [96, 15, 'easeInOut'], [114, 0]]),
      ...K('eyeL', 'x', [[0, 0], [14, -8, 'hold'], [48, -8], [62, 8, 'hold'], [96, 8], [112, 0]]),
      ...K('eyeR', 'x', [[0, 0], [14, -8, 'hold'], [48, -8], [62, 8, 'hold'], [96, 8], [112, 0]]),
      ...K('than', 'rotation', [[0, 0], [18, -2], [66, 2], [114, 0]]),
      ...blink(50), ...blink(100),
    ],
  },
  'talk': {
    label: 'Nói chuyện', dur: 72,
    ops: () => [
      ...K('mouth', 'scaleY', [[0, 0.3], [5, 1.1], [10, 0.35], [15, 0.95], [20, 0.3], [26, 1.1], [32, 0.4],
        [38, 0.9], [44, 0.3], [50, 1.1], [56, 0.35], [62, 0.9], [68, 0.3], [72, 0.3]]),
      ...K('dau', 'rotation', [[0, 0], [10, 2], [20, -1.5], [32, 2], [44, -2], [56, 1.5], [68, 0]]),
      ...K('dau', 'y', [[0, 0], [36, 2], [72, 0]]),
      ...K('browL', 'y', [[0, 0], [6, -5], [52, -5], [64, 0]]),
      ...K('browR', 'y', [[0, 0], [6, -5], [52, -5], [64, 0]]),
      ...K('wingL', 'rotation', [[0, 9], [20, 18], [40, 7], [60, 15], [72, 9]]),
      ...blink(40),
    ],
  },
  'dance': {
    label: 'Nhún nhảy', dur: 96,
    ops: () => [
      ...K('than', 'rotation', [[0, -7], [24, 7], [48, -7], [72, 7], [96, -7]]),
      ...K('dau', 'rotation', [[0, 5], [24, -5], [48, 5], [72, -5], [96, 5]]),
      ...K('viet', 'y', [[0, 150], [12, 134], [24, 150], [36, 134], [48, 150], [60, 134], [72, 150], [84, 134], [96, 150]]),
      ...K('wingL', 'rotation', [[0, 46], [24, 3], [48, 46], [72, 3], [96, 46]]),
      ...K('wingR', 'rotation', [[0, -3], [24, -46], [48, -3], [72, -46], [96, -3]]),
      ...K('crest', 'rotation', [[0, -6], [24, 6], [48, -6], [72, 6], [96, -6]]),
      ...K('mouth', 'scaleY', [[0, 1.2]]),
      ...blink(30), ...blink(78),
    ],
  },
};

// ---- Build ----
// Vị trí đứng cơ bản (chừa 150px trên đầu cho các cú nhảy)
const BASE_Y = 150;

function newBase() {
  const p = opsNewProject({ width: 560, height: 640, fps: 30, durationS: 3, name: 'Vẹt Xanh' });
  p.background = '#faf4e8';
  applyOps(p, characterOps());
  applyOps(p, [{ op: 'setProps', node: 'viet', props: { x: 80, y: BASE_Y } }]);
  return p;
}

const base = newBase();
writeFileSync(join(OUT, 'parrot-base.vecmotion.json'),
  JSON.stringify({ app: 'vecmotion', version: 1, project: base }));
writeFileSync(join(OUT, 'parrot-pose.svg'), projectSVG(base));

const galleryCards = [];
for (const [key, m] of Object.entries(MOTIONS)) {
  const p = newBase();
  p.name = 'Vẹt Xanh — ' + m.label;
  p.durFrames = m.dur;
  applyOps(p, m.ops());
  writeFileSync(join(OUT, `${key}.vecmotion.json`),
    JSON.stringify({ app: 'vecmotion', version: 1, project: p }));
  const svg = animatedSVGString(p);
  writeFileSync(join(OUT, `${key}.svg`), svg);
  galleryCards.push({ key, label: m.label, durS: (m.dur / 30).toFixed(1) });
  console.log(`✓ ${key} (${m.dur}f, ${(m.dur / 30).toFixed(1)}s)`);
}

// Gallery HTML tĩnh
const cards = galleryCards.map((c) => `
  <figure><img src="${c.key}.svg" alt="${c.label}" loading="lazy">
  <figcaption>${c.label} <span>${c.durS}s · loop</span></figcaption></figure>`).join('');
writeFileSync(join(OUT, 'index.html'), `<!DOCTYPE html>
<html lang="vi"><head><meta charset="UTF-8"><title>Vẹt Xanh — Thư viện chuyển động</title>
<style>
body{font-family:system-ui;background:#16181d;color:#e8e4da;margin:0;padding:32px}
h1{font-weight:700}p.sub{color:#9aa0ab;margin-top:-8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:20px;margin-top:24px}
figure{margin:0;background:#faf4e8;border-radius:14px;overflow:hidden}
figure img{width:100%;display:block}
figcaption{background:#1f232b;padding:10px 14px;font-size:14px;display:flex;justify-content:space-between}
figcaption span{color:#8b93a3}
</style></head><body>
<h1>🦜 Vẹt Xanh — Thư viện chuyển động</h1>
<p class="sub">Rig FK 14 bộ phận · SVG động tự chứa (CSS + SMIL) · dựng bằng VecMotion CLI —
sửa file .vecmotion.json tương ứng để tinh chỉnh.</p>
<div class="grid">${cards}</div>
</body></html>`);
console.log('✓ gallery index.html + parrot-base + parrot-pose.svg → library/parrot/');
