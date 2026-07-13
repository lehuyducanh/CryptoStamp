// Pipeline vector hóa: ImageData → quantize → trace từng màu → simplify → paths

import { quantizeImage } from './quantize.js';
import { traceColor } from './trace.js';
import { loopsToPathD } from './simplify.js';

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

export function vectorizeImageData(img, {
  colors = 8, tolerance = 1.5, smooth = true, dropBg = true, minArea = 0,
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
    const res = loopsToPathD(loops, { tolerance, smooth, minArea: mA });
    if (res) items.push({ d: res.d, fill: rgbToHex(palette[ci]), bbox: res.bbox, area: res.area });
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
