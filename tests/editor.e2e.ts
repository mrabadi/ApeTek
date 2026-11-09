import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closeApp, launchApp } from './helpers';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

test('editing Markdown updates a semantic preview with equation images and highlighted code', async () => {
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(3000);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Preview proof\n\nEditable **text** with $x_i^2$.\n\n| Item | Value |\n|---|---|\n| Energy | $mc^2$ |\n\n```python\nprint("hello")\n```');
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"] h1')?.textContent === 'Preview proof');
    const result = await page.locator('[data-testid="preview"]').evaluate((preview) => ({
      text: preview.textContent, images: preview.querySelectorAll('img[src^="data:image/png;base64,"]').length,
      table: preview.querySelectorAll('table').length, code: preview.querySelectorAll('pre code span[style]').length,
      formulaMarkup: preview.querySelectorAll('.katex,math').length,
    }));
    assert.equal(result.images, 2);
    assert.equal(result.table, 1);
    assert.ok(result.code > 0);
    assert.equal(result.formulaMarkup, 0);
    assert.match(result.text!, /Editable text/);
  } finally { await closeApp(app); }
});

test('Save preserves Markdown and cancelling Open preserves unsaved work', async () => {
  const { app, page, userData } = await launchApp();
  try {
    page.setDefaultTimeout(2500);
    const destination = path.join(userData, 'notes.md');
    const other = path.join(userData, 'other.md');
    await writeFile(other, '# Other document\n');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
    const markdown = '# Saved notes\n\nUnicode π and $x^2$.\n';
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(markdown);
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    assert.equal(await readFile(destination, 'utf8'), markdown);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Unsaved work');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, other);
    await page.getByRole('button', { name: 'Open Markdown', exact: true }).click();
    assert.match(await page.locator('.cm-content').innerText(), /Unsaved work/);
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await page.getByRole('button', { name: 'Open Markdown', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent?.includes('Other document'));
  } finally {
    await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
    await app.close().catch(() => {});
  }
});

test('Copy rendered copies the newest completed document with embedded equations', async () => {
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(2500);
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Latest copy\n\nA fresh equation $z^3$.');
    await page.getByRole('button', { name: 'Copy rendered' }).click();
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const html = await app.evaluate(async ({ clipboard }) => {
      const item = (await clipboard.read())[0]; return (await item.getType('text/html')).text();
    });
    assert.match(html, /Latest copy/);
    assert.match(html, /data:image\/png;base64,/);
    assert.doesNotMatch(html, /A little clarity/);
    assert.doesNotMatch(html, /data-line=/);
  } finally { await closeApp(app); }
});

test('Ctrl+C in the preview copies only the selected rich passage with portable math', async () => {
  const { app, page } = await launchApp();
  try {
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Unselected heading\n\nSelected **bold** and $x_i$.\n\nNot selected.');
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"][data-render-state="ready"] strong')?.textContent === 'bold');
    await page.evaluate(() => {
      const paragraph = document.querySelector('[data-testid="preview"] p')!;
      const range = document.createRange(); range.selectNodeContents(paragraph);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await page.keyboard.press('Control+c');
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const html = await app.evaluate(async ({ clipboard }) => {
      const item = (await clipboard.read())[0]; return (await item.getType('text/html')).text();
    });
    assert.match(html, /Selected/);
    assert.match(html, /<strong[^>]*>bold/);
    assert.match(html, /align="middle"/);
    assert.doesNotMatch(html, /Unselected heading|Not selected|data-line|data-copy-/);
  } finally { await closeApp(app); }
});

test('startup recovery finishes before editing or document replacement is enabled', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ ipcMain }) => {
      ipcMain.removeHandler('desktop:loadRecovery');
      ipcMain.handle('desktop:loadRecovery', () => new Promise(resolve => {
        (globalThis as unknown as { finishRecovery: (draft: unknown) => void }).finishRecovery = resolve;
      }));
    });
    await page.reload();
    const textbox = page.getByRole('textbox', { name: 'Markdown source' });
    await textbox.waitFor();
    assert.equal(await textbox.isEditable(), false);
    assert.equal(await page.getByRole('button', { name: 'New document' }).isDisabled(), true);
    await app.evaluate(() => { (globalThis as unknown as { finishRecovery: (draft: unknown) => void }).finishRecovery({ path: null, content: '# Recovered draft', dirty: true }); });
    await page.waitForFunction(() => document.querySelector('.cm-content')?.getAttribute('contenteditable') === 'true');
    assert.match(await textbox.innerText(), /Recovered draft/);
  } finally { await closeApp(app); }
});

test('PDF export waits for the latest rendered document and keeps multipage text selectable', async () => {
  const { app, page, userData } = await launchApp();
  try {
    page.setDefaultTimeout(4000);
    const destination = path.join(userData, 'report.pdf');
    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, destination);
    const source = '# PDF proof\n\nInline $x^2$ and a display equation:\n\n$$\\frac{1}{2}$$\n\n' + Array.from({ length: 80 }, (_, i) => `Paragraph ${i + 1}: Selectable prose for a multipage document. `.repeat(4)).join('\n\n');
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.getByRole('button', { name: 'Export PDF' }).click();
    await page.waitForFunction(() => document.querySelector('footer')?.textContent?.includes('Exported PDF'));
    assert.equal((await readFile(destination)).subarray(0, 5).toString(), '%PDF-');
    const { stdout } = await promisify(execFile)('/usr/bin/pdftotext', [destination, '-']);
    assert.match(stdout, /PDF proof/); assert.match(stdout, /Paragraph 80/);
    const { stdout: info } = await promisify(execFile)('/usr/bin/pdfinfo', [destination]);
    assert.match(info, /612 x 792 pts/);
  } finally { await closeApp(app); }
});

test('scrolling follows source anchors in both directions after pane resizing', async () => {
  const { app, page } = await launchApp();
  try {
    page.setDefaultTimeout(4000);
    const source = Array.from({ length: 35 }, (_, i) => `## Section ${i + 1}\n\n${'A wrapped paragraph with editable text. '.repeat(20)}\n\n$$\nx_i^2 + y_i^2 = z_i^2\n$$\n\n`).join('');
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"][data-render-state="ready"]')?.textContent?.includes('Section 35'));
    await page.locator('.cm-content').press('Control+End');
    await page.waitForFunction(() => { const p = document.querySelector('[data-testid="preview"]')!; return p.scrollTop > 100 && p.scrollHeight - p.clientHeight - p.scrollTop < 8; });
    await page.locator('[data-testid="preview"]').evaluate(element => { element.scrollTop = 0; });
    await page.waitForFunction(() => document.querySelector('.cm-scroller')!.scrollTop < 5);
    const before = await page.locator('.editor-pane').evaluate(element => element.getBoundingClientRect().width);
    await page.getByRole('separator', { name: 'Resize editor and preview' }).press('ArrowRight');
    const after = await page.locator('.editor-pane').evaluate(element => element.getBoundingClientRect().width);
    assert.ok(after > before);
    await page.locator('.cm-content').press('Control+End');
    await page.waitForFunction(() => { const p = document.querySelector('[data-testid="preview"]')!; return p.scrollHeight - p.clientHeight - p.scrollTop < 8; });
  } catch (error) {
    const metrics = await page.evaluate(() => {
      const source = document.querySelector<HTMLElement>('.cm-scroller');
      const preview = document.querySelector<HTMLElement>('[data-testid="preview"]');
      return {
        source: source && { top: source.scrollTop, max: source.scrollHeight - source.clientHeight,
          height: source.scrollHeight, viewport: source.clientHeight },
        preview: preview && { top: preview.scrollTop, max: preview.scrollHeight - preview.clientHeight,
          height: preview.scrollHeight, viewport: preview.clientHeight },
        anchors: preview?.querySelectorAll('[data-line]').length,
        focused: document.activeElement?.className,
      };
    }).catch(() => null);
    console.error('Scroll failure metrics:', JSON.stringify(metrics));
    throw error;
  } finally { await closeApp(app); }
});

test('opening another file starts a fresh undo history', async () => {
  const { app, page, userData } = await launchApp();
  try {
    const destination = path.join(userData, 'second.md');
    await writeFile(destination, '# Second document');
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Previous document edited');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, destination);
    await page.getByRole('button', { name: 'Open Markdown', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('.cm-content')?.textContent === '# Second document');
    await page.locator('.cm-content').press('Control+z');
    assert.equal(await page.locator('.cm-content').textContent(), '# Second document');
  } finally { await closeApp(app); }
});
