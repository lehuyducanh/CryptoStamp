// Parse/build SVG path (M/L/C/Z tuyệt đối) — nền tảng cho morph hình dạng.
// Thuần JS, dùng được cả trình duyệt lẫn Node/CLI.

const PATH_NUM = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?|[A-Za-z]/g;

// d → {cmds: 'MCCZ...', pts: number[]} (hỗ trợ lặp ngầm: M 1 2 3 4 → M,L)
export function parsePathD(d) {
  const tokens = String(d).match(PATH_NUM) || [];
  let cmds = '';
  const pts = [];
  let i = 0;
  while (i < tokens.length) {
    const c = tokens[i];
    if (!/^[A-Za-z]$/.test(c)) throw new Error('Path không hợp lệ gần: ' + c);
    i++;
    if (c === 'Z' || c === 'z') { cmds += 'Z'; continue; }
    if (!'MLC'.includes(c)) {
      throw new Error(`Chỉ hỗ trợ lệnh path tuyệt đối M/L/C/Z (gặp '${c}')`);
    }
    const need = c === 'C' ? 6 : 2;
    let first = true;
    while (i < tokens.length && !/^[A-Za-z]$/.test(tokens[i])) {
      for (let k = 0; k < need; k++) {
        const v = parseFloat(tokens[i++]);
        if (Number.isNaN(v)) throw new Error('Thiếu tọa độ trong path');
        pts.push(v);
      }
      cmds += first ? c : (c === 'M' ? 'L' : c);
      first = false;
    }
    if (first) throw new Error('Lệnh ' + c + ' thiếu tọa độ');
  }
  return { cmds, pts };
}

const pFmt = (v) => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? 0 : r;
};

export function buildPathD(cmds, pts) {
  let d = '', i = 0;
  for (const c of cmds) {
    if (c === 'Z') { d += 'Z'; continue; }
    if (c === 'C') {
      d += `C${pFmt(pts[i])} ${pFmt(pts[i + 1])} ${pFmt(pts[i + 2])} ${pFmt(pts[i + 3])} ${pFmt(pts[i + 4])} ${pFmt(pts[i + 5])}`;
      i += 6;
    } else {
      d += c + pFmt(pts[i]) + ' ' + pFmt(pts[i + 1]);
      i += 2;
    }
  }
  return d;
}

// Chỉ số (của tọa độ x) các điểm neo: điểm M/L và điểm cuối của C
export function pathAnchorIdx(cmds) {
  const out = [];
  let i = 0;
  for (const c of cmds) {
    if (c === 'M' || c === 'L') { out.push(i); i += 2; }
    else if (c === 'C') { out.push(i + 4); i += 6; }
  }
  return out;
}

// Dịch một điểm neo (và control kề + các neo trùng tọa độ — giữ mối hàn
// giữa điểm M và điểm cuối của path kín) đi (dx,dy). Sửa pts tại chỗ.
export function moveAnchor(cmds, pts, aIdx, dx, dy) {
  const ax = pts[aIdx], ay = pts[aIdx + 1];
  const targets = new Set([aIdx]);
  for (const i of pathAnchorIdx(cmds)) {
    if (Math.abs(pts[i] - ax) < 0.02 && Math.abs(pts[i + 1] - ay) < 0.02) targets.add(i);
  }
  const segs = [];
  let p = 0;
  for (const c of cmds) {
    segs.push({ c, base: p });
    p += c === 'C' ? 6 : c === 'Z' ? 0 : 2;
  }
  for (const t of [...targets]) {
    segs.forEach((s, si) => {
      const endIdx = s.c === 'C' ? s.base + 4 : s.c === 'Z' ? -1 : s.base;
      if (endIdx !== t) return;
      if (s.c === 'C') targets.add(s.base + 2); // control 2 của đoạn kết thúc tại neo
      const nx = segs[si + 1];
      if (nx && nx.c === 'C') targets.add(nx.base); // control 1 của đoạn kế
    });
  }
  for (const t of targets) { pts[t] += dx; pts[t + 1] += dy; }
}
