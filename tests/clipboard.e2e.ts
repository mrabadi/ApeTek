import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { clipboardPayload } from '../src/core/clipboard.js';
import { renderMarkdown } from '../src/core/markdown.js';

let browser: Browser;
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y3Yw5cAAAAASUVORK5CYII=';

before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

test('full rich copy retains editable prose and self-contained equation images with copy-safe formatting', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<article id="preview" class="preview" data-line="1"><h1 data-line="1">Title</h1><p data-end-line="3">Editable <strong>bold</strong> and <img src="${png}" width="48" height="24" style="vertical-align:-4px" alt="E=mc^2"> prose.</p></article>`);
    const payload = await page.locator('article').evaluate(clipboardPayload as (root: HTMLElement) => ReturnType<typeof clipboardPayload>);
    assert.match(payload.html, /<h1[^>]*>Title<\/h1>/);
    assert.match(payload.html, /<strong[^>]*>bold<\/strong>/);
    assert.match(payload.html, /src="data:image\/png;base64,/);
    assert.match(payload.html, /width="48" height="24"/);
    assert.match(payload.html, /vertical-align:\s*-4px/);
    assert.match(payload.html, /font-family:\s*Arial/);
    assert.match(payload.html, /font-size:\s*12pt/);
    assert.doesNotMatch(payload.html, /class=|data-line=|data-end-line=|id="preview"/);
    assert.match(payload.text, /Title\n/);
    assert.match(payload.text, /Editable bold and E=mc\^2 prose\./);
  } finally { await page.close(); }
});

test('partial heading selection copies only selected prose and retains its heading wrapper', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><p>Before outside</p><h2>Heading rest</h2><p>After outside</p></article>');
    const payload = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange();
      const text = root.querySelector('h2')!.firstChild!;
      range.setStart(text, 0); range.setEnd(text, 7);
      return make(root as HTMLElement, range);
    }, clipboardPayload.toString());
    assert.equal(payload.text, 'Heading');
    assert.match(payload.html, /<h2[^>]*>Heading<\/h2>/);
    assert.doesNotMatch(payload.html, /outside|rest/);
  } finally { await page.close(); }
});

test('partial table selection restores table structure, selected formula images and readable cell separators', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<article><p>outside before</p><table><tbody><tr><td>one alpha</td><td>Beta <img src="${png}" width="48" height="24" style="vertical-align:-4px" alt="E=x"> tail</td><td>gamma</td></tr><tr><td>after</td></tr></tbody></table><p>outside after</p></article>`);
    const payload = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const cells = root.querySelectorAll('td');
      const range = document.createRange();
      range.setStart(cells[0].firstChild!, 4); range.setEnd(cells[1], 2);
      return make(root as HTMLElement, range);
    }, clipboardPayload.toString());
    assert.equal(payload.text, 'alpha\tBeta E=x');
    assert.equal((payload.html.match(/<table(?:\s|>)/g) ?? []).length, 1);
    assert.equal((payload.html.match(/<tr(?:\s|>)/g) ?? []).length, 1);
    assert.equal((payload.html.match(/<td(?:\s|>)/g) ?? []).length, 2);
    assert.match(payload.html, /border-collapse:\s*collapse/);
    assert.match(payload.html, /border:\s*1px solid/);
    assert.match(payload.html, /alt="E=x"/);
    assert.doesNotMatch(payload.html, /outside|one |tail|gamma|after/);
  } finally { await page.close(); }
});

test('partial task-list copy keeps list nesting and numbering and converts task controls into visible symbols', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><ol start="3"><li>before</li><li><input type="checkbox" checked disabled> done<ul><li>nested</li></ul></li><li>after</li></ol></article>');
    const payload = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange();
      range.selectNodeContents(root.querySelectorAll('ol > li')[1]);
      return make(root as HTMLElement, range);
    }, clipboardPayload.toString());
    assert.equal(payload.text, '☑ done\nnested');
    assert.match(payload.html, /<ol start="4"/);
    assert.equal((payload.html.match(/<li(?:\s|>)/g) ?? []).length, 2);
    assert.match(payload.html, /<ul[^>]*>/);
    assert.match(payload.html, /padding-left:\s*20pt/);
    assert.doesNotMatch(payload.html, /<input|before|after/);
  } finally { await page.close(); }
});

test('headings, code, blockquotes and links carry portable inline styles while Prism colors survive', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><h2>Section</h2><blockquote><p><a href="https://example.com">A link</a></p><pre><code class="language-javascript"><span class="token keyword" style="color:#cf222e">const</span> total = 1;\nreturn total;</code></pre></blockquote></article>');
    const payload = await page.locator('article').evaluate(clipboardPayload as (root: HTMLElement) => ReturnType<typeof clipboardPayload>);
    assert.match(payload.html, /font-size:\s*18pt/);
    assert.match(payload.html, /white-space:\s*pre-wrap/);
    assert.match(payload.html, /font-family:\s*Consolas/);
    assert.match(payload.html, /border-left:\s*3pt solid/);
    assert.match(payload.html, /text-decoration:\s*underline/);
    assert.match(payload.html, /href="https:\/\/example.com"/);
    assert.match(payload.html, /color:\s*(?:#cf222e|rgb\(207, 34, 46\))/);
    assert.doesNotMatch(payload.html, /class=/);
    assert.match(payload.text, /const total = 1;\nreturn total;/);
  } finally { await page.close(); }
});

test('hidden source content and application attributes are removed and nonembedded images become safe placeholders', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<article><p>Visible<span hidden>HIDDEN</span><span style="display:none">LATEX SOURCE</span><span aria-hidden="true">ASSISTIVE SOURCE</span></p><img src="blob:local-equation" alt="Equation"><img src="file:///tmp/chart.png" alt="Chart"><img src="${png}" width="8" height="8" alt="Safe" srcset="file:///tmp/other.png 2x" data-tex="raw source" loading="lazy" onerror="void 0"></article>`);
    const payload = await page.locator('article').evaluate(clipboardPayload as (root: HTMLElement) => ReturnType<typeof clipboardPayload>);
    assert.doesNotMatch(payload.html, /HIDDEN|LATEX SOURCE|ASSISTIVE SOURCE|blob:|file:|srcset=|data-tex=|loading=|onerror=|aria-hidden=/);
    assert.match(payload.html, /Image unavailable: Equation/);
    assert.match(payload.html, /Image unavailable: Chart/);
    assert.equal((payload.html.match(/<img(?:\s|>)/g) ?? []).length, 1);
    assert.match(payload.text, /Visible/);
    assert.doesNotMatch(payload.text, /HIDDEN|SOURCE/);
  } finally { await page.close(); }
});

test('selection copying is clipped to the preview root and empty or outside selections copy nothing', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<p id="before">before outside</p><article><p>inside selected</p></article><p>after outside</p>');
    const payloads = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange();
      range.setStart(document.querySelector('#before')!.firstChild!, 0);
      range.setEnd(root.querySelector('p')!.firstChild!, 6);
      const clipped = make(root as HTMLElement, range);
      range.selectNodeContents(document.querySelector('#before')!);
      const outside = make(root as HTMLElement, range);
      range.selectNodeContents(root); range.collapse(true);
      return { clipped, outside, empty: make(root as HTMLElement, range) };
    }, clipboardPayload.toString());
    assert.equal(payloads.clipped.text, 'inside');
    assert.doesNotMatch(payloads.clipped.html, /outside|before|after|selected/);
    assert.deepEqual(payloads.outside, { html: '', text: '' });
    assert.deepEqual(payloads.empty, { html: '', text: '' });
  } finally { await page.close(); }
});

test('partial highlighted-code copy restores pre/code wrappers and preserves selected indentation', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><p>outside</p><pre><code>outside\n    <span style="color:#cf222e">return</span> total  \noutside</code></pre><p>outside</p></article>');
    const payload = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const code = root.querySelector('code')!;
      const range = document.createRange();
      range.setStart(code.firstChild!, 8); range.setEnd(code.lastChild!, 8);
      return make(root as HTMLElement, range);
    }, clipboardPayload.toString());
    assert.equal(payload.text, '    return total  ');
    assert.match(payload.html, /<pre[^>]*><code[^>]*>    <span/);
    assert.match(payload.html, /color:\s*(?:#cf222e|rgb\(207, 34, 46\))/);
    assert.doesNotMatch(payload.html, /outside/);
  } finally { await page.close(); }
});

test('full and selected copy use padded inline equation images without changing the tight preview or display images', async () => {
  const page = await browser.newPage();
  const padded = 'data:image/png;base64,Y29weQ==';
  try {
    await page.setContent(`<article><p>outside <img src="${png}" width="48" height="24" style="height:24px;width:48px;vertical-align:-4px" alt="E=mc^2" data-copy-src="${padded}" data-copy-height="40" data-copy-descent="20"> prose</p><img src="${png}" width="80" height="30" style="display:block" alt="display"></article>`);
    const result = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const equation = root.querySelector('img')!;
      const range = document.createRange(); range.selectNode(equation);
      return {
        full: make(root as HTMLElement), selected: make(root as HTMLElement, range),
        preview: { src: equation.getAttribute('src'), height: equation.getAttribute('height'), style: equation.getAttribute('style') },
      };
    }, clipboardPayload.toString());
    for (const payload of [result.full, result.selected]) {
      assert.match(payload.html, /src="data:image\/png;base64,Y29weQ==" width="48" height="40"/);
      assert.match(payload.html, /height:\s*40px/);
      assert.match(payload.html, /vertical-align:\s*-20px/);
      assert.match(payload.html, /align="middle"/);
      assert.doesNotMatch(payload.html, /data-copy-/);
    }
    assert.equal(result.selected.text, 'E=mc^2');
    assert.doesNotMatch(result.selected.html, /outside|prose|alt="display"/);
    assert.equal((result.full.html.match(/align="middle"/g) ?? []).length, 1);
    assert.match(result.full.html, /width="80" height="30"[^>]*alt="display"/);
    assert.deepEqual(result.preview, { src: png, height: '24', style: 'height:24px;width:48px;vertical-align:-4px' });
  } finally { await page.close(); }
});

test('full and selected tables carry full-width CSS and legacy width for Writer', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><table><tbody><tr><th>Column</th><th>Formula</th></tr><tr><td>Selected cell</td><td>Other cell</td></tr></tbody></table></article>');
    const payloads = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange(); range.selectNodeContents(root.querySelector('td')!);
      return [make(root as HTMLElement), make(root as HTMLElement, range)];
    }, clipboardPayload.toString());
    for (const payload of payloads) {
      assert.match(payload.html, /<table[^>]*width="100%"/);
      assert.match(payload.html, /width:\s*100%/);
    }
    assert.equal(payloads[1].text, 'Selected cell');
    assert.doesNotMatch(payloads[1].html, /Other cell|Column|Formula/);
  } finally { await page.close(); }
});

test('display equations and diagrams copy in centered paragraphs while tight assets and preview layout stay unchanged', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<article><p>Inline <img src="${png}" width="48" height="24" style="vertical-align:-4px" alt="inline"> prose</p><img src="${png}" width="120" height="32" style="display:block;margin:1em auto;max-width:100%;height:auto" alt="display"><img src="${png}" width="160" height="90" style="display:block;margin:1em auto" alt="diagram"></article>`);
    const result = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange(); range.selectNode(root.querySelector('img[alt="display"]')!);
      const full = make(root as HTMLElement), selected = make(root as HTMLElement, range);
      const fullRoot = document.createElement('div'); fullRoot.innerHTML = full.html;
      const selectedRoot = document.createElement('div'); selectedRoot.innerHTML = selected.html;
      const images = [fullRoot.querySelector('img[alt="display"]')!, fullRoot.querySelector('img[alt="diagram"]')!, selectedRoot.querySelector('img')!];
      return {
        full, selected,
        blocks: images.map((image) => ({ parent: image.parentElement!.tagName, textAlign: image.parentElement!.style.textAlign,
          display: (image as HTMLElement).style.display, margin: (image as HTMLElement).style.margin, src: image.getAttribute('src') })),
        inlineCentered: fullRoot.querySelector('img[alt="inline"]')!.parentElement!.style.textAlign === 'center',
        previewDisplay: (root.querySelector('img[alt="display"]') as HTMLElement).style.display,
      };
    }, clipboardPayload.toString());
    for (const block of result.blocks) assert.deepEqual(block, { parent: 'P', textAlign: 'center', display: 'inline-block', margin: '0px', src: png });
    assert.equal(result.inlineCentered, false);
    assert.equal(result.previewDisplay, 'block');
    assert.equal(result.selected.text, 'display');
    assert.match(result.selected.html, /width="120" height="32"/);
    assert.doesNotMatch(result.selected.html, /Inline|prose|alt="diagram"|align="middle"/);
  } finally { await page.close(); }
});

test('full copy retains safe semantic heading and footnote bookmark targets while removing the application root ID', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article id="preview"><h2 id="user-content-heading">Heading</h2><p><a href="#user-content-heading">Jump</a><a id="user-content-fnref-1" href="#user-content-fn-1">1</a></p><ol><li id="user-content-fn-1">Note <a href="#user-content-fnref-1">Back</a></li></ol></article>');
    const payload = await page.locator('article').evaluate(clipboardPayload as (root: HTMLElement) => ReturnType<typeof clipboardPayload>);
    const ids = new Set(Array.from(payload.html.matchAll(/\sid="([^"]+)"/g), (match) => match[1]));
    const targets = Array.from(payload.html.matchAll(/\shref="#([^"]+)"/g), (match) => decodeURIComponent(match[1]));
    assert.equal(ids.size, 3);
    assert.deepEqual(targets.filter((target) => !ids.has(target)), []);
    assert.doesNotMatch(payload.html, /id="preview"/);
  } finally { await page.close(); }
});

test('math alignment and both scaled image layouts survive full and selected copying while Mermaid remains centered', async () => {
  const page = await browser.newPage();
  const padded = 'data:image/png;base64,Y29weQ==';
  try {
    for (const [mathAlignment, mathScale] of [['left', 100], ['center', 150]] as const) {
      const factor = mathScale / 100;
      const rendered = await renderMarkdown('Inline $x$.\n\n$$\ny\n$$\n\n```mermaid\nflowchart TD\nA --> B\n```', {
        mathAlignment, mathScale,
        renderAsset: async (request) => request.kind === 'mermaid'
          ? { src: png, width: 160, height: 90, descent: 0 }
          : { src: png, width: 48 * factor, height: 24 * factor, descent: 4 * factor,
            ...(!request.display ? { clipboard: { src: padded, height: 40 * factor, descent: 20 * factor } } : {}) },
      });
      await page.setContent(`<article>${rendered.html}</article>`);
      const result = await page.locator('article').evaluate((root, functionSource) => {
        const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
        const original = root.querySelector('img[alt="y"]') as HTMLImageElement;
        const range = document.createRange(); range.selectNode(original);
        const full = make(root as HTMLElement), selected = make(root as HTMLElement, range);
        const fullRoot = document.createElement('div'); fullRoot.innerHTML = full.html;
        const selectedRoot = document.createElement('div'); selectedRoot.innerHTML = selected.html;
        const inline = fullRoot.querySelector('img[alt="x"]') as HTMLImageElement;
        return {
          full, selected,
          blocks: [fullRoot.querySelector('img[alt="y"]')!, selectedRoot.querySelector('img')!].map((image) => ({
            alignment: image.parentElement!.style.textAlign, width: image.getAttribute('width'), height: image.getAttribute('height'), src: image.getAttribute('src'),
          })),
          inline: { width: inline.getAttribute('width'), height: inline.getAttribute('height'), verticalAlign: inline.style.verticalAlign, legacyAlign: inline.getAttribute('align'), src: inline.getAttribute('src') },
          diagramAlignment: fullRoot.querySelector('img[alt^="flowchart"]')!.parentElement!.style.textAlign,
          preview: { height: original.getAttribute('height'), alignment: original.getAttribute('data-math-alignment'), src: original.getAttribute('src') },
        };
      }, clipboardPayload.toString());
      for (const block of result.blocks) assert.deepEqual(block, { alignment: mathAlignment, width: String(48 * factor), height: String(24 * factor), src: png });
      assert.deepEqual(result.inline, { width: String(48 * factor), height: String(40 * factor), verticalAlign: `-${20 * factor}px`, legacyAlign: 'middle', src: padded });
      assert.equal(result.diagramAlignment, 'center');
      assert.deepEqual(result.preview, { height: String(24 * factor), alignment: mathAlignment, src: png });
      assert.equal(result.selected.text, 'y');
      assert.doesNotMatch(result.full.html, /data-math-alignment|data-copy-/);
      assert.doesNotMatch(result.selected.html, /Inline|flowchart|data-math-alignment|data-copy-/);
    }
  } finally { await page.close(); }
});

test('default and selected prose spacing survive full and partial copy without duplicate paragraph margins', async () => {
  const page = await browser.newPage();
  try {
    for (const [settings, lineSpacing, paragraphSpacing] of [
      [{}, 1, 13], [{ lineSpacing: 1.5, paragraphSpacing: 24 }, 1.5, 24],
    ] as const) {
      const rendered = await renderMarkdown('## Heading\n\nSelected paragraph text.\n\nOther paragraph.\n\n- List item\n\n| Heading cell |\n| --- |\n| Body cell |\n\n```javascript\nconst value = 1;\n```', {
        ...settings, bulletLineSpacing: lineSpacing, renderAsset: async () => ({ src: png, width: 48, height: 24, descent: 4 }),
      });
      await page.setContent(`<article>${rendered.html}</article>`);
      const result = await page.locator('article').evaluate((root, functionSource) => {
        const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
        const before = root.innerHTML;
        const range = document.createRange();
        range.setStart(root.querySelector('p')!.firstChild!, 0);
        range.setEnd(root.querySelector('p')!.firstChild!, 8);
        const full = make(root as HTMLElement), selected = make(root as HTMLElement, range);
        const helpers = { parse(payload: { html: string }) {
          const copied = document.createElement('div'); copied.innerHTML = payload.html;
          return {
            prose: Array.from(copied.querySelectorAll<HTMLElement>('p,li,td,th')).map((element) => ({
              tag: element.tagName, lineHeight: element.style.lineHeight,
              margin: [element.style.marginTop, element.style.marginRight, element.style.marginBottom, element.style.marginLeft],
              margins: (element.getAttribute('style')?.match(/(?:^|;)\s*margin\s*:/g) ?? []).length,
            })),
            heading: copied.querySelector<HTMLElement>('h2')?.style.fontSize,
            code: copied.querySelector<HTMLElement>('code')?.style.fontSize,
          };
        } };
        return { full: helpers.parse(full), selected: helpers.parse(selected), selectedText: selected.text, previewUnchanged: before === root.innerHTML };
      }, clipboardPayload.toString());
      for (const copied of [result.full, result.selected]) {
        for (const prose of copied.prose) {
          assert.equal(prose.lineHeight, String(lineSpacing));
          if (prose.tag === 'P') {
            assert.deepEqual(prose.margin, ['0px', '0px', `${paragraphSpacing}px`, '0px']);
            assert.equal(prose.margins, 1, 'one normalized paragraph margin');
          }
        }
      }
      assert.equal(result.full.prose.length, 5);
      assert.equal(result.selected.prose.length, 1);
      assert.equal(result.full.heading, '18pt');
      assert.equal(result.full.code, '10pt');
      assert.equal(result.selectedText, 'Selected');
      assert.equal(result.previewUnchanged, true);
    }
  } finally { await page.close(); }
});

test('block image copy preserves an existing prose paragraph layout and standalone equation margins', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<article><p style="line-height:1.5;margin:0 0 24px"><img src="${png}" width="48" height="24" alt="inside" style="display:block;margin:1em 0" data-math-alignment="left"></p><img src="${png}" width="48" height="24" alt="standalone" style="display:block;margin:1em auto"></article>`);
    const result = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const range = document.createRange(); range.selectNode(root.querySelector('img')!);
      const helpers = { parse(payload: { html: string }) {
        const copied = document.createElement('div'); copied.innerHTML = payload.html;
        return Array.from(copied.querySelectorAll<HTMLImageElement>('img')).map((image) => ({
          alt: image.alt, lineHeight: image.parentElement!.style.lineHeight,
          margin: image.parentElement!.style.margin, textAlign: image.parentElement!.style.textAlign,
        }));
      } };
      return { full: helpers.parse(make(root as HTMLElement)), selected: helpers.parse(make(root as HTMLElement, range)) };
    }, clipboardPayload.toString());
    const existing = { alt: 'inside', lineHeight: '1.5', margin: '0px 0px 24px', textAlign: 'left' };
    assert.deepEqual(result.full[0], existing);
    assert.deepEqual(result.selected, [existing]);
    assert.deepEqual(result.full[1], { alt: 'standalone', lineHeight: '', margin: '10pt 0px', textAlign: 'center' });
  } finally { await page.close(); }
});

test('copy-safe defaults add no padding or margins to unstyled list items', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent('<article><ul><li>First</li><li>Second</li></ul><ol><li>Ordered</li></ol></article>');
    const styles = await page.locator('article').evaluate((root, functionSource) => {
      const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
      const copied = document.createElement('div'); copied.innerHTML = make(root as HTMLElement).html;
      return Array.from(copied.querySelectorAll<HTMLElement>('li')).map((item) => ({ padding: item.style.padding, margin: item.style.margin, lineHeight: item.style.lineHeight }));
    }, clipboardPayload.toString());
    assert.deepEqual(styles, Array.from({ length: 3 }, () => ({ padding: '0px', margin: '0px', lineHeight: '1' })));
  } finally { await page.close(); }
});

test('full and partial list copies preserve chosen gaps, independent line spacing and loose paragraph layout', async () => {
  const page = await browser.newPage();
  const source = 'Outside paragraph.\n\n3. Omitted first item\n4. Selected first paragraph\n   wrapped line.\n\n   Selected second paragraph.\n\n   - Nested first\n   - Nested second\n5. Selected final item\n\n- [x] Done task\n- [ ] Pending task';
  try {
    for (const [settings, gap, lineHeight] of [[{}, 8, 1], [{ bulletSpacing: 12, bulletLineSpacing: 2 }, 12, 2]] as const) {
      const rendered = await renderMarkdown(source, { ...settings, lineSpacing: 1.65, paragraphSpacing: 24,
        renderAsset: async () => ({ src: png, width: 48, height: 24, descent: 4 }) });
      await page.setContent(`<article>${rendered.html}</article>`);
      const result = await page.locator('article').evaluate((root, functionSource) => {
        const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
        const before = root.innerHTML;
        const ordered = root.querySelector('ol')!;
        const items = Array.from(ordered.children).filter((element) => element.tagName === 'LI');
        const range = document.createRange(); range.setStart(items[1], 0); range.setEnd(items[2], items[2].childNodes.length);
        const helpers = { inspect(payload: { html: string; text: string }) {
          const copied = document.createElement('div'); copied.innerHTML = payload.html;
          document.body.appendChild(copied);
          const outer = copied.querySelector('ol')!;
          const nested = outer.querySelector<HTMLElement>('ul')!;
          const nestedItems = Array.from(nested.children) as HTMLElement[];
          const result = {
            start: outer.getAttribute('start'), text: payload.text,
            outer: Array.from(outer.children).filter((element) => element.tagName === 'LI').map((item) => ({
              top: (item as HTMLElement).style.marginTop, bottom: (item as HTMLElement).style.marginBottom,
              paragraphTop: item.querySelector<HTMLElement>(':scope > p')?.style.marginTop ?? '0px',
              padding: (item as HTMLElement).style.padding, lineHeight: (item as HTMLElement).style.lineHeight,
            })),
            nested: { top: nested.style.marginTop, bottom: nested.style.marginBottom,
              itemTops: nestedItems.map((item) => item.style.marginTop),
              physicalEntryGap: nestedItems[0].getBoundingClientRect().top - nested.previousElementSibling!.getBoundingClientRect().bottom,
              physicalPeerGap: nestedItems[1].getBoundingClientRect().top - nestedItems[0].getBoundingClientRect().bottom },
            paragraphs: Array.from(outer.querySelectorAll<HTMLElement>('p')).map((paragraph) => ({
              text: paragraph.textContent, lineHeight: paragraph.style.lineHeight, bottom: paragraph.style.marginBottom,
            })),
            globalLineHeight: copied.querySelector<HTMLElement>('article > p')?.style.lineHeight,
          };
          copied.remove();
          return result;
        } };
        return { full: helpers.inspect(make(root as HTMLElement)), selected: helpers.inspect(make(root as HTMLElement, range)), previewUnchanged: before === root.innerHTML };
      }, clipboardPayload.toString());
      assert.equal(result.full.start, '3');
      assert.equal(result.selected.start, '4');
      assert.deepEqual(result.full.outer.map((item) => Number.parseFloat(item.top) + Number.parseFloat(item.paragraphTop)), [0, gap, gap]);
      assert.deepEqual(result.selected.outer.map((item) => Number.parseFloat(item.top) + Number.parseFloat(item.paragraphTop)), [0, gap]);
      for (const payload of [result.full, result.selected]) {
        for (const item of payload.outer) assert.deepEqual({ bottom: item.bottom, padding: item.padding, lineHeight: item.lineHeight }, { bottom: '0px', padding: '0px', lineHeight: String(lineHeight) });
        assert.equal(Number.parseFloat(payload.nested.top) + Number.parseFloat(payload.nested.itemTops[0]), gap);
        assert.equal(payload.nested.bottom, '0px');
        assert.equal(payload.nested.itemTops[1], `${gap}px`);
        assert.ok(Math.abs(payload.nested.physicalEntryGap - gap) < 0.1);
        assert.ok(Math.abs(payload.nested.physicalPeerGap - gap) < 0.1);
        for (const paragraph of payload.paragraphs) {
          assert.equal(paragraph.lineHeight, String(lineHeight));
          assert.equal(paragraph.bottom, paragraph.text?.startsWith('Selected first') ? '24px' : '0px');
        }
      }
      assert.equal(result.full.globalLineHeight, '1.65');
      assert.match(result.full.text, /☑ Done task/);
      assert.match(result.full.text, /☐ Pending task/);
      assert.doesNotMatch(result.selected.text, /Outside|Omitted|Done|Pending/);
      assert.equal(result.previewUnchanged, true);
    }
  } finally { await page.close(); }
});

test('portable loose paragraphs and nested entries carry list gaps in Writer-supported styles without doubling browser gaps', async () => {
  const page = await browser.newPage();
  const source = '- Loose first paragraph.\n\n  Continued first paragraph.\n\n  - Nested first\n  - Nested second\n\n- Loose second paragraph.\n\n- Loose third paragraph.';
  try {
    for (const gap of [8, 12]) {
      const rendered = await renderMarkdown(source, { bulletSpacing: gap, bulletLineSpacing: 2, paragraphSpacing: 24,
        renderAsset: async () => ({ src: png, width: 48, height: 24, descent: 4 }) });
      await page.setContent(`<article>${rendered.html}</article>`);
      const result = await page.locator('article').evaluate((root, functionSource) => {
        const make = new Function(`return (${functionSource})`)() as typeof clipboardPayload;
        const before = root.innerHTML;
        const copied = document.createElement('div'); copied.innerHTML = make(root as HTMLElement).html;
        document.body.appendChild(copied);
        const list = copied.querySelector('ul')!;
        const items = Array.from(list.children) as HTMLElement[];
        const first = items[0].querySelector<HTMLElement>('p')!;
        const continued = first.nextElementSibling as HTMLElement;
        const second = items[1].querySelector<HTMLElement>('p')!;
        const nested = items[0].querySelector<HTMLElement>('ul')!;
        const child = nested.querySelector<HTMLElement>('li')!;
        const result = {
          looseCarrier: { itemTop: items[1].style.marginTop, paragraphTop: second.style.marginTop },
          nestedCarrier: { listTop: nested.style.marginTop, itemTop: child.style.marginTop },
          physicalPeerGap: second.getBoundingClientRect().top - items[0].getBoundingClientRect().bottom,
          physicalEntryGap: child.getBoundingClientRect().top - continued.getBoundingClientRect().bottom,
          physicalParagraphGap: continued.getBoundingClientRect().top - first.getBoundingClientRect().bottom,
          retained: { firstBottom: first.style.marginBottom, continuedBottom: continued.style.marginBottom, secondBottom: second.style.marginBottom, lineHeight: second.style.lineHeight },
          previewUnchanged: before === root.innerHTML,
        };
        copied.remove(); return result;
      }, clipboardPayload.toString());
      assert.ok(Math.abs(result.physicalPeerGap - gap) < 0.1);
      assert.ok(Math.abs(result.physicalEntryGap - gap) < 0.1);
      assert.ok(Math.abs(result.physicalParagraphGap - 24) < 0.1);
      assert.deepEqual(result.looseCarrier, { itemTop: '0px', paragraphTop: `${gap}px` });
      assert.deepEqual(result.nestedCarrier, { listTop: '0px', itemTop: `${gap}px` });
      assert.deepEqual(result.retained, { firstBottom: '24px', continuedBottom: '0px', secondBottom: '0px', lineHeight: '2' });
      assert.equal(result.previewUnchanged, true);
    }
  } finally { await page.close(); }
});
