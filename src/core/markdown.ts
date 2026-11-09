import type { Element, ElementContent, Root } from 'hast';
import { toHtml } from 'hast-util-to-html';
import { defaultHandlers, type Handler } from 'mdast-util-to-hast';
import Prism from 'prismjs';
import 'prismjs/components/prism-python.js';
import 'prismjs/components/prism-typescript.js';
import 'prismjs/components/prism-jsx.js';
import 'prismjs/components/prism-tsx.js';
import 'prismjs/components/prism-bash.js';
import 'prismjs/components/prism-json.js';
import 'prismjs/components/prism-c.js';
import 'prismjs/components/prism-cpp.js';
import 'prismjs/components/prism-java.js';
import 'prismjs/components/prism-rust.js';
import 'prismjs/components/prism-sql.js';
import 'prismjs/components/prism-yaml.js';
import 'prismjs/components/prism-markdown.js';
import 'prismjs/components/prism-go.js';
import 'prismjs/components/prism-ruby.js';
import 'prismjs/components/prism-diff.js';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkEmoji from 'remark-emoji';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { visit } from 'unist-util-visit';
import type { AssetRequest, RenderedDocument, RenderOptions } from '../shared/types.js';

const blockTags = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'blockquote', 'li', 'tr']);
const anchorTags = new Set([...blockTags, 'table', 'hr', 'section', 'details', 'img', 'figure', 'dl', 'dt', 'dd']);
const imageData = /^data:image\/(?:png|jpeg|gif|webp);base64,[a-zA-Z0-9+/]+={0,2}$/;
const tokenColors: Record<string, string> = {
  comment: '#57606a', prolog: '#57606a', doctype: '#57606a', punctuation: '#57606a',
  keyword: '#cf222e', boolean: '#0550ae', number: '#0550ae', property: '#0550ae',
  function: '#8250df', 'class-name': '#8250df', string: '#0a3069', char: '#0a3069',
  attr: '#0a3069', 'attr-value': '#0a3069', tag: '#116329', inserted: '#116329',
  operator: '#cf222e', deleted: '#cf222e', regex: '#953800', variable: '#953800',
};

function tokenNodes(token: string | Prism.Token): ElementContent[] {
  if (typeof token === 'string') return [{ type: 'text', value: token }];
  const content = Array.isArray(token.content) ? token.content : [token.content];
  return [{
    type: 'element', tagName: 'span',
    properties: { className: ['token', token.type], style: `color:${tokenColors[token.type] ?? '#24292f'};` },
    children: content.flatMap(tokenNodes),
  }];
}

function highlightCode(tree: Root): void {
  visit(tree, 'element', (node, _index, parent) => {
    if (node.tagName !== 'code' || parent?.type !== 'element' || parent.tagName !== 'pre') return;
    const languageClass = Array.isArray(node.properties.className)
      ? node.properties.className.find((name) => String(name).startsWith('language-')) : undefined;
    const language = String(languageClass ?? '').replace(/^language-/, '');
    const grammar = Prism.languages[language];
    if (!grammar) return;
    const content = node.children.map((child) => child.type === 'text' ? child.value : '').join('');
    node.children = Prism.tokenize(content, grammar).flatMap(tokenNodes);
  });
}

function linkFragments(tree: Root): void {
  const ids = new Set<string>();
  visit(tree, 'element', (node) => {
    if (typeof node.properties.id === 'string') ids.add(node.properties.id);
  });
  const headingText = (node: ElementContent): string => {
    if (node.type === 'text') return node.value;
    if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
    return 'children' in node ? node.children.map(headingText).join('') : '';
  };
  visit(tree, 'element', (node) => {
    if (!/^h[1-6]$/.test(node.tagName) || node.properties.id) return;
    const slug = headingText(node).toLowerCase().normalize('NFC')
      .replace(/[^\p{L}\p{N}\p{M}_\-\s]/gu, '').trim().replace(/\s+/g, '-') || 'section';
    const base = `${defaultSchema.clobberPrefix ?? ''}${slug}`;
    let id = base, suffix = 0;
    while (ids.has(id)) id = `${base}-${++suffix}`;
    node.properties.id = id;
    ids.add(id);
  });
  visit(tree, 'element', (node) => {
    const href = node.properties.href;
    if (typeof href !== 'string' || !href.startsWith('#')) return;
    let target: string;
    try { target = decodeURIComponent(href.slice(1)); } catch { return; }
    if (ids.has(target)) return;
    const sanitizedTarget = `${defaultSchema.clobberPrefix ?? ''}${target}`;
    if (ids.has(sanitizedTarget)) node.properties.href = `#${encodeURIComponent(sanitizedTarget)}`;
  });
}

function plainText(tree: Root): string {
  const text = (node: Root | Root['children'][number]): string => {
    if (node.type === 'text') return node.value;
    if (node.type === 'element' && node.tagName === 'img') return String(node.properties.alt ?? '');
    if (node.type === 'element' && node.tagName === 'br') return '\n';
    if (node.type === 'element' && node.tagName === 'input') return node.properties.checked ? '[x]' : '[ ]';
    if (node.type === 'element' && node.tagName === 'tr') return `${node.children
      .filter((child) => child.type === 'element').map(text).join('\t')}\n`;
    const content = 'children' in node ? node.children.map(text).join('') : '';
    return node.type === 'element' && blockTags.has(node.tagName) ? `${content}\n` : content;
  };
  return text(tree).replace(/\n{3,}/g, '\n\n').trim();
}

export async function renderMarkdown(source: string, options: RenderOptions): Promise<RenderedDocument> {
  const checkAbort = () => options.signal?.throwIfAborted();
  checkAbort();
  const assets = new Map<number | undefined, AssetRequest>();
  const mathAlignment = options.mathAlignment === 'center' ? 'center' : 'left';
  const requestedScale = options.mathScale;
  const mathScale = typeof requestedScale === 'number' && Number.isInteger(requestedScale)
    && requestedScale >= 50 && requestedScale <= 200 ? requestedScale : 100;
  const mathFontSize = 12.75 * mathScale / 100;
  const requestedLineSpacing = options.lineSpacing;
  const lineSpacing = typeof requestedLineSpacing === 'number' && Number.isFinite(requestedLineSpacing)
    && requestedLineSpacing >= 1 && requestedLineSpacing <= 3 ? requestedLineSpacing : 1;
  const requestedParagraphSpacing = options.paragraphSpacing;
  const paragraphSpacing = typeof requestedParagraphSpacing === 'number' && Number.isFinite(requestedParagraphSpacing)
    && requestedParagraphSpacing >= 0 && requestedParagraphSpacing <= 40 ? requestedParagraphSpacing : 13;
  const requestedBulletSpacing = options.bulletSpacing;
  const bulletSpacing = typeof requestedBulletSpacing === 'number' && Number.isFinite(requestedBulletSpacing)
    && requestedBulletSpacing >= 0 && requestedBulletSpacing <= 40 ? requestedBulletSpacing : 8;
  const requestedBulletLineSpacing = options.bulletLineSpacing;
  const bulletLineSpacing = typeof requestedBulletLineSpacing === 'number' && Number.isFinite(requestedBulletLineSpacing)
    && requestedBulletLineSpacing >= 1 && requestedBulletLineSpacing <= 3 ? requestedBulletLineSpacing : 1;
  const assetHandler = (kind: AssetRequest['kind'], display?: boolean): Handler => (state, node) => {
    const formula = 'value' in node ? String(node.value) : '';
    const request: AssetRequest = kind === 'math' ? { kind, source: formula, display, fontSize: mathFontSize } : { kind, source: formula };
    assets.set(node.position?.start.offset, request);
    const result: Element = { type: 'element', tagName: 'img', properties: { alt: formula }, children: [] };
    state.patch(node, result);
    return result;
  };
  const codeHandler: Handler = (state, node, parent) => node.type === 'code' && node.lang?.toLowerCase() === 'mermaid'
    ? assetHandler('mermaid')(state, node, parent)
    : defaultHandlers.code(state, node as Parameters<typeof defaultHandlers.code>[1]);
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm, { singleTilde: false })
    .use(remarkMath)
    .use(remarkEmoji, { emoticon: false })
    .use(remarkRehype, {
      allowDangerousHtml: true,
      handlers: { inlineMath: assetHandler('math', false), math: assetHandler('math', true), code: codeHandler },
    })
    .use(rehypeRaw)
    .use(rehypeSanitize, {
      ...defaultSchema,
      protocols: { ...defaultSchema.protocols, src: ['http', 'https', 'data', 'file'] },
    });
  const tree = await processor.run(processor.parse(source));
  checkAbort();
  const images: Element[] = [];
  visit(tree, 'element', (node) => { if (node.tagName === 'img') images.push(node); });
  for (const node of images) {
    checkAbort();
    const request = assets.get(node.position?.start.offset);
    if (!request) {
      const source = String(node.properties.src ?? '');
      let embedded: string | null = imageData.test(source) ? source : null;
      if (!embedded && source && options.resolveImage) {
        try { embedded = await options.resolveImage(source); } catch { /* Show the placeholder below. */ }
        checkAbort();
      }
      if (embedded && imageData.test(embedded)) {
        node.properties.src = embedded;
      } else {
        const alt = String(node.properties.alt ?? source);
        node.tagName = 'span';
        node.properties = { role: 'img', ariaLabel: alt, style: 'color:#b42318;' };
        node.children = [{ type: 'text', value: `Image unavailable: ${alt}${source ? ` (${source})` : ''}` }];
      }
      continue;
    }
    try {
      const asset = await options.renderAsset(request);
      checkAbort();
      if (!/^data:image\/png;base64,[a-zA-Z0-9+/]+={0,2}$/.test(asset.src)
        || !Number.isFinite(asset.width) || asset.width <= 0
        || !Number.isFinite(asset.height) || asset.height <= 0
        || !Number.isFinite(asset.descent) || asset.descent < 0) {
        throw new Error('Invalid rendered image');
      }
      node.properties = {
        src: asset.src, alt: request.source, width: asset.width, height: asset.height,
        style: request.display || request.kind === 'mermaid'
          ? `display:block;margin:1em ${request.kind === 'mermaid' || mathAlignment === 'center' ? 'auto' : '0'};max-width:100%;height:auto;`
          : `vertical-align:-${asset.descent}px;`,
      };
      if (request.kind === 'math' && request.display) node.properties.dataMathAlignment = mathAlignment;
      if (asset.clipboard && request.kind === 'math' && !request.display) {
        node.properties.dataCopySrc = asset.clipboard.src;
        node.properties.dataCopyHeight = asset.clipboard.height;
        node.properties.dataCopyDescent = asset.clipboard.descent;
      }
    } catch {
      checkAbort();
      node.tagName = 'span';
      node.properties = { role: 'alert', style: 'color:#b42318;' };
      node.children = [
        { type: 'text', value: `Could not render ${request.kind === 'math' ? 'equation' : 'diagram'}: ` },
        { type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: request.source }] },
      ];
    }
  }
  highlightCode(tree);
  linkFragments(tree);
  const listDescendants = new WeakSet<Element>();
  visit(tree, 'element', (node, index, parent) => {
    const inListItem = node.tagName === 'li' || parent?.type === 'element' && listDescendants.has(parent);
    if (inListItem) listDescendants.add(node);
    if (['p', 'li', 'td', 'th'].includes(node.tagName)) {
      let gap = paragraphSpacing;
      if (node.tagName === 'p' && parent?.type === 'element' && parent.tagName === 'li') {
        const next = parent.children.slice(parent.children.indexOf(node) + 1).find((child) => child.type === 'element');
        if (next?.tagName !== 'p') gap = 0;
      }
      const firstItem = node.tagName === 'li'
        ? parent?.children.findIndex((child) => child.type === 'element' && child.tagName === 'li') : undefined;
      const itemGap = typeof index === 'number' && typeof firstItem === 'number' && index > firstItem ? bulletSpacing : 0;
      const lineHeight = inListItem && ['p', 'li'].includes(node.tagName) ? bulletLineSpacing : lineSpacing;
      node.properties.style = `line-height:${lineHeight};${node.tagName === 'p' ? `margin:0 0 ${gap}px;`
        : node.tagName === 'li' ? `padding:0;margin:0;margin-top:${itemGap}px;` : ''}`;
    }
    if (['ul', 'ol'].includes(node.tagName) && inListItem) {
      node.properties.style = `margin-top:${bulletSpacing}px;margin-bottom:0;`;
    }
    if (!anchorTags.has(node.tagName) || !node.position) return;
    node.properties.dataLine = node.position.start.line;
    node.properties.dataEndLine = node.position.end.line;
  });
  return { html: toHtml(tree), plainText: plainText(tree) };
}
