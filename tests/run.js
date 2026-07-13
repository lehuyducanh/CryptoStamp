// Unit tests cho các module thuần (chạy: node tests/run.js)

import {
  matMul, matInvert, matApply, matIdentity, nodeMatrix,
} from '../src/core/mat.js';
import { evalTrack, EASINGS } from '../src/core/anim.js';
import { quantizeImage, medianCutPalette } from '../src/vector/quantize.js';
import { traceColor } from '../src/vector/trace.js';
import { rdpSimplify, shoelaceArea, loopsToPathD } from '../src/vector/simplify.js';
import { vectorizeImageData } from '../src/vector/vectorize.js';
import {
  state, newProject, makeNode, addNode, setProps, setFrame, findNode,
  undo, setPivot, groupSelection, setSelection,
} from '../src/core/state.js';

let pass = 0, fail = 0;
function ok(cond, msg) {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ ' + msg); }
}
function close(a, b, eps, msg) { ok(Math.abs(a - b) <= (eps ?? 1e-6), `${msg} (${a} ≈ ${b})`); }

// ---- mat ----
{
  const m = matMul([2, 0, 0, 2, 10, 5], [1, 0, 0, 1, 3, 4]);
  const p = matApply(m, { x: 1, y: 1 });
  close(p.x, 18, 1e-9, 'matMul translate+scale x');
  close(p.y, 15, 1e-9, 'matMul translate+scale y');

  const r = matMul(matInvert(m), m);
  const id = matIdentity();
  ok(r.every((v, i) => Math.abs(v - id[i]) < 1e-9), 'matInvert roundtrip');

  // Pivot bất biến: điểm pivot map thành (x+pivotX, y+pivotY) bất kể xoay/scale
  const n = { x: 7, y: 3, rotation: 137, scaleX: 2.5, scaleY: 0.7, pivotX: 11, pivotY: -4 };
  const q = matApply(nodeMatrix(n), { x: 11, y: -4 });
  close(q.x, 18, 1e-9, 'pivot invariant x');
  close(q.y, -1, 1e-9, 'pivot invariant y');
}

// ---- anim ----
{
  const tr = { keys: [{ t: 0, v: 0, e: 'linear' }, { t: 10, v: 100, e: 'linear' }] };
  close(evalTrack(tr, -5), 0, 0, 'evalTrack trước key đầu');
  close(evalTrack(tr, 5), 50, 1e-9, 'evalTrack linear giữa');
  close(evalTrack(tr, 99), 100, 0, 'evalTrack sau key cuối');
  const hold = { keys: [{ t: 0, v: 1, e: 'hold' }, { t: 10, v: 9, e: 'linear' }] };
  close(evalTrack(hold, 7), 1, 0, 'evalTrack hold');
  close(EASINGS.easeInOut(0.5), 0.5, 1e-9, 'easeInOut đối xứng');
  close(EASINGS.easeOut(1), 1, 1e-9, 'easeOut(1)=1');
}

// ---- rdp / shoelace ----
{
  const line = [[0, 0], [1, 0.01], [2, 0], [3, -0.01], [4, 0]];
  ok(rdpSimplify(line, 0.1).length === 2, 'rdp gộp đường gần thẳng');
  const zig = [[0, 0], [2, 5], [4, 0]];
  ok(rdpSimplify(zig, 0.1).length === 3, 'rdp giữ đỉnh nhọn');
  close(Math.abs(shoelaceArea([[0, 0], [2, 0], [2, 2], [0, 2]])), 4, 1e-9, 'shoelace hình vuông');

  // Hồi quy: vòng kín nhiều điểm không được collapse về <3 điểm
  const ring = [];
  for (let i = 0; i < 10; i++) ring.push([i, 0]);
  for (let i = 0; i < 10; i++) ring.push([10, i]);
  for (let i = 10; i > 0; i--) ring.push([i, 10]);
  for (let i = 10; i > 0; i--) ring.push([0, i]);
  const res = loopsToPathD([ring], { tolerance: 1.5, smooth: false, minArea: 1 });
  ok(res !== null, 'vòng kín lớn không bị RDP nuốt (chord suy biến)');
  ok(res && (res.d.match(/L/g) || []).length >= 2, 'vòng kín giữ được ≥3 đỉnh');
}

// ---- quantize ----
{
  const pal = medianCutPalette([[0, 0, 0], [0, 0, 0], [255, 255, 255], [255, 255, 255]], 2);
  ok(pal.length === 2, 'medianCut ra 2 màu');
  // Ảnh 2x1: đen + trắng
  const data = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]);
  const { palette, indexed } = quantizeImage(data, 2, 1, 2);
  ok(palette.length === 2, 'quantizeImage palette 2');
  ok(indexed[0] !== indexed[1], 'quantizeImage 2 pixel khác chỉ số');
  // Pixel trong suốt = -1
  const data2 = new Uint8ClampedArray([0, 0, 0, 0, 255, 0, 0, 255]);
  const q2 = quantizeImage(data2, 2, 1, 2);
  ok(q2.indexed[0] === -1, 'pixel trong suốt = -1');
}

// ---- trace ----
{
  // 1 pixel giữa lưới 3x3 → 1 vòng, 4 góc
  const g1 = new Int16Array(9).fill(-1);
  g1[4] = 0;
  const loops1 = traceColor(g1, 3, 3, 0);
  ok(loops1.length === 1, 'trace 1 pixel: 1 vòng');
  ok(loops1[0].length === 4, 'trace 1 pixel: 4 góc');
  close(Math.abs(shoelaceArea(loops1[0])), 1, 1e-9, 'trace 1 pixel: diện tích 1');

  // Donut 3x3 (tâm rỗng) → 2 vòng (ngoài + lỗ)
  const g2 = new Int16Array(9).fill(0);
  g2[4] = -1;
  const loops2 = traceColor(g2, 3, 3, 0);
  ok(loops2.length === 2, 'trace donut: 2 vòng');
  const areas = loops2.map((l) => Math.abs(shoelaceArea(l))).sort((a, b) => a - b);
  close(areas[0], 1, 1e-9, 'donut: lỗ diện tích 1');
  close(areas[1], 9, 1e-9, 'donut: ngoài diện tích 9');

  // Checkerboard 2 pixel chéo → không treo, phủ đủ diện tích
  const g3 = new Int16Array(4).fill(-1);
  g3[0] = 0; g3[3] = 0;
  const loops3 = traceColor(g3, 2, 2, 0);
  const total3 = loops3.reduce((s, l) => s + Math.abs(shoelaceArea(l)), 0);
  close(total3, 2, 1e-9, 'checkerboard: tổng diện tích 2');
}

// ---- loopsToPathD ----
{
  const res = loopsToPathD([[[0, 0], [10, 0], [10, 10], [0, 10]]], { minArea: 1, smooth: false });
  ok(res && res.d.startsWith('M') && res.d.endsWith('Z'), 'loopsToPathD ra path kín');
  ok(res.bbox.w === 10 && res.bbox.h === 10, 'loopsToPathD bbox đúng');
}

// ---- vectorize pipeline (ảnh giả 8x8) ----
{
  const w = 8, h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const inSq = x >= 2 && x < 6 && y >= 2 && y < 6;
    data[i * 4] = inSq ? 200 : 30;
    data[i * 4 + 1] = inSq ? 50 : 30;
    data[i * 4 + 2] = inSq ? 50 : 200;
    data[i * 4 + 3] = 255;
  }
  const res = vectorizeImageData({ data, width: w, height: h },
    { colors: 2, dropBg: true, smooth: false, minArea: 1 });
  ok(res.items.length === 1, 'vectorize: nền bị bỏ, còn 1 mảnh');
  ok(res.items[0].bbox.w === 4, 'vectorize: bbox mảnh đúng 4px');
}

// ---- state: node, autokey, undo, pivot, group ----
{
  state.project = newProject();
  const n = makeNode('shape', { shape: 'rect', w: 100, h: 50, fill: '#fff', x: 10, y: 20 });
  addNode(n, null, null, { snapshot: true });
  ok(findNode(n.id) === n, 'addNode + findNode');

  state.autokey = true;
  setFrame(0);
  setProps(n.id, { x: 0 });
  setFrame(30);
  setProps(n.id, { x: 300 });
  setFrame(15);
  close(findNode(n.id).x, 150, 30, 'autokey + evalTrack tại giữa (easeInOut)');
  ok(state.project.tracks.length === 1, 'chỉ 1 track cho x');
  ok(state.project.tracks[0].keys.length === 2, '2 keyframes');

  // Đổi pivot không làm hình nhảy
  const before = nodeMatrix(findNode(n.id));
  setPivot(n.id, 50, 25);
  const after = nodeMatrix(findNode(n.id));
  ok(before.every((v, i) => Math.abs(v - after[i]) < 1e-6), 'setPivot bù trừ, ma trận không đổi');

  // Group
  const n2 = makeNode('shape', { shape: 'ellipse', w: 40, h: 40, fill: '#f00' });
  addNode(n2);
  setSelection([n.id, n2.id]);
  groupSelection();
  ok(state.project.nodes.length === 1 && state.project.nodes[0].type === 'group', 'groupSelection gộp thành 1 group');
  ok(state.project.nodes[0].children.length === 2, 'group có 2 con');

  // Undo
  undo();
  ok(state.project.nodes.length === 2, 'undo trả lại 2 node rời');

  // Serialize roundtrip
  const json = JSON.stringify(state.project);
  const back = JSON.parse(json);
  ok(back.nodes.length === state.project.nodes.length
    && back.tracks.length === state.project.tracks.length, 'serialize roundtrip');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
