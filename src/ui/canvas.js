// Canvas SVG: render scene, chọn/kéo/xoay/scale, pivot, zoom

import {
  state, on, emit, findNode, findParent, walkNodes, setSelection, setProps,
  snapshot, worldMatrix, nodeLocalBBox, makeNode, addNode, setPivot, setTool,
  writeMorphKey,
} from '../core/state.js';
import {
  nodeMatrix, matToSvg, matInvert, matApply, matApplyVec, matIdentity,
} from '../core/mat.js';
import { nodeInnerSVG } from '../core/markup.js';
import { parsePathD, buildPathD, pathAnchorIdx, moveAnchor } from '../vector/path.js';
import { geoTrackIds } from '../core/eval.js';

const SVGNS = 'http://www.w3.org/2000/svg';
let cvSvg, cvContent, cvOverlay, cvBgRect, cvScroll;
const cvEls = new Map();
let cvDrag = null;

function cvMakeEl(tag, attrs = {}) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

export function initCanvas() {
  cvScroll = document.getElementById('canvas-scroll');
  const holder = document.getElementById('stage-holder');
  cvSvg = cvMakeEl('svg', { id: 'stage' });
  cvBgRect = cvMakeEl('rect');
  cvContent = cvMakeEl('g');
  cvOverlay = cvMakeEl('g', { id: 'cv-overlay' });
  cvSvg.append(cvBgRect, cvContent, cvOverlay);
  holder.append(cvSvg);

  cvSvg.addEventListener('pointerdown', cvDown);
  cvSvg.addEventListener('pointermove', cvMove);
  cvSvg.addEventListener('pointerup', cvUp);
  cvSvg.addEventListener('pointercancel', cvUp);
  cvScroll.addEventListener('wheel', (ev) => {
    if (!ev.ctrlKey) return;
    ev.preventDefault();
    setZoom(state.zoom * (ev.deltaY < 0 ? 1.1 : 0.9));
  }, { passive: false });

  on('change:project', () => { cvResizeStage(); cvRebuild(); cvDrawOverlay(); });
  on('change:structure', () => { cvRebuild(); cvDrawOverlay(); });
  on('change:props', () => { cvUpdateTransforms(); cvDrawOverlay(); });
  on('change:frame', () => { cvUpdateTransforms(); cvGeoRefresh(); cvDrawOverlay(); });
  on('change:selection', cvDrawOverlay);
  on('change:tool', cvDrawOverlay);

  cvResizeStage();
  cvRebuild();
  requestAnimationFrame(fitZoom);
}

function cvResizeStage() {
  const p = state.project;
  cvSvg.setAttribute('viewBox', `0 0 ${p.width} ${p.height}`);
  cvSvg.style.width = p.width * state.zoom + 'px';
  cvSvg.style.height = p.height * state.zoom + 'px';
  cvBgRect.setAttribute('width', p.width);
  cvBgRect.setAttribute('height', p.height);
  cvBgRect.setAttribute('fill', p.background || '#ffffff');
}

export function setZoom(z) {
  state.zoom = Math.max(0.1, Math.min(8, z));
  cvResizeStage();
  cvDrawOverlay();
  emit('change:zoom');
}

export function fitZoom() {
  const p = state.project;
  const z = Math.min(
    (cvScroll.clientWidth - 60) / p.width,
    (cvScroll.clientHeight - 60) / p.height
  );
  setZoom(Math.max(0.1, Math.min(z, 2)));
}

function cvRebuild() {
  cvContent.innerHTML = '';
  cvEls.clear();
  state.project.nodes.forEach((n) => cvBuildEl(n, cvContent));
}

function cvBuildEl(n, parentEl) {
  const g = cvMakeEl('g', { 'data-id': n.id });
  cvApplyAttrs(n, g);
  if (n.type === 'group') n.children.forEach((c) => cvBuildEl(c, g));
  else g.innerHTML = nodeInnerSVG(n);
  parentEl.append(g);
  cvEls.set(n.id, g);
}

function cvApplyAttrs(n, el) {
  el.setAttribute('transform', matToSvg(nodeMatrix(n)));
  el.setAttribute('opacity', n.opacity);
  if (n.visible === false) el.setAttribute('display', 'none');
  else el.removeAttribute('display');
}

function cvUpdateTransforms() {
  walkNodes((n) => {
    const el = cvEls.get(n.id);
    if (el) cvApplyAttrs(n, el);
  });
}

// Cập nhật phần bên trong (fill/kích thước) của một node mà không rebuild cả cây
export function refreshNodeInner(id) {
  const n = findNode(id), el = cvEls.get(id);
  if (n && el && n.type !== 'group') el.innerHTML = nodeInnerSVG(n);
}

// Vẽ lại nội dung các node có track hình học (morph, w/h) sau khi tua frame
function cvGeoRefresh() {
  for (const id of geoTrackIds(state.project)) refreshNodeInner(id);
}

function cvStagePoint(ev) {
  const r = cvSvg.getBoundingClientRect();
  return {
    x: ((ev.clientX - r.left) * state.project.width) / r.width,
    y: ((ev.clientY - r.top) * state.project.height) / r.height,
  };
}

function cvParentInverse(id) {
  const loc = findParent(id);
  return loc && loc.parent ? matInvert(worldMatrix(loc.parent.id)) : matIdentity();
}

// ---- Tương tác ----

function cvDown(ev) {
  if (ev.button === 1) {
    cvDrag = { kind: 'pan', sx: ev.clientX, sy: ev.clientY, sl: cvScroll.scrollLeft, st: cvScroll.scrollTop };
    cvSvg.setPointerCapture(ev.pointerId);
    ev.preventDefault();
    return;
  }
  if (ev.button !== 0) return;
  const pt = cvStagePoint(ev);

  if (state.pivotMode && state.selection.length === 1) {
    const id = state.selection[0];
    const local = matApply(matInvert(worldMatrix(id)), pt);
    setPivot(id, +local.x.toFixed(2), +local.y.toFixed(2));
    state.pivotMode = false;
    document.body.classList.remove('pivot-mode');
    emit('change:selection');
    return;
  }

  if (state.tool === 'rect' || state.tool === 'ellipse') {
    const n = makeNode('shape', {
      shape: state.tool, name: state.tool === 'rect' ? 'Chữ nhật' : 'Elip',
      w: 1, h: 1, fill: '#7c9cff', x: pt.x, y: pt.y,
    });
    addNode(n);
    setSelection([n.id]);
    cvDrag = { kind: 'draw', id: n.id, sx: pt.x, sy: pt.y };
    cvSvg.setPointerCapture(ev.pointerId);
    return;
  }

  // Công cụ Sửa điểm: kéo đỉnh path của node vector đang chọn
  if (state.tool === 'points') {
    const vp = ev.target.closest('[data-vp]');
    if (vp && state.selection.length === 1) {
      const id = state.selection[0];
      const n = findNode(id);
      snapshot();
      const [pi, ai] = vp.getAttribute('data-vp').split(':').map(Number);
      const geos = n.paths.map((p) => parsePathD(p.d));
      cvDrag = {
        kind: 'vpoint', id, pi, ai, geos,
        orig: geos.map((g) => g.pts.slice()), startPt: pt,
      };
      cvSvg.setPointerCapture(ev.pointerId);
      return;
    }
    // click node khác → chỉ chọn, không kéo
    const g2 = ev.target.closest('g[data-id]');
    if (g2 && cvContent.contains(g2)) { setSelection([g2.getAttribute('data-id')]); return; }
    setSelection([]);
    return;
  }

  const handle = ev.target.closest('[data-handle]');
  if (handle && state.selection.length === 1) {
    const id = state.selection[0];
    const n = findNode(id);
    snapshot();
    const pw = matApply(worldMatrix(id, false), { x: n.x + n.pivotX, y: n.y + n.pivotY });
    cvDrag = {
      kind: handle.getAttribute('data-handle'), id, pw,
      startRot: n.rotation, startSX: n.scaleX, startSY: n.scaleY,
      startPt: pt, startAng: Math.atan2(pt.y - pw.y, pt.x - pw.x),
    };
    cvSvg.setPointerCapture(ev.pointerId);
    return;
  }

  const g = ev.target.closest('g[data-id]');
  if (g && cvContent.contains(g)) {
    const id = g.getAttribute('data-id');
    let sel;
    if (ev.shiftKey) {
      sel = state.selection.includes(id)
        ? state.selection.filter((s) => s !== id)
        : [...state.selection, id];
    } else if (state.selection.includes(id)) sel = state.selection;
    else sel = [id];
    setSelection(sel);
    if (sel.includes(id)) {
      snapshot();
      cvDrag = {
        kind: 'move', startPt: pt,
        starts: sel.map((sid) => {
          const sn = findNode(sid);
          return { id: sid, x: sn.x, y: sn.y };
        }),
      };
      cvSvg.setPointerCapture(ev.pointerId);
    }
    return;
  }

  setSelection([]);
}

function cvMove(ev) {
  if (!cvDrag) return;
  const pt = cvDrag.kind === 'pan' ? null : cvStagePoint(ev);
  switch (cvDrag.kind) {
    case 'pan':
      cvScroll.scrollLeft = cvDrag.sl - (ev.clientX - cvDrag.sx);
      cvScroll.scrollTop = cvDrag.st - (ev.clientY - cvDrag.sy);
      break;
    case 'draw': {
      const n = findNode(cvDrag.id);
      if (!n) break;
      n.x = Math.min(pt.x, cvDrag.sx);
      n.y = Math.min(pt.y, cvDrag.sy);
      n.w = Math.max(1, Math.abs(pt.x - cvDrag.sx));
      n.h = Math.max(1, Math.abs(pt.y - cvDrag.sy));
      refreshNodeInner(cvDrag.id);
      cvApplyAttrs(n, cvEls.get(cvDrag.id));
      cvDrawOverlay();
      break;
    }
    case 'move': {
      const dx = pt.x - cvDrag.startPt.x, dy = pt.y - cvDrag.startPt.y;
      for (const s of cvDrag.starts) {
        const d = matApplyVec(cvParentInverse(s.id), { x: dx, y: dy });
        setProps(s.id, { x: +(s.x + d.x).toFixed(2), y: +(s.y + d.y).toFixed(2) });
      }
      break;
    }
    case 'rotate': {
      const a = Math.atan2(pt.y - cvDrag.pw.y, pt.x - cvDrag.pw.x);
      let deg = cvDrag.startRot + ((a - cvDrag.startAng) * 180) / Math.PI;
      if (ev.shiftKey) deg = Math.round(deg / 15) * 15;
      setProps(cvDrag.id, { rotation: +deg.toFixed(2) });
      break;
    }
    case 'scale': {
      const d0 = Math.hypot(cvDrag.startPt.x - cvDrag.pw.x, cvDrag.startPt.y - cvDrag.pw.y) || 1e-6;
      const d1 = Math.hypot(pt.x - cvDrag.pw.x, pt.y - cvDrag.pw.y);
      const r = d1 / d0;
      setProps(cvDrag.id, {
        scaleX: +(cvDrag.startSX * r).toFixed(3),
        scaleY: +(cvDrag.startSY * r).toFixed(3),
      });
      break;
    }
    case 'vpoint': {
      const n = findNode(cvDrag.id);
      if (!n) break;
      const inv = matInvert(worldMatrix(cvDrag.id));
      const d = matApplyVec(inv, {
        x: pt.x - cvDrag.startPt.x, y: pt.y - cvDrag.startPt.y,
      });
      const g = cvDrag.geos[cvDrag.pi];
      g.pts = cvDrag.orig[cvDrag.pi].slice();
      moveAnchor(g.cmds, g.pts, cvDrag.ai, d.x, d.y);
      n.paths[cvDrag.pi].d = buildPathD(g.cmds, g.pts);
      refreshNodeInner(n.id);
      cvDrawOverlay();
      break;
    }
  }
}

function cvUp(ev) {
  if (!cvDrag) return;
  if (cvDrag.kind === 'vpoint') {
    // Ghi key morph nếu autokey bật hoặc node đã có track morph
    writeMorphKey(cvDrag.id);
    emit('change:props');
  }
  if (cvDrag.kind === 'draw') {
    const n = findNode(cvDrag.id);
    if (n) {
      if (n.w < 4 || n.h < 4) { n.w = Math.max(n.w, 80); n.h = Math.max(n.h, 80); }
      n.pivotX = n.w / 2; n.pivotY = n.h / 2;
      refreshNodeInner(n.id);
      setTool('select');
      emit('change:props');
    }
  }
  cvDrag = null;
  try { cvSvg.releasePointerCapture(ev.pointerId); } catch (e) { /* đã release */ }
  emit('commit');
}

// ---- Overlay chọn ----

function cvDrawOverlay() {
  cvOverlay.innerHTML = '';
  const z = state.zoom || 1;
  const sw = 1.4 / z;
  for (const id of state.selection) {
    const n = findNode(id);
    if (!n) continue;
    const b = nodeLocalBBox(n);
    const W = worldMatrix(id);
    const cs = [
      [b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h],
    ].map(([x, y]) => matApply(W, { x, y }));
    cvOverlay.append(cvMakeEl('polygon', {
      points: cs.map((p) => `${p.x},${p.y}`).join(' '),
      class: 'sel-outline', 'stroke-width': sw,
    }));
    if (state.selection.length !== 1) continue;

    // Chế độ Sửa điểm: hiện các đỉnh path kéo được thay cho handle transform
    if (state.tool === 'points') {
      if (n.type !== 'vector') continue;
      const pr2 = 4.5 / z;
      n.paths.forEach((p, pi) => {
        const g = parsePathD(p.d);
        for (const ai of pathAnchorIdx(g.cmds)) {
          const wpt = matApply(W, { x: g.pts[ai], y: g.pts[ai + 1] });
          cvOverlay.append(cvMakeEl('circle', {
            cx: wpt.x, cy: wpt.y, r: pr2,
            class: 'vp-handle', 'data-vp': `${pi}:${ai}`, 'stroke-width': sw,
          }));
        }
      });
      continue;
    }

    // Handle scale ở 4 góc
    const hs = 9 / z;
    cs.forEach((p) => {
      cvOverlay.append(cvMakeEl('rect', {
        x: p.x - hs / 2, y: p.y - hs / 2, width: hs, height: hs,
        class: 'sel-handle', 'data-handle': 'scale', 'stroke-width': sw,
      }));
    });

    // Handle xoay phía trên
    const tm = matApply(W, { x: b.x + b.w / 2, y: b.y });
    const ctr = matApply(W, { x: b.x + b.w / 2, y: b.y + b.h / 2 });
    let dx = tm.x - ctr.x, dy = tm.y - ctr.y;
    const L = Math.hypot(dx, dy) || 1;
    dx /= L; dy /= L;
    const rp = { x: tm.x + (dx * 26) / z, y: tm.y + (dy * 26) / z };
    cvOverlay.append(cvMakeEl('line', {
      x1: tm.x, y1: tm.y, x2: rp.x, y2: rp.y, class: 'sel-line', 'stroke-width': sw,
    }));
    cvOverlay.append(cvMakeEl('circle', {
      cx: rp.x, cy: rp.y, r: 6 / z,
      class: 'sel-handle rotate', 'data-handle': 'rotate', 'stroke-width': sw,
    }));

    // Đánh dấu pivot
    const pw = matApply(worldMatrix(id, false), { x: n.x + n.pivotX, y: n.y + n.pivotY });
    const pr = 5 / z;
    cvOverlay.append(cvMakeEl('circle', {
      cx: pw.x, cy: pw.y, r: pr, class: 'pivot-marker', 'stroke-width': sw,
    }));
    cvOverlay.append(cvMakeEl('line', {
      x1: pw.x - pr * 1.8, y1: pw.y, x2: pw.x + pr * 1.8, y2: pw.y,
      class: 'pivot-marker', 'stroke-width': sw,
    }));
    cvOverlay.append(cvMakeEl('line', {
      x1: pw.x, y1: pw.y - pr * 1.8, x2: pw.x, y2: pw.y + pr * 1.8,
      class: 'pivot-marker', 'stroke-width': sw,
    }));
  }
}
