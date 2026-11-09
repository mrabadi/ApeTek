import { _electron as electron } from 'playwright';
import { mkdtemp, mkdir } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ElectronApplication } from 'playwright';
import { installClipboardGuard, restoreClipboardGuard } from './clipboard-guard';
export async function closeApp(app: ElectronApplication) {
  const restored = await restoreClipboardGuard(app).catch(() => 'unavailable');
  if (restored !== 'untouched' && restored !== 'unavailable') console.info(`Clipboard restoration: ${restored}`);
  await app.evaluate(({ app: electronApp }) => electronApp.exit(0)).catch(() => {});
  await app.close().catch(() => {});
}
export async function launchApp(options: { extraArgs?: string[]; userData?: string } = {}) {
  const userData = options.userData ?? await mkdtemp(path.join(os.tmpdir(), 'markdown-local-test-'));
  await mkdir(userData, { recursive: true });
  await mkdir('test-results', { recursive: true });
  const ozone = options.extraArgs?.some(argument => argument === '--ozone-platform' || argument.startsWith('--ozone-platform='))
    ? [] : ['--ozone-platform=x11'];
  const app = await electron.launch({ args: ['--require', path.resolve('tests/capture-main-errors.cjs'), ...ozone, '.', ...(options.extraArgs ?? [])], env: { ...process.env, MARKDOWN_LOCAL_TEST: '1', MARKDOWN_LOCAL_USER_DATA: userData }, timeout: 30000 });
  await installClipboardGuard(app);
  const page = await app.firstWindow();
  await page.waitForLoadState('domcontentloaded');
  return { app, page, userData };
}
