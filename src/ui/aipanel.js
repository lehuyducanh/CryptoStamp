// Panel AI: tạo ảnh, thư viện asset, modal vector hóa

import {
  state, on, emit, uid, makeNode, addNode, setSelection, autoRigGroup,
} from '../core/state.js';
import { AI_PROVIDERS } from '../ai/providers.js';
import { vectorizeImageData, imageToImageData } from '../vector/vectorize.js';
import { showToast, loadImage, readBlobAsDataURL, debounce, qs } from './dom.js';

let aiCurrentAsset = null, aiLastTrace = null, aiModalImg = null;

export function initAIPanel() {
  const provSel = qs('#ai-provider');
  provSel.innerHTML = Object.entries(AI_PROVIDERS)
    .map(([k, p]) => `<option value="${k}">${p.label}</option>`).join('');
  provSel.value = localStorage.getItem('vm_ai_provider') || 'pollinations';
  const keyRow = qs('#ai-key-row');
  const keyInp = qs('#ai-key');
  keyInp.value = localStorage.getItem('vm_ai_key') || '';
  const syncKeyRow = () => { keyRow.hidden = !AI_PROVIDERS[provSel.value].needsKey; };
  provSel.addEventListener('change', () => {
    localStorage.setItem('vm_ai_provider', provSel.value);
    syncKeyRow();
  });
  keyInp.addEventListener('change', () => localStorage.setItem('vm_ai_key', keyInp.value));
  syncKeyRow();

  qs('#ai-generate').addEventListener('click', aiGenerate);

  qs('#asset-upload').addEventListener('change', async (ev) => {
    for (const f of ev.target.files) await aiAddUpload(f);
    ev.target.value = '';
  });
  const leftPanel = qs('#left-panel');
  leftPanel.addEventListener('dragover', (ev) => { ev.preventDefault(); });
  leftPanel.addEventListener('drop', async (ev) => {
    ev.preventDefault();
    for (const f of ev.dataTransfer.files) {
      if (f.type.startsWith('image/')) await aiAddUpload(f);
    }
  });

  qs('#asset-grid').addEventListener('click', aiAssetClick);

  on('change:project', aiRenderAssets);
  on('change:assets', aiRenderAssets);
  aiRenderAssets();
}

async function aiGenerate() {
  const btn = qs('#ai-generate');
  const status = qs('#ai-status');
  let prompt = qs('#ai-prompt').value.trim();
  if (!prompt) { showToast('Nhập mô tả element cần tạo', true); return; }
  if (qs('#ai-style').checked) {
    prompt += ', flat vector illustration, simple shapes, solid colors, white background';
  }
  const size = +qs('#ai-size').value;
  const provider = AI_PROVIDERS[qs('#ai-provider').value];
  const key = qs('#ai-key').value.trim();
  if (provider.needsKey && !key) { showToast('Provider này cần API key', true); return; }
  btn.disabled = true;
  status.textContent = 'Đang tạo ảnh…';
  try {
    const dataURL = await provider.generate({
      prompt, width: size, height: size, key,
      seed: Math.floor(Math.random() * 1e6),
    });
    const img = await loadImage(dataURL);
    aiAddAsset({
      id: uid('a'),
      name: qs('#ai-prompt').value.trim().slice(0, 48),
      dataURL, w: img.naturalWidth, h: img.naturalHeight,
    });
    status.textContent = '';
    showToast('Đã tạo ảnh — bấm ✦ Vector hóa để chuyển thành vector');
  } catch (e) {
    status.textContent = '';
    showToast('Lỗi tạo ảnh: ' + e.message
      + ' — thử nguồn "Demo (offline)" hoặc tải ảnh lên.', true);
  } finally {
    btn.disabled = false;
  }
}

async function aiAddUpload(file) {
  try {
    const dataURL = await readBlobAsDataURL(file);
    const img = await loadImage(dataURL);
    aiAddAsset({
      id: uid('a'), name: file.name, dataURL,
      w: img.naturalWidth, h: img.naturalHeight,
    });
  } catch (e) {
    showToast('Không đọc được ' + file.name, true);
  }
}

function aiAddAsset(asset) {
  state.project.assets.push(asset);
  emit('change:assets');
  emit('commit');
}

function aiRenderAssets() {
  const grid = qs('#asset-grid');
  if (!grid) return;
  const assets = state.project.assets || [];
  if (!assets.length) {
    grid.innerHTML = '<div class="hint">Chưa có asset. Tạo bằng AI hoặc kéo-thả ảnh vào đây.</div>';
    return;
  }
  grid.innerHTML = assets.map((a) => `
    <div class="asset" data-asset="${a.id}">
      <img src="${a.dataURL}" alt="">
      <div class="asset-name" title="${a.name}">${a.name}</div>
      <div class="asset-actions">
        <button data-aact="img" title="Thêm vào canvas dạng ảnh">🖼</button>
        <button data-aact="vec" title="Vector hóa rồi thêm vào canvas">✦ Vector</button>
        <button data-aact="del" title="Xóa asset">🗑</button>
      </div>
    </div>`).join('');
}

function aiAssetClick(ev) {
  const item = ev.target.closest('.asset');
  if (!item) return;
  const asset = state.project.assets.find((a) => a.id === item.getAttribute('data-asset'));
  if (!asset) return;
  const act = ev.target.getAttribute('data-aact');
  if (act === 'del') {
    state.project.assets = state.project.assets.filter((a) => a !== asset);
    emit('change:assets'); emit('commit');
  } else if (act === 'img') {
    aiAddImageNode(asset);
  } else if (act === 'vec') {
    aiOpenVectorModal(asset);
  }
}

function aiAddImageNode(asset) {
  const p = state.project;
  const s = Math.min(1, 320 / Math.max(asset.w, asset.h));
  const w = Math.round(asset.w * s), h = Math.round(asset.h * s);
  const n = makeNode('image', {
    name: asset.name || 'Ảnh', href: asset.dataURL, w, h,
    pivotX: w / 2, pivotY: h / 2,
    x: Math.round((p.width - w) / 2), y: Math.round((p.height - h) / 2),
  });
  addNode(n);
  setSelection([n.id]);
}

// ---- Modal vector hóa ----

function aiOpenVectorModal(asset) {
  aiCurrentAsset = asset;
  const root = qs('#modal-root');
  root.hidden = false;
  root.innerHTML = `
  <div class="modal">
    <h3>Vector hóa — ${asset.name}</h3>
    <div class="vec-previews">
      <div class="vec-box"><div class="vec-cap">Gốc</div><img id="vec-orig" src="${asset.dataURL}"></div>
      <div class="vec-box"><div class="vec-cap">Vector <span id="vec-info"></span></div><div id="vec-preview"></div></div>
    </div>
    <div class="vec-controls">
      <label>Số màu <input id="vec-colors" type="range" min="2" max="16" value="8">
        <span id="vec-colors-v">8</span></label>
      <label>Chi tiết <input id="vec-detail" type="range" min="0.5" max="4" step="0.25" value="1.5"></label>
      <label>Cỡ trace <select id="vec-size">
        <option value="192">192px (nhanh)</option>
        <option value="256" selected>256px</option>
        <option value="384">384px (nét)</option></select></label>
      <label class="chk"><input id="vec-smooth" type="checkbox" checked> Làm mượt cong</label>
      <label class="chk"><input id="vec-dropbg" type="checkbox" checked> Xóa nền</label>
      <label class="chk"><input id="vec-seal" type="checkbox" checked> Bịt khe</label>
      <label class="chk"><input id="vec-split" type="checkbox" checked> Tách mảnh (để rig)</label>
      <label class="chk" title="Nhân vật đứng thẳng, nhìn chính diện: tự nhóm Đầu/Thân/Tay/Chân, đặt pivot khớp và dựng cây FK">
        <input id="vec-autorig" type="checkbox" checked> 🦴 Auto-rig nhân vật</label>
    </div>
    <div class="modal-btns">
      <button id="vec-cancel">Hủy</button>
      <button id="vec-add" class="primary">＋ Thêm vào canvas</button>
    </div>
  </div>`;
  const rerun = debounce(aiRunTrace, 180);
  ['vec-colors', 'vec-detail', 'vec-size', 'vec-smooth', 'vec-dropbg', 'vec-seal']
    .forEach((id) => qs('#' + id).addEventListener('input', () => {
      qs('#vec-colors-v').textContent = qs('#vec-colors').value;
      rerun();
    }));
  qs('#vec-cancel').addEventListener('click', aiCloseModal);
  root.addEventListener('click', (ev) => { if (ev.target === root) aiCloseModal(); });
  qs('#vec-add').addEventListener('click', () => {
    if (!aiLastTrace) return;
    const split = qs('#vec-split').checked;
    const wantRig = qs('#vec-autorig').checked;
    const n = addTraceResult(aiLastTrace, {
      split, seal: qs('#vec-seal').checked,
      name: aiCurrentAsset.name || 'Vector',
    });
    if (n && split && wantRig && n.type === 'group') {
      const r = autoRigGroup(n.id);
      showToast(r
        ? '🦴 Đã auto-rig: ' + r.zones.join(', ') + ' — chỉnh pivot/parent trong Lớp nếu cần'
        : 'Không nhận diện được bố cục nhân vật (cần nhân vật đứng thẳng, đủ mảnh) — rig thủ công bằng nhóm + pivot', !r);
    }
    aiCloseModal();
  });
  loadImage(asset.dataURL).then((img) => { aiModalImg = img; aiRunTrace(); });
}

function aiCloseModal() {
  const root = qs('#modal-root');
  root.hidden = true;
  root.innerHTML = '';
  aiCurrentAsset = null; aiLastTrace = null; aiModalImg = null;
}

function aiRunTrace() {
  if (!aiModalImg) return;
  const info = qs('#vec-info');
  if (!info) return;
  info.textContent = '…';
  const imgData = imageToImageData(aiModalImg, +qs('#vec-size').value);
  const res = vectorizeImageData(imgData, {
    colors: +qs('#vec-colors').value,
    tolerance: 4.5 - +qs('#vec-detail').value, // chi tiết cao = dung sai thấp
    smooth: qs('#vec-smooth').checked,
    dropBg: qs('#vec-dropbg').checked,
  });
  aiLastTrace = res;
  const seal = qs('#vec-seal').checked;
  qs('#vec-preview').innerHTML = `<svg viewBox="0 0 ${res.w} ${res.h}">${
    res.items.map((it) => `<path d="${it.d}" fill="${it.fill}" fill-rule="evenodd"${
      seal ? ` stroke="${it.fill}" stroke-width="1"` : ''}/>`).join('')
  }</svg>`;
  info.textContent = `(${res.items.length} mảnh)`;
}

// Tạo node từ kết quả trace, thêm vào giữa canvas. Export cho smoke test.
export function addTraceResult(res, { split = false, seal = true, name = 'Vector' } = {}) {
  const p = state.project;
  const { items, w, h } = res;
  if (!items.length) { showToast('Không trace được mảnh nào — thử tăng số màu', true); return null; }
  const s = 340 / Math.max(w, h);
  const base = {
    name, scaleX: +s.toFixed(4), scaleY: +s.toFixed(4),
    pivotX: w / 2, pivotY: h / 2,
    x: Math.round((p.width - w) / 2), y: Math.round((p.height - h) / 2),
  };
  let n;
  if (!split || items.length < 2) {
    n = makeNode('vector', {
      ...base, seal, bbox: { x: 0, y: 0, w, h },
      paths: items.map(({ d, fill, bbox }) => ({ d, fill, bbox })),
    });
  } else {
    n = makeNode('group', base);
    n.children = items.map((it, i) => makeNode('vector', {
      name: 'Mảnh ' + (i + 1), seal, bbox: it.bbox,
      paths: [{ d: it.d, fill: it.fill, bbox: it.bbox }],
      pivotX: it.bbox.x + it.bbox.w / 2, pivotY: it.bbox.y + it.bbox.h / 2,
    }));
  }
  addNode(n);
  setSelection([n.id]);
  return n;
}
