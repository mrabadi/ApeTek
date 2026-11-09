import katex from 'katex';
import 'katex/dist/katex.min.css';
import type { AssetRequest } from '../shared/types';

const surface = document.getElementById('surface')!;
let diagramId = 0;
Object.assign(surface.style, { position: 'absolute', left: '8px', top: '8px', display: 'inline-block', whiteSpace: 'nowrap', color: '#17212b', lineHeight: 'normal' });

async function renderAsset(request: AssetRequest) {
  surface.replaceChildren();
  surface.style.fontSize = `${request.fontSize || 17}px`;
  const formula = document.createElement('span');
  formula.style.display = 'inline-block';
  if (request.kind === 'mermaid') {
    const { default: mermaid } = await import('mermaid');
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral', fontFamily: 'Arial, sans-serif', flowchart: { htmlLabels: false } });
    const { svg } = await mermaid.render(`diagram-${++diagramId}`, request.source);
    formula.innerHTML = svg;
    const image = formula.querySelector('svg')!;
    const box = image.viewBox.baseVal;
    const scale = Math.min(1, 1100 / box.width);
    image.setAttribute('width', String(Math.ceil(box.width * scale)));
    image.setAttribute('height', String(Math.ceil(box.height * scale)));
    image.style.width = `${Math.ceil(box.width * scale)}px`;
    image.style.height = `${Math.ceil(box.height * scale)}px`;
    image.style.maxWidth = 'none';
  } else {
    katex.render(request.source, formula, { displayMode: request.display || false, throwOnError: true, trust: false, strict: 'ignore', output: 'html' });
    for (const display of formula.querySelectorAll<HTMLElement>('.katex-display')) display.style.margin = '0';
  }
  const baseline = document.createElement('span');
  Object.assign(baseline.style, { display: 'inline-block', width: '0', height: '0', padding: '0', margin: '0', verticalAlign: 'baseline' });
  surface.append(formula, baseline);
  await document.fonts.ready;
  const rect = formula.getBoundingClientRect();
  const x = Math.floor(rect.left) - 2, y = Math.floor(rect.top) - 2;
  const width = Math.ceil(rect.right) - x + 2, height = Math.ceil(rect.bottom) - y + 2;
  return { x, y, width, height, descent: request.kind === 'mermaid' ? 0 : Math.max(0, y + height - baseline.getBoundingClientRect().top) };
}

Object.assign(window, { renderAsset });
