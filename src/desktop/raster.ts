import { BrowserWindow, nativeImage } from 'electron';
import type { AssetRequest, RenderedAsset } from '../shared/types';

/** One serialized, locally loaded Chromium surface; no user-supplied JavaScript. */
export class AssetRenderer {
  private window: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private cache = new Map<string, RenderedAsset>();
  constructor(private htmlPath: string) {}

  render(request: AssetRequest): Promise<RenderedAsset> {
    if (!request || !['math', 'mermaid'].includes(request.kind) || typeof request.source !== 'string' || request.source.length > 100000) {
      return Promise.reject(new Error('Invalid equation or diagram request'));
    }
    const key = JSON.stringify(request);
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const task = this.queue.then(async () => {
      const existing = this.cache.get(key);
      if (existing) return existing;
      await this.init();
      const contents = this.window!.webContents;
      const bounds = await contents.executeJavaScript(`window.renderAsset(${JSON.stringify(request)})`);
      if (bounds.width > 6000 || bounds.height > 6000) throw new Error('Equation or diagram is too large to render');
      // Capture at the compositor's requested resolution, independent of monitor DPI.
      const capture = await contents.debugger.sendCommand('Page.captureScreenshot', { format: 'png', clip: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height, scale: 3 }, captureBeyondViewport: true, fromSurface: true });
      const asset: RenderedAsset = { src: `data:image/png;base64,${capture.data}`, width: bounds.width, height: bounds.height, descent: bounds.descent };
      if (request.kind === 'math' && !request.display) {
        // Writer honors legacy middle alignment but ignores numeric vertical-align.
        // Center the real TeX baseline inside a separate transparent copy image.
        const image = nativeImage.createFromBuffer(Buffer.from(capture.data, 'base64'));
        const pixels = image.getSize();
        const baseline = Math.round((bounds.height - bounds.descent) * 3);
        const half = Math.max(baseline, pixels.height - baseline);
        const bitmap = Buffer.alloc(pixels.width * half * 2 * 4);
        image.toBitmap().copy(bitmap, (half - baseline) * pixels.width * 4);
        const centered = nativeImage.createFromBitmap(bitmap, { width: pixels.width, height: half * 2 });
        asset.clipboard = { src: centered.toDataURL(), height: half * 2 / 3, descent: half / 3 };
      }
      if (this.cache.size >= 256) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(key, asset);
      return asset;
    });
    this.queue = task.catch(() => {});
    return task;
  }

  private init(): Promise<void> {
    if (this.ready) return this.ready;
    this.window = new BrowserWindow({ width: 1200, height: 800, show: false, transparent: true, backgroundColor: '#00000000', webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, offscreen: true } });
    this.window.setMenu(null);
    this.window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    this.ready = this.window.loadFile(this.htmlPath).then(async () => {
      this.window!.webContents.debugger.attach('1.3');
      await this.window!.webContents.debugger.sendCommand('Emulation.setDefaultBackgroundColorOverride', { color: { r: 0, g: 0, b: 0, a: 0 } });
      await this.window!.webContents.executeJavaScript('document.fonts.ready');
    });
    return this.ready;
  }
}
