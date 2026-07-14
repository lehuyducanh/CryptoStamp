// Engine thao tác project qua JSON ops — API cho AI agent / CLI.
// Thuần (không DOM, không store): nhận project object, sửa tại chỗ.

import { sortKeys } from '../core/anim.js';
import { nodeMatrix, matMul, matInvert } from '../core/mat.js';
import { findNodeIn, geometryFlat } from '../core/eval.js';
import { parsePathD } from '../vector/path.js';
import { autoRigApply } from '../rig/autorig.js';

const OPS_ANIM = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity', 'w', 'h'];
const OPS_EASES = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'backOut', 'bounceOut', 'hold'];

export function opsNewProject(o = {}) {
  const fps = o.fps || 30;
  return {
    name: o.name || 'Dự án', width: o.width || 960, height: o.height || 540,
    fps, durFrames: Math.round((o.durationS || 5) * fps),
    background: o.background || '#ffffff', idc: 1, nodes: [], tracks: [], assets: [],
  };
}

function opsUid(project, prefix = 'n') { return prefix + project.idc++; }

function opsMakeNode(project, type, extra = {}) {
  const n = Object.assign(
    {
      name: type, type,
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      pivotX: 0, pivotY: 0, visible: true,
    },
    type === 'group' ? { children: [] } : {},
    extra
  );
  if (!n.id) n.id = opsUid(project); // extra có thể mang id:undefined — không để ghi đè
  if (n.id && findNodeIn(project.nodes, n.id)) throw new Error(`id '${n.id}' đã tồn tại`);
  return n;
}

function opsFindParent(id, list, parent = null) {
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.id === id) return { list, index: i, parent };
    if (n.children) {
      const r = opsFindParent(id, n.children, n);
      if (r) return r;
    }
  }
  return null;
}

function opsResolve(project, created, ref) {
  if (ref == null) return null;
  const id = String(ref).startsWith('@') ? created[String(ref).slice(1)] : ref;
  const n = findNodeIn(project.nodes, id);
  if (!n) throw new Error(`Không tìm thấy node '${ref}'`);
  return n;
}

function opsParentList(project, created, parentRef) {
  if (parentRef == null) return project.nodes;
  const p = opsResolve(project, created, parentRef);
  if (p.type !== 'group') throw new Error(`'${parentRef}' không phải group — không thể chứa con`);
  return p.children;
}

function opsEnsureTrack(project, nodeId, prop) {
  let t = project.tracks.find((t) => t.nodeId === nodeId && t.prop === prop);
  if (!t) { t = { id: opsUid(project, 't'), nodeId, prop, keys: [] }; project.tracks.push(t); }
  return t;
}

function opsUpsertKey(track, t, v, e) {
  const k = track.keys.find((k) => k.t === t);
  if (k) { k.v = v; if (e) k.e = e; }
  else { track.keys.push({ t, v, e: e || 'easeInOut' }); sortKeys(track); }
}

function opsCheckEase(e) {
  if (e && !OPS_EASES.includes(e)) {
    throw new Error(`Easing '${e}' không hợp lệ (dùng: ${OPS_EASES.join(', ')})`);
  }
}

function opsBBoxOfPaths(paths) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const p of paths) {
    const { pts } = parsePathD(p.d);
    for (let i = 0; i < pts.length; i += 2) {
      x1 = Math.min(x1, pts[i]); y1 = Math.min(y1, pts[i + 1]);
      x2 = Math.max(x2, pts[i]); y2 = Math.max(y2, pts[i + 1]);
    }
  }
  if (x1 > x2) return { x: 0, y: 0, w: 10, h: 10 };
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 };
}

function opsRegister(created, op, node) {
  if (op.ref) created[op.ref] = node.id;
}

// Thêm node từ kết quả vectorize {items,w,h} (giống nút "Thêm vào canvas" trên UI)
function opsAddTraced(project, created, op) {
  const { items, w, h } = op.trace;
  if (!items?.length) throw new Error('trace.items rỗng');
  const s = op.scale ?? 340 / Math.max(w, h);
  const base = {
    name: op.name || 'Vector', scaleX: +s.toFixed(4), scaleY: +s.toFixed(4),
    pivotX: w / 2, pivotY: h / 2,
    x: op.x ?? Math.round((project.width - w) / 2),
    y: op.y ?? Math.round((project.height - h) / 2),
    id: op.id,
  };
  const seal = op.seal !== false;
  let n;
  if (!op.split || items.length < 2) {
    n = opsMakeNode(project, 'vector', {
      ...base, seal, bbox: { x: 0, y: 0, w, h },
      paths: items.map(({ d, fill, bbox }) => ({ d, fill, bbox })),
    });
  } else {
    n = opsMakeNode(project, 'group', base);
    n.children = items.map((it, i) => opsMakeNode(project, 'vector', {
      name: 'Mảnh ' + (i + 1), seal, bbox: it.bbox,
      paths: [{ d: it.d, fill: it.fill, bbox: it.bbox }],
      pivotX: it.bbox.x + it.bbox.w / 2, pivotY: it.bbox.y + it.bbox.h / 2,
    }));
  }
  opsParentList(project, created, op.parent).push(n);
  opsRegister(created, op, n);
  return n;
}

// Thực thi tuần tự danh sách ops. Trả về {created: {ref→id}, count}.
// Tham chiếu node: id trực tiếp hoặc '@ref' đã đặt ở op trước đó.
export function applyOps(project, ops) {
  if (!Array.isArray(ops)) throw new Error('ops phải là mảng JSON');
  const created = {};
  ops.forEach((op, i) => {
    try {
      switch (op.op) {
        case 'setProject': {
          for (const k of ['name', 'width', 'height', 'fps', 'background']) {
            if (op[k] != null) project[k] = op[k];
          }
          if (op.durationS != null) project.durFrames = Math.round(op.durationS * project.fps);
          if (op.durFrames != null) project.durFrames = op.durFrames;
          break;
        }
        case 'addShape': {
          if (!['rect', 'ellipse'].includes(op.shape)) throw new Error("shape phải là 'rect'|'ellipse'");
          const w = op.w ?? 100, h = op.h ?? 100;
          const n = opsMakeNode(project, 'shape', {
            shape: op.shape, name: op.name || op.shape, w, h,
            fill: op.fill || '#7c9cff', x: op.x ?? 0, y: op.y ?? 0,
            rotation: op.rotation ?? 0, opacity: op.opacity ?? 1,
            pivotX: w / 2, pivotY: h / 2, id: op.id,
          });
          opsParentList(project, created, op.parent).push(n);
          opsRegister(created, op, n);
          break;
        }
        case 'addGroup': {
          const n = opsMakeNode(project, 'group', {
            name: op.name || 'Nhóm', x: op.x ?? 0, y: op.y ?? 0, id: op.id,
          });
          opsParentList(project, created, op.parent).push(n);
          if (op.children) {
            for (const ref of op.children) {
              const c = opsResolve(project, created, ref);
              const loc = opsFindParent(c.id, project.nodes);
              loc.list.splice(loc.index, 1);
              n.children.push(c);
            }
          }
          opsRegister(created, op, n);
          break;
        }
        case 'addVector': {
          if (!op.paths?.length) throw new Error('addVector cần paths:[{d,fill}]');
          op.paths.forEach((p) => parsePathD(p.d)); // validate M/L/C/Z
          const bbox = opsBBoxOfPaths(op.paths);
          const s = op.scale ?? 1;
          const n = opsMakeNode(project, 'vector', {
            name: op.name || 'Vector', paths: op.paths.map((p) => ({ ...p })),
            bbox, seal: op.seal !== false,
            pivotX: bbox.x + bbox.w / 2, pivotY: bbox.y + bbox.h / 2,
            x: op.x ?? 0, y: op.y ?? 0, scaleX: s, scaleY: s, id: op.id,
          });
          opsParentList(project, created, op.parent).push(n);
          opsRegister(created, op, n);
          break;
        }
        case 'addImage': {
          if (!op.href) throw new Error('addImage cần href (dataURL)');
          const n = opsMakeNode(project, 'image', {
            name: op.name || 'Ảnh', href: op.href, w: op.w || 100, h: op.h || 100,
            x: op.x ?? 0, y: op.y ?? 0,
            pivotX: (op.w || 100) / 2, pivotY: (op.h || 100) / 2, id: op.id,
          });
          opsParentList(project, created, op.parent).push(n);
          opsRegister(created, op, n);
          break;
        }
        case 'addTraced': opsAddTraced(project, created, op); break;
        case 'setProps': {
          const n = opsResolve(project, created, op.node);
          Object.assign(n, op.props || {});
          break;
        }
        case 'setPivot': {
          const n = opsResolve(project, created, op.node);
          if (op.compensate !== false) {
            const mOld = nodeMatrix(n);
            n.pivotX = op.px; n.pivotY = op.py;
            const t = matMul(mOld, matInvert(nodeMatrix({ ...n, x: 0, y: 0 })));
            n.x = +t[4].toFixed(3); n.y = +t[5].toFixed(3);
          } else {
            n.pivotX = op.px; n.pivotY = op.py;
          }
          break;
        }
        case 'parent': {
          const n = opsResolve(project, created, op.node);
          const loc = opsFindParent(n.id, project.nodes);
          const list = opsParentList(project, created, op.parent ?? null);
          loc.list.splice(loc.index, 1);
          const idx = op.index == null ? list.length : Math.min(op.index, list.length);
          list.splice(idx, 0, n);
          break;
        }
        case 'remove': {
          const n = opsResolve(project, created, op.node);
          const loc = opsFindParent(n.id, project.nodes);
          loc.list.splice(loc.index, 1);
          const ids = [];
          (function collect(x) { ids.push(x.id); x.children?.forEach(collect); })(n);
          project.tracks = project.tracks.filter((t) => !ids.includes(t.nodeId));
          break;
        }
        case 'key': {
          const n = opsResolve(project, created, op.node);
          if (op.prop === 'morph') throw new Error("Dùng op 'poseKey' cho keyframe hình dạng");
          if (!OPS_ANIM.includes(op.prop)) {
            throw new Error(`prop '${op.prop}' không keyframe được (dùng: ${OPS_ANIM.join(', ')})`);
          }
          if (typeof op.value !== 'number') throw new Error('key cần value là số');
          opsCheckEase(op.ease);
          opsUpsertKey(opsEnsureTrack(project, n.id, op.prop), Math.round(op.frame), op.value, op.ease);
          break;
        }
        case 'poseKey': {
          const n = opsResolve(project, created, op.node);
          if (n.type !== 'vector') throw new Error('poseKey chỉ dùng cho node vector');
          opsCheckEase(op.ease);
          let flat;
          if (op.paths) {
            if (op.paths.length !== n.paths.length) {
              throw new Error(`poseKey cần đúng ${n.paths.length} path (nhận ${op.paths.length})`);
            }
            flat = [];
            op.paths.forEach((d, pi) => {
              const pose = parsePathD(d);
              const cur = parsePathD(n.paths[pi].d);
              if (pose.cmds !== cur.cmds) {
                throw new Error(`Path ${pi}: chuỗi lệnh không khớp (cần '${cur.cmds}', nhận '${pose.cmds}') — pose phải cùng topology`);
              }
              flat.push(...pose.pts);
            });
          } else {
            flat = geometryFlat(n); // key hình dạng hiện tại
          }
          opsUpsertKey(opsEnsureTrack(project, n.id, 'morph'), Math.round(op.frame), flat, op.ease);
          break;
        }
        case 'autoRig': {
          const n = opsResolve(project, created, op.node);
          if (n.type !== 'group') throw new Error('autoRig cần node group chứa các mảnh (dùng addTraced với split:true)');
          const r = autoRigApply(n, (name) => opsMakeNode(project, 'group', { name }));
          if (!r) throw new Error('Không nhận diện được bố cục nhân vật — cần ≥3 mảnh rời, nhân vật đứng thẳng chính diện');
          if (op.ref) created[op.ref] = r.zones.join('|');
          break;
        }
        case 'removeKey': {
          const n = opsResolve(project, created, op.node);
          const tr = project.tracks.find((t) => t.nodeId === n.id && t.prop === op.prop);
          if (tr) {
            tr.keys = tr.keys.filter((k) => k.t !== Math.round(op.frame));
            if (!tr.keys.length) project.tracks.splice(project.tracks.indexOf(tr), 1);
          }
          break;
        }
        default:
          throw new Error(`op '${op.op}' không tồn tại`);
      }
    } catch (e) {
      throw new Error(`ops[${i}] (${op.op}): ${e.message}`);
    }
  });
  return { created, count: ops.length };
}
