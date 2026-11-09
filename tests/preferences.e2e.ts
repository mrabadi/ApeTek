import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { closeApp, launchApp } from './helpers';
import { setSlider } from './ui-sliders';

test('a fresh profile defaults PDF export to Letter', async () => {
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(5000);
    await page.getByLabel('PDF page size').waitFor();
    assert.equal(await page.getByLabel('PDF page size').inputValue(), 'Letter');
  } finally { await closeApp(app); }
});

test('math settings update real PNGs, newest rich copy, and PDF without changing saved Markdown', async () => {
  const { app, page, userData } = await launchApp();
  try {
    page.setDefaultTimeout(6000);
    const source = '# Appearance proof\n\nInline $\\frac{a+b+c+d}{x+y+z}$ stays inline.\n\n$$\n\\begin{aligned}x+y&=a+b+c\\\\z&=d+e+f\\end{aligned}\n$$\n\nBody text stays editable.';
    const markdownPath = path.join(userData, 'appearance.md');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, markdownPath);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"][data-render-state="ready"] h1')?.textContent === 'Appearance proof');
    const baseline = await page.locator('.document img').evaluateAll(images => images.map(element => {
      const image = element as HTMLImageElement;
      return { src: image.src, width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')) };
    }));
    assert.equal(baseline.length, 2);
    const leftPdf = path.resolve('test-results/preferences-left100.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, leftPdf);
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const { stdout: info } = await promisify(execFile)('/usr/bin/pdfinfo', [leftPdf]);
    assert.match(info, /612 x 792 pts/);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await page.getByLabel('Display equation blocks').selectOption('center');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const centeredHtml = await app.evaluate(async ({ clipboard }) => (await (await clipboard.read())[0].getType('text/html')).text());
    assert.equal(/text-align:\s*center/.test(centeredHtml), true, 'Copy must use the newly selected centered block layout.');
    const centered = await page.locator('.document img').evaluateAll(images => images.map(image => image.getAttribute('src')));
    assert.deepEqual(centered, baseline.map(image => image.src), 'Block alignment must leave the equations themselves unchanged.');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('LaTeX size'), 150);
    await page.keyboard.press('Escape');
    // Copy immediately: no preview-ready wait may hide an obsolete render revision.
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const html = await app.evaluate(async ({ clipboard }) => (await (await clipboard.read())[0].getType('text/html')).text());
    const copied = await page.evaluate(value => [...new DOMParser().parseFromString(value, 'text/html').querySelectorAll('img')].map(image => ({
      src: image.src, width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')),
    })), html);
    const scaled = await page.locator('.document img').evaluateAll(images => images.map(element => {
      const image = element as HTMLImageElement;
      return { width: Number(image.getAttribute('width')), height: Number(image.getAttribute('height')),
        naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight };
    }));
    for (let index = 0; index < 2; index++) {
      assert.ok(scaled[index].width > baseline[index].width * 1.4);
      assert.ok(scaled[index].width < baseline[index].width * 1.55);
      assert.equal(scaled[index].naturalWidth, scaled[index].width * 3);
      assert.equal(scaled[index].naturalHeight, scaled[index].height * 3);
      assert.equal(copied[index].width, scaled[index].width);
      const png = Buffer.from(copied[index].src.split(',')[1], 'base64');
      assert.equal(png.readUInt32BE(16), copied[index].width * 3);
      assert.equal(png.readUInt32BE(20), copied[index].height * 3);
    }
    assert.equal(/text-align:\s*center/.test(html), true);
    const centerPdf = path.resolve('test-results/preferences-center150.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, centerPdf);
    await page.getByRole('button', { name: 'Export PDF', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    const { stdout: text } = await promisify(execFile)('/usr/bin/pdftotext', [centerPdf, '-']);
    assert.match(text, /Body text stays editable/);
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    assert.equal(await readFile(markdownPath, 'utf8'), source);
    await page.screenshot({ path: 'test-results/preferences-center150.png' });
  } finally { await closeApp(app); }
});

test('Document settings replaces the offline badge with compact whole-document controls', async () => {
  const { app, page } = await launchApp();
  try {
    assert.equal(await page.getByRole('button', { name: 'Document settings', exact: true }).count(), 1);
    assert.equal(await page.getByText('Local & offline', { exact: true }).count(), 0);
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    assert.equal(await page.getByLabel('Display equation blocks').inputValue(), 'left');
    assert.equal(await page.getByLabel('LaTeX size').inputValue(), '100');
    await page.keyboard.press('Escape');
    assert.equal(await page.getByLabel('LaTeX size').count(), 0);
  } finally { await closeApp(app); }
});

test('appearance and PDF preferences survive a normal restart and malformed preferences recover safely', async () => {
  const first = await launchApp();
  let app = first.app, page = first.page;
  try {
    await page.getByLabel('PDF page size').selectOption('A4');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await page.getByLabel('Display equation blocks').selectOption('center');
    await setSlider(page.getByLabel('LaTeX size'), 175);
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('apetek.preferences.v2')!).mathScale === 175);
    await page.getByRole('button', { name: 'New document', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="New document"]')!.disabled);
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/index.html'))!.close());
    await closed;
    ({ app, page } = await launchApp({ userData: first.userData }));
    assert.equal(await page.getByLabel('PDF page size').inputValue(), 'A4');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    assert.equal(await page.getByLabel('Display equation blocks').inputValue(), 'center');
    assert.equal(await page.getByLabel('LaTeX size').inputValue(), '175');
    await page.evaluate(() => localStorage.setItem('apetek.preferences.v2', '{malformed'));
    await page.reload();
    await page.getByLabel('PDF page size').waitFor();
    assert.equal(await page.getByLabel('PDF page size').inputValue(), 'Letter');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    assert.equal(await page.getByLabel('Display equation blocks').inputValue(), 'left');
    assert.equal(await page.getByLabel('LaTeX size').inputValue(), '100');
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('apetek.preferences.v2')!)), {
      pageSize: 'Letter', mathAlignment: 'left', mathScale: 100, lineSpacing: 1, paragraphSpacing: 13, bulletLineSpacing: 1, bulletSpacing: 8,
    });
    await page.screenshot({ path: 'test-results/preferences-settings.png' });
  } finally { await closeApp(app); }
});

test('dragging source text highlights the chosen range without coloring the whole line', async () => {
  const { app, page } = await launchApp();
  try {
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('Drag only these chosen words, leaving the rest clear.\nThe next line has the same clear background.');
    await page.locator('.cm-content').press('Control+Home');
    const geometry = await page.locator('.cm-line').first().evaluate(line => {
      const text = line.firstChild!;
      const range = document.createRange(); range.setStart(text, 10); range.setEnd(text, 22);
      const bounds = range.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom };
    });
    const y = (geometry.top + geometry.bottom) / 2;
    await page.mouse.move(geometry.left + 0.2, y);
    await page.mouse.down();
    await page.mouse.move(geometry.right - 0.2, y, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(() => document.querySelector('.cm-selectionBackground')!.getBoundingClientRect().width > 0);
    const selection = await page.evaluate(() => {
      const lines = [...document.querySelectorAll<HTMLElement>('.cm-line')];
      const range = window.getSelection()!.getRangeAt(0).getBoundingClientRect();
      const highlight = document.querySelector('.cm-selectionBackground')!.getBoundingClientRect();
      const first = lines[0].getBoundingClientRect();
      const second = lines[1].getBoundingClientRect();
      return { text: window.getSelection()!.toString(), width: range.width, left: range.left,
        highlight: { left: highlight.left, width: highlight.width },
        selected: { x: range.left + 2, y: highlight.top + 2 },
        outside: { x: first.right - 20, y: first.top + 2 },
        clear: { x: second.right - 20, y: second.top + 2 } };
    });
    assert.equal(selection.text, 'these chosen');
    assert.ok(Math.abs(selection.highlight.left - selection.left) < 2);
    assert.ok(Math.abs(selection.highlight.width - selection.width) < 3);
    const screenshot = await page.screenshot({ path: 'test-results/preferences-source-selection.png' });
    const pixels = await page.evaluate(async ({ png, selected, outside, clear }) => {
      const image = new Image(); image.src = `data:image/png;base64,${png}`; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const context = canvas.getContext('2d')!; context.drawImage(image, 0, 0);
      return [selected, outside, clear].map(point => [...context.getImageData(
        Math.round(point.x * image.width / window.innerWidth), Math.round(point.y * image.height / window.innerHeight), 1, 1).data]);
    }, { png: screenshot.toString('base64'), ...selection });
    assert.deepEqual(pixels[1], pixels[2], 'Text outside the selection must have the same clear background as the next line.');
    assert.notDeepEqual(pixels[0], pixels[2], 'The selected range must be visibly colored.');
  } finally { await closeApp(app); }
});
