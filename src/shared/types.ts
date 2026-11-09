export interface AssetRequest {
  kind: 'math' | 'mermaid';
  source: string;
  display?: boolean;
  fontSize?: number;
}

export interface RenderedAsset {
  src: string;
  width: number;
  height: number;
  descent: number;
  clipboard?: { src: string; height: number; descent: number };
}

export interface RenderOptions {
  renderAsset: (request: AssetRequest) => Promise<RenderedAsset>;
  resolveImage?: (source: string) => Promise<string | null>;
  mathAlignment?: 'left' | 'center';
  mathScale?: number;
  lineSpacing?: number;
  paragraphSpacing?: number;
  bulletSpacing?: number;
  bulletLineSpacing?: number;
  signal?: AbortSignal;
}

export interface RenderedDocument {
  html: string;
  plainText: string;
}

export interface FileDocument { path: string; content: string }
export interface RecoveryDraft { path: string | null; content: string; dirty: boolean }
export type AppAction = 'new' | 'open' | 'save' | 'saveAs' | 'pdf' | 'close';
export interface DesktopBridge {
  renderAsset(request: AssetRequest): Promise<RenderedAsset>;
  openDocument(): Promise<FileDocument | null>;
  saveDocument(request: { path: string | null; content: string; saveAs?: boolean }): Promise<string | null>;
  loadRecovery(): Promise<RecoveryDraft | null>;
  persistRecovery(draft: RecoveryDraft): Promise<void>;
  discardRecovery(): Promise<void>;
  readImage(source: string, documentPath: string | null): Promise<string | null>;
  copyRendered(payload: { html: string; text: string }): Promise<void>;
  exportPdf(request: { html: string; pageSize: 'A4' | 'Letter' }): Promise<string | null>;
  confirmDiscard(): Promise<'save' | 'discard' | 'cancel'>;
  setDocumentState(state: { path: string | null; dirty: boolean }): void;
  close(): void;
  onAction(handler: (action: AppAction) => void): () => void;
}

declare global {
  interface Window { desktop: DesktopBridge }
}
