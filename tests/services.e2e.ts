import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import test from 'node:test';
import { closeApp, launchApp } from './helpers';

test('native save and open preserve original Markdown source, with cancel leaving files untouched', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    const destination = path.join(userData, 'notes.md');
    const source = '# Original 🌍\n\n$α + β$\n\n```ts\nconst x = 1;\n```\n';
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, destination);
    assert.equal(await page.evaluate((content) => window.desktop.saveDocument({ path: null, content }), source), destination);
    assert.equal(await readFile(destination, 'utf8'), source);
    assert.deepEqual(await page.evaluate(() => window.desktop.openDocument()), { path: destination, content: source });
    await app.evaluate(({ dialog }) => {
      dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' });
      dialog.showOpenDialog = async () => ({ canceled: true, filePaths: [] });
    });
    assert.equal(await page.evaluate(() => window.desktop.saveDocument({ path: null, content: 'cancelled' })), null);
    assert.equal(await page.evaluate(() => window.desktop.openDocument()), null);
    assert.equal(await readFile(destination, 'utf8'), source);
    assert.equal(await page.evaluate((filePath) => window.desktop.saveDocument({ path: filePath, content: 'saved directly' }), destination), destination);
    assert.equal(await readFile(destination, 'utf8'), 'saved directly');
    assert.equal(await page.evaluate((filePath) => window.desktop.saveDocument({ path: filePath, content: 'not saved', saveAs: true }), destination), null);
    assert.equal(await readFile(destination, 'utf8'), 'saved directly');
  } finally { await closeApp(app); }
});

test('desktop recovery persists drafts in the isolated profile and tolerates corrupt recovery', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    assert.equal(await page.evaluate(() => window.desktop.loadRecovery()), null);
    const draft = { path: null, content: '# Recovery 🌍\n\n$α$', dirty: true };
    await page.evaluate((value) => window.desktop.persistRecovery(value), draft);
    assert.deepEqual(await page.evaluate(() => window.desktop.loadRecovery()), draft);
    await writeFile(path.join(userData, 'recovery', 'recovery.json'), '{ invalid');
    assert.equal(await page.evaluate(() => window.desktop.loadRecovery()), null);
    await page.evaluate((value) => window.desktop.persistRecovery(value), draft);
    await page.evaluate(() => window.desktop.discardRecovery());
    await page.evaluate(() => window.desktop.discardRecovery());
    assert.equal(await page.evaluate(() => window.desktop.loadRecovery()), null);
  } finally { await closeApp(app); }
});

test('desktop image resolution embeds local PNGs and rejects unsafe image sources', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    await writeFile(path.join(userData, 'image.png'), Buffer.from(png, 'base64'));
    assert.equal(await page.evaluate((documentPath) => window.desktop.readImage('image.png', documentPath),
      path.join(userData, 'notes.md')), `data:image/png;base64,${png}`);
    assert.equal(await page.evaluate(() => window.desktop.readImage('javascript:alert(1)', null)), null);
    assert.equal(await page.evaluate(() => window.desktop.readImage('https://example.com/picture.png', null)), null);
  } finally { await closeApp(app); }
});

test('PDF export writes a paginated PDF with readable prose and embedded PNG images', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    const destination = path.join(userData, 'export.pdf');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, destination);
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const html = `<h1>PDF export proof</h1><p>Selectable prose survives export.</p><img src="data:image/png;base64,${png}" width="12" height="12" alt="equation">` +
      Array.from({ length: 100 }, (_, index) => `<p>Paragraph ${index + 1} continues the printable document.</p>`).join('');
    assert.equal(await page.evaluate((payload) => window.desktop.exportPdf(payload), { html, pageSize: 'A4' as const }), destination);
    const pdf = await readFile(destination);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.match(pdf.toString('latin1'), /\/Subtype \/Image/);
    assert.match(pdf.toString('latin1'), /\/Count [2-9]/);
    const { execFile } = await import('node:child_process');
    const { promisify } = await import('node:util');
    const text = await promisify(execFile)('pdftotext', [destination, '-']);
    assert.match(text.stdout, /PDF export proof/);
    assert.match(text.stdout, /Selectable prose survives export/);
    assert.match(text.stdout, /Paragraph 100 continues/);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    assert.equal(await page.evaluate(() => window.desktop.exportPdf({ html: '<p>cancelled</p>', pageSize: 'Letter' })), null);
  } finally { await closeApp(app); }
});

test('discard confirmation exposes Save, Discard and Cancel choices', async () => {
  const { app, page } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    for (const [response, expected] of ['save', 'discard', 'cancel'].entries()) {
      await app.evaluate(({ dialog }, chosen) => {
        dialog.showMessageBox = async () => ({ response: chosen, checkboxChecked: false });
      }, response);
      assert.equal(await page.evaluate(() => window.desktop.confirmDiscard()), expected);
    }
  } finally { await closeApp(app); }
});

test('dirty native close routes through the document guard and explicit close quits hidden windows', async () => {
  const { app, page } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 2, checkboxChecked: false }); });
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Unsaved native-close proof');
    await page.locator('.file-name[data-dirty="true"]').waitFor();
    await page.evaluate(async () => {
      const actions: string[] = [];
      (window as unknown as { serviceActions: string[] }).serviceActions = actions;
      window.desktop.onAction((action) => actions.push(action));
      window.desktop.setDocumentState({ path: '/tmp/notes.md', dirty: true });
      await window.desktop.confirmDiscard();
    });
    const title = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('/index.html'))!.getTitle());
    assert.match(title, /\*.*notes\.md/);
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('/index.html'))!.close());
    await page.waitForFunction(() => (window as unknown as { serviceActions: string[] }).serviceActions.includes('close'));
    assert.equal(page.isClosed(), false);
    const closed = app.waitForEvent('close');
    await page.evaluate(() => window.desktop.close()).catch(() => undefined);
    await closed;
  } finally { await closeApp(app); }
});

test('File menu exposes local editor accelerators and routes Save to the document action', async () => {
  const { app, page } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await page.evaluate(() => {
      const actions: string[] = [];
      (window as unknown as { serviceActions: string[] }).serviceActions = actions;
      window.desktop.onAction((action) => actions.push(action));
    });
    const items = await app.evaluate(({ Menu }) => ['file-new', 'file-open', 'file-save', 'file-save-as', 'file-pdf', 'file-close']
      .map((id) => { const item = Menu.getApplicationMenu()?.getMenuItemById(id); return item ? { id, accelerator: item.accelerator } : null; }));
    assert.deepEqual(items, [
      { id: 'file-new', accelerator: 'Ctrl+N' }, { id: 'file-open', accelerator: 'Ctrl+O' },
      { id: 'file-save', accelerator: 'Ctrl+S' }, { id: 'file-save-as', accelerator: 'Ctrl+Shift+S' },
      { id: 'file-pdf', accelerator: 'Ctrl+Shift+P' }, { id: 'file-close', accelerator: 'Ctrl+W' },
    ]);
    await app.evaluate(({ Menu, BrowserWindow }) => {
      const item = Menu.getApplicationMenu()!.getMenuItemById('file-save')!;
      item.click(item, BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/index.html')),
        {} as Electron.KeyboardEvent);
    });
    await page.waitForFunction(() => (window as unknown as { serviceActions: string[] }).serviceActions.includes('save'));
  } finally { await closeApp(app); }
});

test('recovery operations preserve request order so discard cannot be undone by an earlier write', async () => {
  const { app, page } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    await page.evaluate(async () => {
      const write = window.desktop.persistRecovery({ path: null, content: 'old draft '.repeat(400_000), dirty: true });
      const discard = window.desktop.discardRecovery();
      await Promise.all([write, discard]);
    });
    const remaining = await page.evaluate(() => window.desktop.loadRecovery());
    assert.equal(remaining === null, true, 'Discard must remain final after an earlier pending recovery write.');
  } finally { await closeApp(app); }
});

test('Save appends .md when the native dialog returns an extensionless filename', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    const destination = path.join(userData, 'new-notes');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, destination);
    assert.equal(await page.evaluate(() => window.desktop.saveDocument({ path: null, content: '# Saved notes' })), `${destination}.md`);
    assert.equal(await readFile(`${destination}.md`, 'utf8'), '# Saved notes');
  } finally { await closeApp(app); }
});


test('a Markdown path on the command line opens that document as a clean saved file', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'markdown-local-cli-'));
  const startup = path.join(directory, 'startup.md');
  await writeFile(startup, '# Command line document\n\nOriginal source $α$.');
  const { app, page } = await launchApp({ extraArgs: [startup] });
  page.setDefaultTimeout(5000);
  try {
    await page.getByRole('textbox', { name: 'Markdown source' }).waitFor();
    await page.evaluate(() => window.desktop.loadRecovery());
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    assert.match(await page.locator('.cm-content').innerText(), /Command line document/);
    assert.equal(await page.locator('.file-name').getAttribute('title'), startup);
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    assert.equal(await page.evaluate(() => window.desktop.loadRecovery()), null);
  } finally { await closeApp(app); }
});

test('an unsaved recovery draft takes priority over a command-line Markdown file', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'markdown-local-recovery-priority-'));
  await mkdir(path.join(userData, 'recovery'), { recursive: true });
  await writeFile(path.join(userData, 'recovery', 'recovery.json'), JSON.stringify({
    path: null, content: '# Irreplaceable unsaved draft', dirty: true,
  }));
  const startup = path.join(userData, 'startup.md');
  await writeFile(startup, '# Command line document');
  const { app, page } = await launchApp({ extraArgs: [startup], userData });
  page.setDefaultTimeout(5000);
  try {
    await page.getByRole('textbox', { name: 'Markdown source' }).waitFor();
    await page.evaluate(() => window.desktop.loadRecovery());
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    assert.match(await page.locator('.cm-content').innerText(), /Irreplaceable unsaved draft/);
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'true');
    assert.equal(await readFile(startup, 'utf8'), '# Command line document');
  } finally { await closeApp(app); }
});

test('native close of a just-saved clean document removes stale dirty recovery before quitting', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    const destination = path.join(userData, 'saved-close.md');
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
    }, destination);
    const content = '# Saved before native close';
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(content);
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    await page.evaluate(async ({ filePath, source }) => {
      window.desktop.setDocumentState({ path: filePath, dirty: false });
      await window.desktop.persistRecovery({ path: filePath, content: source, dirty: true });
    }, { filePath: destination, source: content });
    const closed = app.waitForEvent('close');
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('/index.html'))!.close());
    await closed;
    await assert.rejects(readFile(path.join(userData, 'recovery', 'recovery.json')), { code: 'ENOENT' });
    assert.equal(await readFile(destination, 'utf8'), content);
  } finally { await closeApp(app); }
});
