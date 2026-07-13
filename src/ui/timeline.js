// Timeline: ruler, hàng track theo thuộc tính, keyframe kéo được, playhead

import {
  state, on, emit, snapshot, findNode, walkNodes, setFrame, setSelection,
} from '../core/state.js';
import { EASE_NAMES, sortKeys } from '../core/anim.js';
import { togglePlay, pauseAnim } from '../core/player.js';

const TL_LABEL_W = 170;
const TL_PROP_LABELS = {
  x: 'X', y: 'Y', rotation: 'Xoay', scaleX: 'Tỉ lệ X', scaleY: 'Tỉ lệ Y', opacity: 'Mờ',
};
let tlScroll, tlPpf = 8, tlKeyDrag = null, tlScrub = null, tlZoomExp = 0;

export function initTimeline() {
  tlScroll = document.getElementById('tl-scroll');

  const easeSel = document.getElementById('tl-ease');
  easeSel.innerHTML = EASE_NAMES.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
  easeSel.value = state.defaultEase;
  easeSel.addEventListener('change', () => {
    state.defaultEase = easeSel.value;
    if (state.selectedKey) {
      const tr = state.project.tracks.find((t) => t.id === state.selectedKey.trackId);
      const k = tr?.keys.find((k) => k.t === state.selectedKey.t);
      if (k) { snapshot(); k.e = easeSel.value; emit('change:tracks'); emit('change:frame'); }
    }
  });

  document.getElementById('tl-first').addEventListener('click', () => { pauseAnim(); setFrame(0); });
  document.getElementById('tl-play').addEventListener('click', togglePlay);
  document.getElementById('tl-loop').addEventListener('click', (e) => {
    state.looping = !state.looping;
    e.currentTarget.classList.toggle('active', state.looping);
  });
  document.getElementById('tl-autokey').addEventListener('click', (e) => {
    state.autokey = !state.autokey;
    e.currentTarget.classList.toggle('active', state.autokey);
  });

  const zoomInp = document.getElementById('tl-zoomx');
  zoomInp.addEventListener('input', () => { tlZoomExp = +zoomInp.value; tlRebuild(); });

  const fpsInp = document.getElementById('tl-fps');
  const durInp = document.getElementById('tl-dur');
  fpsInp.addEventListener('change', () => {
    snapshot();
    state.project.fps = Math.max(1, Math.min(60, +fpsInp.value || 30));
    emit('change:project');
  });
  durInp.addEventListener('change', () => {
    snapshot();
    const s = Math.max(0.5, +durInp.value || 5);
    state.project.durFrames = Math.round(s * state.project.fps);
    setFrame(Math.min(state.frame, state.project.durFrames));
    emit('change:project');
  });

  tlScroll.addEventListener('pointerdown', tlDown);
  tlScroll.addEventListener('pointermove', tlMove);
  tlScroll.addEventListener('pointerup', tlUp);
  tlScroll.addEventListener('pointercancel', tlUp);

  on('change:project', () => { tlSyncInputs(); tlRebuild(); });
  on('change:structure', tlRebuild);
  on('change:tracks', tlRebuild);
  on('change:selection', tlRebuild);
  on('change:frame', tlUpdatePlayhead);
  on('change:play', () => {
    document.getElementById('tl-play').textContent = state.playing ? '⏸' : '▶';
  });

  tlSyncInputs();
  tlRebuild();
}

function tlSyncInputs() {
  document.getElementById('tl-fps').value = state.project.fps;
  document.getElementById('tl-dur').value = +(state.project.durFrames / state.project.fps).toFixed(2);
}

// ppf cơ sở = vừa khít panel; tlZoomExp (thanh Zoom) nhân theo lũy thừa 2,
// cho phép đi xuống 0.2px/frame để phim dài (9000 frame) vẫn điều hướng được.
function tlComputePpf() {
  const avail = tlScroll.clientWidth - TL_LABEL_W - 24;
  const fit = Math.max(0.2, avail / state.project.durFrames);
  return Math.max(0.2, Math.min(20, fit * Math.pow(2, tlZoomExp)));
}

function tlFormatTime(sec) {
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return m + ':' + String(s).padStart(2, '0');
}

function tlRebuild() {
  const p = state.project;
  tlPpf = tlComputePpf();
  const laneW = p.durFrames * tlPpf;

  // Ruler: chọn bước vạch (giây) sao cho nhãn cách nhau ≥ 70px
  const secPx = p.fps * tlPpf;
  const stepS = [1, 2, 5, 10, 15, 30, 60, 120].find((s) => s * secPx >= 70) || 300;
  let ticks = '';
  for (let f = 0; f <= p.durFrames; f += stepS * p.fps) {
    ticks += `<div class="tl-tick" style="left:${f * tlPpf}px">${tlFormatTime(f / p.fps)}</div>`;
  }
  let html = `<div class="tl-row tl-ruler-row">
    <div class="tl-label">Thời gian</div>
    <div class="tl-lane tl-ruler" style="width:${laneW}px">${ticks}</div></div>`;

  let hasTracks = false;
  walkNodes((n) => {
    const trs = p.tracks.filter((t) => t.nodeId === n.id && t.keys.length);
    if (!trs.length) return;
    hasTracks = true;
    const sel = state.selection.includes(n.id) ? ' sel' : '';
    html += `<div class="tl-row tl-node-row${sel}" data-node="${n.id}">
      <div class="tl-label tl-node-name">${n.name}</div>
      <div class="tl-lane" style="width:${laneW}px"></div></div>`;
    for (const tr of trs) {
      const keys = tr.keys.map((k) => {
        const kSel = state.selectedKey && state.selectedKey.trackId === tr.id
          && state.selectedKey.t === k.t ? ' sel' : '';
        return `<div class="tl-key${kSel}" data-track="${tr.id}" data-t="${k.t}"
          style="left:${k.t * tlPpf - 5}px" title="f${k.t} · ${k.e}"></div>`;
      }).join('');
      html += `<div class="tl-row">
        <div class="tl-label tl-prop">${TL_PROP_LABELS[tr.prop] || tr.prop}</div>
        <div class="tl-lane" style="width:${laneW}px">${keys}</div></div>`;
    }
  });
  if (!hasTracks) {
    html += `<div class="tl-empty">Chưa có keyframe. Chọn đối tượng rồi bấm ◆ ở
      panel Thuộc tính, hoặc bật <b>● Ghi key</b> và kéo đối tượng trên canvas.</div>`;
  }
  html += `<div id="tl-playhead" style="left:${TL_LABEL_W + state.frame * tlPpf}px"></div>`;
  tlScroll.innerHTML = html;
  tlUpdatePlayhead();
}

function tlUpdatePlayhead() {
  const ph = document.getElementById('tl-playhead');
  if (ph) ph.style.left = TL_LABEL_W + state.frame * tlPpf + 'px';
  const t = document.getElementById('tl-time');
  if (t) {
    t.textContent = (state.frame / state.project.fps).toFixed(2) + 's · f' + Math.floor(state.frame);
  }
}

function tlFrameFromEvent(ev, laneEl) {
  const r = laneEl.getBoundingClientRect();
  const f = Math.round((ev.clientX - r.left) / tlPpf);
  return Math.max(0, Math.min(f, state.project.durFrames));
}

function tlDown(ev) {
  const keyEl = ev.target.closest('.tl-key');
  if (keyEl) {
    const trackId = keyEl.getAttribute('data-track');
    const t = +keyEl.getAttribute('data-t');
    state.selectedKey = { trackId, t };
    const tr = state.project.tracks.find((x) => x.id === trackId);
    const k = tr?.keys.find((k) => k.t === t);
    if (k) document.getElementById('tl-ease').value = k.e;
    const nid = tr?.nodeId;
    if (nid && !state.selection.includes(nid)) setSelection([nid]);
    tlKeyDrag = { trackId, t, el: keyEl, lane: keyEl.parentElement, moved: false };
    tlScroll.setPointerCapture(ev.pointerId);
    tlRebuild();
    return;
  }
  const nodeRow = ev.target.closest('.tl-node-row');
  if (nodeRow && ev.target.closest('.tl-label')) {
    setSelection([nodeRow.getAttribute('data-node')]);
    return;
  }
  const lane = ev.target.closest('.tl-lane');
  if (lane) {
    pauseAnim();
    tlScrub = { lane };
    setFrame(tlFrameFromEvent(ev, lane));
    tlScroll.setPointerCapture(ev.pointerId);
  }
}

function tlMove(ev) {
  if (tlScrub) { setFrame(tlFrameFromEvent(ev, tlScrub.lane)); return; }
  if (!tlKeyDrag) return;
  const newT = tlFrameFromEvent(ev, tlKeyDrag.lane);
  if (newT === tlKeyDrag.t) return;
  const tr = state.project.tracks.find((x) => x.id === tlKeyDrag.trackId);
  if (!tr || tr.keys.some((k) => k.t === newT)) return; // đích đã có key
  if (!tlKeyDrag.moved) { snapshot(); tlKeyDrag.moved = true; }
  const k = tr.keys.find((k) => k.t === tlKeyDrag.t);
  if (!k) return;
  k.t = newT;
  sortKeys(tr);
  tlKeyDrag.t = newT;
  state.selectedKey = { trackId: tr.id, t: newT };
  tlKeyDrag.el.style.left = newT * tlPpf - 5 + 'px';
  tlKeyDrag.el.setAttribute('data-t', newT);
}

function tlUp(ev) {
  if (tlKeyDrag && tlKeyDrag.moved) {
    emit('change:tracks');
    emit('change:frame');
    emit('change:props');
  }
  tlKeyDrag = null;
  tlScrub = null;
  try { tlScroll.releasePointerCapture(ev.pointerId); } catch (e) { /* rồi */ }
}

// Xóa key đang chọn (gọi từ phím Delete)
export function deleteSelectedTimelineKey() {
  if (!state.selectedKey) return false;
  const tr = state.project.tracks.find((t) => t.id === state.selectedKey.trackId);
  if (!tr) { state.selectedKey = null; return false; }
  snapshot();
  const i = tr.keys.findIndex((k) => k.t === state.selectedKey.t);
  if (i >= 0) tr.keys.splice(i, 1);
  if (!tr.keys.length) {
    const ti = state.project.tracks.indexOf(tr);
    if (ti >= 0) state.project.tracks.splice(ti, 1);
  }
  state.selectedKey = null;
  emit('change:tracks');
  emit('change:frame');
  emit('change:props');
  return true;
}
