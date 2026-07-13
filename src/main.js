// Khởi động VecMotion Studio

import {
  state, emit, newProject, loadAutosave, setTool, setSelection, setFrame,
  setProps, findNode, makeNode, addNode, deleteNodes, groupSelection,
  duplicateSelection, undo, redo, snapshot,
} from './core/state.js';
import { togglePlay } from './core/player.js';
import { initCanvas } from './ui/canvas.js';
import { initLayers } from './ui/layers.js';
import { initInspector } from './ui/inspector.js';
import { initTimeline, deleteSelectedTimelineKey } from './ui/timeline.js';
import { initAIPanel, addTraceResult } from './ui/aipanel.js';
import { initToolbar } from './ui/toolbar.js';
import { AI_PROVIDERS } from './ai/providers.js';
import { vectorizeImageData, imageToImageData } from './vector/vectorize.js';
import { projectSVG } from './core/markup.js';
import { animatedSVGString } from './export/exporters.js';
import { loadImage } from './ui/dom.js';

function boot() {
  if (!loadAutosave()) state.project = newProject();

  initCanvas();
  initLayers();
  initInspector();
  initTimeline();
  initAIPanel();
  initToolbar();

  emit('change:project');
  emit('change:structure');
  emit('change:selection');
  emit('change:tracks');
  emit('change:zoom');

  document.addEventListener('keydown', onKeyDown);

  // Hook cho smoke test / debug console
  window.__vm = {
    state, findNode, makeNode, addNode, setSelection, setFrame, setProps,
    deleteNodes, undo, redo, togglePlay,
    AI_PROVIDERS, loadImage, imageToImageData, vectorizeImageData,
    addTraceResult, projectSVG, animatedSVGString,
  };
}

function onKeyDown(e) {
  const ae = document.activeElement;
  const editing = ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA'
    || ae.tagName === 'SELECT' || ae.isContentEditable);
  if (editing) {
    if (e.key === 'Escape') ae.blur();
    return;
  }
  if (e.ctrlKey || e.metaKey) {
    switch (e.key.toLowerCase()) {
      case 'z': e.preventDefault(); e.shiftKey ? redo() : undo(); break;
      case 'y': e.preventDefault(); redo(); break;
      case 'g': e.preventDefault(); groupSelection(); break;
      case 'd': e.preventDefault(); duplicateSelection(); break;
    }
    return;
  }
  switch (e.key) {
    case ' ': e.preventDefault(); togglePlay(); break;
    case 'v': case 'V': setTool('select'); break;
    case 'r': case 'R': setTool('rect'); break;
    case 'e': case 'E': setTool('ellipse'); break;
    case 'Delete': case 'Backspace':
      if (!deleteSelectedTimelineKey()) deleteNodes([...state.selection]);
      break;
    case 'Escape':
      state.pivotMode = false;
      document.body.classList.remove('pivot-mode');
      setSelection([]);
      break;
    case 'ArrowLeft': case 'ArrowRight': case 'ArrowUp': case 'ArrowDown': {
      if (!state.selection.length) break;
      e.preventDefault();
      const d = e.shiftKey ? 10 : 1;
      const dx = e.key === 'ArrowLeft' ? -d : e.key === 'ArrowRight' ? d : 0;
      const dy = e.key === 'ArrowUp' ? -d : e.key === 'ArrowDown' ? d : 0;
      snapshot();
      for (const id of state.selection) {
        const n = findNode(id);
        if (n) setProps(id, { x: n.x + dx, y: n.y + dy });
      }
      break;
    }
  }
}

boot();
