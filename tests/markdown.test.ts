import assert from 'node:assert/strict';
import test from 'node:test';
import { renderMarkdown } from '../src/core/markdown.js';
import type { AssetRequest, RenderedAsset } from '../src/shared/types.js';

const image: RenderedAsset = {
  src: 'data:image/png;base64,iVBORw0KGgo=', width: 48, height: 24, descent: 4,
};

test('inline and display TeX render as portable PNG images with readable plain text', async () => {
  const requests: AssetRequest[] = [];
  const rendered = await renderMarkdown('Energy $E=mc^2$.\n\n$$\n\\frac{a}{b}\n$$', {
    renderAsset: async (request) => { requests.push(request); return image; },
  });
  assert.deepEqual(requests, [
    { kind: 'math', source: 'E=mc^2', display: false, fontSize: 12.75 },
    { kind: 'math', source: '\\frac{a}{b}', display: true, fontSize: 12.75 },
  ]);
  assert.equal((rendered.html.match(/<img /g) ?? []).length, 2);
  assert.match(rendered.html, /src="data:image\/png;base64,iVBORw0KGgo="/);
  assert.match(rendered.html, /alt="E=mc\^2"/);
  assert.match(rendered.html, /width="48" height="24"/);
  assert.match(rendered.html, /vertical-align:-4px/);
  assert.match(rendered.plainText, /Energy E=mc\^2\./);
  assert.match(rendered.plainText, /\\frac\{a\}\{b\}/);
});

test('GitHub tables, tasks, strikeout, nested lists and named emoji survive rendering', async () => {
  const rendered = await renderMarkdown('# Notes :sparkles:\n\n~~old~~ **new**\n\n- [x] Done\n  - Nested\n- [ ] Pending\n\n| Name | Value |\n| --- | --- |\n| Math | $x^2$ |', {
    renderAsset: async () => image,
  });
  assert.match(rendered.html, /<h1[^>]*>Notes ✨<\/h1>/);
  assert.match(rendered.html, /<del>old<\/del>/);
  assert.match(rendered.html, /<strong>new<\/strong>/);
  assert.match(rendered.html, /<table(?:\s[^>]*)?>/);
  assert.match(rendered.html, /type="checkbox" checked disabled/);
  assert.match(rendered.html, /Nested/);
  assert.match(rendered.plainText, /\[x\] Done/);
  assert.match(rendered.plainText, /Name\tValue/);
  assert.match(rendered.plainText, /Math\tx\^2/);
});

test('safe raw HTML is retained while scripts, event handlers, CSS and unsafe links are removed', async () => {
  const rendered = await renderMarkdown('<div style="background:url(https://tracker.invalid)"><em>Raw HTML</em><script>alert(1)</script><img src="x" onerror="alert(2)"><a href="javascript:alert(3)">bad</a></div>\n\n[good](https://example.com)', {
    renderAsset: async () => image,
  });
  assert.match(rendered.html, /<em>Raw HTML<\/em>/);
  assert.match(rendered.html, /href="https:\/\/example.com"/);
  assert.doesNotMatch(rendered.html, /script|onerror|javascript:|tracker\.invalid|alert\(/);
  assert.match(rendered.plainText, /Raw HTML/);
});

test('Mermaid fences become portable diagram images while ordinary code remains literal', async () => {
  const requests: AssetRequest[] = [];
  const rendered = await renderMarkdown('```mermaid\nflowchart TD\nA --> B\n```\n\n```python\nprint("$literal$")\n```\n\n`$also_literal$` and \\$5', {
    renderAsset: async (request) => { requests.push(request); return image; },
  });
  assert.deepEqual(requests, [{ kind: 'mermaid', source: 'flowchart TD\nA --> B' }]);
  assert.equal((rendered.html.match(/<img /g) ?? []).length, 1);
  assert.match(rendered.html, /alt="flowchart TD/);
  assert.match(rendered.html, /class="language-python"/);
  assert.match(rendered.plainText, /print\("\$literal\$"\)/);
  assert.match(rendered.html, /<code>\$also_literal\$<\/code> and \$5/);
  assert.match(rendered.plainText, /flowchart TD\nA --> B/);
});

test('fenced code highlights common languages with portable inline token styles and safe unknown-language fallback', async () => {
  const rendered = await renderMarkdown('```python\ndef answer():\n    return 42\n```\n\n```javascript\nconst value = true;\n```\n\n```not-a-language\n<script>literal</script>\n```', {
    renderAsset: async () => { throw new Error('Code must not be rendered as an asset'); },
  });
  assert.match(rendered.html, /class="token keyword" style="color:/);
  assert.match(rendered.html, /class="token boolean" style="color:/);
  assert.match(rendered.html, /class="language-not-a-language"/);
  assert.doesNotMatch(rendered.html, /<script>/);
  assert.match(rendered.plainText, /def answer\(\):\n    return 42/);
  assert.match(rendered.plainText, /<script>literal<\/script>/);
});

test('invalid equations and diagrams display their source without interrupting other content', async () => {
  const rendered = await renderMarkdown('Before $\\unsupported{a}$ and **after**.\n\n```mermaid\nbad diagram\n```\n\n$x$', {
    renderAsset: async (request) => {
      if (request.source !== 'x') throw new Error('Invalid asset');
      return image;
    },
  });
  assert.equal((rendered.html.match(/role="alert"/g) ?? []).length, 2);
  assert.match(rendered.html, /\\unsupported\{a\}/);
  assert.match(rendered.html, /bad diagram/);
  assert.match(rendered.html, /<strong>after<\/strong>/);
  assert.equal((rendered.html.match(/<img /g) ?? []).length, 1);
  assert.match(rendered.plainText, /\\unsupported\{a\}/);
});

test('preview blocks carry original source line ranges for scroll anchors after rendering', async () => {
  const rendered = await renderMarkdown('# Title\n\nParagraph\nwrapped\n\n$$\nx=1\n$$\n\n```python\nprint(1)\n```\n\n- item', {
    renderAsset: async () => image,
  });
  assert.match(rendered.html, /<h1[^>]*data-line="1" data-end-line="1">Title<\/h1>/);
  assert.match(rendered.html, /<p(?=[^>]*data-line="3")(?=[^>]*data-end-line="4")[^>]*>Paragraph\nwrapped<\/p>/);
  assert.match(rendered.html, /<img [^>]*data-line="6" data-end-line="8"/);
  assert.match(rendered.html, /<pre data-line="10" data-end-line="12">/);
  assert.match(rendered.html, /<li(?=[^>]*data-line="14")(?=[^>]*data-end-line="14")[^>]*>item<\/li>/);
});

test('document images are embedded for copying and unresolved images have a visible safe placeholder', async () => {
  const requested: string[] = [];
  const rendered = await renderMarkdown(`![Chart](figures/chart.png)\n\n<img src="missing.png" alt="Missing chart">\n\n![Already embedded](${image.src})`, {
    renderAsset: async () => image,
    resolveImage: async (source) => { requested.push(source); return source === 'figures/chart.png' ? image.src : null; },
  });
  assert.deepEqual(requested, ['figures/chart.png', 'missing.png']);
  assert.equal((rendered.html.match(/<img /g) ?? []).length, 2);
  assert.equal((rendered.html.match(/src="data:image\/png;base64,/g) ?? []).length, 2);
  assert.doesNotMatch(rendered.html, /src="(?:figures|missing)/);
  assert.match(rendered.html, /Image unavailable: Missing chart/);
  assert.match(rendered.plainText, /Chart/);
  assert.match(rendered.plainText, /Image unavailable: Missing chart/);
});

test('invalid raster results cannot create remote or malformed equation images', async () => {
  for (const invalid of [
    { ...image, src: 'https://example.com/remote.png' },
    { ...image, width: -1 },
    { ...image, descent: Number.NaN },
  ]) {
    const rendered = await renderMarkdown('$x$', { renderAsset: async () => invalid });
    assert.doesNotMatch(rendered.html, /<img /);
    assert.match(rendered.html, /role="alert"/);
    assert.match(rendered.plainText, /x/);
  }
});

test('inline math exposes trusted copy-image metadata while preview images retain tight dimensions', async () => {
  const padded = { src: 'data:image/png;base64,Y29weQ==', height: 40, descent: 20 };
  const rendered = await renderMarkdown('$x$\n\n$$\ny\n$$\n\n```mermaid\nflowchart TD\nA --> B\n```', {
    renderAsset: async (request) => request.kind === 'math' && !request.display
      ? { ...image, clipboard: padded } : image,
  });
  assert.equal((rendered.html.match(/data-copy-src=/g) ?? []).length, 1);
  assert.match(rendered.html, /data-copy-src="data:image\/png;base64,Y29weQ=="/);
  assert.match(rendered.html, /data-copy-height="40"/);
  assert.match(rendered.html, /data-copy-descent="20"/);
  assert.equal((rendered.html.match(/<img src="data:image\/png;base64,iVBORw0KGgo="/g) ?? []).length, 3);
  assert.equal((rendered.html.match(/width="48" height="24"/g) ?? []).length, 3);
  assert.match(rendered.html, /vertical-align:-4px/);
});

test('file URL images reach the local resolver and never remain as active file references', async () => {
  const requested: string[] = [];
  const source = '![Local chart](file:///tmp/chart.png)';
  const resolved = await renderMarkdown(source, {
    renderAsset: async () => image,
    resolveImage: async (value) => { requested.push(value); return image.src; },
  });
  assert.deepEqual(requested, ['file:///tmp/chart.png']);
  assert.match(resolved.html, /src="data:image\/png;base64,/);
  assert.doesNotMatch(resolved.html, /(?:src|href)="file:/);
  const unresolved = await renderMarkdown(source, { renderAsset: async () => image });
  assert.doesNotMatch(unresolved.html, /<img |(?:src|href)="file:/);
  assert.match(unresolved.html, /Image unavailable: Local chart/);
});

test('footnotes, backreferences and raw internal links target sanitized IDs without removing clobber protection', async () => {
  const rendered = await renderMarkdown('A note[^1].\n\n[^1]: Footnote text.\n\n<span id="location">Target</span> [local](#location)', {
    renderAsset: async () => image,
  });
  const ids = new Set(Array.from(rendered.html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));
  const targets = Array.from(rendered.html.matchAll(/\shref="#([^"]+)"/g), (match) => decodeURIComponent(match[1]));
  assert.equal(targets.length, 3);
  assert.deepEqual(targets.filter((target) => !ids.has(target)), []);
  assert.ok(ids.has('user-content-location'));
  assert.doesNotMatch(rendered.html, /id="location"/);
});

test('headings receive unique safe slugs and internal links resolve duplicate, Unicode and explicit targets', async () => {
  const rendered = await renderMarkdown('[first](#a-title) [second](#a-title-1) [unicode](#caf%C3%A9) [explicit](#custom) [safe](#location)\n\n# A *Title*!\n\n## A Title!\n\n## Café\n\n<h2 id="custom">Explicit</h2>\n\n## location', {
    renderAsset: async () => image,
  });
  for (const id of ['user-content-a-title', 'user-content-a-title-1', 'user-content-café', 'user-content-custom', 'user-content-location']) {
    assert.match(rendered.html, new RegExp(`id="${id}"`));
  }
  const ids = new Set(Array.from(rendered.html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));
  const targets = Array.from(rendered.html.matchAll(/\shref="#([^"]+)"/g), (match) => decodeURIComponent(match[1]));
  assert.equal(ids.size, 5);
  assert.deepEqual(targets.filter((target) => !ids.has(target)), []);
  assert.doesNotMatch(rendered.html, /id="location"/);
});

test('display math defaults to left alignment with optional centering while TeX internals and Mermaid stay unchanged', async () => {
  const formula = String.raw`\begin{aligned}a &= b \\ c &= d\end{aligned}`;
  const source = `$z$\n\n$$\n${formula}\n$$\n\n\`\`\`mermaid\nflowchart TD\nA --> B\n\`\`\``;
  const requests: AssetRequest[] = [];
  const renderAsset = async (request: AssetRequest) => { requests.push(request); return image; };
  const left = await renderMarkdown(source, { renderAsset });
  const center = await renderMarkdown(source, { renderAsset, mathAlignment: 'center' });
  assert.equal((left.html.match(/data-math-alignment="left"/g) ?? []).length, 1);
  assert.equal((center.html.match(/data-math-alignment="center"/g) ?? []).length, 1);
  assert.match(left.html, /display:block;margin:1em 0;/);
  assert.equal((left.html.match(/margin:1em auto;/g) ?? []).length, 1);
  assert.equal((center.html.match(/margin:1em auto;/g) ?? []).length, 2);
  const expectedMathRequests = [
    { kind: 'math', source: 'z', display: false, fontSize: 12.75 },
    { kind: 'math', source: formula, display: true, fontSize: 12.75 },
  ];
  assert.deepEqual(requests.filter((request) => request.kind === 'math'), [
    ...expectedMathRequests, ...expectedMathRequests,
  ]);
  assert.deepEqual(requests.filter((request) => request.kind === 'mermaid'), [
    { kind: 'mermaid', source: 'flowchart TD\nA --> B' },
    { kind: 'mermaid', source: 'flowchart TD\nA --> B' },
  ]);
});

test('global math scale reaches inline and display raster requests with safe bounds and preserves raster and copy metrics', async () => {
  const source = '$x$\n\n$$\ny\n$$\n\n```mermaid\nflowchart TD\nA --> B\n```';
  for (const [scale, expectedFont] of [[undefined, 12.75], [50, 6.375], [75, 9.5625], [90, 11.475], [100, 12.75], [137, 17.4675], [150, 19.125], [200, 25.5], [NaN, 12.75], [Infinity, 12.75], [49, 12.75], [201, 12.75], [100.5, 12.75]] as const) {
    const requests: AssetRequest[] = [];
    const factor = expectedFont / 12.75;
    const rendered = await renderMarkdown(source, {
      mathScale: scale,
      renderAsset: async (request) => {
        requests.push(request);
        return request.kind === 'mermaid' ? image : {
          ...image, width: image.width * factor, height: image.height * factor, descent: image.descent * factor,
          ...(!request.display ? { clipboard: { src: 'data:image/png;base64,Y29weQ==', height: 40 * factor, descent: 20 * factor } } : {}),
        };
      },
    });
    assert.deepEqual(requests.filter((request) => request.kind === 'math'), [
      { kind: 'math', source: 'x', display: false, fontSize: expectedFont },
      { kind: 'math', source: 'y', display: true, fontSize: expectedFont },
    ]);
    assert.deepEqual(requests.filter((request) => request.kind === 'mermaid'), [{ kind: 'mermaid', source: 'flowchart TD\nA --> B' }]);
    assert.ok(rendered.html.includes(`width="${48 * factor}" height="${24 * factor}"`));
    assert.ok(rendered.html.includes(`vertical-align:-${4 * factor}px`));
    assert.ok(rendered.html.includes(`data-copy-height="${40 * factor}"`));
    assert.ok(rendered.html.includes(`data-copy-descent="${20 * factor}"`));
  }
});

test('prose spacing is single by default and configurable without changing heading or code typography', async () => {
  const source = '# Heading\n\nFirst line\nwrapped.\n\nSecond paragraph.\n\n- List item\n\n| Column |\n| --- |\n| Cell |\n\n```javascript\nconst value = 1;\n```\n\n<p style="line-height:9;margin:99px">Raw paragraph</p>';
  for (const [settings, lineHeight, paragraphGap] of [
    [{}, 1, 13],
    [{ lineSpacing: 1.5, paragraphSpacing: 24 }, 1.5, 24],
    [{ lineSpacing: 3, paragraphSpacing: 40 }, 3, 40],
    [{ lineSpacing: 1, paragraphSpacing: 0 }, 1, 0],
    [{ lineSpacing: Number.NaN, paragraphSpacing: Infinity }, 1, 13],
    [{ lineSpacing: 0.9, paragraphSpacing: -1 }, 1, 13],
    [{ lineSpacing: 3.1, paragraphSpacing: 41 }, 1, 13],
  ] as const) {
    const rendered = await renderMarkdown(source, { renderAsset: async () => image, bulletLineSpacing: lineHeight, ...settings });
    const prose = Array.from(rendered.html.matchAll(/<(p|li|td|th)(?=[\s>])([^>]*)>/g));
    assert.equal(prose.length, 6);
    for (const [, tag, attributes] of prose) {
      assert.ok(attributes.includes(`line-height:${lineHeight};`), `${tag} has configured line height`);
      if (tag === 'p') assert.ok(attributes.includes(`margin:0 0 ${paragraphGap}px;`), 'paragraph has one after-gap');
    }
    assert.doesNotMatch(rendered.html, /<(?:h1|pre|code)[^>]*style=/);
    assert.doesNotMatch(rendered.html, /line-height:9|margin:99px/);
    assert.match(rendered.plainText, /First line\nwrapped\./);
  }
});

test('aborting a pending render rejects and prevents subsequent equation raster requests', async () => {
  const controller = new AbortController();
  let release!: (asset: RenderedAsset) => void;
  let markStarted!: () => void;
  const firstAsset = new Promise<RenderedAsset>((resolve) => { release = resolve; });
  const started = new Promise<void>((resolve) => { markStarted = resolve; });
  const requests: AssetRequest[] = [];
  const rendering = renderMarkdown('$first$ and $second$.', {
    signal: controller.signal,
    renderAsset: async (request) => { requests.push(request); markStarted(); return firstAsset; },
  });
  const rejected = assert.rejects(rendering, { name: 'AbortError' });
  await started;
  controller.abort();
  release(image);
  await rejected;
  assert.deepEqual(requests.map((request) => request.source), ['first']);
  const preAbortedRequests: AssetRequest[] = [];
  await assert.rejects(renderMarkdown('$unused$', {
    signal: controller.signal,
    renderAsset: async (request) => { preAbortedRequests.push(request); return image; },
  }), { name: 'AbortError' });
  assert.deepEqual(preAbortedRequests, []);
});

test('tight, loose, ordered, task and nested lists have an 8px item gap and independent single line spacing by default', async () => {
  const examples = [
    ['- First item\n- Second item', [0, 8]],
    ['- First item\n\n- Second item', [0, 8]],
    ['1. First item\n2. Second item', [0, 8]],
    ['- [x] First item\n- [ ] Second item', [0, 8]],
    ['- Parent item\n\n  - First child\n  - Second child\n\n- Peer item', [0, 0, 8, 8]],
  ] as const;
  for (const [example, expectedGaps] of examples) {
    const rendered = await renderMarkdown(`Outside before.\n\n${example}\n\nOutside after.`, { lineSpacing: 1.5, renderAsset: async () => image });
    const items = Array.from(rendered.html.matchAll(/<li\b([^>]*)>/g));
    assert.deepEqual(items.map(([, attributes]) => Number(attributes.match(/margin-top:([\d.]+)px/)?.[1])), expectedGaps);
    for (const [, attributes] of items) {
      assert.match(attributes, /line-height:1;/);
      assert.match(attributes, /padding:0;/, 'list item padding must not add a vertical gap');
      assert.match(attributes, /margin:0;margin-top:/);
    }
    for (const [, attributes, content] of rendered.html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      assert.ok(attributes.includes(`margin:0 0 ${content.startsWith('Outside') ? 13 : 0}px;`));
      assert.ok(attributes.includes(`line-height:${content.startsWith('Outside') ? 1.5 : 1};`));
    }
    if (example.includes('Parent')) assert.match(rendered.html, /<ul style="margin-top:8px;margin-bottom:0;">/);
    if (example.includes('[x]')) {
      assert.match(rendered.html, /type="checkbox" checked disabled/);
      assert.match(rendered.html, /type="checkbox" disabled/);
    }
  }
});

test('bullet gap is bounded and independent of wrapped line and multi-paragraph item spacing', async () => {
  const source = '# Heading\n\nOutside paragraph.\n\n- First paragraph\n  wrapped line.\n\n  Second paragraph\n\n  - Nested one\n  - Nested two\n\n- Peer item\n\n1. Ordered one\n2. Ordered two\n\n- [x] Task one\n- [ ] Task two\n\n$$\nx=1\n$$\n\n```python\nprint(1)\n```';
  for (const [bulletSpacing, gap] of [[12, 12], [0, 0], [40, 40], [12.5, 12.5], [NaN, 8], [Infinity, 8], [-1, 8], [41, 8]] as const) {
    const rendered = await renderMarkdown(source, {
      bulletSpacing, bulletLineSpacing: 1.25, lineSpacing: 1.5, paragraphSpacing: 24, renderAsset: async () => image,
    });
    const items = Array.from(rendered.html.matchAll(/<li\b([^>]*)>/g));
    assert.deepEqual(items.map(([, attributes]) => Number(attributes.match(/margin-top:([\d.]+)px/)?.[1])), [0, 0, gap, gap, 0, gap, 0, gap]);
    for (const [, attributes] of items) {
      assert.match(attributes, /line-height:1\.25;/);
      assert.match(attributes, /padding:0;margin:0;/);
    }
    assert.ok(rendered.html.includes(`<ul style="margin-top:${gap}px;margin-bottom:0;">`));
    for (const [, attributes, content] of rendered.html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      const paragraphGap = content.startsWith('Outside') || content.startsWith('First') ? 24 : 0;
      assert.ok(attributes.includes(`line-height:${content.startsWith('Outside') ? 1.5 : 1.25};margin:0 0 ${paragraphGap}px;`), content);
    }
    assert.match(rendered.html, /display:block;margin:1em 0;/);
    assert.doesNotMatch(rendered.html, /<(?:h1|pre|code)[^>]*style=/);
  }
});

test('bullet line spacing validates its own range and reaches loose paragraphs inside nested blocks', async () => {
  const source = 'Outside paragraph.\n\n- First paragraph\n  wrapped line.\n\n  > Quoted bullet paragraph.\n\n  Final bullet paragraph.\n\n- Peer item';
  for (const [bulletLineSpacing, expected] of [[undefined, 1], [1.25, 1.25], [2, 2], [3, 3], [0.9, 1], [3.1, 1], [NaN, 1], [Infinity, 1]] as const) {
    const rendered = await renderMarkdown(source, { bulletLineSpacing, lineSpacing: 1.65, renderAsset: async () => image });
    for (const [, attributes] of rendered.html.matchAll(/<li\b([^>]*)>/g)) assert.ok(attributes.includes(`line-height:${expected};`));
    for (const [, attributes, content] of rendered.html.matchAll(/<p\b([^>]*)>([\s\S]*?)<\/p>/g)) {
      assert.ok(attributes.includes(`line-height:${content.startsWith('Outside') ? 1.65 : expected};`), content);
    }
  }
});
