// Đánh giá project tại một frame (thuần, không phụ thuộc store) —
// dùng chung cho editor, exporter và CLI. Hỗ trợ track số và track 'morph'
// (mảng tọa độ phẳng của toàn bộ paths một node vector).

import { evalTrack } from './anim.js';
import { parsePathD, buildPathD } from '../vector/path.js';
import { nodeMatrix, matApply } from './mat.js';

export function findNodeIn(list, id) {
  for (const n of list) {
    if (n.id === id) return n;
    if (n.children) {
      const r = findNodeIn(n.children, id);
      if (r) return r;
    }
  }
  return null;
}

// Toàn bộ tọa độ paths của node vector, nối phẳng [x,y,x,y,...]
export function geometryFlat(node) {
  const flat = [];
  for (const p of node.paths || []) flat.push(...parsePathD(p.d).pts);
  return flat;
}

// Ghi mảng tọa độ phẳng ngược vào paths (giữ nguyên chuỗi lệnh/topology)
export function applyMorphFlat(node, flat) {
  let off = 0;
  for (const p of node.paths || []) {
    const g = parsePathD(p.d);
    const need = g.pts.length;
    if (off + need > flat.length) break; // không khớp topology → dừng an toàn
    p.d = buildPathD(g.cmds, flat.slice(off, off + need));
    off += need;
  }
}

export const GEO_PROPS = ['morph', 'w', 'h'];

export function evalProjectAtFrame(project, frame) {
  for (const tr of project.tracks) {
    if (!tr.keys.length) continue;
    const n = findNodeIn(project.nodes, tr.nodeId);
    if (!n) continue;
    const v = evalTrack(tr, frame);
    if (tr.prop === 'morph') {
      if (Array.isArray(v)) applyMorphFlat(n, v);
    } else {
      n[tr.prop] = v;
    }
  }
}

// Bbox trong hệ tọa độ cục bộ của node (trước transform của chính nó)
export function nodeLocalBBox(n) {
  if (n.type === 'shape' || n.type === 'image') return { x: 0, y: 0, w: n.w || 10, h: n.h || 10 };
  if (n.type === 'vector') {
    if (n.paths?.length === 1 && n.paths[0].bbox) return n.paths[0].bbox;
    return n.bbox || { x: 0, y: 0, w: 10, h: 10 };
  }
  if (n.type === 'group') {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity, any = false;
    for (const c of n.children) {
      if (c.visible === false) continue;
      const b = nodeLocalBBox(c), m = nodeMatrix(c);
      for (const [px, py] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) {
        const p = matApply(m, { x: px, y: py });
        x1 = Math.min(x1, p.x); y1 = Math.min(y1, p.y);
        x2 = Math.max(x2, p.x); y2 = Math.max(y2, p.y);
      }
      any = true;
    }
    return any ? { x: x1, y: y1, w: x2 - x1, h: y2 - y1 } : { x: 0, y: 0, w: 0, h: 0 };
  }
  return { x: 0, y: 0, w: 0, h: 0 };
}

// Các node có track hình học (cần vẽ lại nội dung, không chỉ transform)
export function geoTrackIds(project) {
  const s = new Set();
  for (const t of project.tracks) {
    if (GEO_PROPS.includes(t.prop)) s.add(t.nodeId);
  }
  return s;
}
