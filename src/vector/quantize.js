// Lượng tử hóa màu bằng median-cut (thuần, test được bằng Node)

export function medianCutPalette(samples, n) {
  let boxes = [samples];
  while (boxes.length < n) {
    let bi = -1, br = -1, bc = 0;
    boxes.forEach((b, i) => {
      if (b.length < 2) return;
      for (let c = 0; c < 3; c++) {
        let mn = 255, mx = 0;
        for (const s of b) { const v = s[c]; if (v < mn) mn = v; if (v > mx) mx = v; }
        const r = mx - mn;
        if (r > br) { br = r; bi = i; bc = c; }
      }
    });
    if (bi < 0 || br === 0) break;
    const b = boxes[bi];
    b.sort((p, q) => p[bc] - q[bc]);
    const mid = b.length >> 1;
    boxes.splice(bi, 1, b.slice(0, mid), b.slice(mid));
  }
  return boxes.map((b) => {
    let r = 0, g = 0, bl = 0;
    for (const s of b) { r += s[0]; g += s[1]; bl += s[2]; }
    const L = b.length || 1;
    return [Math.round(r / L), Math.round(g / L), Math.round(bl / L)];
  });
}

// data: Uint8ClampedArray RGBA. Trả về palette + bản đồ chỉ số màu (-1 = trong suốt)
export function quantizeImage(data, w, h, nColors = 8, alphaMin = 40) {
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / 30000)));
  const samples = [];
  for (let y = 0; y < h; y += step) {
    for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (data[i + 3] >= alphaMin) samples.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  if (!samples.length) return { palette: [], indexed: new Int16Array(w * h).fill(-1) };
  const palette = medianCutPalette(samples, nColors);
  const indexed = new Int16Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    if (data[i + 3] < alphaMin) { indexed[p] = -1; continue; }
    let best = 0, bd = Infinity;
    for (let c = 0; c < palette.length; c++) {
      const dr = data[i] - palette[c][0];
      const dg = data[i + 1] - palette[c][1];
      const db = data[i + 2] - palette[c][2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bd) { bd = d; best = c; }
    }
    indexed[p] = best;
  }
  return { palette, indexed };
}
