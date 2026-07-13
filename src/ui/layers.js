// Panel Lớp: cây node, chọn, đổi tên, ẩn/hiện, kéo-thả reparent (rig FK)

import {
  state, on, emit, snapshot, findNode, findParent, setSelection,
  deleteNodes, duplicateSelection, reparentNode,
} from '../core/state.js';

const LY_ICONS = { group: '▣', shape: '▢', vector: '✦', image: '🖼' };
let lyList, lyDragId = null;

export function initLayers() {
  lyList = document.getElementById('layer-list');

  document.querySelectorAll('[data-lact]').forEach((btn) => {
    btn.addEventListener('click', () => lyAction(btn.getAttribute('data-lact')));
  });

  lyList.addEventListener('click', lyOnClick);
  lyList.addEventListener('dblclick', lyOnDblClick);
  lyList.addEventListener('dragstart', (ev) => {
    const row = ev.target.closest('.ly-row');
    if (!row) return;
    lyDragId = row.getAttribute('data-id');
    ev.dataTransfer.effectAllowed = 'move';
  });
  lyList.addEventListener('dragover', (ev) => {
    const row = ev.target.closest('.ly-row');
    if (!row || !lyDragId || row.getAttribute('data-id') === lyDragId) return;
    ev.preventDefault();
    lyList.querySelectorAll('.ly-row').forEach((r) => r.classList.remove('drop-into', 'drop-after'));
    const n = findNode(row.getAttribute('data-id'));
    const r = row.getBoundingClientRect();
    const rel = (ev.clientY - r.top) / r.height;
    if (n?.type === 'group' && rel > 0.25 && rel < 0.75) row.classList.add('drop-into');
    else row.classList.add('drop-after');
  });
  lyList.addEventListener('dragleave', (ev) => {
    ev.target.closest('.ly-row')?.classList.remove('drop-into', 'drop-after');
  });
  lyList.addEventListener('drop', (ev) => {
    ev.preventDefault();
    const row = ev.target.closest('.ly-row');
    lyList.querySelectorAll('.ly-row').forEach((r) => r.classList.remove('drop-into', 'drop-after'));
    if (!row || !lyDragId) return;
    const targetId = row.getAttribute('data-id');
    if (targetId === lyDragId) return;
    const tn = findNode(targetId);
    const r = row.getBoundingClientRect();
    const rel = (ev.clientY - r.top) / r.height;
    if (tn?.type === 'group' && rel > 0.25 && rel < 0.75) {
      reparentNode(lyDragId, targetId); // thả VÀO nhóm → parent (rig)
    } else {
      const loc = findParent(targetId);
      if (loc) reparentNode(lyDragId, loc.parent ? loc.parent.id : null, loc.index + 1);
    }
    lyDragId = null;
  });

  on('change:structure', lyRender);
  on('change:selection', lyRender);
  on('change:structure-name', lyRender);
  on('change:project', lyRender);
  lyRender();
}

function lyRender() {
  if (!lyList) return;
  let html = '';
  (function walk(list, depth) {
    // Duyệt ngược để phần tử trên cùng canvas hiện trên đầu danh sách
    for (let i = list.length - 1; i >= 0; i--) {
      const n = list[i];
      const sel = state.selection.includes(n.id) ? ' sel' : '';
      const hid = n.visible === false ? ' hidden-node' : '';
      html += `<div class="ly-row${sel}${hid}" data-id="${n.id}" draggable="true"
        style="padding-left:${8 + depth * 16}px">
        <span class="ly-eye" data-eye title="Ẩn/hiện">${n.visible === false ? '◌' : '●'}</span>
        <span class="ly-icon">${LY_ICONS[n.type] || '•'}</span>
        <span class="ly-name">${lyEsc(n.name)}</span></div>`;
      if (n.children) walk(n.children, depth + 1);
    }
  })(state.project.nodes, 0);
  lyList.innerHTML = html || '<div class="hint" style="padding:10px">Chưa có đối tượng.<br>Vẽ hình (R/E), hoặc tạo bằng AI ở panel trái.</div>';
}

function lyEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

function lyOnClick(ev) {
  const row = ev.target.closest('.ly-row');
  if (!row) return;
  const id = row.getAttribute('data-id');
  if (ev.target.hasAttribute('data-eye')) {
    const n = findNode(id);
    snapshot();
    n.visible = n.visible === false;
    emit('change:props');
    lyRender();
    return;
  }
  if (ev.shiftKey) {
    setSelection(state.selection.includes(id)
      ? state.selection.filter((s) => s !== id)
      : [...state.selection, id]);
  } else setSelection([id]);
}

function lyOnDblClick(ev) {
  const row = ev.target.closest('.ly-row');
  if (!row) return;
  const id = row.getAttribute('data-id');
  const n = findNode(id);
  const nameEl = row.querySelector('.ly-name');
  const inp = document.createElement('input');
  inp.value = n.name;
  inp.className = 'ly-rename';
  nameEl.replaceWith(inp);
  inp.focus();
  inp.select();
  const done = () => {
    snapshot();
    n.name = inp.value || n.name;
    lyRender();
    emit('change:structure-name');
  };
  inp.addEventListener('blur', done);
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') inp.blur();
    if (e.key === 'Escape') { inp.value = n.name; inp.blur(); }
    e.stopPropagation();
  });
}

function lyAction(act) {
  const sel = state.selection;
  if (act === 'del') { deleteNodes([...sel]); return; }
  if (act === 'dup') { duplicateSelection(); return; }
  if (sel.length !== 1) return;
  const loc = findParent(sel[0]);
  if (!loc) return;
  // up = tiến lên trên canvas (về cuối list SVG), down = lùi xuống
  const dir = act === 'up' ? 1 : act === 'down' ? -1 : 0;
  if (!dir) return;
  const ni = loc.index + dir;
  if (ni < 0 || ni >= loc.list.length) return;
  snapshot();
  const [n] = loc.list.splice(loc.index, 1);
  loc.list.splice(ni, 0, n);
  emit('change:structure');
}
