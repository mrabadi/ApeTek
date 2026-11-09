import { app, BrowserWindow, clipboard, ClipboardItem } from 'electron';
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { AssetRenderer } from './raster';
import { registerServices } from './services';
import { guardEditorWindow, trustedHandle } from './trusted';
app.setName('ApeTek');
const userData = process.env.MARKDOWN_LOCAL_USER_DATA || path.join(app.getPath('appData'), 'Markdown Local');
mkdirSync(userData, { recursive: true, mode: 0o700 });
app.setPath('userData', userData);
// XWayland provides a reliable cross-application HTML clipboard on Ubuntu 22.04.
if (process.platform === 'linux' && process.env.DISPLAY && !app.commandLine.hasSwitch('ozone-platform')) app.commandLine.appendSwitch('ozone-platform', 'x11');
let window: BrowserWindow;
app.whenReady().then(async () => {
  const assets = new AssetRenderer(path.join(__dirname, '../renderer/raster.html'));
  window = new BrowserWindow({ title: 'ApeTek', icon: path.join(__dirname, 'icon.png'), width: 1400, height: 900, minWidth: 880, minHeight: 600, backgroundColor: '#f4f5f3', autoHideMenuBar: true, show: process.env.MARKDOWN_LOCAL_TEST !== '1', webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  guardEditorWindow(window, pathToFileURL(path.join(__dirname, '../renderer/index.html')).href);
  trustedHandle(window, 'desktop:renderAsset', (_event, request) => assets.render(request));
  trustedHandle(window, 'desktop:copyRendered', async (_event, payload) => {
    if (typeof payload?.html !== 'string' || typeof payload?.text !== 'string') throw new Error('Invalid clipboard content');
    await clipboard.write([new ClipboardItem({ 'text/html': payload.html, 'text/plain': payload.text })]);
  });
  registerServices(window);
  await window.loadFile(path.join(__dirname, '../renderer/index.html'));
});
app.on('window-all-closed', () => app.quit());
