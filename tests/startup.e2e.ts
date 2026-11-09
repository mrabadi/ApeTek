import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { OpenDialogReturnValue } from 'electron';
import type { ElectronApplication, Page } from 'playwright';
import { closeApp, launchApp } from './helpers';

async function ready(page: Page) {
  await page.waitForFunction(() => !document.querySelector<HTMLButtonElement>('[aria-label="New document"]')!.disabled && document.querySelector('[data-render-state="ready"]'));
}

async function closeNormally(app: ElectronApplication) {
  const closed = app.waitForEvent('close');
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/renderer/index.html'))!.close());
  await closed;
}

test('a fresh profile opens a blank clean document without the built-in demonstration', async () => {
  const { app, page } = await launchApp();
  try {
    await ready(page);
    assert.equal((await page.getByRole('textbox', { name: 'Markdown source' }).innerText()).trim(), '');
    assert.equal((await page.locator('.document').innerText()).trim(), '');
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    await page.screenshot({ path: 'test-results/startup-blank.png' });
  } finally { await closeApp(app); }
});

test('the last accepted file reopens from disk after normal close and Save As updates it', async () => {
  const first = await launchApp();
  let { app, page } = first;
  const original = path.join(first.userData, 'original.md');
  const savedAs = path.join(first.userData, 'renamed.md');
  try {
    await ready(page);
    await writeFile(original, '# Original document');
    await app.evaluate(({ dialog }, filePath) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] }); }, original);
    await page.getByRole('button', { name: 'Open Markdown', exact: true }).click();
    await page.waitForFunction(filePath => document.querySelector('.file-name')?.getAttribute('title') === filePath, original);
    await closeNormally(app);
    await writeFile(original, '# Changed on disk');
    ({ app, page } = await launchApp({ userData: first.userData }));
    await ready(page);
    assert.equal(await page.locator('.file-name').getAttribute('title'), original);
    assert.equal(await page.locator('.cm-content').textContent(), '# Changed on disk');
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');

    await app.evaluate(({ dialog }, filePath) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath }); }, savedAs);
    await page.getByRole('button', { name: 'Save Markdown as', exact: true }).click();
    await page.waitForFunction(filePath => document.querySelector('.file-name')?.getAttribute('title') === filePath, savedAs);
    await closeNormally(app);
    assert.equal(await readFile(savedAs, 'utf8'), '# Changed on disk');
    await writeFile(savedAs, '');
    ({ app, page } = await launchApp({ userData: first.userData }));
    await ready(page);
    assert.equal(await page.locator('.file-name').getAttribute('title'), savedAs);
    assert.equal(await page.locator('.cm-content').textContent(), '');
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    await page.screenshot({ path: 'test-results/startup-last-file.png' });
  } finally { await closeApp(app); }
});

test('an explicit startup file overrides the remembered file while dirty recovery remains first', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'apetek-startup-priority-'));
  const original = path.join(userData, 'original.md'), explicit = path.join(userData, 'explicit.md');
  await writeFile(original, '# Remembered document');
  await writeFile(explicit, '# Explicit document');
  let { app, page } = await launchApp({ userData, extraArgs: [original] });
  try {
    await ready(page);
    assert.equal(await page.locator('.file-name').getAttribute('title'), original);
    await closeNormally(app);
    ({ app, page } = await launchApp({ userData, extraArgs: [explicit] }));
    await ready(page);
    assert.equal(await page.locator('.cm-content').textContent(), '# Explicit document');
    await closeNormally(app);
    ({ app, page } = await launchApp({ userData }));
    await ready(page);
    assert.equal(await page.locator('.file-name').getAttribute('title'), explicit);
    await closeNormally(app);
    await mkdir(path.join(userData, 'recovery'), { recursive: true });
    await writeFile(path.join(userData, 'recovery/recovery.json'), JSON.stringify({ path: null, content: '# Unsaved recovery wins', dirty: true }));
    ({ app, page } = await launchApp({ userData, extraArgs: [original] }));
    await ready(page);
    assert.equal(await page.locator('.cm-content').textContent(), '# Unsaved recovery wins');
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'true');
    assert.equal(await readFile(original, 'utf8'), '# Remembered document');
    assert.equal(await readFile(explicit, 'utf8'), '# Explicit document');
  } finally { await closeApp(app); }
});

test('a missing remembered file opens an editable clean blank document without an error', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'apetek-startup-missing-'));
  await writeFile(path.join(userData, 'last-document.json'), JSON.stringify({ path: path.join(userData, 'deleted.md') }));
  const { app, page } = await launchApp({ userData });
  try {
    await ready(page);
    assert.equal(await page.getByRole('textbox', { name: 'Markdown source' }).isEditable(), true);
    assert.equal((await page.locator('.cm-content').textContent())?.trim(), '');
    assert.equal(await page.locator('.file-name').getAttribute('title'), 'Untitled.md');
    assert.equal(await page.locator('.file-name').getAttribute('data-dirty'), 'false');
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
  } finally { await closeApp(app); }
});

test('cancelling a pending guarded Open or Save As keeps the accepted file for next launch', async () => {
  const userData = await mkdtemp(path.join(tmpdir(), 'apetek-startup-cancel-'));
  const accepted = path.join(userData, 'accepted.md'), rejected = path.join(userData, 'rejected.md');
  await writeFile(accepted, '# Accepted document'); await writeFile(rejected, '# Rejected document');
  let { app, page } = await launchApp({ userData, extraArgs: [accepted] });
  try {
    await ready(page);
    await app.evaluate(({ dialog }) => { dialog.showSaveDialog = async () => ({ canceled: true, filePath: '' }); });
    await page.getByRole('button', { name: 'Save Markdown as', exact: true }).click();
    await app.evaluate(({ dialog, BrowserWindow }) => {
      dialog.showOpenDialog = async () => new Promise<OpenDialogReturnValue>(resolve => {
        Object.assign(globalThis, { completeStartupOpen: resolve });
        void BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/renderer/index.html'))!.webContents.executeJavaScript('document.documentElement.dataset.openPending = "1"');
      });
      dialog.showMessageBox = async () => {
        void BrowserWindow.getAllWindows().find(window => window.webContents.getURL().includes('/renderer/index.html'))!.webContents.executeJavaScript('document.documentElement.dataset.guardCancelled = "1"');
        return { response: 2, checkboxChecked: false };
      };
    });
    await page.getByRole('button', { name: 'Open Markdown', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.openPending === '1');
    await page.getByRole('textbox', { name: 'Markdown source' }).fill('# Later unsaved edit');
    await app.evaluate((_electron, filePath) => (globalThis as unknown as { completeStartupOpen: (value: OpenDialogReturnValue) => void }).completeStartupOpen({ canceled: false, filePaths: [filePath] }), rejected);
    await page.waitForFunction(() => document.documentElement.dataset.guardCancelled === '1');
    assert.equal(await page.locator('.file-name').getAttribute('title'), accepted);
    assert.equal(await page.locator('.cm-content').textContent(), '# Later unsaved edit');
    await app.evaluate(({ dialog }) => { dialog.showMessageBox = async () => ({ response: 1, checkboxChecked: false }); });
    await closeNormally(app);
    ({ app, page } = await launchApp({ userData }));
    await ready(page);
    assert.equal(await page.locator('.file-name').getAttribute('title'), accepted);
    assert.equal(await page.locator('.cm-content').textContent(), '# Accepted document');
  } finally { await closeApp(app); }
});
