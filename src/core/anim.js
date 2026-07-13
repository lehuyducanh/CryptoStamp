// Easing và nội suy keyframe. t (thời gian key) tính theo frame.

export const EASINGS = {
  linear: (t) => t,
  easeIn: (t) => t * t * t,
  easeOut: (t) => 1 - Math.pow(1 - t, 3),
  easeInOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: (t) => {
    const c = 1.70158;
    return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
  },
  bounceOut: (t) => {
    const n1 = 7.5625, d1 = 2.75;
    if (t < 1 / d1) return n1 * t * t;
    if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
    if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
    return n1 * (t -= 2.625 / d1) * t + 0.984375;
  },
  hold: (t) => 0, // giữ nguyên giá trị key trước (step)
};

export const EASE_NAMES = [
  ['easeInOut', 'Êm 2 đầu'],
  ['linear', 'Đều'],
  ['easeIn', 'Vào chậm'],
  ['easeOut', 'Ra chậm'],
  ['backOut', 'Vọt lố'],
  ['bounceOut', 'Nảy'],
  ['hold', 'Giữ (step)'],
];

export function sortKeys(track) {
  track.keys.sort((a, b) => a.t - b.t);
}

// Giá trị của track tại frame f (f có thể là số thực khi đang phát).
// Giá trị key là số (transform, w/h) hoặc mảng số (morph — tọa độ đỉnh).
export function evalTrack(track, f) {
  const ks = track.keys;
  if (!ks.length) return undefined;
  if (f <= ks[0].t) return ks[0].v;
  if (f >= ks[ks.length - 1].t) return ks[ks.length - 1].v;
  let i = 0;
  while (ks[i + 1].t <= f) i++;
  const k0 = ks[i], k1 = ks[i + 1];
  if (k0.e === 'hold') return k0.v;
  const u = (f - k0.t) / (k1.t - k0.t);
  const ease = EASINGS[k0.e] || EASINGS.linear;
  if (Array.isArray(k0.v)) {
    // Morph: nội suy từng phần tử; topology khác nhau → giữ key trước
    if (!Array.isArray(k1.v) || k1.v.length !== k0.v.length) return k0.v;
    const e = ease(u);
    return k0.v.map((a, idx) => a + (k1.v[idx] - a) * e);
  }
  return k0.v + (k1.v - k0.v) * ease(u);
}
