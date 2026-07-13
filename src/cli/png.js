// PNG decoder tối giản cho CLI (Node, dùng node:zlib) — đủ để vectorize headless.
// Hỗ trợ: 8-bit, color type 0/2/3/4/6, không interlace.

import zlib from 'node:zlib';

export function decodePNG(buf) {
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  sig.forEach((b, i) => {
    if (buf[i] !== b) throw new Error('Không phải file PNG (chỉ hỗ trợ PNG — ảnh khác hãy convert trước)');
  });
  let pos = 8, w = 0, h = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  let plte = null, trns = null;
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0); h = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    pos += 12 + len;
  }
  if (bitDepth !== 8) throw new Error(`Chỉ hỗ trợ PNG 8-bit (file này ${bitDepth}-bit)`);
  if (interlace) throw new Error('Không hỗ trợ PNG interlaced (Adam7)');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('Color type PNG không hỗ trợ: ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = w * channels;
  const out = new Uint8Array(h * stride);
  const paeth = (a, b, c) => {
    const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  let rp = 0;
  for (let y = 0; y < h; y++) {
    const f = raw[rp++];
    for (let x = 0; x < stride; x++) {
      const cur = raw[rp++];
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const ul = x >= channels && y > 0 ? out[(y - 1) * stride + x - channels] : 0;
      let v;
      switch (f) {
        case 0: v = cur; break;
        case 1: v = cur + left; break;
        case 2: v = cur + up; break;
        case 3: v = cur + ((left + up) >> 1); break;
        case 4: v = cur + paeth(left, up, ul); break;
        default: throw new Error('Filter PNG không hợp lệ: ' + f);
      }
      out[y * stride + x] = v & 0xff;
    }
  }

  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    let r, g, b, a = 255;
    switch (colorType) {
      case 0: r = g = b = out[i]; break;
      case 2: r = out[i * 3]; g = out[i * 3 + 1]; b = out[i * 3 + 2]; break;
      case 3: {
        const pi = out[i];
        r = plte[pi * 3]; g = plte[pi * 3 + 1]; b = plte[pi * 3 + 2];
        if (trns && pi < trns.length) a = trns[pi];
        break;
      }
      case 4: r = g = b = out[i * 2]; a = out[i * 2 + 1]; break;
      case 6: r = out[i * 4]; g = out[i * 4 + 1]; b = out[i * 4 + 2]; a = out[i * 4 + 3]; break;
    }
    rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = a;
  }
  return { data: rgba, width: w, height: h };
}

// Thu nhỏ nearest-neighbor để trace nhanh (tương đương imageToImageData bản DOM)
export function scaleImageData(img, maxSize) {
  const s = Math.min(1, maxSize / Math.max(img.width, img.height));
  if (s >= 1) return img;
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.round(y / s));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.round(x / s));
      const si = (sy * img.width + sx) * 4, di = (y * w + x) * 4;
      out[di] = img.data[si]; out[di + 1] = img.data[si + 1];
      out[di + 2] = img.data[si + 2]; out[di + 3] = img.data[si + 3];
    }
  }
  return { data: out, width: w, height: h };
}
