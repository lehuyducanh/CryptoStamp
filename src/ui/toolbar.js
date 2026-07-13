// Thanh công cụ trên cùng

import {
  state, on, setTool, undo, redo, groupSelection, newProject, loadProjectData,
} from '../core/state.js';
import {
  saveProjectFile, openProjectFile, exportFrameSVG, exportAnimatedSVG,
} from '../export/exporters.js';
import { setZoom, fitZoom } from './canvas.js';
import { qs } from './dom.js';

export function initToolbar() {
  document.querySelectorAll('#topbar [data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => setTool(btn.getAttribute('data-tool')));
  });
  on('change:tool', () => {
    document.querySelectorAll('#topbar [data-tool]').forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-tool') === state.tool);
    });
  });

  qs('#tb-group').addEventListener('click', groupSelection);
  qs('#tb-undo').addEventListener('click', undo);
  qs('#tb-redo').addEventListener('click', redo);

  qs('#tb-new').addEventListener('click', () => {
    if (!confirm('Tạo dự án mới? Dự án hiện tại chưa lưu sẽ mất.')) return;
    loadProjectData(newProject());
  });
  qs('#tb-open').addEventListener('click', openProjectFile);
  qs('#tb-save').addEventListener('click', saveProjectFile);
  qs('#tb-exp-svg').addEventListener('click', exportFrameSVG);
  qs('#tb-exp-anim').addEventListener('click', exportAnimatedSVG);

  qs('#tb-zoom-in').addEventListener('click', () => setZoom(state.zoom * 1.2));
  qs('#tb-zoom-out').addEventListener('click', () => setZoom(state.zoom / 1.2));
  qs('#tb-zoom-fit').addEventListener('click', fitZoom);
  on('change:zoom', () => {
    qs('#tb-zoom').textContent = Math.round(state.zoom * 100) + '%';
  });
}
