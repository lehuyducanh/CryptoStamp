// Xuất: JSON dự án, SVG tĩnh, SVG động (CSS keyframes nhúng)

import { state, loadProjectData, ANIM_PROPS } from '../core/state.js';
import { evalTrack } from '../core/anim.js';
import { nodeMatrix, matToCss } from '../core/mat.js';
import { projectSVG } from '../core/markup.js';
import { findNodeIn, GEO_PROPS } from '../core/eval.js';
import { parsePathD, buildPathD } from '../vector/path.js';
import { downloadFile, showToast } from '../ui/dom.js';

export function saveProjectFile() {
  const name = (state.project.name || 'du-an').replace(/\s+/g, '-');
  downloadFile(name + '.vecmotion.json',
    JSON.stringify({ app: 'vecmotion', version: 1, project: state.project }),
    'application/json');
}

export function openProjectFile() {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const file = inp.files[0];
    if (!file) return;
    try {
      const j = JSON.parse(await file.text());
      const p = j.project || j;
      if (!p.nodes || !p.tracks) throw new Error('Không phải file dự án VecMotion');
      loadProjectData(p);
      showToast('Đã mở dự án: ' + (p.name || file.name));
    } catch (e) {
      showToast('Lỗi mở file: ' + e.message, true);
    }
  };
  inp.click();
}

export function exportFrameSVG() {
  downloadFile('frame.svg', projectSVG(state.project), 'image/svg+xml');
  showToast('Đã xuất SVG khung hình hiện tại');
}

// keyTimes/values cho SMIL: chuẩn hóa 0..1, đệm hai đầu để hợp lệ
function smilKeys(track, durFrames) {
  const ks = track.keys;
  const times = [], vals = [];
  if (ks[0].t > 0) { times.push(0); vals.push(ks[0].v); }
  for (const k of ks) { times.push(k.t / durFrames); vals.push(k.v); }
  if (ks[ks.length - 1].t < durFrames) { times.push(1); vals.push(ks[ks.length - 1].v); }
  return { times: times.map((t) => +t.toFixed(5)), vals };
}

function smilTag(attr, times, valStrs, durS) {
  return `<animate attributeName="${attr}" dur="${durS}s" repeatCount="indefinite"`
    + ` calcMode="linear" keyTimes="${times.join(';')}" values="${valStrs.join(';')}"/>`;
}

// SMIL <animate> cho các track hình học (morph d, w/h) của một node
function smilForNode(p, n, trs, durS) {
  const out = { shape: '', paths: [] };
  for (const tr of trs) {
    if ((tr.prop === 'w' || tr.prop === 'h') && (n.type === 'shape' || n.type === 'image')) {
      const { times, vals } = smilKeys(tr, p.durFrames);
      const v2 = vals.map((v) => +(+v).toFixed(2));
      if (n.type === 'shape' && n.shape === 'ellipse') {
        // Elip vẽ bằng cx/cy/rx/ry dẫn xuất từ w/h
        const half = vals.map((v) => +(v / 2).toFixed(2));
        out.shape += smilTag(tr.prop === 'w' ? 'rx' : 'ry', times, half, durS)
          + smilTag(tr.prop === 'w' ? 'cx' : 'cy', times, half, durS);
      } else {
        out.shape += smilTag(tr.prop === 'w' ? 'width' : 'height', times, v2, durS);
      }
    } else if (tr.prop === 'morph' && n.type === 'vector') {
      const { times, vals } = smilKeys(tr, p.durFrames);
      let off = 0;
      n.paths.forEach((path, i) => {
        const g = parsePathD(path.d);
        const need = g.pts.length;
        const dVals = vals.map((flat) =>
          Array.isArray(flat) && flat.length >= off + need
            ? buildPathD(g.cmds, flat.slice(off, off + need))
            : path.d);
        out.paths[i] = (out.paths[i] || '') + smilTag('d', times, dVals, durS);
        off += need;
      });
    }
  }
  return out.shape || out.paths.length ? out : null;
}

// Dựng chuỗi SVG động: transform/opacity qua CSS @keyframes (lấy mẫu mọi frame,
// nén run-length), morph/w-h qua SMIL <animate>. Nhận project để CLI dùng chung.
export function animatedSVGString(p = state.project) {
  const byNode = new Map();   // track transform/opacity → CSS
  const geoByNode = new Map(); // track morph/w/h → SMIL
  for (const tr of p.tracks) {
    if (!tr.keys.length) continue;
    const bucket = GEO_PROPS.includes(tr.prop) ? geoByNode : byNode;
    if (!ANIM_PROPS.includes(tr.prop) && !GEO_PROPS.includes(tr.prop)) continue;
    if (!bucket.has(tr.nodeId)) bucket.set(tr.nodeId, []);
    bucket.get(tr.nodeId).push(tr);
  }
  if (!byNode.size && !geoByNode.size) return null;
  const durS = +(p.durFrames / p.fps).toFixed(4);
  let css = '';
  const ids = new Set();
  for (const [id, trs] of byNode) {
    const n = findNodeIn(p.nodes, id);
    if (!n) continue;
    ids.add(id);
    const samples = [];
    for (let f = 0; f <= p.durFrames; f++) {
      const o = { ...n };
      for (const tr of trs) o[tr.prop] = evalTrack(tr, f);
      samples.push({ f, m: matToCss(nodeMatrix(o)), op: +(+o.opacity).toFixed(3) });
    }
    const same = (a, b) => a && b && a.m === b.m && a.op === b.op;
    let kf = '';
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i], prev = samples[i - 1], next = samples[i + 1];
      if (prev && next && same(s, prev) && same(s, next)) continue; // giữa đoạn tĩnh
      kf += `${+(s.f / p.durFrames * 100).toFixed(3)}%{transform:${s.m};opacity:${s.op}}`;
    }
    css += `@keyframes vm-${id}{${kf}}\n.vm-${id}{animation:vm-${id} ${durS}s linear infinite;transform-origin:0 0}\n`;
  }
  const smilFor = geoByNode.size
    ? (n) => {
      const trs = geoByNode.get(n.id);
      return trs ? smilForNode(p, n, trs, durS) : null;
    }
    : null;
  return projectSVG(p, { css, animatedIds: ids, smilFor });
}

export function exportAnimatedSVG() {
  const p = state.project;
  if (p.durFrames / p.fps > 60) {
    showToast('Dự án dài hơn 60s: SVG động sẽ rất nặng — nên dùng ⬇ Video (WebM/PNG) cho phim dài.', true);
  }
  const svg = animatedSVGString();
  if (!svg) {
    showToast('Chưa có keyframe nào để xuất animation', true);
    return;
  }
  downloadFile('animation.svg', svg, 'image/svg+xml');
  showToast('Đã xuất SVG động — mở file bằng trình duyệt để xem');
}
