import { ipcMain, shell } from 'electron';
import type { BrowserWindow, IpcMainInvokeEvent } from 'electron';

const editorUrls = new WeakMap<BrowserWindow, string>();
type InvokeListener = Parameters<typeof ipcMain.handle>[1];
type SendListener = Parameters<typeof ipcMain.on>[1];

function documentUrl(value: string): string | null {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

function isTrusted(window: BrowserWindow, event: Pick<IpcMainInvokeEvent, 'sender' | 'senderFrame'>): boolean {
  try {
    if (window.isDestroyed()) return false;
    const contents = window.webContents;
    const expected = editorUrls.get(window);
    return Boolean(expected && !contents.isDestroyed() && event.sender === contents
      && event.senderFrame === contents.mainFrame && documentUrl(event.senderFrame.url) === expected);
  } catch {
    return false;
  }
}

function openExternalLink(value: string): void {
  try {
    const url = new URL(value);
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) {
      void shell.openExternal(url.href).catch(() => {});
    }
  } catch { /* Invalid document links are inert. */ }
}

export function trustedHandle(window: BrowserWindow, channel: string, listener: InvokeListener): void {
  ipcMain.handle(channel, (event, ...args) => {
    if (!isTrusted(window, event)) throw new Error('Untrusted IPC sender');
    return listener(event, ...args);
  });
}

export function trustedOn(window: BrowserWindow, channel: string, listener: SendListener): void {
  ipcMain.on(channel, (event, ...args) => {
    if (isTrusted(window, event)) listener(event, ...args);
  });
}

/** Keep document links out of the privileged application renderer. */
export function guardEditorWindow(window: BrowserWindow, expectedIndexUrl: string): void {
  const expected = documentUrl(expectedIndexUrl);
  if (!expected || new URL(expected).protocol !== 'file:') throw new Error('The editor requires a packaged file URL');
  editorUrls.set(window, expected);
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
    openExternalLink(event.url);
  });
  window.webContents.on('will-frame-navigate', event => {
    if (!event.isMainFrame) event.preventDefault();
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalLink(url);
    return { action: 'deny' };
  });
}
