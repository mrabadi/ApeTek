import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { clipboardPayload } from '../src/core/clipboard.js';

let browser: Browser;

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('full and image-only selected copies keep proportional headings and padded math from a detached snapshot', async () => {
  const page = await browser.newPage();
  try {
    const results = await page.evaluate(async (functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const ratios = [32 / 15, 21 / 15, 18 / 15, 1, 0.83, 0.67];
      const results = [];
      for (const scale of [100, 137]) {
        for (const [index, ratio] of ratios.entries()) {
          const width = Math.ceil(48 * ratio * scale / 100);
          const tightHeight = Math.ceil(24 * ratio * scale / 100);
          const copyHeight = tightHeight * 2;
          const descent = copyHeight / 2;
          const sources = [];
          for (const height of [tightHeight, copyHeight]) {
            const canvas = document.createElement('canvas');
            canvas.width = width * 3;
            canvas.height = height * 3;
            const context = canvas.getContext('2d')!;
            context.fillStyle = '#17212b';
            context.fillRect(6, 6, canvas.width - 12, tightHeight * 3 - 12);
            sources.push(canvas.toDataURL('image/png'));
          }
          const [tight, padded] = sources;
          const root = document.createElement('article');
          root.innerHTML = `<p>Outside before</p><h${index + 1} style="font-size:${ratio}em">Heading <strong><img src="${tight}" alt="x_i" width="${width}" height="${tightHeight}" style="vertical-align:-4px" data-copy-src="${padded}" data-copy-height="${copyHeight}" data-copy-descent="${descent}"></strong> tail</h${index + 1}><p>Outside after</p>`;
          const original = root.outerHTML;
          const equation = root.querySelector('img')!;
          const selected = document.createRange();
          selected.selectNode(equation);
          const full = make(root), partial = make(root, selected);
          const copies = [];
          for (const payload of [full, partial]) {
            const copy = document.createElement('div');
            copy.innerHTML = payload.html;
            const heading = copy.querySelector(`h${index + 1}`) as HTMLElement;
            const image = heading.querySelector('img')!;
            const raster = new Image();
            raster.src = image.src;
            await raster.decode();
            copies.push({
              fontSize: heading.style.fontSize,
              source: image.getAttribute('src'), width: Number(image.getAttribute('width')),
              height: Number(image.getAttribute('height')), cssHeight: image.style.height,
              verticalAlign: image.style.verticalAlign, align: image.getAttribute('align'),
              raster: [raster.naturalWidth, raster.naturalHeight], text: payload.text,
              hasTransportAttributes: /data-copy-/.test(payload.html),
            });
          }
          results.push({ level: index + 1, scale, ratio, width, copyHeight, descent, padded,
            detached: !root.isConnected, sourceUnchanged: root.outerHTML === original, copies });
        }
      }
      return results;
    }, clipboardPayload.toString());
    for (const result of results) {
      assert.equal(result.detached, true);
      assert.equal(result.sourceUnchanged, true);
      for (const copy of result.copies) {
        assert.match(copy.fontSize, /pt$/, `H${result.level} at ${result.scale}% uses a portable explicit heading size`);
        assert.ok(Math.abs(Number.parseFloat(copy.fontSize) - 12 * result.ratio) < 0.001,
          `H${result.level} preserves its heading/body text proportion at ${result.scale}%`);
        assert.equal(copy.source, result.padded);
        assert.equal(copy.width, result.width);
        assert.equal(copy.height, result.copyHeight);
        assert.equal(copy.cssHeight, `${result.copyHeight}px`);
        assert.equal(copy.verticalAlign, `-${result.descent}px`);
        assert.equal(copy.align, 'middle');
        assert.deepEqual(copy.raster, [result.width * 3, result.copyHeight * 3]);
        assert.equal(copy.hasTransportAttributes, false);
      }
      assert.equal(result.copies[1].text, 'x_i');
      assert.match(result.copies[0].text, /Outside before/);
      assert.doesNotMatch(result.copies[1].text, /Heading|tail|Outside/);
    }
  } finally { await page.close(); }
});

test('standalone headings keep existing copy defaults and unrelated font units remain unchanged', async () => {
  const page = await browser.newPage();
  try {
    const sizes = await page.evaluate((functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const root = document.createElement('article');
      root.innerHTML = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6><h2 style="font-size:2rem">Root relative</h2><h2 style="font-size:28px">Pixels</h2><p style="font-size:2em">Body</p>';
      const copy = document.createElement('div');
      copy.innerHTML = make(root).html;
      return [...copy.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,p')].map(element => element.style.fontSize);
    }, clipboardPayload.toString());
    assert.deepEqual(sizes, ['24pt', '18pt', '15pt', '13pt', '12pt', '11pt', '2rem', '28px', '2em']);
  } finally { await page.close(); }
});
