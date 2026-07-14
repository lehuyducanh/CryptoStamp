// Pipeline vector hóa: ImageData → quantize → trace từng màu → simplify → paths

import { quantizeImage } from './quantize.js';
import { traceColor } from './trace.js';
import { loopsToPathD, shoelaceArea } from './simplify.js';

export function rgbToHex([r, g, b]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

// Màu chiếm đa số trên viền ảnh → coi là nền (nếu > 40% chu vi)
export function borderBgIndex(indexed, w, h) {
  const counts = new Map();
  const bump = (i) => { if (i >= 0) counts.set(i, (counts.get(i) || 0) + 1); };
  for (let x = 0; x < w; x++) { bump(indexed[x]); bump(indexed[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { bump(indexed[y * w]); bump(indexed[y * w + w - 1]); }
  let best = -1, bc = 0;
  counts.forEach((c, i) => { if (c > bc) { bc = c; best = i; } });
  const perim = 2 * (w + h);
  return best >= 0 && bc > perim * 0.4 ? best : -1;
}

function loopBBox(loop) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of loop) {
    x1 = Math.min(x1, x); y1 = Math.min(y1, y);
    x2 = Math.max(x2, x); y2 = Math.max(y2, y);
  }
  return { x1, y1, x2, y2 };
}

// Gom các loop của MỘT màu thành từng "đảo" liền khối: loop bao ngoài (dấu
// diện tích chiếm đa số) + các lỗ nằm trong nó. Nhờ vậy hai vùng cùng màu
// rời nhau (vd 2 bàn tay) thành 2 mảnh riêng — điều kiện để auto-rig.
export function splitIslandGroups(loops) {
  const infos = loops.map((l) => ({ l, a: shoelaceArea(l), bb: loopBBox(l) }));
  const biggest = infos.reduce((m, i) => (Math.abs(i.a) > Math.abs(m.a) ? i : m));
  const outerSign = Math.sign(biggest.a) || 1;
  const groups = [];
  const holes = [];
  for (const i of infos) {
    if (Math.sign(i.a) === outerSign) groups.push({ loops: [i.l], bb: i.bb, a: Math.abs(i.a) });
    else holes.push(i);
  }
  for (const h of holes) {
    // outer nhỏ nhất mà bbox chứa lỗ này
    let best = null;
    for (const g of groups) {
      const inside = h.bb.x1 >= g.bb.x1 && h.bb.y1 >= g.bb.y1
        && h.bb.x2 <= g.bb.x2 && h.bb.y2 <= g.bb.y2;
      if (inside && (!best || g.a < best.a)) best = g;
    }
    if (best) best.loops.push(h.l);
    else groups.push({ loops: [h.l], bb: h.bb, a: Math.abs(h.a) });
  }
  return groups;
}

export function vectorizeImageData(img, {
  colors = 8, tolerance = 1.5, smooth = true, dropBg = true, minArea = 0,
  islands = true,
} = {}) {
  const { width: w, height: h, data } = img;
  const { palette, indexed } = quantizeImage(data, w, h, colors);
  const bg = dropBg ? borderBgIndex(indexed, w, h) : -1;
  const mA = minArea || Math.max(8, (w * h) / 4000);
  const items = [];
  for (let ci = 0; ci < palette.length; ci++) {
    if (ci === bg) continue;
    const loops = traceColor(indexed, w, h, ci);
    if (!loops.length) continue;
    const fill = rgbToHex(palette[ci]);
    const groups = islands ? splitIslandGroups(loops) : [{ loops }];
    for (const g of groups) {
      const res = loopsToPathD(g.loops, { tolerance, smooth, minArea: mA });
      if (res) items.push({ d: res.d, fill, bbox: res.bbox, area: res.area });
    }
  }
  items.sort((a, b) => b.area - a.area); // mảnh lớn vẽ trước (nằm dưới)
  return { items, w, h };
}

// (Chỉ trình duyệt) Thu nhỏ ảnh và đọc ImageData để trace
export function imageToImageData(img, maxSize = 256) {
  const iw = img.naturalWidth || img.width, ih = img.naturalHeight || img.height;
  const s = Math.min(1, maxSize / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * s)), h = Math.max(1, Math.round(ih * s));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}
