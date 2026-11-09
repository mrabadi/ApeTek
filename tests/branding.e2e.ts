import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { closeApp, launchApp } from './helpers';

test('ApeTek branding appears in the header and native window with a loaded chimpanzee logo', async () => {
  const { app, page, userData } = await launchApp();
  page.setDefaultTimeout(5000);
  try {
    await page.locator('.brand strong').waitFor();
    assert.equal(await page.locator('.brand strong').innerText(), 'ApeTek');
    const logo = page.getByRole('img', { name: 'ApeTek chimpanzee logo' });
    await logo.waitFor();
    assert.equal(await logo.evaluate(async (element) => {
      const image = element as HTMLImageElement;
      await image.decode();
      return image.naturalWidth > 0 && image.naturalHeight > 0;
    }), true);
    assert.equal(await page.title(), 'ApeTek');
    await page.getByRole('button', { name: 'New document', exact: true }).waitFor();
    await page.evaluate(() => window.desktop.loadRecovery());
    const native = await app.evaluate(({ app: nativeApp, BrowserWindow }) => ({
      name: nativeApp.getName(), userData: nativeApp.getPath('userData'),
      title: BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().includes('/index.html'))!.getTitle(),
    }));
    assert.equal(native.name, 'ApeTek');
    assert.match(native.title, / — ApeTek$/);
    assert.equal(native.userData, userData);
    const icon = await readFile(path.resolve('dist/desktop/icon.png'));
    assert.deepEqual(icon, await readFile(path.resolve('assets/icon.png')));
    assert.equal(icon.subarray(1, 4).toString(), 'PNG');
    await page.screenshot({ path: 'test-results/apetek-branding.png' });
  } finally { await closeApp(app); }
});
