// Đánh giá project tại một frame (thuần, không phụ thuộc store) —
// dùng chung cho editor, exporter và CLI. Hỗ trợ track số và track 'morph'
// (mảng tọa độ phẳng của toàn bộ paths một node vector).

import { evalTrack } from './anim.js';
import { parsePathD, buildPathD } from '../vector/path.js';

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

// Các node có track hình học (cần vẽ lại nội dung, không chỉ transform)
export function geoTrackIds(project) {
  const s = new Set();
  for (const t of project.tracks) {
    if (GEO_PROPS.includes(t.prop)) s.add(t.nodeId);
  }
  return s;
}
