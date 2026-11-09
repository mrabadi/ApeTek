/** Build rich and plain clipboard formats without touching the OS clipboard. */
export function clipboardPayload(root: HTMLElement, range?: Range): { html: string; text: string } {
  const document = root.ownerDocument;
  let clone: HTMLElement;
  if (range) {
    const selected = range.cloneRange();
    if (selected.collapsed || !selected.intersectsNode(root)) return { html: '', text: '' };
    const rootRange = document.createRange();
    rootRange.selectNodeContents(root);
    if (selected.compareBoundaryPoints(Range.START_TO_START, rootRange) < 0) selected.setStart(root, 0);
    if (selected.compareBoundaryPoints(Range.END_TO_END, rootRange) > 0) selected.setEnd(root, root.childNodes.length);
    if (selected.collapsed) return { html: '', text: '' };
    let fragment: Node = selected.cloneContents();
    const common = selected.commonAncestorContainer;
    let ancestor = common.nodeType === 1 ? common as HTMLElement : common.parentElement;
    while (ancestor && root.contains(ancestor)) {
      const parent = ancestor.cloneNode(false) as HTMLElement;
      if (ancestor.tagName === 'OL') {
        const items = Array.from(ancestor.children).filter((child) => child.tagName === 'LI');
        const firstSelected = items.findIndex((item) => selected.intersectsNode(item));
        if (firstSelected >= 0) parent.setAttribute('start', String(Number(ancestor.getAttribute('start') ?? 1) + firstSelected));
      }
      parent.appendChild(fragment);
      fragment = parent;
      if (ancestor === root) break;
      ancestor = ancestor.parentElement;
    }
    clone = document.createElement('div');
    clone.appendChild(fragment);
  } else {
    clone = root.cloneNode(true) as HTMLElement;
  }
  const defaults: Record<string, string> = {
    H1: 'font-size:24pt;font-weight:bold;margin:16pt 0 8pt;',
    H2: 'font-size:18pt;font-weight:bold;margin:14pt 0 7pt;',
    H3: 'font-size:15pt;font-weight:bold;margin:12pt 0 6pt;',
    H4: 'font-size:13pt;font-weight:bold;margin:10pt 0 5pt;',
    H5: 'font-size:12pt;font-weight:bold;margin:10pt 0 5pt;',
    H6: 'font-size:11pt;font-weight:bold;margin:10pt 0 5pt;',
    P: 'line-height:1;margin:0 0 13px;',
    TABLE: 'width:100%;border-collapse:collapse;margin:10pt 0;',
    TH: 'line-height:1;border:1px solid #b9c2ce;padding:6pt 8pt;vertical-align:top;background-color:#f3f5f7;font-weight:bold;',
    TD: 'line-height:1;border:1px solid #b9c2ce;padding:6pt 8pt;vertical-align:top;',
    UL: 'margin:6pt 0;padding-left:20pt;',
    OL: 'margin:6pt 0;padding-left:20pt;',
    LI: 'line-height:1;padding:0;margin:0;',
    PRE: 'font-family:Consolas,monospace;font-size:10pt;white-space:pre-wrap;background-color:#f3f5f7;padding:10pt;margin:10pt 0;',
    CODE: 'font-family:Consolas,monospace;font-size:10pt;',
    BLOCKQUOTE: 'border-left:3pt solid #c4cbd4;padding-left:10pt;margin:10pt 0;color:#57606a;',
    A: 'color:#0969da;text-decoration:underline;',
  };
  const attributes = new Set(['href', 'title', 'src', 'alt', 'width', 'height', 'style', 'colspan', 'rowspan', 'start', 'reversed', 'value', 'align', 'scope', 'dir', 'lang']);
  for (const element of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))]) {
    const blockImage = element.tagName === 'IMG' && element.style.display === 'block';
    const blockAlignment = element.getAttribute('data-math-alignment') === 'left' ? 'left' : 'center';
    if (element.hidden || element.getAttribute('aria-hidden') === 'true' || element.style.display === 'none'
      || element.style.visibility === 'hidden' || ['SCRIPT', 'STYLE', 'TEMPLATE', 'NOSCRIPT'].includes(element.tagName)) {
      if (element === clone) clone = document.createElement('div');
      else element.remove();
      continue;
    }
    if (element.tagName === 'IMG' && element.hasAttribute('data-copy-src')) {
      const source = element.getAttribute('data-copy-src') ?? '';
      const height = Number(element.getAttribute('data-copy-height'));
      const descent = Number(element.getAttribute('data-copy-descent'));
      if (/^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/.test(source)
        && Number.isFinite(height) && height > 0 && Number.isFinite(descent) && descent >= 0) {
        element.setAttribute('src', source);
        element.setAttribute('height', String(height));
        element.style.height = `${height}px`;
        element.style.verticalAlign = `-${descent}px`;
        element.setAttribute('align', 'middle');
      }
    }
    if (element.tagName === 'IMG' && !/^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+={0,2}$/.test(element.getAttribute('src') ?? '')) {
      const placeholder = document.createTextNode(`Image unavailable: ${element.getAttribute('alt') ?? 'image'}`);
      if (element === clone) { clone = document.createElement('div'); clone.appendChild(placeholder); }
      else element.replaceWith(placeholder);
      continue;
    }
    if (blockImage) {
      let paragraph = element.parentElement;
      if (paragraph?.tagName !== 'P') {
        paragraph = document.createElement('p');
        paragraph.style.margin = '10pt 0';
        if (element === clone) clone = paragraph;
        else element.replaceWith(paragraph);
        paragraph.appendChild(element);
      }
      paragraph.style.textAlign = blockAlignment;
      element.style.display = 'inline-block';
      element.style.margin = '0';
    }
    if (element.tagName === 'INPUT' && element.getAttribute('type') === 'checkbox') {
      element.replaceWith(document.createTextNode((element as HTMLInputElement).checked ? '☑' : '☐'));
      continue;
    }
    if (element.tagName === 'TABLE') element.setAttribute('width', '100%');
    for (const attribute of Array.from(element.attributes)) {
      const semanticId = attribute.name === 'id' && attribute.value.startsWith('user-content-');
      if (!attributes.has(attribute.name) && !semanticId) element.removeAttribute(attribute.name);
    }
    if (/^(?:blob|file|javascript|data):/i.test(element.getAttribute('href') ?? '')) element.removeAttribute('href');
    for (const property of Array.from(element.style)) {
      if (/url\s*\(|expression\s*\(|(?:blob|file|javascript):/i.test(element.style.getPropertyValue(property))) {
        element.style.removeProperty(property);
      }
    }
    if (defaults[element.tagName]) {
      const previousStyle = Array.from(element.style, (property) => ({
        property, value: element.style.getPropertyValue(property), priority: element.style.getPropertyPriority(property),
      }));
      element.style.cssText = defaults[element.tagName];
      for (const { property, value, priority } of previousStyle) element.style.setProperty(property, value, priority);
    }
    if (range && element.tagName === 'LI'
      && Array.from(element.parentElement?.children ?? []).find((sibling) => sibling.tagName === 'LI') === element) {
      element.style.marginTop = '0';
    }
  }
  // Writer imports list-item spacing, but ignores nested-list outer margins.
  for (const list of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('ul,ol'))]) {
    if (!['UL', 'OL'].includes(list.tagName) || !list.parentElement?.closest('li')) continue;
    const gap = Number.parseFloat(list.style.marginTop);
    const firstItem = Array.from(list.children).find((child) => child.tagName === 'LI') as HTMLElement | undefined;
    if (firstItem && Number.isFinite(gap) && gap > 0) {
      firstItem.style.marginTop = `${(Number.parseFloat(firstItem.style.marginTop) || 0) + gap}px`;
      list.style.marginTop = '0';
    }
  }
  // A loose item's paragraph overrides its LI spacing in Writer's HTML import.
  for (const item of [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('li'))]) {
    if (item.tagName !== 'LI') continue;
    const paragraph = item.firstElementChild as HTMLElement | null;
    const gap = Number.parseFloat(item.style.marginTop);
    if (paragraph?.tagName === 'P' && Number.isFinite(gap) && gap > 0) {
      paragraph.style.marginTop = `${(Number.parseFloat(paragraph.style.marginTop) || 0) + gap}px`;
      item.style.marginTop = '0';
    }
  }
  const blockTags = new Set(['ARTICLE', 'DIV', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'P', 'LI', 'PRE', 'BLOCKQUOTE']);
  const helpers = {
    text(node: Node): string {
      if (node.nodeType === 3) return node.textContent ?? '';
      if (node.nodeType !== 1 && node.nodeType !== 11) return '';
      const element = node as HTMLElement;
      if (element.tagName === 'IMG') return element.getAttribute('alt') ?? '';
      if (element.tagName === 'BR') return '\n';
      if (element.tagName === 'TR') return `${Array.from(element.children)
        .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
        .map((cell) => helpers.text(cell)).join('\t')}\n`;
      const content = Array.from(node.childNodes).map((child) => helpers.text(child)).join('');
      if (element.tagName === 'UL' || element.tagName === 'OL') return `\n${content}\n`;
      return blockTags.has(element.tagName) ? `${content}\n` : content;
    },
  };
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'font-family:Arial,sans-serif;font-size:12pt;line-height:1.5;color:#24292f;background-color:#fff;';
  wrapper.appendChild(clone);
  return { html: wrapper.outerHTML, text: helpers.text(clone).replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '') };
}
