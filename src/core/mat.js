// Ma trận affine 2D [a,b,c,d,e,f] — cùng thứ tự với SVG matrix(a b c d e f)

export function matIdentity() { return [1, 0, 0, 1, 0, 0]; }

export function matMul(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];
}

export function matTranslate(x, y) { return [1, 0, 0, 1, x, y]; }

export function matRotate(deg) {
  const r = (deg * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  return [c, s, -s, c, 0, 0];
}

export function matScale(sx, sy) { return [sx, 0, 0, sy, 0, 0]; }

export function matInvert(m) {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det) return matIdentity();
  const ia = d / det, ib = -b / det, ic = -c / det, id = a / det;
  return [ia, ib, ic, id, -(ia * e + ic * f), -(ib * e + id * f)];
}

export function matApply(m, p) {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

// Áp dụng chỉ phần tuyến tính (vector hướng, bỏ tịnh tiến)
export function matApplyVec(m, p) {
  return { x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y };
}

// Transform của một node: T(x,y) · T(pivot) · R · S · T(−pivot)
export function nodeMatrix(n) {
  let m = matTranslate(n.x + n.pivotX, n.y + n.pivotY);
  m = matMul(m, matRotate(n.rotation));
  m = matMul(m, matScale(n.scaleX, n.scaleY));
  return matMul(m, matTranslate(-n.pivotX, -n.pivotY));
}

const matFmt = (v) => +v.toFixed(4);
export function matToSvg(m) { return `matrix(${m.map(matFmt).join(' ')})`; }
export function matToCss(m) { return `matrix(${m.map(matFmt).join(',')})`; }
