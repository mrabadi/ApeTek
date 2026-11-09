import assert from 'node:assert/strict';
import test from 'node:test';
import path from 'node:path';
import { closeApp, launchApp } from './helpers';
import { setSlider } from './ui-sliders';

type DeferredCopy = { resolve: () => void; reject: (error: Error) => void };

test('copy confirmations clear after editing and appearance changes without copying again', async () => {
  const { app, page, userData } = await launchApp();
  try {
    await app.evaluate(({ ipcMain }) => {
      Object.assign(globalThis, { statusCopyCount: 0 });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', () => { (globalThis as unknown as { statusCopyCount: number }).statusCopyCount++; });
    });
    const editor = page.getByRole('textbox', { name: 'Markdown source' });
    await editor.fill('# Status proof\n\nAn editable paragraph.');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Status proof');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Copied rendered document' }).waitFor();
    await editor.press('Control+End'); await editor.press('x');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] p')?.textContent?.endsWith('x'));
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
    assert.equal(await app.evaluate(() => (globalThis as unknown as { statusCopyCount: number }).statusCopyCount), 1);

    await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('.document p')!);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await page.keyboard.press('Control+c');
    await page.getByRole('status').filter({ hasText: 'Copied selected passage' }).waitFor();
    await editor.press('Control+End'); await editor.press('y');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] p')?.textContent?.endsWith('y'));
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');

    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Copied rendered document' }).waitFor();
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('Between bullets', { exact: true }), 12);
    await page.keyboard.press('Escape');
    await page.locator('[data-render-state="ready"]').waitFor();
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
    assert.equal(await app.evaluate(() => (globalThis as unknown as { statusCopyCount: number }).statusCopyCount), 3);
    assert.equal(await page.locator('[data-copy-state="idle"]').count(), 1);

    await app.evaluate(({ dialog }, destination) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: destination }); }, path.join(userData, 'status.md'));
    await page.getByRole('button', { name: 'Save Markdown', exact: true }).click();
    await page.locator('.file-name[data-dirty="false"]').waitFor();
    await page.locator('[data-render-state="ready"]').waitFor();
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Saved Markdown');
    await page.screenshot({ path: 'test-results/copy-status-ready.png' });
  } finally { await closeApp(app); }
});

test('late copy responses cannot restore stale feedback or replace a newer copy operation', async () => {
  const { app, page } = await launchApp();
  try {
    await app.evaluate(({ ipcMain }) => {
      const requests: DeferredCopy[] = [];
      Object.assign(globalThis, { statusRequests: requests });
      ipcMain.removeHandler('desktop:copyRendered');
      ipcMain.handle('desktop:copyRendered', event => new Promise<void>((resolve, reject) => {
        requests.push({ resolve, reject });
        void event.sender.executeJavaScript(`document.documentElement.dataset.pendingCopies = "${requests.length}"`);
      }));
    });
    const editor = page.getByRole('textbox', { name: 'Markdown source' });
    await editor.fill('# Deferred copy\n\nOriginal content.');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Deferred copy');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.pendingCopies === '1');
    await editor.fill('# New revision\n\nNewer content.');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'New revision');
    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.pendingCopies === '2');
    await app.evaluate(() => (globalThis as unknown as { statusRequests: DeferredCopy[] }).statusRequests[0].resolve());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal(await page.getByTestId('copy-rendered').getAttribute('data-copy-state'), 'copying', 'An older copy must not mark the newer operation completed.');
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
    await app.evaluate(() => (globalThis as unknown as { statusRequests: DeferredCopy[] }).statusRequests[1].resolve());
    await page.getByRole('status').filter({ hasText: 'Copied rendered document' }).waitFor();

    await page.getByRole('button', { name: 'Copy rendered', exact: true }).click();
    await page.waitForFunction(() => document.documentElement.dataset.pendingCopies === '3');
    await page.getByRole('button', { name: 'Document settings', exact: true }).click();
    await setSlider(page.getByLabel('Between bullets', { exact: true }), 12);
    await page.keyboard.press('Escape');
    await page.locator('[data-render-state="ready"]').waitFor();
    await app.evaluate(() => (globalThis as unknown as { statusRequests: DeferredCopy[] }).statusRequests[2].reject(new Error('Old copy test failure')));
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
    assert.equal(await page.getByTestId('copy-rendered').getAttribute('data-copy-state'), 'idle');

    await page.evaluate(() => {
      const range = document.createRange(); range.selectNodeContents(document.querySelector('.document p')!);
      const selection = window.getSelection()!; selection.removeAllRanges(); selection.addRange(range);
    });
    await page.keyboard.press('Control+c');
    await page.waitForFunction(() => document.documentElement.dataset.pendingCopies === '4');
    await editor.fill('# Latest revision\n\nCurrent content.');
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"] h1')?.textContent === 'Latest revision');
    await app.evaluate(() => (globalThis as unknown as { statusRequests: DeferredCopy[] }).statusRequests[3].resolve());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.equal((await page.getByRole('status').innerText()).trim(), 'Ready');
    assert.equal(await page.getByTestId('copy-rendered').getAttribute('data-copy-state'), 'idle');
    assert.equal(await app.evaluate(() => (globalThis as unknown as { statusRequests: DeferredCopy[] }).statusRequests.length), 4);
  } finally { await closeApp(app); }
});
