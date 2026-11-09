import type { EditorView } from '@codemirror/view';
import { interpolateScroll, normalizeAnchors, type ScrollAnchor, type ScrollDirection } from '../core/scroll';

export function bindScrollSync(
  editor: EditorView, preview: HTMLElement, isEnabled: () => boolean,
): { refresh: (direction?: ScrollDirection) => void; destroy: () => void } {
  const source = editor.scrollDOM;
  const suppressed = new Map<HTMLElement, number>();
  let frame = 0;
  let driver: ScrollDirection = 'source';
  let destroyed = false;

  const measure = () => {
    const previewTop = preview.getBoundingClientRect().top + preview.clientTop;
    const points: ScrollAnchor[] = [];
    const sourceY = (line: number, end = false) => {
      const block = editor.lineBlockAt(editor.state.doc.line(Math.min(line, editor.state.doc.lines)).from);
      return (end ? block.bottom : block.top) + editor.documentPadding.top;
    };
    for (const block of preview.querySelectorAll<HTMLElement>('[data-line]')) {
      const start = Number(block.dataset.line);
      const end = Number(block.dataset.endLine);
      if (!Number.isInteger(start) || start < 1) continue;
      const bounds = block.getBoundingClientRect();
      points.push({ source: sourceY(start), preview: bounds.top - previewTop + preview.scrollTop });
      if (Number.isInteger(end) && end >= start) {
        points.push({ source: sourceY(end, true), preview: bounds.bottom - previewTop + preview.scrollTop });
      }
    }
    return normalizeAnchors(points, Math.max(0, source.scrollHeight - source.clientHeight),
      Math.max(0, preview.scrollHeight - preview.clientHeight));
  };

  const schedule = (direction: ScrollDirection) => {
    if (destroyed || !isEnabled()) return;
    driver = direction;
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (destroyed || !isEnabled()) return;
      const anchors = measure();
      if (anchors.length < 2) return;
      const origin = driver === 'source' ? source : preview;
      const target = driver === 'source' ? preview : source;
      const position = interpolateScroll(anchors, origin.scrollTop, driver);
      suppressed.set(target, position);
      target.scrollTop = position;
      if (driver === 'preview') editor.dispatch({ effects: editor.scrollSnapshot() });
    });
  };
  const onScroll = (element: HTMLElement, direction: ScrollDirection) => () => {
    const expected = suppressed.get(element);
    suppressed.delete(element);
    if (expected !== undefined && Math.abs(element.scrollTop - expected) < 1) return;
    schedule(direction);
  };
  const sourceScroll = onScroll(source, 'source');
  const previewScroll = onScroll(preview, 'preview');
  source.addEventListener('scroll', sourceScroll, { passive: true });
  preview.addEventListener('scroll', previewScroll, { passive: true });
  const refresh = (direction: ScrollDirection = driver) => schedule(direction);
  const geometryChanged = () => refresh();
  const resize = new ResizeObserver(geometryChanged);
  resize.observe(source);
  resize.observe(editor.contentDOM);
  resize.observe(preview);
  preview.addEventListener('load', geometryChanged, true);
  refresh();
  return { refresh, destroy: () => {
    destroyed = true;
    cancelAnimationFrame(frame);
    source.removeEventListener('scroll', sourceScroll);
    preview.removeEventListener('scroll', previewScroll);
    preview.removeEventListener('load', geometryChanged, true);
    resize.disconnect();
    suppressed.clear();
  } };
}
