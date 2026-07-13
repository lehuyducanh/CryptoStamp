// Xuất video: WebM (MediaRecorder, quay theo thời gian thực) và chuỗi PNG (.zip)
// — con đường ra video dài (phim 5 phút) thay cho SVG động vốn chỉ hợp clip ngắn.

import { state, applyTracks, setFrame } from '../core/state.js';
import { projectSVG } from '../core/markup.js';
import { loadImage, showToast, downloadFile, qs } from '../ui/dom.js';
import { zipStore } from './zip.js';

export const PNG_MAX_FRAMES = 901; // ~30s @30fps mỗi lần xuất (giới hạn RAM)

let vidCancel = false;

// Vẽ frame f của dự án lên canvas (đánh giá track rồi rasterize SVG)
async function vidDrawFrame(ctx, f) {
  state.frame = f;
  applyTracks();
  const svg = projectSVG(state.project);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await loadImage(url);
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(img, 0, 0);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function vidMakeCanvas() {
  const p = state.project;
  const canvas = document.createElement('canvas');
  canvas.width = p.width;
  canvas.height = p.height;
  return { canvas, ctx: canvas.getContext('2d') };
}

// Quay WebM theo thời gian thực (5 phút phim ≈ 5 phút render)
export async function recordWebMBlob({ onProgress = () => {} } = {}) {
  const p = state.project;
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m));
  if (!mime) throw new Error('Trình duyệt không hỗ trợ MediaRecorder/WebM');
  const { canvas, ctx } = vidMakeCanvas();
  const stream = canvas.captureStream(p.fps);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });

  vidCancel = false;
  await vidDrawFrame(ctx, 0);
  rec.start(1000);
  const t0 = performance.now();
  let lastWhole = -1;
  while (!vidCancel) {
    const f = ((performance.now() - t0) / 1000) * p.fps;
    if (f >= p.durFrames) break;
    if (Math.floor(f) !== lastWhole) {
      lastWhole = Math.floor(f);
      await vidDrawFrame(ctx, f);
      onProgress(f / p.durFrames);
    }
    await new Promise((r) => requestAnimationFrame(r));
  }
  rec.stop();
  await stopped;
  onProgress(1);
  if (vidCancel) throw new Error('Đã hủy');
  return new Blob(chunks, { type: 'video/webm' });
}

// Chuỗi PNG frame-chính-xác (ghép bằng ffmpeg) — chất lượng cao nhất
export async function recordPNGZipBlob({ fromF = 0, toF = null, onProgress = () => {} } = {}) {
  const p = state.project;
  toF = toF == null ? p.durFrames : toF;
  fromF = Math.max(0, Math.round(fromF));
  toF = Math.min(p.durFrames, Math.round(toF));
  const total = toF - fromF + 1;
  if (total < 1) throw new Error('Khoảng frame không hợp lệ');
  if (total > PNG_MAX_FRAMES) {
    throw new Error(`Tối đa ${PNG_MAX_FRAMES} frame (~${Math.floor(PNG_MAX_FRAMES / p.fps)}s) mỗi lần — hãy xuất thành nhiều phần`);
  }
  vidCancel = false;
  const { canvas, ctx } = vidMakeCanvas();
  const files = [];
  for (let f = fromF; f <= toF; f++) {
    if (vidCancel) throw new Error('Đã hủy');
    await vidDrawFrame(ctx, f);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
    files.push({
      name: `frame_${String(f - fromF).padStart(4, '0')}.png`,
      data: new Uint8Array(await blob.arrayBuffer()),
    });
    onProgress((f - fromF + 1) / total);
  }
  return zipStore(files);
}

// ---- Modal UI ----

export function openVideoExportModal() {
  const p = state.project;
  const durS = p.durFrames / p.fps;
  const root = qs('#modal-root');
  root.hidden = false;
  root.innerHTML = `
  <div class="modal">
    <h3>Xuất video — ${durS.toFixed(1)}s @ ${p.fps}fps (${p.durFrames} frame)</h3>
    <div class="hint" style="margin-bottom:10px">
      <b>WebM</b>: quay theo thời gian thực (phim ${durS.toFixed(0)}s ≈ chờ ${durS.toFixed(0)}s), dùng được ngay.<br>
      <b>Chuỗi PNG</b>: frame-chính-xác, chất lượng cao nhất, ghép bằng ffmpeg
      (xem README) — tối đa ~${Math.floor(PNG_MAX_FRAMES / p.fps)}s mỗi lần, phim dài xuất thành nhiều phần.
    </div>
    <div class="vec-controls">
      <label>PNG từ giây <input id="vex-from" type="number" min="0" step="1" value="0" style="width:64px"></label>
      <label>đến giây <input id="vex-to" type="number" min="0" step="1"
        value="${Math.min(durS, Math.floor(PNG_MAX_FRAMES / p.fps)).toFixed(0)}" style="width:64px"></label>
    </div>
    <progress id="vex-prog" max="1" value="0" style="width:100%" hidden></progress>
    <div id="vex-status" class="status"></div>
    <div class="modal-btns">
      <button id="vex-close">Đóng</button>
      <button id="vex-png">⬇ PNG .zip</button>
      <button id="vex-webm" class="primary">⬇ WebM</button>
    </div>
  </div>`;

  const prog = qs('#vex-prog'), status = qs('#vex-status');
  let running = false;
  const close = () => {
    if (running) { vidCancel = true; return; }
    root.hidden = true;
    root.innerHTML = '';
  };
  qs('#vex-close').addEventListener('click', close);
  root.addEventListener('click', (ev) => { if (ev.target === root && !running) close(); });

  async function run(label, fn, filename) {
    if (running) return;
    running = true;
    const saved = state.frame;
    prog.hidden = false; prog.value = 0;
    status.textContent = label + '… (bấm Đóng để hủy)';
    qs('#vex-webm').disabled = qs('#vex-png').disabled = true;
    try {
      const blob = await fn((v) => { prog.value = v; });
      downloadFile(filename, blob);
      status.textContent = '✓ Xong — đã tải ' + filename;
    } catch (e) {
      status.textContent = '✗ ' + e.message;
    } finally {
      running = false;
      qs('#vex-webm').disabled = qs('#vex-png').disabled = false;
      setFrame(saved);
    }
  }

  qs('#vex-webm').addEventListener('click', () =>
    run('Đang quay WebM', (cb) => recordWebMBlob({ onProgress: cb }), 'animation.webm'));
  qs('#vex-png').addEventListener('click', () => {
    const fromS = +qs('#vex-from').value || 0;
    const toS = +qs('#vex-to').value || 0;
    run('Đang render PNG', (cb) => recordPNGZipBlob({
      fromF: fromS * p.fps, toF: toS * p.fps, onProgress: cb,
    }), `frames_${fromS}s-${toS}s.zip`);
  });
}
