// Panel thuộc tính: transform + keyframe, pivot, màu, thao tác rig

import {
  state, on, emit, snapshot, findNode, findParent, setProps, setPivot,
  setSelection, toggleKey, getTrack, nodeLocalBBox, explodeVector, ungroupNode,
  ANIM_PROPS,
} from '../core/state.js';
import { refreshNodeInner } from './canvas.js';

const INS_LABELS = {
  x: 'X', y: 'Y', rotation: 'Xoay °', scaleX: 'Tỉ lệ X', scaleY: 'Tỉ lệ Y', opacity: 'Mờ',
  w: 'Rộng', h: 'Cao',
};
const INS_STEPS = {
  x: 1, y: 1, rotation: 1, scaleX: 0.05, scaleY: 0.05, opacity: 0.05, w: 1, h: 1,
};

// Danh sách prop hiện trong panel: transform + w/h nếu node có kích thước
function insPropsFor(n) {
  return (n.type === 'shape' || n.type === 'image') ? [...ANIM_PROPS, 'w', 'h'] : ANIM_PROPS;
}
let insBox;

export function initInspector() {
  insBox = document.getElementById('inspector');

  insBox.addEventListener('focusin', (ev) => {
    if (ev.target.matches('input')) snapshot();
  });
  insBox.addEventListener('input', insOnInput);
  insBox.addEventListener('change', () => emit('commit'));
  insBox.addEventListener('click', insOnClick);

  on('change:selection', insRender);
  on('change:structure', insRender);
  on('change:tracks', insRender);
  on('change:project', insRender);
  on('change:props', insSyncValues);
  on('change:frame', insSyncValues);

  insRender();
}

function insKeyBtnClass(nodeId, prop) {
  const tr = getTrack(nodeId, prop);
  if (!tr) return 'key-btn';
  const f = Math.round(state.frame);
  return tr.keys.some((k) => k.t === f) ? 'key-btn on' : 'key-btn track';
}

function insRender() {
  if (!insBox) return;
  const sel = state.selection;

  if (sel.length === 0) {
    const p = state.project;
    insBox.innerHTML = `
      <div class="ins-section"><h4>Dự án</h4>
        <div class="prop-row"><label>Tên</label><input data-proj="name" value="${p.name}"></div>
        <div class="prop-row"><label>Rộng</label><input type="number" data-proj="width" value="${p.width}"></div>
        <div class="prop-row"><label>Cao</label><input type="number" data-proj="height" value="${p.height}"></div>
        <div class="prop-row"><label>Nền</label><input type="color" data-proj="background" value="${p.background}"></div>
        <div class="hint">Chọn một đối tượng trên canvas hoặc panel Lớp để chỉnh thuộc tính.</div>
      </div>`;
    return;
  }
  if (sel.length > 1) {
    insBox.innerHTML = `<div class="hint">${sel.length} đối tượng đang chọn —
      kéo để di chuyển cùng lúc, Ctrl+G để nhóm lại (bước đầu của rig).</div>`;
    return;
  }

  const n = findNode(sel[0]);
  if (!n) { insBox.innerHTML = ''; return; }
  const loc = findParent(n.id);
  const typeName = { group: 'Nhóm', shape: 'Hình', vector: 'Vector', image: 'Ảnh' }[n.type] || n.type;

  let html = `<div class="ins-section">
    <div class="prop-row"><label>Tên</label><input data-k="name" value="${n.name}"></div>
    <div class="prop-row"><label>Loại</label><span class="ins-type">${typeName}</span>
      ${loc && loc.parent ? `<button class="mini" data-act="selparent" title="Chọn nhóm cha">⬆ Cha</button>` : ''}
    </div></div>`;

  html += `<div class="ins-section"><h4>Transform <span class="hint-inline">◆ = keyframe tại frame hiện tại</span></h4>`;
  for (const p of insPropsFor(n)) {
    html += `<div class="prop-row"><label>${INS_LABELS[p]}</label>
      <input type="number" step="${INS_STEPS[p]}" data-prop="${p}" value="${+(+n[p]).toFixed(3)}">
      <button class="${insKeyBtnClass(n.id, p)}" data-key="${p}" title="Bật/tắt keyframe">◆</button></div>`;
  }
  if (n.type === 'vector') {
    html += `<div class="prop-row"><label>Hình dạng</label>
      <span class="ins-type" style="flex:1" title="Kéo đỉnh bằng công cụ ✎ (phím A), key tự ghi khi ● Ghi key bật">✎ sửa điểm (A)</span>
      <button class="${insKeyBtnClass(n.id, 'morph')}" data-key="morph" title="Keyframe hình dạng (morph)">◆</button></div>`;
  }
  html += `</div>`;

  html += `<div class="ins-section"><h4>Tâm xoay (pivot)</h4>
    <div class="prop-row"><label>Pivot X</label><input type="number" data-pivot="x" value="${+n.pivotX.toFixed(2)}"></div>
    <div class="prop-row"><label>Pivot Y</label><input type="number" data-pivot="y" value="${+n.pivotY.toFixed(2)}"></div>
    <div class="btn-row">
      <button class="mini ${state.pivotMode ? 'active' : ''}" data-act="pivotmode">🎯 Click đặt tâm</button>
      <button class="mini" data-act="pivotcenter">⌖ Về giữa</button>
    </div>
    <div class="hint">Với rig: đặt tâm xoay tại khớp (vai, khuỷu tay…) rồi animate "Xoay".</div>
  </div>`;

  if (n.type === 'shape') {
    html += `<div class="ins-section"><h4>Màu</h4>
      <div class="prop-row"><label>Tô</label><input type="color" data-shapefill value="${n.fill}"></div></div>`;
  }
  if (n.type === 'vector') {
    const fills = (n.paths || []).slice(0, 12).map((p, i) =>
      `<input type="color" data-fill="${i}" value="${p.fill}" title="Mảnh ${i + 1}">`).join('');
    html += `<div class="ins-section"><h4>Màu các mảnh</h4>
      <div class="fill-grid">${fills}</div>
      <label class="chk"><input type="checkbox" data-seal ${n.seal ? 'checked' : ''}> Bịt khe răng cưa</label>
      ${n.paths?.length > 1 ? `<button class="mini" data-act="explode">✂ Tách thành các mảnh (để rig)</button>` : ''}
    </div>`;
  }
  if (n.type === 'group') {
    html += `<div class="ins-section">
      <button class="mini" data-act="ungroup">Rã nhóm</button>
      <div class="hint">Nhóm = xương (bone) trong rig FK. Kéo node khác thả vào
      nhóm này ở panel Lớp để parent.</div></div>`;
  }
  insBox.innerHTML = html;
}

// Cập nhật giá trị input khi props đổi (không đè input đang gõ)
function insSyncValues() {
  if (state.selection.length !== 1) return;
  const n = findNode(state.selection[0]);
  if (!n) return;
  for (const p of [...insPropsFor(n), 'morph']) {
    const inp = insBox.querySelector(`input[data-prop="${p}"]`);
    if (inp && document.activeElement !== inp) inp.value = +(+n[p]).toFixed(3);
    const btn = insBox.querySelector(`button[data-key="${p}"]`);
    if (btn) btn.className = insKeyBtnClass(n.id, p);
  }
  const px = insBox.querySelector('input[data-pivot="x"]');
  const py = insBox.querySelector('input[data-pivot="y"]');
  if (px && document.activeElement !== px) px.value = +n.pivotX.toFixed(2);
  if (py && document.activeElement !== py) py.value = +n.pivotY.toFixed(2);
}

function insOnInput(ev) {
  const t = ev.target;
  const projKey = t.getAttribute('data-proj');
  if (projKey) {
    const v = t.type === 'number' ? Math.max(1, +t.value || 1) : t.value;
    state.project[projKey] = v;
    emit('change:project');
    return;
  }
  if (state.selection.length !== 1) return;
  const id = state.selection[0];
  const n = findNode(id);
  if (!n) return;

  if (t.hasAttribute('data-prop')) {
    const p = t.getAttribute('data-prop');
    let v = parseFloat(t.value);
    if (Number.isNaN(v)) return;
    if (p === 'w' || p === 'h') v = Math.max(1, v);
    setProps(id, { [p]: v });
    if (p === 'w' || p === 'h') refreshNodeInner(id); // kích thước nằm trong markup
    return;
  }
  if (t.hasAttribute('data-pivot')) {
    const px = parseFloat(insBox.querySelector('input[data-pivot="x"]').value) || 0;
    const py = parseFloat(insBox.querySelector('input[data-pivot="y"]').value) || 0;
    setPivot(id, px, py, { snap: false });
    return;
  }
  if (t.getAttribute('data-k') === 'name') {
    n.name = t.value;
    emit('change:structure-name'); // layers tự nghe
    return;
  }
  if (t.hasAttribute('data-shapefill')) {
    n.fill = t.value;
    refreshNodeInner(id);
    return;
  }
  if (t.hasAttribute('data-fill')) {
    const i = +t.getAttribute('data-fill');
    if (n.paths?.[i]) { n.paths[i].fill = t.value; refreshNodeInner(id); }
    return;
  }
  if (t.hasAttribute('data-seal')) {
    n.seal = t.checked;
    refreshNodeInner(id);
  }
}

function insOnClick(ev) {
  const keyProp = ev.target.getAttribute?.('data-key');
  if (keyProp && state.selection.length === 1) {
    toggleKey(state.selection[0], keyProp);
    return;
  }
  const act = ev.target.getAttribute?.('data-act');
  if (!act || state.selection.length !== 1) return;
  const id = state.selection[0];
  const n = findNode(id);
  switch (act) {
    case 'pivotmode':
      state.pivotMode = !state.pivotMode;
      document.body.classList.toggle('pivot-mode', state.pivotMode);
      ev.target.classList.toggle('active', state.pivotMode);
      break;
    case 'pivotcenter': {
      const b = nodeLocalBBox(n);
      setPivot(id, +(b.x + b.w / 2).toFixed(2), +(b.y + b.h / 2).toFixed(2));
      insSyncValues();
      break;
    }
    case 'selparent': {
      const loc = findParent(id);
      if (loc?.parent) setSelection([loc.parent.id]);
      break;
    }
    case 'explode': explodeVector(id); break;
    case 'ungroup': ungroupNode(id); break;
  }
}
