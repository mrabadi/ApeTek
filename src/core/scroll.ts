export interface ScrollAnchor { source: number; preview: number }
export type ScrollDirection = 'source' | 'preview';

export function normalizeAnchors(
  anchors: readonly ScrollAnchor[], sourceMax: number, previewMax: number,
): ScrollAnchor[] {
  if (!Number.isFinite(sourceMax) || !Number.isFinite(previewMax) || sourceMax <= 0 || previewMax <= 0) {
    return [{ source: 0, preview: 0 }];
  }
  const points: ScrollAnchor[] = [{ source: 0, preview: 0 }];
  const candidates = anchors.filter((anchor) => Number.isFinite(anchor.source) &&
    Number.isFinite(anchor.preview) && anchor.source > 0 && anchor.source < sourceMax &&
    anchor.preview > 0 && anchor.preview < previewMax)
    .sort((a, b) => a.source - b.source || a.preview - b.preview);
  for (const anchor of candidates) {
    const previous = points[points.length - 1];
    if (anchor.source > previous.source && anchor.preview > previous.preview) points.push({ ...anchor });
  }
  points.push({ source: sourceMax, preview: previewMax });
  return points;
}

export function interpolateScroll(
  anchors: readonly ScrollAnchor[], position: number, direction: ScrollDirection,
): number {
  if (anchors.length < 2 || Number.isNaN(position)) return 0;
  const target: ScrollDirection = direction === 'source' ? 'preview' : 'source';
  if (position <= anchors[0][direction]) return anchors[0][target];
  if (position >= anchors[anchors.length - 1][direction]) return anchors[anchors.length - 1][target];
  let low = 0;
  let high = anchors.length - 1;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (anchors[middle][direction] <= position) low = middle;
    else high = middle;
  }
  const before = anchors[low];
  const after = anchors[high];
  const ratio = (position - before[direction]) / (after[direction] - before[direction]);
  return before[target] + ratio * (after[target] - before[target]);
}
