import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeApp, launchApp } from './helpers';
test('equations become transparent high-resolution PNGs with inline baseline metrics', async () => {
  const { app, page } = await launchApp();
  try {
    const asset = await page.evaluate(() => window.desktop.renderAsset({ kind: 'math', source: String.raw`\frac{x_i}{y^2}`, display: false }));
    assert.match(asset.src, /^data:image\/png;base64,/);
    assert.ok(asset.width > 5 && asset.height > 5);
    assert.ok(asset.descent > 0 && asset.descent < asset.height);
    assert.ok(asset.clipboard, 'inline math includes a Writer-compatible image');
    assert.equal(asset.clipboard.descent, asset.clipboard.height / 2);
    assert.ok(asset.clipboard.height >= asset.height);
    const pixels = await page.evaluate(async (image) => {
      const img = new Image(); img.src = image.src; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!; ctx.drawImage(img, 0, 0);
      const bytes = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let transparent = 0, ink = 0;
      for (let i = 3; i < bytes.length; i += 4) { if (bytes[i] === 0) transparent++; if (bytes[i] > 200) ink++; }
      return { width: img.naturalWidth, height: img.naturalHeight, transparent, ink };
    }, asset);
    assert.equal(pixels.width, Math.round(asset.width * 3));
    assert.equal(pixels.height, Math.round(asset.height * 3));
    assert.ok(pixels.transparent > 0 && pixels.ink > 0);
  } finally { await closeApp(app); }
});

test('rich copy puts embedded equation HTML and readable source text on the OS clipboard', async () => {
  const { app, page } = await launchApp();
  try {
    const asset = await page.evaluate(() => window.desktop.renderAsset({ kind: 'math', source: 'E=mc^2' }));
    const html = `<h1>Clipboard proof</h1><p>Energy <img src="${asset.src}" width="${asset.width}" height="${asset.height}" alt="E=mc^2"> remains editable.</p><table><tr><th>Symbol</th></tr><tr><td>E</td></tr></table>`;
    await page.evaluate((payload) => window.desktop.copyRendered(payload), { html, text: 'Clipboard proof\nEnergy E=mc^2 remains editable.\nSymbol\nE' });
    const formats = await app.evaluate(async ({ clipboard }) => {
      const items = await clipboard.read();
      const item = items[0];
      return { types: item.types, html: await (await item.getType('text/html')).text(), text: await clipboard.readText() };
    });
    assert.ok(formats.types.includes('text/html'));
    assert.ok(formats.types.includes('text/plain'));
    assert.ok(!formats.types.includes('image/png'));
    assert.match(formats.html, /data:image\/png;base64,/);
    assert.match(formats.html, /<table>/);
    assert.match(formats.text, /E=mc\^2/);
  } finally { await closeApp(app); }
});

test('Mermaid diagrams become portable PNG images and malformed math reports an error', async () => {
  const { app, page } = await launchApp();
  try {
    const diagram = await page.evaluate(() => window.desktop.renderAsset({ kind: 'mermaid', source: 'flowchart LR\n  A[Write] --> B[Preview] --> C[Copy]' }));
    assert.match(diagram.src, /^data:image\/png;base64,/);
    assert.ok(diagram.width > 100 && diagram.height > 20);
    assert.equal(diagram.descent, 0);
    await assert.rejects(page.evaluate(() => window.desktop.renderAsset({ kind: 'math', source: String.raw`\frac{1}{` })), /parse|KaTeX|expected|end/i);
  } finally { await closeApp(app); }
});
