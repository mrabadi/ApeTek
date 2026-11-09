import { contextBridge, ipcRenderer } from 'electron';
import type { AppAction, DesktopBridge } from '../shared/types';

const desktop: DesktopBridge = {
  renderAsset: (request) => ipcRenderer.invoke('desktop:renderAsset', request),
  openDocument: () => ipcRenderer.invoke('desktop:open'),
  saveDocument: (request) => ipcRenderer.invoke('desktop:save', request),
  loadRecovery: () => ipcRenderer.invoke('desktop:loadRecovery'),
  persistRecovery: (draft) => ipcRenderer.invoke('desktop:persistRecovery', draft),
  discardRecovery: () => ipcRenderer.invoke('desktop:discardRecovery'),
  readImage: (source, documentPath) => ipcRenderer.invoke('desktop:readImage', source, documentPath),
  copyRendered: (payload) => ipcRenderer.invoke('desktop:copyRendered', payload),
  exportPdf: (request) => ipcRenderer.invoke('desktop:exportPdf', request),
  confirmDiscard: () => ipcRenderer.invoke('desktop:confirmDiscard'),
  setDocumentState: (state) => ipcRenderer.send('desktop:setDocumentState', state),
  close: () => ipcRenderer.send('desktop:close'),
  onAction: (handler) => {
    const listener = (_event: Electron.IpcRendererEvent, action: AppAction) => handler(action);
    ipcRenderer.on('desktop:action', listener);
    return () => { ipcRenderer.removeListener('desktop:action', listener); };
  },
};

contextBridge.exposeInMainWorld('desktop', desktop);
