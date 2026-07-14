// Auto-rig heuristic cho nhân vật flat đứng thẳng, nhìn chính diện
// (bố cục chuẩn của ảnh nhân vật AI tạo). Thuần — dùng chung UI và CLI.
//
// Nguyên lý: chia các mảnh vector theo vị trí tâm trong bbox tổng:
//   tay = lệch hẳn sang trái/phải, đầu = phần trên, chân = phần dưới,
//   còn lại = thân. Pivot đặt tại khớp (cổ / vai / hông), thân là gốc FK.
// Đây là template-rig, không phải nhận diện ML — nhân vật tư thế lạ
// (nằm, nghiêng) cần chỉnh tay sau khi rig.

import { nodeMatrix, matApply } from '../core/mat.js';
import { nodeLocalBBox } from '../core/eval.js';

const RIG_NAMES = {
  head: 'Đầu', torso: 'Thân',
  armL: 'Tay trái', armR: 'Tay phải',
  legL: 'Chân trái', legR: 'Chân phải',
};

function rigUnion(bs) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const b of bs) {
    x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y);
    x2 = Math.max(x2, b.x + b.w); y2 = Math.max(y2, b.y + b.h);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// Bbox của node con trong hệ tọa độ của cha (áp transform riêng của con)
export function pieceBBoxInParent(c) {
  const b = nodeLocalBBox(c), m = nodeMatrix(c);
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
    const p = matApply(m, { x: px, y: py });
    x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
    x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
  }
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

// pieces: [{x,y,w,h}] → plan {zones:[{zone,name,indices,pivot}], root} hoặc null.
// Neo theo THÂN (mảnh lớn nhất gần giữa) thay vì bbox tổng — bbox tổng dễ bị
// kéo lệch bởi phụ kiện nhô cao/thấp (ăng-ten, mũ, đuôi…).
export function planRig(pieces) {
  if (!pieces || pieces.length < 3) return null;
  const U = rigUnion(pieces);
  if (U.w <= 0 || U.h <= 0) return null;

  // Seed thân: mảnh diện tích lớn nhất có tâm nằm ở dải giữa theo chiều ngang
  // (fallback: mảnh lớn nhất bất kể vị trí)
  let seed = -1, seedArea = -1, fallback = -1, fallbackArea = -1;
  pieces.forEach((b, i) => {
    const u = (b.x + b.w / 2 - U.x) / U.w;
    const a = b.w * b.h;
    if (u > 0.3 && u < 0.7 && a > seedArea) { seed = i; seedArea = a; }
    if (a > fallbackArea) { fallback = i; fallbackArea = a; }
  });
  if (seed < 0) seed = fallback;
  const T = pieces[seed];

  const zoneOf = (b, i) => {
    if (i === seed) return 'torso';
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    if (cx < T.x + 0.08 * T.w) return 'armL';   // lệch hẳn khỏi mép trái thân
    if (cx > T.x + 0.92 * T.w) return 'armR';
    if (cy < T.y + 0.1 * T.h) return 'head';    // phía trên thân
    if (cy > T.y + 0.9 * T.h) return cx <= T.x + T.w / 2 ? 'legL' : 'legR'; // dưới thân
    return 'torso';
  };

  const zones = { head: [], torso: [], armL: [], armR: [], legL: [], legR: [] };
  pieces.forEach((b, i) => zones[zoneOf(b, i)].push(i));
  const limbs = ['head', 'armL', 'armR', 'legL', 'legR'].filter((z) => zones[z].length);
  if (!limbs.length) return null; // tất cả rơi vào thân → không nhận diện được

  const zoneList = [];
  for (const [z, idx] of Object.entries(zones)) {
    if (!idx.length) continue;
    const zu = rigUnion(idx.map((i) => pieces[i]));
    let pivot;
    switch (z) {
      case 'head': pivot = { x: zu.x + zu.w / 2, y: zu.y + zu.h * 0.9 }; break;   // cổ
      case 'armL': pivot = { x: zu.x + zu.w * 0.85, y: zu.y + zu.h * 0.15 }; break; // vai (trong-trên)
      case 'armR': pivot = { x: zu.x + zu.w * 0.15, y: zu.y + zu.h * 0.15 }; break;
      case 'legL':
      case 'legR': pivot = { x: zu.x + zu.w / 2, y: zu.y }; break;                // hông
      default: pivot = { x: zu.x + zu.w / 2, y: zu.y + zu.h * 0.85 };             // thân: gần hông
    }
    const area = idx.reduce((s, i) => s + pieces[i].w * pieces[i].h, 0);
    zoneList.push({ zone: z, name: RIG_NAMES[z], indices: idx, pivot, area });
  }
  // Gốc FK: thân nếu có, không thì vùng lớn nhất
  const torso = zoneList.find((zl) => zl.zone === 'torso');
  const root = torso || zoneList.reduce((m, zl) => (zl.area > m.area ? zl : m));
  return { zones: zoneList, root: root.zone };
}

// Áp plan vào group (con là các mảnh phẳng). makeGroup(name) do caller cấp
// (UI dùng makeNode của store, CLI dùng makeNode của ops). Trả về
// {zones:[tên], root} hoặc null nếu không rig được. Chỉ mutate khi thành công.
export function autoRigApply(group, makeGroup) {
  if (!group.children || group.children.length < 3) return null;
  if (group.children.some((c) => c.type === 'group')) return null; // đã rig rồi
  const pieces = group.children.map(pieceBBoxInParent);
  const plan = planRig(pieces);
  if (!plan) return null;

  const kids = group.children;
  const zoneNodes = {};
  for (const zl of plan.zones) {
    const g = makeGroup(zl.name);
    g.children = zl.indices.map((i) => kids[i]);
    g.pivotX = +zl.pivot.x.toFixed(2);
    g.pivotY = +zl.pivot.y.toFixed(2);
    zoneNodes[zl.zone] = g;
  }
  const root = zoneNodes[plan.root];
  for (const zl of plan.zones) {
    if (zl.zone !== plan.root) root.children.push(zoneNodes[zl.zone]);
  }
  group.children = [root];
  return { zones: plan.zones.map((z) => z.name), root: root.name };
}
