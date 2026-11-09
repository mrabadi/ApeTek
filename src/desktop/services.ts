import { app, BrowserWindow, dialog, Menu } from 'electron';
import path from 'node:path';
import { atomicWrite, discardRecovery, loadLastDocument, loadRecovery, readMarkdown, rememberDocument, resolveLocalImage, saveRecovery } from './files';
import type { AppAction, RecoveryDraft } from '../shared/types';
import { trustedHandle, trustedOn } from './trusted';

export function registerServices(window: BrowserWindow): void {
  const printWindows = new Set<BrowserWindow>();
  let editorReady = false;
  let pendingClose = false;
  let quitting = false;
  const profileDirectory = app.getPath('userData');
  let lastDocumentPath: string | null = null;
  let sessionQueue: Promise<void> = Promise.resolve();
  const sendAction = (action: AppAction) => {
    if (!window.isDestroyed()) window.webContents.send('desktop:action', action);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [
      { id: 'file-new', label: 'New', accelerator: 'Ctrl+N', click: () => sendAction('new') },
      { id: 'file-open', label: 'Open…', accelerator: 'Ctrl+O', click: () => sendAction('open') },
      { type: 'separator' },
      { id: 'file-save', label: 'Save', accelerator: 'Ctrl+S', click: () => sendAction('save') },
      { id: 'file-save-as', label: 'Save as…', accelerator: 'Ctrl+Shift+S', click: () => sendAction('saveAs') },
      { id: 'file-pdf', label: 'Export PDF…', accelerator: 'Ctrl+Shift+P', click: () => sendAction('pdf') },
      { type: 'separator' },
      { id: 'file-close', label: 'Close', accelerator: 'Ctrl+W', click: () => sendAction('close') },
      { label: 'Quit', accelerator: 'Ctrl+Q', click: () => sendAction('close') },
    ] },
    { label: 'Edit', submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ] },
    { label: 'View', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
  ]));
  const quit = () => {
    if (quitting) return;
    quitting = true;
    void sessionQueue.then(() => {
      for (const printWindow of printWindows) if (!printWindow.isDestroyed()) printWindow.destroy();
      app.quit();
    });
  };
  trustedOn(window, 'desktop:setDocumentState', (_event, state: { path: string | null; dirty: boolean }) => {
    if (window.isDestroyed() || !state || (state.path !== null && typeof state.path !== 'string') || typeof state.dirty !== 'boolean') return;
    editorReady = true;
    window.setTitle(`${state.dirty ? '* ' : ''}${state.path ? path.basename(state.path) : 'Untitled.md'} — ApeTek`);
    if (state.path && state.path !== lastDocumentPath) {
      const acceptedPath = path.resolve(state.path);
      lastDocumentPath = acceptedPath;
      sessionQueue = sessionQueue.then(() => rememberDocument(profileDirectory, acceptedPath))
        .catch(error => { console.warn('Unable to remember the last document:', error); });
    }
    if (pendingClose) { pendingClose = false; sendAction('close'); }
  });
  trustedOn(window, 'desktop:close', quit);
  window.on('close', (event) => {
    if (quitting) return;
    event.preventDefault();
    if (editorReady) sendAction('close');
    else pendingClose = true;
  });
  window.on('closed', quit);
  const recoveryDirectory = path.join(profileDirectory, 'recovery');
  let recoveryQueue: Promise<void> = Promise.resolve();
  const queueRecovery = <T>(operation: () => Promise<T>): Promise<T> => {
    const result = recoveryQueue.then(operation);
    recoveryQueue = result.then(() => undefined, () => undefined);
    return result;
  };
  const startupFile = process.argv.slice(app.isPackaged ? 1 : 2)
    .find((argument) => !argument.startsWith('-') && /\.(md|markdown)$/i.test(argument));
  let startupPending = true;
  trustedHandle(window, 'desktop:loadRecovery', () => queueRecovery(async () => {
    const draft = await loadRecovery(recoveryDirectory);
    if (!startupPending) return draft;
    startupPending = false;
    if (draft?.dirty) return draft;
    const opened = startupFile ? await readMarkdown(path.resolve(startupFile)) : await loadLastDocument(profileDirectory);
    return opened ? { ...opened, dirty: false } : null;
  }));
  trustedHandle(window, 'desktop:persistRecovery', (_event, draft: RecoveryDraft) => queueRecovery(() => saveRecovery(recoveryDirectory, draft)));
  trustedHandle(window, 'desktop:discardRecovery', () => queueRecovery(() => discardRecovery(recoveryDirectory)));
  trustedHandle(window, 'desktop:readImage', (_event, source: string, documentPath: string | null) =>
    resolveLocalImage(source, documentPath));
  trustedHandle(window, 'desktop:exportPdf', async (_event, request: { html: string; pageSize: 'A4' | 'Letter' }) => {
    if (typeof request?.html !== 'string' || !['A4', 'Letter'].includes(request.pageSize)) {
      throw new Error('Invalid PDF export request.');
    }
    const result = await dialog.showSaveDialog(window, {
      title: 'Export PDF', defaultPath: 'Untitled.pdf',
      filters: [{ name: 'PDF document', extensions: ['pdf'] }],
    });
    if (result.canceled || !result.filePath) return null;
    const destination = path.extname(result.filePath) ? result.filePath : `${result.filePath}.pdf`;
    const printWindow = new BrowserWindow({ show: false, width: 900, height: 1200,
      backgroundColor: '#ffffff', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true } });
    printWindows.add(printWindow);
    printWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    try {
      const document = `<!doctype html><html><head><meta charset="utf-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline';">
        <style>
          body{font:11pt system-ui,sans-serif;line-height:1.5;color:#1f2937;background:white;margin:0}
          h1,h2,h3,h4{line-height:1.25;break-after:avoid} h1{font-size:24pt} h2{font-size:19pt}
          a{color:#1565c0;text-decoration:underline} img{max-width:100%;height:auto;break-inside:avoid}
          pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f3f4f6;padding:12pt;border-radius:4pt}
          code{font-family:monospace;font-size:.92em} table{border-collapse:collapse;max-width:100%}
          th,td{border:1px solid #cbd5e1;padding:5pt 8pt;overflow-wrap:anywhere} tr{break-inside:avoid}
          blockquote{border-left:3pt solid #cbd5e1;padding-left:12pt;color:#475569}
        </style></head><body>${request.html}</body></html>`;
      await printWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(document)}`);
      await printWindow.webContents.executeJavaScript(`(async () => {
        await document.fonts.ready;
        await Promise.all(Array.from(document.images, image => image.decode()));
      })()`);
      const pdf = await printWindow.webContents.printToPDF({ pageSize: request.pageSize, printBackground: true,
        preferCSSPageSize: false, margins: { top: 0.6, bottom: 0.6, left: 0.6, right: 0.6 }, generateTaggedPDF: true });
      await atomicWrite(destination, pdf);
      return destination;
    } finally {
      printWindows.delete(printWindow);
      if (!printWindow.isDestroyed()) printWindow.destroy();
    }
  });
  trustedHandle(window, 'desktop:confirmDiscard', async () => {
    const result = await dialog.showMessageBox(window, { type: 'question', title: 'Unsaved changes',
      message: 'Save changes to this Markdown document?', buttons: ['Save', 'Discard', 'Cancel'],
      defaultId: 0, cancelId: 2, noLink: true });
    return (['save', 'discard', 'cancel'] as const)[result.response] ?? 'cancel';
  });
  trustedHandle(window, 'desktop:open', async () => {
    const result = await dialog.showOpenDialog(window, {
      title: 'Open Markdown', properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });
    return result.canceled || !result.filePaths[0] ? null : readMarkdown(result.filePaths[0]);
  });
  trustedHandle(window, 'desktop:save', async (_event, request: { path: string | null; content: string; saveAs?: boolean }) => {
    let destination = request.path;
    if (!destination || request.saveAs) {
      const result = await dialog.showSaveDialog(window, {
        title: 'Save Markdown', defaultPath: destination ?? 'Untitled.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });
      if (result.canceled || !result.filePath) return null;
      destination = result.filePath;
    }
    if (!path.extname(destination)) destination += '.md';
    await atomicWrite(destination, request.content);
    return destination;
  });
}
