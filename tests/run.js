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
import { crc32, zipStore } from '../src/export/zip.js';
import { parsePathD, buildPathD, pathAnchorIdx, moveAnchor } from '../src/vector/path.js';
import { geometryFlat, applyMorphFlat, evalProjectAtFrame } from '../src/core/eval.js';
import { opsNewProject, applyOps } from '../src/cli/ops.js';
import { splitIslandGroups, vectorizeImageData as vecImg2 } from '../src/vector/vectorize.js';
import { planRig, autoRigApply } from '../src/rig/autorig.js';

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

// ---- path parse/build/moveAnchor ----
{
  const g = parsePathD('M0 0L10 0L10 10L0 10Z');
  ok(g.cmds === 'MLLLZ' && g.pts.length === 8, 'parsePathD polygon');
  ok(buildPathD(g.cmds, g.pts) === 'M0 0L10 0L10 10L0 10Z', 'buildPathD roundtrip');
  ok(pathAnchorIdx(g.cmds).join(',') === '0,2,4,6', 'pathAnchorIdx polygon');

  const c = parsePathD('M0 0C1 0 9 0 10 0C10 1 10 9 10 10C9 10 1 10 0 10C0 9 0 1 0 0Z');
  ok(c.cmds === 'MCCCCZ' && c.pts.length === 26, 'parsePathD bezier kín');

  // Lặp ngầm: M 0 0 5 5 → M rồi L
  const imp = parsePathD('M0 0 5 5L9 9Z');
  ok(imp.cmds === 'MLLZ', 'parsePathD lặp ngầm M→L');

  let threw = false;
  try { parsePathD('M0 0q1 1 2 2'); } catch { threw = true; }
  ok(threw, 'parsePathD từ chối lệnh tương đối/không hỗ trợ');

  // moveAnchor: kéo góc polygon
  const g2 = parsePathD('M0 0L10 0L10 10L0 10Z');
  moveAnchor(g2.cmds, g2.pts, 2, 5, -3); // góc (10,0)
  ok(g2.pts[2] === 15 && g2.pts[3] === -3, 'moveAnchor dịch đúng đỉnh');
  ok(g2.pts[0] === 0 && g2.pts[4] === 10, 'moveAnchor không đụng đỉnh khác');

  // moveAnchor weld: điểm M trùng điểm cuối path kín phải dịch cùng nhau
  const g3 = parsePathD('M0 0C1 0 9 0 10 0C10 1 10 9 10 10C9 10 1 10 0 10C0 9 0 1 0 0Z');
  moveAnchor(g3.cmds, g3.pts, 0, 4, 4); // kéo điểm M(0,0)
  ok(g3.pts[0] === 4 && g3.pts[1] === 4, 'weld: điểm M dịch');
  ok(g3.pts[24] === 4 && g3.pts[25] === 4, 'weld: điểm cuối trùng dịch theo (không rách mối hàn)');
  ok(g3.pts[2] === 5 && g3.pts[22] === 4, 'weld: control kề dịch theo');
}

// ---- morph eval ----
{
  const proj = {
    nodes: [{
      id: 'v1', type: 'vector', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
      opacity: 1, pivotX: 0, pivotY: 0,
      paths: [{ d: 'M0 0L10 0L10 10L0 10Z', fill: '#f00' }],
    }],
    tracks: [],
  };
  const n = proj.nodes[0];
  const flat0 = geometryFlat(n);
  ok(flat0.length === 8, 'geometryFlat 8 tọa độ');
  const flat1 = flat0.map((v, i) => (i % 2 === 0 ? v + 20 : v)); // dịch x +20
  proj.tracks.push({
    id: 't1', nodeId: 'v1', prop: 'morph',
    keys: [{ t: 0, v: flat0, e: 'linear' }, { t: 10, v: flat1, e: 'linear' }],
  });
  evalProjectAtFrame(proj, 5);
  const mid = geometryFlat(n);
  close(mid[0], 10, 0.01, 'morph nội suy giữa: x0 = +10');
  close(mid[1], 0, 0.01, 'morph nội suy giữa: y giữ nguyên');
  evalProjectAtFrame(proj, 10);
  close(geometryFlat(n)[0], 20, 0.01, 'morph tại key cuối');
  // applyMorphFlat trực tiếp
  applyMorphFlat(n, flat0);
  ok(n.paths[0].d === 'M0 0L10 0L10 10L0 10Z', 'applyMorphFlat khôi phục d gốc');
}

// ---- CLI ops engine ----
{
  const p = opsNewProject({ width: 800, height: 600, fps: 30, durationS: 2 });
  ok(p.durFrames === 60, 'opsNewProject durFrames');
  const r = applyOps(p, [
    { op: 'addShape', shape: 'rect', w: 100, h: 50, fill: '#ff0000', x: 10, y: 20, name: 'Thân', ref: 'body' },
    { op: 'addShape', shape: 'ellipse', w: 40, h: 40, name: 'Đầu', ref: 'head' },
    { op: 'addGroup', name: 'Nhân vật', children: ['@body', '@head'], ref: 'char' },
    { op: 'setPivot', node: '@char', px: 60, py: 45 },
    { op: 'key', node: '@char', prop: 'rotation', frame: 0, value: 0, ease: 'easeInOut' },
    { op: 'key', node: '@char', prop: 'rotation', frame: 30, value: 90 },
    { op: 'key', node: '@body', prop: 'w', frame: 0, value: 100 },
    { op: 'key', node: '@body', prop: 'w', frame: 30, value: 200, ease: 'linear' },
    { op: 'addVector', paths: [{ d: 'M0 0L20 0L20 20L0 20Z', fill: '#0f0' }], name: 'Lá', ref: 'leaf' },
    { op: 'poseKey', node: '@leaf', frame: 0 },
    { op: 'poseKey', node: '@leaf', frame: 20, paths: ['M0 -5L25 0L20 25L0 20Z'] },
  ]);
  ok(Object.keys(r.created).length === 4, 'ops: 4 ref được tạo');
  ok(p.nodes.length === 2 && p.nodes[0].type === 'group', 'ops: group chứa 2 con, vector ở root');
  ok(p.nodes[0].children.length === 2, 'ops: children đúng');
  ok(p.tracks.length === 3, 'ops: 3 track (rotation, w, morph)');
  evalProjectAtFrame(p, 15);
  const body = p.nodes[0].children[0];
  close(body.w, 150, 0.01, 'ops: track w nội suy linear giữa');
  // poseKey sai topology phải báo lỗi (@ref chỉ sống trong 1 lần applyOps → dùng id thật)
  let threw = false;
  try { applyOps(p, [{ op: 'poseKey', node: r.created.leaf, frame: 30, paths: ['M0 0L5 5Z'] }]); }
  catch (e) { threw = /topology|lệnh/.test(e.message); }
  ok(threw, 'ops: poseKey topology sai bị từ chối');
  // JSON roundtrip với morph key mảng
  const back = JSON.parse(JSON.stringify(p));
  ok(Array.isArray(back.tracks.find((t) => t.prop === 'morph').keys[0].v), 'ops: morph key serialize được');
}

// ---- tách đảo (islands) ----
{
  const sq = (x, y, s) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]];
  // 2 hình vuông rời cùng màu → 2 đảo
  const g2 = splitIslandGroups([sq(0, 0, 4), sq(10, 0, 4)]);
  ok(g2.length === 2, 'islands: 2 khối rời → 2 đảo');
  // vuông + lỗ bên trong (ngược chiều) → 1 đảo 2 loop
  const outer = sq(0, 0, 10);
  const hole = sq(3, 3, 3).reverse();
  const g1 = splitIslandGroups([outer, hole]);
  ok(g1.length === 1 && g1[0].loops.length === 2, 'islands: lỗ gắn vào đảo chứa nó');

  // Ảnh 12x8: hai khối đỏ rời trên nền lam → vectorize (islands mặc định) ra 2 mảnh
  const w = 12, h = 8;
  const data = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const x = i % w, y = (i / w) | 0;
    const red = y >= 2 && y < 6 && ((x >= 1 && x < 4) || (x >= 8 && x < 11));
    data[i * 4] = red ? 220 : 20; data[i * 4 + 1] = 30;
    data[i * 4 + 2] = red ? 30 : 220; data[i * 4 + 3] = 255;
  }
  const res2 = vecImg2({ data, width: w, height: h },
    { colors: 2, dropBg: true, smooth: false, minArea: 1 });
  ok(res2.items.length === 2, 'vectorize islands: 2 khối cùng màu → 2 mảnh riêng');
}

// ---- auto-rig ----
{
  // Nhân vật giả: đầu / thân / 2 tay / 2 chân (bbox trong không gian cha)
  const pieces = [
    { x: 35, y: 0, w: 30, h: 28 },   // đầu
    { x: 30, y: 28, w: 40, h: 42 },  // thân
    { x: 0, y: 30, w: 28, h: 30 },   // tay trái
    { x: 72, y: 30, w: 28, h: 30 },  // tay phải
    { x: 32, y: 70, w: 16, h: 30 },  // chân trái
    { x: 52, y: 70, w: 16, h: 30 },  // chân phải
  ];
  const plan = planRig(pieces);
  ok(plan !== null, 'planRig nhận diện được');
  ok(plan.root === 'torso', 'planRig: thân là gốc');
  const byZone = Object.fromEntries(plan.zones.map((z) => [z.zone, z]));
  ok(byZone.head?.indices.includes(0), 'planRig: đầu đúng mảnh');
  ok(byZone.armL?.indices.includes(2) && byZone.armR?.indices.includes(3), 'planRig: 2 tay đúng bên');
  ok(byZone.legL?.indices.includes(4) && byZone.legR?.indices.includes(5), 'planRig: 2 chân đúng bên');
  close(byZone.head.pivot.y, 25.2, 1, 'planRig: pivot đầu tại cổ');
  ok(byZone.legL.pivot.y === 70, 'planRig: pivot chân tại hông');

  // autoRigApply dựng cây FK
  const mk = (bbox, name) => ({
    id: name, name, type: 'vector', x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1,
    opacity: 1, pivotX: 0, pivotY: 0,
    paths: [{ d: `M${bbox.x} ${bbox.y}L${bbox.x + bbox.w} ${bbox.y}L${bbox.x + bbox.w} ${bbox.y + bbox.h}L${bbox.x} ${bbox.y + bbox.h}Z`, fill: '#abc' }],
    bbox,
  });
  const group = {
    id: 'g', name: 'NV', type: 'group', x: 0, y: 0, rotation: 0,
    scaleX: 1, scaleY: 1, opacity: 1, pivotX: 0, pivotY: 0,
    children: pieces.map((b, i) => mk(b, 'p' + i)),
  };
  let gi = 0;
  const r = autoRigApply(group, (name) => ({
    id: 'zg' + gi++, name, type: 'group', x: 0, y: 0, rotation: 0,
    scaleX: 1, scaleY: 1, opacity: 1, pivotX: 0, pivotY: 0, children: [],
  }));
  ok(r !== null && r.root === 'Thân', 'autoRigApply: gốc là Thân');
  ok(group.children.length === 1 && group.children[0].name === 'Thân', 'autoRigApply: 1 con gốc');
  const rootG = group.children[0];
  const subGroups = rootG.children.filter((c) => c.type === 'group');
  ok(subGroups.length === 5, 'autoRigApply: 5 chi là con của Thân');
  ok(rootG.children.some((c) => c.id === 'p1'), 'autoRigApply: mảnh thân nằm trong Thân');
  // đã rig rồi → không rig lại
  ok(autoRigApply(group, () => ({})) === null, 'autoRigApply: từ chối rig lần 2');
}

// ---- PNG decoder (tự dựng PNG hợp lệ bằng zlib + crc32) ----
{
  const zlib = await import('node:zlib');
  const W = 3, H = 2;
  // pixel RGBA: đỏ, lục, lam / trắng, đen, trong suốt
  const px = [
    [255, 0, 0, 255], [0, 255, 0, 255], [0, 0, 255, 255],
    [255, 255, 255, 255], [0, 0, 0, 255], [0, 0, 0, 0],
  ];
  const rows = [];
  for (let y = 0; y < H; y++) {
    rows.push(0); // filter None
    for (let x = 0; x < W; x++) rows.push(...px[y * W + x]);
  }
  const idat = zlib.deflateSync(Buffer.from(rows));
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0)),
  ]);
  const { decodePNG } = await import('../src/cli/png.js');
  const img = decodePNG(png);
  ok(img.width === 3 && img.height === 2, 'decodePNG kích thước');
  ok(img.data[0] === 255 && img.data[1] === 0, 'decodePNG pixel đỏ');
  ok(img.data[4 * 4 + 0] === 0 && img.data[4 * 4 + 3] === 255, 'decodePNG pixel đen');
  ok(img.data[5 * 4 + 3] === 0, 'decodePNG pixel trong suốt');
}

// ---- zip / crc32 ----
{
  const enc = new TextEncoder();
  ok(crc32(new Uint8Array(0)) === 0, 'crc32 rỗng = 0');
  ok(crc32(enc.encode('123456789')) === 0xcbf43926, 'crc32 chuẩn "123456789"');
  const blob = zipStore([
    { name: 'a.txt', data: enc.encode('hello') },
    { name: 'b/c.txt', data: enc.encode('vecmotion') },
  ]);
  const buf = new Uint8Array(await blob.arrayBuffer());
  ok(buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 3 && buf[3] === 4, 'zip: local header PK\\3\\4');
  const tail = buf.slice(-22);
  ok(tail[0] === 0x50 && tail[1] === 0x4b && tail[2] === 5 && tail[3] === 6, 'zip: end-of-central-dir');
  const view = new DataView(tail.buffer, tail.byteOffset);
  ok(view.getUint16(8, true) === 2, 'zip: đếm 2 entry');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
