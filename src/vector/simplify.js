// Đơn giản hóa polygon (RDP) và dựng SVG path (poly hoặc Catmull-Rom → Bézier)

export function shoelaceArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length];
    s += x1 * y2 - x2 * y1;
  }
  return s / 2;
}

// Ramer–Douglas–Peucker cho polyline mở (giữ 2 đầu)
export function rdpSimplify(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const [ax, ay] = pts[0], [bx, by] = pts[pts.length - 1];
  const dx = bx - ax, dy = by - ay;
  const len = Math.hypot(dx, dy);
  let maxD = -1, maxI = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    // Chord suy biến (vòng kín mở tại 1 điểm): dùng khoảng cách tới điểm neo
    const d = len < 1e-9
      ? Math.hypot(pts[i][0] - ax, pts[i][1] - ay)
      : Math.abs(dy * (pts[i][0] - ax) - dx * (pts[i][1] - ay)) / len;
    if (d > maxD) { maxD = d; maxI = i; }
  }
  if (maxD <= eps) return [pts[0], pts[pts.length - 1]];
  const l = rdpSimplify(pts.slice(0, maxI + 1), eps);
  const r = rdpSimplify(pts.slice(maxI), eps);
  return l.slice(0, -1).concat(r);
}

// RDP cho polygon kín: xoay để mở tại điểm xa trọng tâm nhất (góc ổn định)
export function simplifyLoop(pts, eps) {
  if (pts.length <= 4 || eps <= 0) return pts;
  let cx = 0, cy = 0;
  pts.forEach((p) => { cx += p[0]; cy += p[1]; });
  cx /= pts.length; cy /= pts.length;
  let si = 0, sd = -1;
  pts.forEach((p, i) => {
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d > sd) { sd = d; si = i; }
  });
  const rot = pts.slice(si).concat(pts.slice(0, si));
  rot.push(rot[0]);
  const s = rdpSimplify(rot, eps);
  s.pop();
  return s;
}

const spFmt = (v) => Math.round(v * 100) / 100;

export function polyPathD(pts) {
  return 'M' + pts.map((p) => spFmt(p[0]) + ' ' + spFmt(p[1])).join('L') + 'Z';
}

// Catmull-Rom kín → chuỗi cubic Bézier
export function smoothPathD(pts) {
  const n = pts.length;
  if (n < 3) return polyPathD(pts);
  let d = 'M' + spFmt(pts[0][0]) + ' ' + spFmt(pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += `C${spFmt(c1[0])} ${spFmt(c1[1])} ${spFmt(c2[0])} ${spFmt(c2[1])} ${spFmt(p2[0])} ${spFmt(p2[1])}`;
  }
  return d + 'Z';
}

// Gộp nhiều loop của một màu thành một path d (+ bbox, diện tích)
export function loopsToPathD(loops, { tolerance = 1.5, smooth = true, minArea = 16 } = {}) {
  const parts = [];
  let bb = null, area = 0;
  for (const loop of loops) {
    const a = Math.abs(shoelaceArea(loop));
    if (a < minArea) continue;
    area += a;
    for (const [x, y] of loop) {
      if (!bb) bb = { x1: x, y1: y, x2: x, y2: y };
      else {
        bb.x1 = Math.min(bb.x1, x); bb.y1 = Math.min(bb.y1, y);
        bb.x2 = Math.max(bb.x2, x); bb.y2 = Math.max(bb.y2, y);
      }
    }
    const p = simplifyLoop(loop, tolerance);
    if (p.length < 3) continue;
    parts.push(smooth && p.length > 3 ? smoothPathD(p) : polyPathD(p));
  }
  if (!parts.length) return null;
  return {
    d: parts.join(''),
    area,
    bbox: { x: bb.x1, y: bb.y1, w: bb.x2 - bb.x1, h: bb.y2 - bb.y1 },
  };
}
