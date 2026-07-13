// Xuất: JSON dự án, SVG tĩnh, SVG động (CSS keyframes nhúng)

import { state, findNode, loadProjectData } from '../core/state.js';
import { evalTrack } from '../core/anim.js';
import { nodeMatrix, matToCss } from '../core/mat.js';
import { projectSVG } from '../core/markup.js';
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

// Dựng chuỗi SVG động: lấy mẫu mọi frame cho node có track, nén run-length
// các đoạn tĩnh, nhúng thành CSS @keyframes.
export function animatedSVGString() {
  const p = state.project;
  const byNode = new Map();
  for (const tr of p.tracks) {
    if (!tr.keys.length) continue;
    if (!byNode.has(tr.nodeId)) byNode.set(tr.nodeId, []);
    byNode.get(tr.nodeId).push(tr);
  }
  if (!byNode.size) return null;
  const durS = +(p.durFrames / p.fps).toFixed(4);
  let css = '';
  const ids = new Set();
  for (const [id, trs] of byNode) {
    const n = findNode(id);
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
  return projectSVG(p, { css, animatedIds: ids });
}

export function exportAnimatedSVG() {
  const svg = animatedSVGString();
  if (!svg) {
    showToast('Chưa có keyframe nào để xuất animation', true);
    return;
  }
  downloadFile('animation.svg', svg, 'image/svg+xml');
  showToast('Đã xuất SVG động — mở file bằng trình duyệt để xem');
}
