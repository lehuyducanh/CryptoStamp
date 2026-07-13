// Sinh markup SVG cho node/project — dùng chung cho canvas editor, exporter và CLI.
// smil: chuỗi <animate> SMIL chèn vào trong phần tử (morph d, width/height…).

import { nodeMatrix, matToSvg, matToCss } from './mat.js';

export function escAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

// smil = { shape: '<animate…>', paths: ['<animate…>', …] } hoặc null
export function nodeInnerSVG(n, smil = null) {
  const sh = smil?.shape || '';
  if (n.type === 'shape') {
    if (n.shape === 'ellipse') {
      return `<ellipse cx="${n.w / 2}" cy="${n.h / 2}" rx="${n.w / 2}" ry="${n.h / 2}" fill="${n.fill}">${sh}</ellipse>`;
    }
    return `<rect width="${n.w}" height="${n.h}" rx="${n.rx || 0}" fill="${n.fill}">${sh}</rect>`;
  }
  if (n.type === 'image') {
    return `<image href="${escAttr(n.href)}" width="${n.w}" height="${n.h}" preserveAspectRatio="none">${sh}</image>`;
  }
  if (n.type === 'vector') {
    return (n.paths || [])
      .map((p, i) => `<path d="${p.d}" fill="${p.fill}" fill-rule="evenodd"${
        n.seal ? ` stroke="${p.fill}" stroke-width="1" stroke-linejoin="round"` : ''
      }>${smil?.paths?.[i] || ''}</path>`)
      .join('');
  }
  return '';
}

export function nodeSVG(n, animatedIds = null, smilFor = null) {
  const inner = n.type === 'group'
    ? n.children.map((c) => nodeSVG(c, animatedIds, smilFor)).join('')
    : nodeInnerSVG(n, smilFor ? smilFor(n) : null);
  const m = nodeMatrix(n);
  // Node có animation transform: dùng CSS (style) để @keyframes ghi đè được
  const attrs = animatedIds && animatedIds.has(n.id)
    ? ` class="vm-${n.id}" style="transform:${matToCss(m)}"`
    : ` transform="${matToSvg(m)}"`;
  return `<g${attrs} opacity="${n.opacity}"${n.visible === false ? ' display="none"' : ''}>${inner}</g>`;
}

export function projectSVG(project, { css = '', animatedIds = null, smilFor = null } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${project.width}" height="${project.height}" viewBox="0 0 ${project.width} ${project.height}">`
    + (css ? `<style>${css}</style>` : '')
    + (project.background && project.background !== 'transparent'
      ? `<rect width="${project.width}" height="${project.height}" fill="${project.background}"/>` : '')
    + project.nodes.map((n) => nodeSVG(n, animatedIds, smilFor)).join('')
    + '</svg>';
}
