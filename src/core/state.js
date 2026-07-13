// Store trung tâm: project, scene graph, tracks, selection, undo/redo, event bus.
// Thuần logic (không DOM) để test được bằng Node.

import { evalTrack, sortKeys } from './anim.js';
import { matIdentity, matMul, matApply, matInvert, nodeMatrix } from './mat.js';

// ---- Event bus ----
const _listeners = {};
export function on(ev, cb) { (_listeners[ev] ??= []).push(cb); }
export function emit(ev, data) {
  for (const cb of _listeners[ev] || []) cb(data);
  if (ev === 'change:structure' || ev === 'change:tracks' || ev === 'commit') scheduleAutosave();
}

export const ANIM_PROPS = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];

export const state = {
  project: null,
  selection: [],
  frame: 0,
  playing: false,
  looping: true,
  autokey: false,
  defaultEase: 'easeInOut',
  tool: 'select',
  selectedKey: null, // {trackId, t}
  zoom: 1,
  pivotMode: false,
};

export function newProject() {
  return {
    name: 'Dự án', width: 960, height: 540, fps: 30, durFrames: 150,
    background: '#ffffff', idc: 1, nodes: [], tracks: [], assets: [],
  };
}

export function uid(prefix = 'n') { return prefix + state.project.idc++; }

export function makeNode(type, extra = {}) {
  return Object.assign(
    {
      id: uid(), name: type, type,
      x: 0, y: 0, rotation: 0, scaleX: 1, scaleY: 1, opacity: 1,
      pivotX: 0, pivotY: 0, visible: true,
    },
    type === 'group' ? { children: [] } : {},
    extra
  );
}

// ---- Tree helpers ----
export function findNode(id, list) {
  list = list || state.project.nodes;
  for (const n of list) {
    if (n.id === id) return n;
    if (n.children) { const r = findNode(id, n.children); if (r) return r; }
  }
  return null;
}

export function findParent(id, list, parent = null) {
  list = list || state.project.nodes;
  for (let i = 0; i < list.length; i++) {
    const n = list[i];
    if (n.id === id) return { list, index: i, parent };
    if (n.children) { const r = findParent(id, n.children, n); if (r) return r; }
  }
  return null;
}

export function walkNodes(cb, list) {
  list = list || state.project.nodes;
  for (const n of list) { cb(n); if (n.children) walkNodes(cb, n.children); }
}

// Chuỗi tổ tiên từ gốc đến node (bao gồm node)
export function nodeAncestors(id) {
  const path = [];
  (function walk(list, acc) {
    for (const n of list) {
      const acc2 = [...acc, n];
      if (n.id === id) { path.push(...acc2); return true; }
      if (n.children && walk(n.children, acc2)) return true;
    }
    return false;
  })(state.project.nodes, []);
  return path;
}

export function worldMatrix(id, includeSelf = true) {
  const chain = nodeAncestors(id);
  let m = matIdentity();
  for (const n of chain) {
    if (!includeSelf && n.id === id) break;
    m = matMul(m, nodeMatrix(n));
  }
  return m;
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

// ---- Undo / Redo (snapshot JSON) ----
const _undo = [], _redo = [];
export function snapshot() {
  const s = JSON.stringify(state.project);
  if (_undo.length && _undo[_undo.length - 1] === s) return;
  _undo.push(s);
  if (_undo.length > 80) _undo.shift();
  _redo.length = 0;
}
export function undo() {
  if (!_undo.length) return;
  _redo.push(JSON.stringify(state.project));
  state.project = JSON.parse(_undo.pop());
  afterRestore();
}
export function redo() {
  if (!_redo.length) return;
  _undo.push(JSON.stringify(state.project));
  state.project = JSON.parse(_redo.pop());
  afterRestore();
}
function afterRestore() {
  state.selection = state.selection.filter((id) => findNode(id));
  state.selectedKey = null;
  state.frame = Math.min(state.frame, state.project.durFrames);
  applyTracks();
  emit('change:project'); emit('change:structure'); emit('change:tracks');
  emit('change:selection'); emit('change:props');
}

let _saveT = null;
function scheduleAutosave() {
  if (typeof localStorage === 'undefined') return;
  clearTimeout(_saveT);
  _saveT = setTimeout(() => {
    try { localStorage.setItem('vecmotion_autosave', JSON.stringify(state.project)); } catch (e) { /* đầy quota */ }
  }, 600);
}
export function loadAutosave() {
  if (typeof localStorage === 'undefined') return false;
  try {
    const s = localStorage.getItem('vecmotion_autosave');
    if (s) { state.project = JSON.parse(s); return true; }
  } catch (e) { /* hỏng dữ liệu */ }
  return false;
}

export function loadProjectData(project) {
  state.project = project;
  state.selection = []; state.selectedKey = null; state.frame = 0;
  applyTracks();
  emit('change:project'); emit('change:structure'); emit('change:tracks');
  emit('change:selection'); emit('change:frame'); emit('change:props');
}

// ---- Selection / frame / tool ----
export function setSelection(ids) {
  state.selection = ids;
  state.selectedKey = null;
  emit('change:selection');
}
export function setTool(t) {
  state.tool = t;
  if (t !== 'select') state.pivotMode = false;
  emit('change:tool');
}
export function setFrame(f) {
  state.frame = Math.max(0, Math.min(f, state.project.durFrames));
  applyTracks();
  emit('change:frame'); emit('change:props');
}
export function applyTracks() {
  for (const tr of state.project.tracks) {
    if (!tr.keys.length) continue;
    const n = findNode(tr.nodeId);
    if (n) n[tr.prop] = evalTrack(tr, state.frame);
  }
}

// ---- Tracks / keyframes ----
export function getTrack(nodeId, prop) {
  return state.project.tracks.find((t) => t.nodeId === nodeId && t.prop === prop);
}
export function ensureTrack(nodeId, prop) {
  let t = getTrack(nodeId, prop);
  if (!t) { t = { id: uid('t'), nodeId, prop, keys: [] }; state.project.tracks.push(t); }
  return t;
}
// Trả về true nếu tạo key mới (khác với ghi đè)
export function upsertKey(track, t, v, e) {
  const k = track.keys.find((k) => k.t === t);
  if (k) { k.v = v; if (e) k.e = e; return false; }
  track.keys.push({ t, v, e: e || state.defaultEase });
  sortKeys(track);
  return true;
}
export function removeKeyAt(track, t) {
  const i = track.keys.findIndex((k) => k.t === t);
  if (i >= 0) track.keys.splice(i, 1);
  if (!track.keys.length) {
    const ti = state.project.tracks.indexOf(track);
    if (ti >= 0) state.project.tracks.splice(ti, 1);
  }
}
export function toggleKey(nodeId, prop) {
  snapshot();
  const n = findNode(nodeId);
  const f = Math.round(state.frame);
  const tr = getTrack(nodeId, prop);
  if (tr && tr.keys.some((k) => k.t === f)) removeKeyAt(tr, f);
  else upsertKey(ensureTrack(nodeId, prop), f, n[prop]);
  emit('change:tracks');
}
export function removeNodeTracks(nodeId) {
  state.project.tracks = state.project.tracks.filter((t) => t.nodeId !== nodeId);
}

// Đặt thuộc tính khi chỉnh sửa. Tự ghi key nếu prop đã có track hoặc autokey bật.
export function setProps(id, patch) {
  const n = findNode(id);
  if (!n) return;
  let newKey = false;
  const f = Math.round(state.frame);
  for (const [p, v] of Object.entries(patch)) {
    n[p] = v;
    if (ANIM_PROPS.includes(p)) {
      const tr = getTrack(id, p);
      if (tr || state.autokey) {
        if (upsertKey(tr || ensureTrack(id, p), f, v)) newKey = true;
      }
    }
  }
  emit('change:props');
  if (newKey) emit('change:tracks');
}

// Đổi pivot nhưng bù trừ x,y để hình không dịch chuyển
export function setPivot(id, px, py, { snap = true } = {}) {
  const n = findNode(id);
  if (!n) return;
  if (snap) snapshot();
  const mOld = nodeMatrix(n);
  n.pivotX = px; n.pivotY = py;
  const pOnly = nodeMatrix({ ...n, x: 0, y: 0 });
  const t = matMul(mOld, matInvert(pOnly));
  n.x = +t[4].toFixed(3); n.y = +t[5].toFixed(3);
  emit('change:props');
}

// ---- Structure ops ----
export function addNode(node, parentId = null, index = null, opts = {}) {
  if (opts.snapshot !== false) snapshot();
  const list = parentId ? findNode(parentId).children : state.project.nodes;
  if (index == null) list.push(node);
  else list.splice(index, 0, node);
  emit('change:structure');
  return node;
}

function collectIds(n) {
  const ids = [n.id];
  if (n.children) n.children.forEach((c) => ids.push(...collectIds(c)));
  return ids;
}

// Lọc bỏ id có tổ tiên cũng đang được chọn
export function topMostIds(ids) {
  return ids.filter((id) => {
    const chain = nodeAncestors(id);
    return !chain.some((a) => a.id !== id && ids.includes(a.id));
  });
}

export function deleteNodes(ids) {
  ids = topMostIds(ids.filter((id) => findNode(id)));
  if (!ids.length) return;
  snapshot();
  for (const id of ids) {
    const loc = findParent(id);
    if (!loc) continue;
    const [n] = loc.list.splice(loc.index, 1);
    collectIds(n).forEach(removeNodeTracks);
  }
  state.selection = state.selection.filter((id) => findNode(id));
  emit('change:structure'); emit('change:tracks'); emit('change:selection');
}

export function reparentNode(id, targetParentId, index = null) {
  if (id === targetParentId) return;
  const n = findNode(id);
  if (!n) return;
  if (targetParentId && collectIds(n).includes(targetParentId)) return; // không thả vào con cháu
  snapshot();
  const loc = findParent(id);
  loc.list.splice(loc.index, 1);
  const list = targetParentId ? findNode(targetParentId).children : state.project.nodes;
  const i = index == null ? list.length : Math.min(index, list.length);
  list.splice(i, 0, n);
  emit('change:structure');
}

export function groupSelection() {
  const ids = topMostIds(state.selection.filter((id) => findNode(id)));
  if (!ids.length) return;
  snapshot();
  const refs = ids.map((id) => findNode(id));
  const first = findParent(ids[0]);
  const parentId = first.parent ? first.parent.id : null;
  const insertAt = first.index;
  for (const r of refs) {
    const loc = findParent(r.id);
    loc.list.splice(loc.index, 1);
  }
  const g = makeNode('group', { name: 'Nhóm' });
  g.children = refs;
  const list = parentId ? findNode(parentId).children : state.project.nodes;
  list.splice(Math.min(insertAt, list.length), 0, g);
  const b = nodeLocalBBox(g);
  g.pivotX = b.x + b.w / 2; g.pivotY = b.y + b.h / 2;
  state.selection = [g.id];
  emit('change:structure'); emit('change:selection');
}

export function ungroupNode(id) {
  const g = findNode(id);
  if (!g || g.type !== 'group') return;
  snapshot();
  const loc = findParent(id);
  if (g.rotation === 0 && g.scaleX === 1 && g.scaleY === 1) {
    g.children.forEach((c) => { c.x += g.x; c.y += g.y; });
  }
  loc.list.splice(loc.index, 1, ...g.children);
  removeNodeTracks(id);
  state.selection = g.children.map((c) => c.id);
  emit('change:structure'); emit('change:tracks'); emit('change:selection');
}

function cloneNodeDeep(n, map) {
  const c = JSON.parse(JSON.stringify(n));
  (function remap(x) {
    const nid = uid();
    map[x.id] = nid;
    x.id = nid;
    x.children?.forEach(remap);
  })(c);
  return c;
}

export function duplicateSelection() {
  const ids = topMostIds(state.selection.filter((id) => findNode(id)));
  if (!ids.length) return;
  snapshot();
  const clones = [];
  for (const id of ids) {
    const n = findNode(id);
    const loc = findParent(id);
    const map = {};
    const c = cloneNodeDeep(n, map);
    c.x += 16; c.y += 16;
    loc.list.splice(loc.index + 1, 0, c);
    for (const tr of [...state.project.tracks]) {
      if (map[tr.nodeId]) {
        state.project.tracks.push({
          id: uid('t'), nodeId: map[tr.nodeId], prop: tr.prop,
          keys: tr.keys.map((k) => ({ ...k })),
        });
      }
    }
    clones.push(c.id);
  }
  state.selection = clones;
  emit('change:structure'); emit('change:tracks'); emit('change:selection');
}

// Tách node vector nhiều path thành group các mảnh riêng (để rig)
export function explodeVector(id) {
  const n = findNode(id);
  if (!n || n.type !== 'vector' || !n.paths || n.paths.length < 2) return;
  snapshot();
  const loc = findParent(id);
  const g = makeNode('group', {
    name: n.name, x: n.x, y: n.y, rotation: n.rotation,
    scaleX: n.scaleX, scaleY: n.scaleY, opacity: n.opacity,
    pivotX: n.pivotX, pivotY: n.pivotY,
  });
  g.children = n.paths.map((p, i) => {
    const b = p.bbox || n.bbox || { x: 0, y: 0, w: 10, h: 10 };
    return makeNode('vector', {
      name: 'Mảnh ' + (i + 1), paths: [p], bbox: b, seal: n.seal,
      pivotX: b.x + b.w / 2, pivotY: b.y + b.h / 2,
    });
  });
  loc.list.splice(loc.index, 1, g);
  removeNodeTracks(id);
  state.selection = [g.id];
  emit('change:structure'); emit('change:tracks'); emit('change:selection');
}
