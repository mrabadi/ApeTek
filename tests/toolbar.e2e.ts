import assert from 'node:assert/strict';
import test from 'node:test';
import { closeApp, launchApp } from './helpers';
import { setSlider } from './ui-sliders';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('one compact toolbar keeps branding and every document control on the same row at 880px', async () => {
  const { app, page } = await launchApp();
  try {
    await page.getByRole('button', { name: 'Document settings', exact: true }).waitFor();
    const rows = await page.evaluate(() => {
      const elements = [document.querySelector('.brand')!, ...document.querySelectorAll('.toolbar button,.toolbar select')];
      return elements.map(element => { const bounds = element.getBoundingClientRect(); return bounds.top + bounds.height / 2; });
    });
    assert.ok(Math.max(...rows) - Math.min(...rows) < 5, 'Brand and controls must share one toolbar row.');
    assert.equal(await page.getByText('LATEX FOR APES', { exact: true }).count(), 1);
    await page.setViewportSize({ width: 880, height: 720 });
    const bounds = await page.evaluate(() => [...document.querySelectorAll('.toolbar .brand,.toolbar button,.toolbar select,.toolbar .file-name')].map(element => {
      const bounds = element.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom, width: bounds.width };
    }));
    assert.ok(bounds.every(bounds => bounds.left >= 0 && bounds.right <= 880 && bounds.width > 0));
    assert.ok(bounds.every(item => Math.abs((item.top + item.bottom) / 2 - (bounds[0].top + bounds[0].bottom) / 2) < 5));
    await page.screenshot({ path: 'test-results/toolbar-880.png' });
  } finally { await closeApp(app); }
});

test('editing rendering and appearance changes never copy automatically; explicit button and preview copy do', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ ipcMain }) => {
      const calls: unknown[] = []; Object.assign(globalThis, { copyCalls: calls });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', (_event, payload) => { calls.push(payload); });
    });
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Explicit copy only\n\nEditable prose with $x^2$.');
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"][data-render-state="ready"] h1')?.textContent === 'Explicit copy only');
    assert.equal(await app.evaluate(() => (globalThis as unknown as { copyCalls: unknown[] }).copyCalls.length), 0);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await page.getByLabel('Display equation blocks').selectOption('center');
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"]')?.getAttribute('data-render-state') === 'ready');
    assert.equal(await app.evaluate(() => (globalThis as unknown as { copyCalls: unknown[] }).copyCalls.length), 0);
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-copy-state="copied"]').waitFor();
    assert.equal(await app.evaluate(() => (globalThis as unknown as { copyCalls: unknown[] }).copyCalls.length), 1);
    await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('.document p')!);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Copied selected passage'));
    assert.equal(await app.evaluate(() => (globalThis as unknown as { copyCalls: unknown[] }).copyCalls.length), 2);
  } finally { await closeApp(app); }
});

test('math and prose settings use continuous sliders with precise keyboard and wheel adjustments', async () => {
  const { app, page } = await launchApp();
  try {
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    const math = page.getByLabel('LaTeX size');
    assert.equal(await math.getAttribute('type'), 'range');
    assert.equal(await math.getAttribute('min'), '50');
    assert.equal(await math.getAttribute('max'), '200');
    await math.focus(); await math.press('Home'); await math.press('ArrowRight');
    assert.equal(await math.inputValue(), '51');
    await math.hover(); await page.mouse.wheel(0, -120);
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[aria-label="LaTeX size"]')!.value === '52');
    const track = (await math.boundingBox())!;
    await page.mouse.move(track.x + 11, track.y + track.height / 2);
    await page.mouse.down();
    await page.mouse.move(track.x + track.width * 0.65, track.y + track.height / 2, { steps: 5 });
    await page.mouse.up();
    const dragged = Number(await math.inputValue());
    assert.ok(dragged > 120 && dragged < 170, 'Dragging the native slider must update its value.');
    assert.equal(await page.locator('output[for="math-scale"]').innerText(), `${dragged}%`);
    assert.equal(await page.getByLabel('Line spacing', { exact: true }).inputValue(), '1');
    assert.equal(await page.getByLabel('Paragraph spacing').inputValue(), '13');
  } finally { await closeApp(app); }
});

test('precise math and prose spacing settings reach the newest copy and PDF while saved Markdown stays clean', async () => {
  const { app, page, userData } = await launchApp();
  try {
    const source = '# Spacing proof\n\nParagraph one with $x^2$.\n\nParagraph two remains editable.\n\n- A list item\n\n| Column | Value |\n|---|---|\n| First | Second |\n\n```python\nprint("unchanged")\n```';
    const destination = path.join(userData, 'spacing.md');
    await app.evaluate(({ dialog, ipcMain }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', (_event, payload) => { Object.assign(globalThis, { spacingCopy: payload.html }); });
    }, destination);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Spacing proof');
    const typography = await page.locator('.document').evaluate(article => ['h1', 'pre code'].map(selector => getComputedStyle(article.querySelector(selector)!).fontSize));
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('LaTeX size'), 137);
    await setSlider(page.getByLabel('Line spacing', { exact: true }), 1.65);
    await setSlider(page.getByLabel('Paragraph spacing'), 24);
    assert.equal(await page.locator('output[for="math-scale"]').innerText(), '137%');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-copy-state="copied"]').waitFor();
    const html = await app.evaluate(() => (globalThis as unknown as { spacingCopy: string }).spacingCopy);
    const prose = await page.evaluate(value => [...new DOMParser().parseFromString(value, 'text/html').querySelectorAll<HTMLElement>('p,li,td,th')].map(element => ({
      tag: element.tagName, lineHeight: element.style.lineHeight, marginBottom: element.style.marginBottom,
    })), html);
    assert.ok(prose.length >= 7);
    assert.ok(prose.every(element => element.lineHeight === (element.tag === 'LI' ? '1' : '1.65')), 'Copy must contain the newest prose spacing and independent bullet line spacing.');
    assert.ok(prose.filter(element => element.tag === 'P').every(element => element.marginBottom === '24px'));
    const previewStyle = await page.locator('.document p').first().evaluate(element => ({ lineHeight: getComputedStyle(element).lineHeight, marginBottom: getComputedStyle(element).marginBottom }));
    assert.equal(previewStyle.lineHeight, '24.75px');
    assert.equal(previewStyle.marginBottom, '24px');
    assert.deepEqual(await page.locator('.document').evaluate(article => ['h1', 'pre code'].map(selector => getComputedStyle(article.querySelector(selector)!).fontSize)), typography);
    const pdf = path.resolve('test-results/preferences-spaced137.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, pdf);
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const { stdout } = await promisify(execFile)('/usr/bin/pdftotext', [pdf, '-']);
    assert.match(stdout, /Paragraph two remains editable/);
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    assert.equal(await readFile(destination, 'utf8'), source);
    await page.screenshot({ path: 'test-results/preferences-spaced137.png' });
  } finally { await closeApp(app); }
});

test('rapid slider changes coalesce obsolete image work while immediate copy awaits the final precise size', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ ipcMain, nativeImage, BrowserWindow }) => {
      BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/index.html'))!.webContents.setBackgroundThrottling(false);
      const calls: { fontSize: number }[] = [];
      const src = nativeImage.createFromBitmap(Buffer.alloc(12 * 12 * 4), { width: 12, height: 12 }).toDataURL();
      Object.assign(globalThis, { sliderAssetCalls: calls });
      ipcMain.removeHandler('desktop:renderAsset');
      ipcMain.handle('desktop:renderAsset', async (_event, request) => {
        calls.push(request); await new Promise(resolve => setTimeout(resolve, 20));
        return { src, width: request.fontSize, height: 4, descent: 0 };
      });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', (_event, payload) => { Object.assign(globalThis, { sliderCopy: payload.html }); });
    });
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Coalescing proof\n\n$x$ $y$ $z$ $a$ $b$');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Coalescing proof');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await app.evaluate(() => { (globalThis as unknown as { sliderAssetCalls: unknown[] }).sliderAssetCalls.length = 0; });
    await page.getByLabel('LaTeX size').evaluate(async element => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      for (let value = 120; value <= 137; value++) {
        setter.call(element, String(value)); element.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 5));
      }
    });
    assert.equal(await page.getByLabel('LaTeX size').inputValue(), '137');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-copy-state="copied"]').waitFor();
    const result = await app.evaluate(() => ({
      calls: (globalThis as unknown as { sliderAssetCalls: { fontSize: number }[] }).sliderAssetCalls,
      html: (globalThis as unknown as { sliderCopy: string }).sliderCopy,
    }));
    assert.equal(result.calls.length, 5, 'Only the final document should request its five equation images.');
    assert.ok(result.calls.every(call => Math.abs(call.fontSize - 12.75 * 1.37) < 1e-8));
    const width = await page.evaluate(html => Number(new DOMParser().parseFromString(html, 'text/html').querySelector('img')!.getAttribute('width')), result.html);
    assert.ok(Math.abs(width - 12.75 * 1.37) < 1e-8);
    assert.doesNotMatch(await page.locator('footer').innerText(), /AbortError/);
  } finally { await closeApp(app); }
});

test('Independent bullet line and between-bullet spacing reach newest copy and PDF and survive restart without changing Markdown', async () => {
  const first = await launchApp();
  let app = first.app, page = first.page;
  try {
    page.setDefaultTimeout(6000);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    assert.equal(await page.getByLabel('Between bullets').count(), 1);
    assert.equal(await page.getByLabel('Bullet line spacing').inputValue(), '1');
    const spacing = page.getByLabel('Between bullets');
    assert.equal(await spacing.getAttribute('type'), 'range');
    assert.equal(await spacing.getAttribute('min'), '0');
    assert.equal(await spacing.getAttribute('max'), '40');
    assert.equal(await spacing.inputValue(), '8');
    await spacing.focus(); await spacing.press('Home'); await spacing.press('ArrowRight');
    assert.equal(await spacing.inputValue(), '1');
    await spacing.hover(); await page.mouse.wheel(0, -120);
    await page.waitForFunction(() => document.querySelector<HTMLInputElement>('[aria-label="Between bullets"]')!.value === '2');
    await setSlider(spacing, 8); await setSlider(page.getByLabel('Line spacing', { exact: true }), 2); await page.keyboard.press('Escape');
    const source = '# Bullet proof\n\n- Alpha item\n- Beta item\n\nUnchanged editable body.';
    const destination = path.join(first.userData, 'bullet-proof.md');
    await app.evaluate(({ dialog, ipcMain }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', (_event, payload) => { Object.assign(globalThis, { bulletCopy: payload.html }); });
    }, destination);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Bullet proof');
    assert.deepEqual(await page.locator('.document li').evaluateAll(items => items.map(item => getComputedStyle(item).marginTop)), ['0px', '8px']);
    assert.deepEqual(await page.locator('.document li').evaluateAll(items => items.map(item => getComputedStyle(item).lineHeight)), ['15px', '15px']);
    const defaultPdf = path.resolve('test-results/bullet-spacing8.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, defaultPdf);
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const { stdout: defaultBounds } = await promisify(execFile)('/usr/bin/pdftotext', ['-bbox', defaultPdf, '-']);
    const defaultAlpha = Number(defaultBounds.match(/yMin="([\d.]+)"[^>]*>Alpha<\//)![1]);
    const defaultBeta = Number(defaultBounds.match(/yMin="([\d.]+)"[^>]*>Beta<\//)![1]);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('Between bullets'), 12); await page.keyboard.press('Escape');
    const pdf = path.resolve('test-results/bullet-spacing12.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, pdf);
    // Export immediately after the setting, without waiting for preview readiness.
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const { stdout: bounds } = await promisify(execFile)('/usr/bin/pdftotext', ['-bbox', pdf, '-']);
    const alpha = Number(bounds.match(/yMin="([\d.]+)"[^>]*>Alpha<\//)![1]);
    const beta = Number(bounds.match(/yMin="([\d.]+)"[^>]*>Beta<\//)![1]);
    assert.ok(Math.abs((beta - alpha) - (defaultBeta - defaultAlpha) - 3) < 1, 'PDF must contain the newly selected 12px gap instead of the former 8px gap.');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('Bullet line spacing'), 1.5);
    await setSlider(page.getByLabel('Between bullets'), 11); await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-copy-state="copied"]').waitFor();
    const html = await app.evaluate(() => (globalThis as unknown as { bulletCopy: string }).bulletCopy);
    assert.deepEqual(await page.evaluate(value => [...new DOMParser().parseFromString(value, 'text/html').querySelectorAll<HTMLElement>('li')].map(item => item.style.marginTop), html), ['0px', '11px']);
    assert.deepEqual(await page.evaluate(value => [...new DOMParser().parseFromString(value, 'text/html').querySelectorAll<HTMLElement>('li')].map(item => item.style.lineHeight), html), ['1.5', '1.5']);
    assert.deepEqual(await page.locator('.document li').evaluateAll(items => items.map(item => getComputedStyle(item).marginTop)), ['0px', '11px']);
    assert.deepEqual(await page.locator('.document li').evaluateAll(items => items.map(item => getComputedStyle(item).lineHeight)), ['22.5px', '22.5px']);
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    assert.equal(await readFile(destination, 'utf8'), source);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('Between bullets'), 12); await page.keyboard.press('Escape');
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('apetek.preferences.v2')!).bulletSpacing === 12);
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/index.html'))!.close());
    await closed;
    ({ app, page } = await launchApp({ userData: first.userData }));
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    assert.equal(await page.getByLabel('Between bullets').inputValue(), '12');
    assert.equal(await page.getByLabel('Bullet line spacing').inputValue(), '1.5');
    assert.equal(await page.locator('output[for="bullet-spacing"]').innerText(), '12px');
    await page.screenshot({ path: 'test-results/bullet-spacing-settings.png' });
    await page.setViewportSize({ width: 880, height: 600 });
    const dialog = (await page.getByRole('dialog', { name: 'Document appearance' }).boundingBox())!;
    assert.ok(dialog.y >= 0 && dialog.y + dialog.height < 600, 'All Settings controls must fit the minimum window height.');
    await page.screenshot({ path: 'test-results/bullet-spacing-settings-880x600.png' });
  } finally { await closeApp(app); }
});
