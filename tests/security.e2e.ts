import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { closeApp, launchApp } from './helpers';

test('a Markdown web link opens externally while the editor and unsaved source remain intact', async () => {
  const { app, page } = await launchApp();
  try {
    const editorUrl = page.url();
    const destination = 'https://markdown-local.invalid/documentation';
    await app.evaluate(({ shell }) => {
      (globalThis as unknown as { openedExternal: string[] }).openedExternal = [];
      shell.openExternal = async (url) => { (globalThis as unknown as { openedExternal: string[] }).openedExternal.push(url); };
    });
    await page.route(destination, (route) => route.fulfill({
      contentType: 'text/html', body: '<h1>External fixture replaces the editor</h1>',
    }));
    const source = '# Unsaved source\n\n[Read documentation](' + destination + ')';
    await page.getByRole('textbox', { name: 'Markdown source' }).fill(source);
    await page.locator('[data-testid="preview"] a').waitFor();
    await page.getByRole('link', { name: 'Read documentation' }).click({ noWaitAfter: true });
    await page.waitForLoadState('domcontentloaded');
    assert.equal(page.url(), editorUrl, 'external Markdown links must not replace the privileged editor page');
    assert.equal((await page.locator('.cm-line').allTextContents()).join('\n'), source);
    assert.deepEqual(await app.evaluate(() => (globalThis as unknown as { openedExternal: string[] }).openedExternal), [destination]);
  } finally {
    await closeApp(app);
  }
});

test('a different renderer with the same preload cannot invoke editor privileges', async () => {
  const { app } = await launchApp();
  try {
    const result = await app.evaluate(async ({ BrowserWindow }, preload) => {
      const hostile = new BrowserWindow({ show: false, webPreferences: {
        preload, contextIsolation: true, nodeIntegration: false, sandbox: true,
      } });
      try {
        await hostile.loadURL('data:text/html,<h1>Untrusted renderer</h1>');
        return await hostile.webContents.executeJavaScript(`window.desktop.renderAsset({kind:'math',source:'x'}).then(
          () => ({ allowed: true, message: '' }),
          error => ({ allowed: false, message: error.message }))`);
      } finally {
        hostile.destroy();
      }
    }, path.join(process.cwd(), 'dist/desktop/preload.cjs')) as { allowed: boolean; message: string };
    assert.equal(result.allowed, false, 'merely loading the preload must not grant the renderer editor privileges');
    assert.match(result.message, /Untrusted IPC sender/);
  } finally {
    await closeApp(app);
  }
});

test('window.open cannot create a child window and safe popup URLs open externally', async () => {
  const { app, page } = await launchApp();
  try {
    const destination = 'https://markdown-local.invalid/popup';
    await app.context().route(destination, route => route.fulfill({ contentType: 'text/html', body: '<h1>Popup fixture</h1>' }));
    await app.evaluate(({ shell }) => {
      (globalThis as unknown as { openedExternal: string[] }).openedExternal = [];
      shell.openExternal = async url => { (globalThis as unknown as { openedExternal: string[] }).openedExternal.push(url); };
    });
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Popup security fixture');
    await page.waitForFunction(() => document.querySelector('[data-testid="preview"] h1')?.textContent === 'Popup security fixture');
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    const before = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    await page.evaluate(url => { window.open(url, '_blank'); }, destination);
    const after = await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length);
    assert.equal(after, before, 'document popups must not create additional Electron windows');
    assert.deepEqual(await app.evaluate(() => (globalThis as unknown as { openedExternal: string[] }).openedExternal), [destination]);
  } finally {
    await closeApp(app);
  }
});

test('only HTTP HTTPS and mailto URLs are handed to the external opener', async () => {
  const { app, page } = await launchApp();
  try {
    const safe = ['http://markdown-local.invalid/plain', 'https://markdown-local.invalid/secure', 'mailto:author@example.com'];
    await app.evaluate(({ shell }) => {
      (globalThis as unknown as { openedExternal: string[] }).openedExternal = [];
      shell.openExternal = async url => { (globalThis as unknown as { openedExternal: string[] }).openedExternal.push(url); };
    });
    await page.evaluate(urls => {
      for (const url of urls) window.open(url, '_blank');
    }, [...safe, 'file:///tmp/markdown-local-hostile.html', 'javascript:document.body.replaceChildren()', 'data:text/html,<h1>Hostile</h1>']);
    assert.deepEqual(await app.evaluate(() => (globalThis as unknown as { openedExternal: string[] }).openedExternal), safe);
  } finally {
    await closeApp(app);
  }
});

test('same-page anchors work and retain legitimate editor IPC access', async () => {
  const { app, page } = await launchApp();
  try {
    const editorUrl = page.url();
    await page.evaluate(() => {
      const target = document.createElement('div'); target.id = 'security-anchor';
      const link = document.createElement('a'); link.id = 'security-anchor-link'; link.href = '#security-anchor'; link.textContent = 'Same page';
      document.body.append(link, target);
    });
    await page.locator('#security-anchor-link').click({ noWaitAfter: true });
    await page.waitForURL(editorUrl + '#security-anchor');
    const result = await page.evaluate(() => window.desktop.renderAsset({ kind: 'math', source: 'x' }));
    assert.match(result.src, /^data:image\/png;base64,/);
  } finally {
    await closeApp(app);
  }
});

test('the editor renderer loses privilege if its main frame leaves the exact packaged URL', async () => {
  const { app } = await launchApp();
  try {
    const result = await app.evaluate(async ({ BrowserWindow }) => {
      const editor = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/renderer/index.html'))!;
      // Main-process loadURL bypasses will-navigate, independently testing IPC URL validation.
      await editor.loadURL('data:text/html,<h1>Unexpected main-frame URL</h1>');
      return await editor.webContents.executeJavaScript(`window.desktop.renderAsset({kind:'math',source:'x'}).then(
        () => ({ allowed: true, message: '' }),
        error => ({ allowed: false, message: error.message }))`);
    }) as { allowed: boolean; message: string };
    assert.equal(result.allowed, false);
    assert.match(result.message, /Untrusted IPC sender/);
  } finally {
    await closeApp(app);
  }
});

test('untrusted renderer send messages cannot alter editor document state', async () => {
  const { app } = await launchApp();
  try {
    const result = await app.evaluate(async ({ BrowserWindow }, preload) => {
      const editor = BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('/renderer/index.html'))!;
      const before = editor.getTitle();
      const hostile = new BrowserWindow({ show: false, webPreferences: { preload, contextIsolation: true, nodeIntegration: false, sandbox: true } });
      try {
        await hostile.loadURL('data:text/html,<h1>Untrusted sender</h1>');
        await hostile.webContents.executeJavaScript(`(async () => {
          window.desktop.setDocumentState({path:'/tmp/hostile.md',dirty:true});
          try { await window.desktop.renderAsset({kind:'math',source:'x'}); } catch { /* FIFO barrier after send. */ }
        })()`);
        return { before, after: editor.getTitle() };
      } finally {
        hostile.destroy();
      }
    }, path.join(process.cwd(), 'dist/desktop/preload.cjs')) as { before: string; after: string };
    assert.equal(result.after, result.before);
  } finally {
    await closeApp(app);
  }
});
