// Vòng lặp phát animation bằng requestAnimationFrame

import { state, setFrame, emit } from './state.js';

let plRaf = null, plT0 = 0, plF0 = 0;

export function playAnim() {
  if (state.playing) return;
  state.playing = true;
  plT0 = performance.now();
  plF0 = state.frame >= state.project.durFrames - 0.01 ? 0 : state.frame;
  emit('change:play');
  plTick();
}

function plTick() {
  if (!state.playing) return;
  const p = state.project;
  let f = plF0 + ((performance.now() - plT0) / 1000) * p.fps;
  if (f >= p.durFrames) {
    if (state.looping) { plT0 = performance.now(); plF0 = 0; f = 0; }
    else { pauseAnim(); setFrame(p.durFrames); return; }
  }
  setFrame(f);
  plRaf = requestAnimationFrame(plTick);
}

export function pauseAnim() {
  if (!state.playing) return;
  state.playing = false;
  cancelAnimationFrame(plRaf);
  emit('change:play');
}

export function togglePlay() {
  state.playing ? pauseAnim() : playAnim();
}
