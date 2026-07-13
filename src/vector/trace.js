// Dò đường bao (contour) theo cạnh pixel cho một màu trong ảnh đã lượng tử.
// Mỗi cạnh giữa pixel trong/ngoài thành một đoạn có hướng (vùng trong nằm bên
// trái); nối các đoạn thành vòng kín. Lỗ (hole) render đúng nhờ fill-rule evenodd.

export function traceColor(indexed, w, h, ci) {
  const inside = (x, y) => x >= 0 && y >= 0 && x < w && y < h && indexed[y * w + x] === ci;
  const segs = new Map();
  const addSeg = (x1, y1, x2, y2) => {
    const k = x1 + ',' + y1;
    let a = segs.get(k);
    if (!a) { a = []; segs.set(k, a); }
    a.push([x2, y2]);
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) addSeg(x, y, x + 1, y);
      if (!inside(x + 1, y)) addSeg(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) addSeg(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) addSeg(x, y + 1, x, y);
    }
  }
  const loops = [];
  while (segs.size) {
    const k0 = segs.keys().next().value;
    const [sx, sy] = k0.split(',').map(Number);
    const pts = [[sx, sy]];
    let cx = sx, cy = sy, pdx = 0, pdy = 0;
    const guardMax = w * h * 8;
    for (let guard = 0; guard < guardMax; guard++) {
      const k = cx + ',' + cy;
      const arr = segs.get(k);
      if (!arr) break;
      let idx = 0;
      if (arr.length > 1 && (pdx || pdy)) {
        // Góc mơ hồ (checkerboard): ưu tiên rẽ giữ vùng trong bên trái
        let best = -Infinity;
        for (let i = 0; i < arr.length; i++) {
          const dx = arr[i][0] - cx, dy = arr[i][1] - cy;
          const cr = pdx * dy - pdy * dx;
          if (cr > best) { best = cr; idx = i; }
        }
      }
      const [nx, ny] = arr.splice(idx, 1)[0];
      if (!arr.length) segs.delete(k);
      pdx = nx - cx; pdy = ny - cy;
      cx = nx; cy = ny;
      if (cx === sx && cy === sy) break;
      pts.push([cx, cy]);
    }
    if (pts.length >= 4) loops.push(collapseCollinear(pts));
  }
  return loops;
}

// Bỏ các điểm thẳng hàng trên polygon kín
export function collapseCollinear(pts) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[(i - 1 + n) % n], b = pts[i], c = pts[(i + 1) % n];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (cross !== 0) out.push(b);
  }
  return out.length >= 3 ? out : pts;
}
