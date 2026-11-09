import assert from 'node:assert/strict';
import test from 'node:test';

test('scroll interpolation follows block anchors in both directions, with exact endpoints', async () => {
  const { normalizeAnchors, interpolateScroll } = await import('../src/core/scroll');
  const anchors = normalizeAnchors([
    { source: 100, preview: 400 }, { source: 200, preview: 500 },
  ], 1000, 2000);
  assert.deepEqual(anchors, [
    { source: 0, preview: 0 }, { source: 100, preview: 400 },
    { source: 200, preview: 500 }, { source: 1000, preview: 2000 },
  ]);
  assert.equal(interpolateScroll(anchors, 150, 'source'), 450);
  assert.equal(interpolateScroll(anchors, 450, 'preview'), 150);
  assert.equal(interpolateScroll(anchors, -100, 'source'), 0);
  assert.equal(interpolateScroll(anchors, 10000, 'source'), 2000);
  assert.equal(interpolateScroll(anchors, 10000, 'preview'), 1000);
});

test('anchor normalization discards duplicates, crossing nested geometry and invalid positions', async () => {
  const { normalizeAnchors, interpolateScroll } = await import('../src/core/scroll');
  const anchors = normalizeAnchors([
    { source: 300, preview: 350 }, { source: 100, preview: 200 },
    { source: 100, preview: 100 }, { source: 200, preview: 100 },
    { source: 250, preview: 50 }, { source: NaN, preview: 700 },
    { source: 500, preview: Infinity }, { source: 1000, preview: 600 },
    { source: -10, preview: 30 }, { source: 700, preview: 5000 },
  ], 1000, 2000);
  assert.deepEqual(anchors, [
    { source: 0, preview: 0 }, { source: 100, preview: 100 },
    { source: 300, preview: 350 }, { source: 1000, preview: 2000 },
  ]);
  for (let source = 0; source <= 1000; source += 10) {
    const preview = interpolateScroll(anchors, source, 'source');
    assert.ok(Number.isFinite(preview));
    assert.ok(Math.abs(interpolateScroll(anchors, preview, 'preview') - source) < 1e-8);
  }
});

test('empty and non-scrollable geometry yields safe finite values', async () => {
  const { normalizeAnchors, interpolateScroll } = await import('../src/core/scroll');
  assert.equal(interpolateScroll([], 100, 'source'), 0);
  assert.equal(interpolateScroll([{ source: 0, preview: 0 }], 100, 'preview'), 0);
  assert.deepEqual(normalizeAnchors([], 0, 0), [{ source: 0, preview: 0 }]);
  assert.deepEqual(normalizeAnchors([{ source: 1, preview: 10 }], 0, 100), [{ source: 0, preview: 0 }]);
  assert.deepEqual(normalizeAnchors([], -50, NaN), [{ source: 0, preview: 0 }]);
  const anchors = normalizeAnchors([], 100, 200);
  assert.equal(interpolateScroll(anchors, NaN, 'source'), 0);
  assert.equal(interpolateScroll(anchors, Infinity, 'source'), 200);
});

type PreviewBlock = { dataset: { line: string; endLine: string }; top: number; bottom: number };

async function withPanes(run: (fixture: {
  source: FakePane; preview: FakePane; editor: import('@codemirror/view').EditorView;
  flush: () => void; frameCount: () => number; resized: () => void; observed: Set<Element>;
}) => Promise<void>): Promise<void> {
  const original = { requestAnimationFrame: globalThis.requestAnimationFrame,
    cancelAnimationFrame: globalThis.cancelAnimationFrame, ResizeObserver: globalThis.ResizeObserver };
  const frames = new Map<number, FrameRequestCallback>();
  let frameId = 0;
  const observed = new Set<Element>();
  let observerCallback: ResizeObserverCallback | undefined;
  globalThis.requestAnimationFrame = (callback) => { frames.set(++frameId, callback); return frameId; };
  globalThis.cancelAnimationFrame = (id) => { frames.delete(id); };
  globalThis.ResizeObserver = class {
    constructor(callback: ResizeObserverCallback) { observerCallback = callback; }
    observe(element: Element) { observed.add(element); }
    unobserve(element: Element) { observed.delete(element); }
    disconnect() { observed.clear(); }
  } as unknown as typeof ResizeObserver;
  const source = new FakePane();
  const preview = new FakePane();
  preview.scrollHeight = 2100;
  preview.blocks = [
    { dataset: { line: '11', endLine: '20' }, top: 400, bottom: 500 },
    { dataset: { line: '21', endLine: '30' }, top: 500, bottom: 700 },
  ];
  const editor = { scrollDOM: source, contentDOM: source, documentPadding: { top: 10 },
    state: { doc: { lines: 101, line: (line: number) => ({ from: (line - 1) * 10 }) } },
    lineBlockAt: (position: number) => ({ top: position, bottom: position + 10 }),
    scrollSnapshot: () => undefined, dispatch: () => undefined,
  } as unknown as import('@codemirror/view').EditorView;
  try {
    await run({ source, preview, editor, observed,
      flush: () => { const current = [...frames.values()]; frames.clear(); current.forEach((callback) => callback(0)); },
      frameCount: () => frames.size,
      resized: () => observerCallback?.([], {} as ResizeObserver),
    });
  } finally {
    for (const [key, value] of Object.entries(original)) {
      if (value === undefined) Reflect.deleteProperty(globalThis, key);
      else Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
  }
}

class FakePane extends EventTarget {
  scrollHeight = 1100;
  clientHeight = 100;
  clientTop = 0;
  blocks: PreviewBlock[] = [];
  private position = 0;
  get scrollTop() { return this.position; }
  set scrollTop(value: number) {
    if (value === this.position) return;
    this.position = value;
    this.dispatchEvent(new Event('scroll'));
  }
  getBoundingClientRect() { return { top: 100, bottom: 200 }; }
  querySelectorAll() {
    return this.blocks.map((block) => ({ dataset: block.dataset, getBoundingClientRect: () => ({
      top: block.top - this.scrollTop + 100, bottom: block.bottom - this.scrollTop + 100,
    }) }));
  }
}

test('DOM scroll sync maps matching blocks in both directions without feedback loops', async () => {
  await withPanes(async ({ source, preview, editor, flush, frameCount }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => true);
    flush();
    source.scrollTop = 160;
    source.dispatchEvent(new Event('scroll'));
    assert.equal(frameCount(), 1);
    flush();
    assert.equal(preview.scrollTop, 450);
    assert.equal(frameCount(), 0);
    preview.scrollTop = 600;
    flush();
    assert.equal(source.scrollTop, 260);
    assert.equal(frameCount(), 0);
    source.scrollTop = 1000;
    flush();
    assert.equal(preview.scrollTop, 2000);
    sync.destroy();
  });
});

test('scroll sync refresh preserves the source location after image and pane layout changes', async () => {
  await withPanes(async ({ source, preview, editor, flush, frameCount, resized, observed }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => true);
    flush();
    assert.ok(observed.has(preview as unknown as Element));
    assert.ok(observed.has(source as unknown as Element));
    source.scrollTop = 160;
    flush();
    assert.equal(preview.scrollTop, 450);
    preview.blocks[0].top = 600;
    preview.blocks[0].bottom = 900;
    preview.blocks[1].top = 900;
    preview.blocks[1].bottom = 1100;
    preview.dispatchEvent(new Event('load'));
    flush();
    assert.equal(source.scrollTop, 160);
    assert.equal(preview.scrollTop, 750);
    preview.blocks[0].top = 800;
    preview.blocks[0].bottom = 1000;
    preview.blocks[1].top = 1000;
    preview.blocks[1].bottom = 1200;
    resized();
    flush();
    assert.equal(preview.scrollTop, 900);
    sync.refresh();
    assert.equal(frameCount(), 1);
    sync.destroy();
    assert.equal(frameCount(), 0);
    assert.equal(observed.size, 0);
    source.scrollTop = 500;
    preview.dispatchEvent(new Event('load'));
    sync.refresh();
    assert.equal(frameCount(), 0);
  });
});

test('disabled synchronization keeps panes independent and can be re-enabled', async () => {
  await withPanes(async ({ source, preview, editor, flush }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    let enabled = false;
    preview.scrollTop = 600;
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => enabled);
    flush();
    assert.equal(preview.scrollTop, 600);
    source.scrollTop = 160;
    flush();
    assert.equal(preview.scrollTop, 600);
    enabled = true;
    sync.refresh();
    flush();
    assert.equal(preview.scrollTop, 450);
    source.scrollHeight = source.clientHeight;
    preview.scrollTop = 700;
    flush();
    assert.equal(preview.scrollTop, 700);
    sync.destroy();
  });
});

test('layout refresh cannot override a pending preview-origin scroll', async () => {
  await withPanes(async ({ source, preview, editor, flush }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => true);
    flush();
    source.scrollTop = 1000;
    flush();
    assert.equal(preview.scrollTop, 2000);
    preview.scrollTop = 0;
    sync.refresh();
    flush();
    assert.equal(source.scrollTop, 0, 'Viewport geometry refresh must retain the pending preview scroll as its origin.');
    assert.equal(preview.scrollTop, 0);
    sync.destroy();
  });
});

test('later geometry refresh keeps the last preview driver until a source edit explicitly changes it', async () => {
  await withPanes(async ({ source, preview, editor, flush }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => true);
    flush();
    preview.scrollTop = 600;
    flush();
    assert.equal(source.scrollTop, 260);
    (editor as unknown as { documentPadding: { top: number } }).documentPadding.top = 110;
    sync.refresh();
    flush();
    assert.equal(preview.scrollTop, 600, 'A later layout notification must not move the pane the user last scrolled.');
    assert.equal(source.scrollTop, 360);
    sync.refresh('source');
    flush();
    (editor as unknown as { documentPadding: { top: number } }).documentPadding.top = 210;
    sync.refresh();
    flush();
    assert.equal(source.scrollTop, 360);
    assert.equal(preview.scrollTop, 450);
    sync.destroy();
  });
});

test('preview navigation replaces a pending editor caret scroll with the mapped position', async () => {
  await withPanes(async ({ source, preview, editor, flush }) => {
    const { bindScrollSync } = await import('../src/renderer/scroll-sync');
    let pendingCaretTop = 1000;
    Object.assign(editor, {
      scrollSnapshot: () => ({ top: source.scrollTop }),
      dispatch: ({ effects }: { effects: { top: number } }) => { pendingCaretTop = effects.top; },
    });
    const sync = bindScrollSync(editor, preview as unknown as HTMLElement, () => true);
    flush();
    source.scrollTop = 1000;
    flush();
    assert.equal(preview.scrollTop, 2000);
    preview.scrollTop = 0;
    flush();
    assert.equal(source.scrollTop, 0);
    // CodeMirror applies pending scrollIntoView effects during its later measure phase.
    source.scrollTop = pendingCaretTop;
    assert.equal(source.scrollTop, 0, 'A pending end-caret scroll must not undo navigation from the preview.');
    flush();
    assert.equal(preview.scrollTop, 0);
    sync.destroy();
  });
});
