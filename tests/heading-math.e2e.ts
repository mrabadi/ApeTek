import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { closeApp, launchApp } from './helpers';
import { setSlider } from './ui-sliders';

test('heading math follows all six text sizes and global math scale with sharp PNGs and inline baselines', async () => {
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(10000);
    const formula = 'x_i^2';
    const source = [
      `Body $${formula}$.`,
      ...Array.from({ length: 6 }, (_, index) => `${'#'.repeat(index + 1)} H${index + 1} $${formula}$`),
      `## H2 duplicate $${formula}$`,
      `## H2 nested **$${formula}$**`,
    ].join('\n\n');
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"][data-render-state="ready"] h1 img') !== null
      && document.querySelectorAll('.document img').length === 9);

    let unscaledWidths: number[] = [];
    for (const scale of [100, 137]) {
      if (scale !== 100) {
        const previousBody = await page.locator('.document > p img').getAttribute('src');
        await page.getByRole('button', { name: 'Document settings', exact: true }).click();
        await setSlider(page.getByLabel('LaTeX size'), scale);
        await page.keyboard.press('Escape');
        await page.waitForFunction(previous => document.querySelector('[data-testid="preview"][data-render-state="ready"]') !== null
          && document.querySelector<HTMLImageElement>('.document > p img')?.src !== previous, previousBody);
      }

      const rendered = await page.evaluate(async ({ formula, scale }) => {
        const article = document.querySelector<HTMLElement>('.document')!;
        const bodySize = Number.parseFloat(getComputedStyle(article).fontSize);
        const images = Array.from(article.querySelectorAll<HTMLImageElement>('img'));
        await document.fonts.ready;
        await Promise.all(images.map(image => image.decode()));
        const contexts = [];
        for (const image of images) {
          const heading = image.closest<HTMLElement>('h1,h2,h3,h4,h5,h6');
          const fontSize = Number.parseFloat(getComputedStyle(heading ?? image.parentElement!).fontSize);
          const expected = await window.desktop.renderAsset({
            kind: 'math', source: formula, display: false,
            fontSize: 12.75 * (scale / 100) * (fontSize / bodySize),
          });
          const probe = document.createElement('span');
          probe.style.cssText = 'display:inline-block;width:0;height:0;padding:0;margin:0;border:0;vertical-align:baseline;';
          image.after(probe);
          const verticalAlign = Number.parseFloat(getComputedStyle(image).verticalAlign);
          const baselineError = image.getBoundingClientRect().bottom + verticalAlign - probe.getBoundingClientRect().top;
          probe.remove();
          contexts.push({
            label: heading?.textContent ?? 'Body', level: heading ? Number(heading.tagName.slice(1)) : 0,
            fontSize, src: image.src, width: Number(image.getAttribute('width')),
            height: Number(image.getAttribute('height')), naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight, verticalAlign, baselineError, expected,
          });
        }
        return { bodySize, contexts };
      }, { formula, scale });

      assert.equal(rendered.contexts.length, 9);
      assert.equal(rendered.bodySize, 15, 'heading math must preserve the existing body typography');
      for (const context of rendered.contexts) {
        const label = `${context.label.trim()} at ${scale}%`;
        assert.equal(context.width, context.expected.width, `${label}: equation width follows the surrounding text size`);
        assert.equal(context.height, context.expected.height, `${label}: equation height follows the surrounding text size`);
        assert.ok(context.src === context.expected.src, `${label}: preview uses a raster captured at the matching font size`);
        assert.equal(context.verticalAlign, -context.expected.descent, `${label}: preview preserves the raster's baseline metric`);
        assert.equal(context.naturalWidth, context.width * 3, `${label}: PNG width retains three-times pixel density`);
        assert.equal(context.naturalHeight, context.height * 3, `${label}: PNG height retains three-times pixel density`);
        assert.ok(Math.abs(context.baselineError) < 1, `${label}: equation shares the adjacent text baseline (${context.baselineError}px error)`);
      }

      const body = rendered.contexts[0];
      const headings = rendered.contexts.filter(context => context.level > 0);
      for (const [index, fontSize] of [32, 21, 18, 15, 12.45, 10.05].entries()) {
        assert.ok(Math.abs(headings[index].fontSize - fontSize) < 0.01, `H${index + 1} text keeps its existing font size`);
      }
      assert.notEqual(headings[0].src, body.src, 'the same formula in H1 must use a larger raster than body text');
      assert.equal(headings[3].src, body.src, 'H4 and body text at the same font size reuse the same raster');
      const h2 = headings.filter(context => context.level === 2);
      assert.equal(h2.length, 3);
      assert.ok(h2.every(context => context.src === h2[0].src), 'duplicate and emphasized H2 formulas reuse the same correctly sized raster');

      if (scale === 100) unscaledWidths = rendered.contexts.map(context => context.width);
      else rendered.contexts.forEach((context, index) => {
        assert.ok(context.width > unscaledWidths[index], `${context.label.trim()}: global math scale composes with heading scale`);
      });
    }
    await page.screenshot({ path: 'test-results/heading-math137.png', fullPage: true });
    const pdfPath = path.resolve('test-results/heading-math137.pdf');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, pdfPath);
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const pdf = await readFile(pdfPath);
    assert.equal(pdf.subarray(0, 5).toString('ascii'), '%PDF-', 'heading math exports as a PDF document');
    const { stdout: info } = await promisify(execFile)('/usr/bin/pdfinfo', [pdfPath]);
    assert.match(info, /Pages:\s+[1-9]/);
    const { stdout: text } = await promisify(execFile)('/usr/bin/pdftotext', [pdfPath, '-']);
    assert.match(text, /\bBody\b/, 'body prose stays readable in the PDF');
    for (let level = 1; level <= 6; level++) {
      assert.match(text, new RegExp(`\\bH${level}\\b`), `H${level} text stays readable in the PDF`);
    }
  } finally { await closeApp(app); }
});
