// Các nguồn tạo ảnh AI. Mọi provider trả về Promise<dataURL>.

import { readBlobAsDataURL } from '../ui/dom.js';

export function aiHash(s) {
  let h = 1779033703;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}

export function aiRandom(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const AI_PROVIDERS = {
  mock: {
    label: 'Demo (offline, luôn chạy)',
    needsKey: false,
    async generate({ prompt, width = 512, height = 512, seed = 0 }) {
      return aiMockGenerate({ prompt, width, height, seed });
    },
  },
  pollinations: {
    label: 'Pollinations (miễn phí)',
    needsKey: false,
    async generate({ prompt, width = 512, height = 512, seed = 0 }) {
      const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}`
        + `?width=${width}&height=${height}&seed=${seed}&nologo=true`;
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 90000);
      try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const blob = await res.blob();
        return await readBlobAsDataURL(blob);
      } finally { clearTimeout(timer); }
    },
  },
  openai: {
    label: 'OpenAI DALL·E 3 (cần API key)',
    needsKey: true,
    async generate({ prompt, key }) {
      const res = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
        body: JSON.stringify({
          model: 'dall-e-3', prompt, n: 1, size: '1024x1024', response_format: 'b64_json',
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'HTTP ' + res.status);
      return 'data:image/png;base64,' + j.data[0].b64_json;
    },
  },
};

// ---- Provider Demo: vẽ thủ tục ảnh flat (nền trong suốt, vector hóa đẹp) ----

function aiMockGenerate({ prompt, width, height, seed }) {
  const rnd = aiRandom(aiHash(prompt) + seed);
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d');
  const hue = Math.floor(rnd() * 360);
  const col = (h, s, l) => `hsl(${((h % 360) + 360) % 360} ${s}% ${l}%)`;
  const p = prompt.toLowerCase();
  if (/robot/.test(p)) aiDrawRobot(ctx, width, height, rnd, hue, col);
  else if (/rocket|tên lửa|ten lua/.test(p)) aiDrawRocket(ctx, width, height, rnd, hue, col);
  else if (/tree|cây|cay|flower|hoa|plant/.test(p)) aiDrawPlant(ctx, width, height, rnd, hue, col);
  else aiDrawCreature(ctx, width, height, rnd, hue, col);
  return Promise.resolve(c.toDataURL('image/png'));
}

function aiBlob(ctx, cx, cy, r, rnd, wob = 0.22, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (1 - wob / 2 + rnd() * wob);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    ctx.bezierCurveTo(
      p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6,
      p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6,
      p2[0], p2[1]
    );
  }
  ctx.closePath();
}

function aiDrawCreature(ctx, W, H, rnd, hue, col) {
  const cx = W / 2, cy = H * 0.55, R = W * 0.27;
  const main = col(hue, 65, 62), light = col(hue, 60, 78), dark = col(hue, 55, 30);
  // chân
  ctx.fillStyle = dark;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(cx + s * R * 0.5, cy + R * 0.95, R * 0.22, R * 0.13, 0, 0, 7);
    ctx.fill();
  }
  // tai/ăng-ten
  const ears = rnd() > 0.5;
  if (ears) {
    ctx.fillStyle = main;
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(cx + s * R * 0.55, cy - R * 0.95, R * 0.18, R * 0.32, s * 0.4, 0, 7);
      ctx.fill();
    }
  }
  // thân
  ctx.fillStyle = main;
  aiBlob(ctx, cx, cy, R, rnd, 0.18, 9);
  ctx.fill();
  // bụng
  ctx.fillStyle = light;
  aiBlob(ctx, cx, cy + R * 0.25, R * 0.55, rnd, 0.15, 8);
  ctx.fill();
  // mắt
  for (const s of [-1, 1]) {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(cx + s * R * 0.38, cy - R * 0.25, R * 0.17, 0, 7); ctx.fill();
    ctx.fillStyle = dark;
    ctx.beginPath(); ctx.arc(cx + s * R * 0.34, cy - R * 0.23, R * 0.08, 0, 7); ctx.fill();
  }
  // miệng
  ctx.strokeStyle = dark; ctx.lineWidth = W * 0.015; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(cx, cy + R * 0.1, R * 0.22, 0.3, Math.PI - 0.3); ctx.stroke();
  // má
  ctx.fillStyle = col(hue + 330, 70, 75);
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(cx + s * R * 0.62, cy + R * 0.02, R * 0.09, 0, 7); ctx.fill();
  }
}

function aiDrawRobot(ctx, W, H, rnd, hue, col) {
  const cx = W / 2, cy = H / 2, u = W / 512;
  const metal = col(hue, 14, 72), dark = col(hue, 18, 26), accent = col(hue, 75, 55);
  const rr = (x, y, w, h, r, fill) => {
    ctx.fillStyle = fill; ctx.beginPath(); ctx.roundRect(x, y, w, h, r); ctx.fill();
  };
  // ăng-ten
  ctx.strokeStyle = dark; ctx.lineWidth = 8 * u;
  ctx.beginPath(); ctx.moveTo(cx, cy - 190 * u); ctx.lineTo(cx, cy - 230 * u); ctx.stroke();
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx, cy - 238 * u, 16 * u, 0, 7); ctx.fill();
  // tay
  for (const s of [-1, 1]) {
    rr(cx + s * 120 * u - 20 * u, cy - 20 * u, 40 * u, 130 * u, 20 * u, metal);
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(cx + s * 120 * u, cy + 125 * u, 24 * u, 0, 7); ctx.fill();
  }
  // chân + bàn chân
  for (const s of [-1, 1]) {
    rr(cx + s * 55 * u - 20 * u, cy + 135 * u, 40 * u, 70 * u, 14 * u, metal);
    rr(cx + s * 55 * u - 32 * u, cy + 200 * u, 64 * u, 26 * u, 10 * u, dark);
  }
  // thân
  rr(cx - 105 * u, cy - 45 * u, 210 * u, 185 * u, 26 * u, metal);
  rr(cx - 70 * u, cy - 10 * u, 140 * u, 95 * u, 14 * u, dark);
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(cx, cy + 38 * u, 28 * u, 0, 7); ctx.fill();
  // đầu
  rr(cx - 90 * u, cy - 190 * u, 180 * u, 135 * u, 24 * u, metal);
  rr(cx - 66 * u, cy - 162 * u, 132 * u, 62 * u, 16 * u, dark);
  ctx.fillStyle = accent;
  for (const s of [-1, 1]) {
    ctx.beginPath(); ctx.arc(cx + s * 34 * u, cy - 131 * u, 15 * u, 0, 7); ctx.fill();
  }
}

function aiDrawRocket(ctx, W, H, rnd, hue, col) {
  const cx = W / 2, u = W / 512, cy = H / 2;
  const body = col(hue, 15, 88), accent = col(hue, 75, 55), dark = col(hue, 30, 25);
  // lửa
  ctx.fillStyle = col(30, 95, 60);
  aiBlob(ctx, cx, cy + 205 * u, 42 * u, rnd, 0.4, 7); ctx.fill();
  ctx.fillStyle = col(48, 100, 62);
  aiBlob(ctx, cx, cy + 190 * u, 24 * u, rnd, 0.4, 7); ctx.fill();
  // cánh
  ctx.fillStyle = accent;
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(cx + s * 55 * u, cy + 60 * u);
    ctx.lineTo(cx + s * 120 * u, cy + 170 * u);
    ctx.lineTo(cx + s * 55 * u, cy + 150 * u);
    ctx.closePath(); ctx.fill();
  }
  // thân
  ctx.fillStyle = body;
  ctx.beginPath(); ctx.roundRect(cx - 60 * u, cy - 160 * u, 120 * u, 320 * u, 60 * u); ctx.fill();
  // mũi
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(cx - 60 * u, cy - 120 * u);
  ctx.quadraticCurveTo(cx, cy - 260 * u, cx + 60 * u, cy - 120 * u);
  ctx.closePath(); ctx.fill();
  // cửa sổ
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(cx, cy - 40 * u, 38 * u, 0, 7); ctx.fill();
  ctx.fillStyle = col(hue + 180, 60, 70);
  ctx.beginPath(); ctx.arc(cx, cy - 40 * u, 27 * u, 0, 7); ctx.fill();
}

function aiDrawPlant(ctx, W, H, rnd, hue, col) {
  const cx = W / 2, u = W / 512, base = H * 0.82;
  const green = col(120 + rnd() * 40, 50, 42), greenL = col(120 + rnd() * 40, 45, 58);
  const potC = col(hue, 55, 50), petal = col(hue, 75, 65);
  // chậu
  ctx.fillStyle = potC;
  ctx.beginPath();
  ctx.moveTo(cx - 90 * u, base - 90 * u); ctx.lineTo(cx + 90 * u, base - 90 * u);
  ctx.lineTo(cx + 65 * u, base); ctx.lineTo(cx - 65 * u, base);
  ctx.closePath(); ctx.fill();
  // thân cây
  ctx.strokeStyle = green; ctx.lineWidth = 14 * u; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(cx, base - 90 * u);
  ctx.quadraticCurveTo(cx + 20 * u, base - 200 * u, cx, base - 300 * u); ctx.stroke();
  // lá
  for (const [s, dy] of [[-1, 150], [1, 200], [-1, 250]]) {
    ctx.fillStyle = greenL;
    ctx.beginPath();
    ctx.ellipse(cx + s * 55 * u, base - dy * u, 60 * u, 24 * u, s * -0.5, 0, 7);
    ctx.fill();
  }
  // hoa
  ctx.fillStyle = petal;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * 45 * u, base - 300 * u + Math.sin(a) * 45 * u,
      30 * u, 20 * u, a, 0, 7);
    ctx.fill();
  }
  ctx.fillStyle = col(45, 95, 60);
  ctx.beginPath(); ctx.arc(cx, base - 300 * u, 26 * u, 0, 7); ctx.fill();
}
