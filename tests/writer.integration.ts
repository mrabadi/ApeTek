import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test, { after } from 'node:test';
import { _electron, type ElectronApplication, type Page } from 'playwright';
import type { RenderedAsset } from '../src/shared/types';
import { installClipboardGuard, restoreClipboardGuard } from './clipboard-guard';
import { setSlider } from './ui-sliders';

const run = promisify(execFile);
const root = process.cwd();
const script = path.join(root, 'scripts/writer-paste.py');

let sharedApplication: Promise<{ app: ElectronApplication; page: Page; userData: string }> | undefined;
function launchWriterApp() {
  return sharedApplication ??= createWriterApp();
}

async function createWriterApp() {
  const userData = await mkdtemp(path.join(os.tmpdir(), 'markdown-local-writer-app-'));
  const app = await _electron.launch({
    args: ['--require', path.join(root, 'tests/capture-main-errors.cjs'), '--ozone-platform=x11', path.join(root, 'dist/desktop/main.cjs')],
    env: { ...process.env, MARKDOWN_LOCAL_TEST: '1', MARKDOWN_LOCAL_USER_DATA: userData },
  });
  try {
    await installClipboardGuard(app);
    const page = await app.firstWindow();
    await page.waitForURL(/\/renderer\/index\.html$/);
    await page.waitForLoadState('load');
    await page.locator('.cm-content').waitFor();
    return { app, page, userData };
  } catch (error) {
    await app.evaluate(({ app: electron }) => electron.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
    throw error;
  }
}

after(async () => {
  if (!sharedApplication) return;
  const instance = await sharedApplication.catch(() => undefined);
  if (!instance) return;
  const { app, userData } = instance;
  try {
    const status = await restoreClipboardGuard(app);
    console.info(`Writer clipboard restoration: ${status}`);
  } finally {
    await app.evaluate(({ app: electron }) => electron.exit(0)).catch(() => {});
    await app.close().catch(() => {});
    await rm(userData, { recursive: true, force: true });
  }
});

interface WriterReport {
  ok: boolean;
  text: string;
  headingCount: number;
  listCount: number;
  tableCount: number;
  embeddedPngCount: number;
  asCharacterCount: number;
  graphics: Array<{ verticalPosition: string; verticalRelative: string; paragraphAlignment: string; width: string; height: string; pngWidth: number; pngHeight: number; lineHeight: string; paragraphMarginTop: string; paragraphMarginBottom: string }>;
  listParagraphs: Array<{ text: string; depth: number; paragraphIndex: number; lineHeight: string; marginTop: string; marginBottom: string }>;
  roundTrip: { editableTextMatches: boolean; graphicCountBefore: number; graphicCountAfter: number; tableCountBefore: number; tableCountAfter: number };
  odt: string;
  pdf: string;
}

function assertWriterRoundTrip(report: WriterReport): void {
  assert.ok(report.roundTrip, 'the saved ODT must be reopened in Writer before acceptance');
  assert.equal(report.roundTrip.editableTextMatches, true);
  assert.ok(report.roundTrip.graphicCountAfter >= 2);
  assert.equal(report.roundTrip.graphicCountAfter, report.roundTrip.graphicCountBefore);
  assert.equal(report.roundTrip.tableCountAfter, report.roundTrip.tableCountBefore);
}

function cssPixels(length: string): number {
  const match = /^(\d+(?:\.\d+)?)(in|cm|mm|pt|pc|px)$/.exec(length);
  assert.ok(match, 'Writer dimension has a supported physical unit');
  const factors: Record<string, number> = { in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16, px: 1 };
  return Number(match[1]) * factors[match[2]];
}

async function verifyWriterClipboard(outputDirectory: string): Promise<void> {
  const { stdout } = await run('/usr/bin/python3', [script, '--output-dir', outputDirectory, '--clipboard-marker', 'Writer acceptance'], { timeout: 90_000 });
  const report = JSON.parse(stdout) as WriterReport;
  assert.equal(report.ok, true);
  assertWriterRoundTrip(report);
  assert.match(report.text, /Editable prose before/);
  assert.match(report.text, /const preserved = "\$not_math\$";/);
  assert.ok(report.headingCount >= 1, 'heading remains a document heading');
  assert.ok(report.listCount >= 2, 'unordered and ordered lists remain document lists');
  assert.ok(report.tableCount >= 1, 'table remains editable cells');
  assert.ok(report.embeddedPngCount >= 3);
  assert.ok(report.asCharacterCount >= 2);
  assert.ok((await readFile(report.pdf)).subarray(0, 5).equals(Buffer.from('%PDF-')));
}

async function bounded<T>(promise: Promise<T>, description: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([promise, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Timed out: ${description}`)), 20_000);
    })]);
  } finally {
    clearTimeout(timer);
  }
}

test('image equations and editable HTML survive the native clipboard into Writer', { timeout: 120_000 }, async (context) => {
  const { page } = await launchWriterApp();
  try {
    const formulas: RenderedAsset[] = [];
    for (const source of [String.raw`x_i^2+\frac{1}{2}`, String.raw`\alpha+\beta`, String.raw`\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}`]) {
      context.diagnostic(`Rendering equation ${formulas.length + 1}`);
      formulas.push(await bounded(page.evaluate((tex) => window.desktop.renderAsset({ kind: 'math', source: tex }), source), `equation ${formulas.length + 1} image`));
    }
    const image = (asset: RenderedAsset) => `<img src="${asset.src}" width="${asset.width}" height="${asset.height}" style="width:${asset.width}px;height:${asset.height}px;vertical-align:-${asset.descent}px" alt="Equation">`;
    const html = `<h1>Writer acceptance</h1><p>Editable prose before ${image(formulas[0])} after. <b>Bold text</b>, <i>italic text</i>, and <a href="https://example.com">a link</a>.</p><ul><li>First bullet</li><li>Second bullet</li></ul><ol><li>First ordered item</li><li>Second ordered item</li></ol><table style="border-collapse:collapse"><tr><th>Column</th><th>Value</th></tr><tr><td>Formula</td><td>${image(formulas[1])}</td></tr></table><pre style="font-family:monospace">const preserved = "$not_math$";</pre><p style="text-align:center">${image(formulas[2])}</p>`;
    context.diagnostic('Writing the native clipboard');
    await bounded(page.evaluate((payload) => window.desktop.copyRendered(payload), { html, text: 'Writer acceptance\nEditable prose before equations after.' }), 'native clipboard write');
    context.diagnostic('Pasting into disposable Writer');
    await verifyWriterClipboard(path.join(root, 'test-results', 'writer-bridge'));
  } finally {
    // Suite teardown restores the clipboard and closes the shared isolated process.
  }
});

test('Writer acceptance rejects a document flattened into a screenshot', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markdown-local-writer-gate-'));
  try {
    const fixture = path.join(directory, 'flattened.odt');
    await run('/usr/bin/python3', ['-c', `import sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as output:
 output.writestr('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"><office:body/></office:document-content>')`, fixture]);
    await assert.rejects(run('/usr/bin/python3', [script, '--inspect-odt', fixture]), (error: unknown) => {
      const result = error as { stderr?: string };
      assert.match(result.stderr ?? '', /editable|heading|graphic/i);
      return true;
    });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Writer inspection accepts editable text with an embedded PNG equation', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markdown-local-writer-positive-'));
  try {
    const fixture = path.join(directory, 'embedded.odt');
    await run('/usr/bin/python3', ['-c', `import sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as output:
 output.writestr('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink"><office:body><text:p>Editable fixture<draw:frame text:anchor-type="as-char"><draw:image xlink:href="Pictures/equation.png"/></draw:frame></text:p></office:body></office:document-content>')
 output.writestr('Pictures/equation.png', bytes([137,80,78,71,13,10,26,10]))`, fixture]);
    const { stdout } = await run('/usr/bin/python3', [script, '--inspect-odt', fixture]);
    const report = JSON.parse(stdout) as WriterReport | null;
    assert.notEqual(report, null, 'ODT inspector must return the embedded image and editable text report');
    assert.equal(report?.ok, true);
    assert.equal(report?.embeddedPngCount, 1);
    assert.equal(report?.asCharacterCount, 1);
    assert.match(report?.text ?? '', /Editable fixture/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('Writer inspection reports inherited equation paragraph alignment and PNG dimensions', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'apetek-writer-alignment-'));
  try {
    const fixture = path.join(directory, 'alignment.odt');
    await run('/usr/bin/python3', ['-c', `import base64,sys,zipfile
with zipfile.ZipFile(sys.argv[1], 'w') as output:
 output.writestr('styles.xml', '<office:document-styles xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"><office:styles><style:style style:name="CenteredBase" style:family="paragraph"><style:paragraph-properties fo:text-align="center" fo:line-height="200%" fo:margin-top="0px" fo:margin-bottom="24px"/></style:style></office:styles></office:document-styles>')
 output.writestr('content.xml', '<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:draw="urn:oasis:names:tc:opendocument:xmlns:drawing:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"><office:automatic-styles><style:style style:name="CenteredChild" style:family="paragraph" style:parent-style-name="CenteredBase"/></office:automatic-styles><office:body><text:p text:style-name="CenteredChild">Editable centered formula<draw:frame text:anchor-type="as-char"><draw:image xlink:href="Pictures/equation.png"/></draw:frame></text:p><text:p>Editable default formula<draw:frame text:anchor-type="as-char"><draw:image xlink:href="Pictures/equation.png"/></draw:frame></text:p><text:list><text:list-item><text:p text:style-name="CenteredChild">Outer fixture</text:p><text:p text:style-name="CenteredChild">Continuation fixture</text:p><text:list><text:list-item><text:p>Nested fixture</text:p></text:list-item></text:list></text:list-item></text:list></office:body></office:document-content>')
 output.writestr('Pictures/equation.png', base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII='))`, fixture]);
    const { stdout } = await run('/usr/bin/python3', [script, '--inspect-odt', fixture]);
    const report = JSON.parse(stdout) as WriterReport;
    assert.equal(report.graphics[0].paragraphAlignment, 'center');
    assert.equal(report.graphics[0].lineHeight, '200%');
    assert.equal(report.graphics[0].paragraphMarginBottom, '24px');
    assert.equal(report.graphics[1].paragraphAlignment, 'left');
    assert.equal(report.graphics[0].pngWidth, 1);
    assert.equal(report.graphics[0].pngHeight, 1);
    assert.deepEqual(report.listParagraphs.map(paragraph => [paragraph.text, paragraph.depth, paragraph.paragraphIndex]), [['Outer fixture', 1, 0], ['Continuation fixture', 1, 1], ['Nested fixture', 2, 0]]);
    assert.equal(report.listParagraphs[0].marginBottom, '24px');
    assert.equal(report.listParagraphs[2].lineHeight, '100%');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

const fence = '```';
const markdown = String.raw`# Writer acceptance

Editable prose before $x_i^2+\frac{1}{2}$ after. **Bold text**, *italic text*, and [a link](https://example.com).

- First bullet
- Second bullet

1. First ordered item
2. Second ordered item

| Column | Value |
| --- | --- |
| Formula | $\alpha+\beta$ |

${fence}javascript
const preserved = "$not_math$";
${fence}

$$
\sum_{n=1}^{\infty}\frac{1}{n^2}=\frac{\pi^2}{6}
$$
`;

test('rendered clipboard pastes editable content and embedded equations into Writer', { timeout: 120_000 }, async () => {
  const { app: application, page } = await launchWriterApp();
  try {
    await page.locator('.cm-content').fill(markdown);
    await page.locator('[data-testid="preview"] h1').filter({ hasText: 'Writer acceptance' }).waitFor();
    await page.locator('[data-testid="preview"] img').nth(2).waitFor();
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    await page.locator('[data-testid="copy-rendered"]').click();
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const copied = await application.evaluate(async ({ clipboard }) => {
      const entries = await clipboard.read();
      const entry = entries.find((candidate) => candidate.types.includes('text/html'));
      const html = entry ? await (await entry.getType('text/html')).text() : '';
      return { embeddedPng: /<img\b[^>]*src="data:image\/png;base64,/i.test(html), unsafe: /<svg\b|class="katex|blob:|src="file:/i.test(html) };
    });
    assert.equal(copied.embeddedPng, true, 'rendered clipboard must embed equation PNGs');
    assert.equal(copied.unsafe, false);
    const outputDirectory = process.env.WRITER_OUTPUT_DIR ?? path.join(root, 'test-results', 'writer');
    await verifyWriterClipboard(outputDirectory);
    const report = JSON.parse(await readFile(path.join(outputDirectory, 'writer-report.json'), 'utf8')) as WriterReport;
    assert.ok(report.graphics.filter((graphic) => graphic.verticalPosition === 'middle' && graphic.verticalRelative === 'baseline').length >= 2,
      'inline formula baselines use the Writer-compatible centered images');
  } finally {
    // Suite teardown restores the clipboard and closes the shared isolated process.
  }
});

test('Writer preserves left equation blocks by default and chosen equation size and paragraph spacing', { timeout: 120_000 }, async () => {
  const { page } = await launchWriterApp();
  try {
    await page.locator('.cm-content').fill(String.raw`# Writer math preferences

Editable prose before $x_i^2+\frac{1}{2}$ after.

$$
\begin{aligned} f(x) &= x^2+2x+1 \\ &= (x+1)^2 \end{aligned}
$$
`);
    await page.locator('[data-testid="preview"] h1').filter({ hasText: 'Writer math preferences' }).waitFor();
    await page.locator('[data-testid="preview"] img').nth(1).waitFor();
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    const imageSizes = async () => {
      await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('[data-testid="preview"] img')].every(image => image.complete && image.naturalWidth > 0));
      return page.locator('[data-testid="preview"] img').evaluateAll(images => images.map(image => ({ width: image.getBoundingClientRect().width, pixels: (image as HTMLImageElement).naturalWidth })));
    };
    const standardSizes = await imageSizes();
    const output = process.env.WRITER_OUTPUT_DIR ?? path.join(root, 'test-results', 'writer');
    const paste = async (name: string): Promise<WriterReport> => {
      await page.locator('[data-testid="copy-rendered"]').click();
      await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
      const { stdout } = await run('/usr/bin/python3', [script, '--output-dir', path.join(output, name), '--clipboard-marker', 'Writer math preferences'], { timeout: 90_000 });
      const report = JSON.parse(stdout) as WriterReport;
      assertWriterRoundTrip(report);
      assert.match(report.text, /Editable prose before/);
      assert.equal(report.embeddedPngCount, 2);
      assert.equal(report.graphics[0].verticalPosition, 'middle');
      assert.equal(report.graphics[0].verticalRelative, 'baseline');
      return report;
    };
    const standard = await paste('math-left-100');
    assert.equal(standard.graphics[0].lineHeight, '100%', 'copied prose defaults to single line spacing');
    assert.ok(Math.abs(cssPixels(standard.graphics[0].paragraphMarginBottom) - 13) < 0.1);
    assert.equal(cssPixels(standard.graphics[0].paragraphMarginTop), 0);
    assert.equal(standard.graphics[1].paragraphAlignment, 'left', 'display equation block is left aligned by default');
    await page.getByRole('button', { name: 'Document settings' }).click();
    await page.getByLabel('Display equation blocks').selectOption('center');
    await setSlider(page.getByRole('slider', { name: 'LaTeX size', exact: true }), 150);
    await setSlider(page.getByRole('slider', { name: 'Line spacing', exact: true }), 2);
    await setSlider(page.getByRole('slider', { name: 'Paragraph spacing', exact: true }), 24);
    await page.keyboard.press('Escape');
    await page.waitForFunction(width => {
      const image = document.querySelector('[data-testid="preview"] img');
      return image && image.getBoundingClientRect().width > width * 1.4;
    }, standardSizes[0].width);
    await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
    const largerSizes = await imageSizes();
    const larger = await paste('math-center-150');
    assert.equal(larger.graphics[1].paragraphAlignment, 'center');
    assert.equal(larger.graphics[0].lineHeight, '200%');
    assert.ok(Math.abs(cssPixels(larger.graphics[0].paragraphMarginBottom) - 24) < 0.1);
    assert.equal(cssPixels(larger.graphics[0].paragraphMarginTop), 0);
    for (const [report, sizes] of [[standard, standardSizes], [larger, largerSizes]] as const) {
      for (const index of [0, 1]) {
        const graphic = report.graphics[index];
        assert.equal(graphic.pngWidth, sizes[index].pixels, 'copied PNG retains the preview raster width');
        assert.equal(graphic.pngWidth, Math.round(sizes[index].width * 3), 'equation raster retains its three-times pixel density');
        assert.ok(Math.abs(cssPixels(graphic.width) - sizes[index].width) < 0.1, 'Writer frame preserves the chosen preview width');
        assert.ok(Math.abs(cssPixels(graphic.height) * 3 - graphic.pngHeight) < 0.4, 'Writer frame preserves the baseline-padded PNG height at three-times density');
      }
    }
    for (const index of [0, 1]) {
      assert.ok(larger.graphics[index].pngWidth > standard.graphics[index].pngWidth * 1.4,
        'the larger math preference produces substantially larger equation rasters');
    }
  } finally {
    // Suite teardown restores the clipboard and closes the shared isolated process.
  }
});

test('Writer preserves independent bullet line spacing and gaps after saving and reopening', { timeout: 120_000 }, async () => {
  const { page } = await launchWriterApp();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.locator('.cm-content').fill(`# Writer bullet preferences

Editable list prose $x$ and $y$.

## Tight
- Tight first has enough editable prose to wrap across visual lines in Writer, so the chosen line spacing applies inside the item as well as the separate gap before the following bullet.
- Tight second

## Loose
- Loose first paragraph.

  Continued first paragraph.

- Loose second paragraph.

## Nested
- Outer first
  - Nested first
  - Nested second
- Outer second

## Ordered
1. Ordered first
2. Ordered second

## Tasks
- [ ] Task first
- [x] Task second
`);
  await page.locator('[data-testid="preview"] h1').filter({ hasText: 'Writer bullet preferences' }).waitFor();
  await page.locator('[data-testid="preview"] img').nth(1).waitFor();
  await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
  const output = process.env.WRITER_OUTPUT_DIR ?? path.join(root, 'test-results', 'writer');
  const paste = async (name: string): Promise<WriterReport> => {
    await page.locator('[data-testid="copy-rendered"]').click();
    await page.locator('[data-testid="copy-rendered"][data-copy-state="copied"]').waitFor();
    const { stdout } = await run('/usr/bin/python3', [script, '--output-dir', path.join(output, name), '--clipboard-marker', 'Writer bullet preferences'], { timeout: 90_000 });
    const report = JSON.parse(stdout) as WriterReport;
    assertWriterRoundTrip(report);
    return report;
  };
  const assertBullets = (report: WriterReport, lineHeight: string, gap: number) => {
    assert.ok(report.listCount >= 6, 'tight, loose, nested, ordered, and task lists remain editable lists');
    const paragraph = (marker: string) => {
      const result = report.listParagraphs.find(candidate => candidate.text.includes(marker));
      assert.ok(result, `Writer retains list paragraph: ${marker}`);
      return result;
    };
    for (const marker of ['Tight first', 'Tight second', 'Loose first', 'Continued first', 'Loose second', 'Outer first', 'Nested first', 'Nested second', 'Outer second', 'Ordered first', 'Ordered second', 'Task first', 'Task second']) {
      assert.equal(paragraph(marker).lineHeight, lineHeight, `independent bullet line spacing: ${marker}`);
    }
    const nestedEntryGap = cssPixels(paragraph('Outer first').marginBottom) + cssPixels(paragraph('Nested first').marginTop);
    assert.ok(Math.abs(nestedEntryGap - gap) < 0.1, `parent-to-nested bullet gap: expected ${gap}px, got ${nestedEntryGap}px`);
    for (const [first, second] of [['Tight first', 'Tight second'], ['Continued first', 'Loose second'], ['Nested first', 'Nested second'], ['Ordered first', 'Ordered second'], ['Task first', 'Task second']]) {
      const actual = Math.max(cssPixels(paragraph(first).marginBottom), cssPixels(paragraph(second).marginTop));
      assert.ok(Math.abs(actual - gap) < 0.1, `between-bullet gap ${second}: expected ${gap}px, got ${actual}px`);
    }
    assert.equal(paragraph('Nested second').depth, 2);
    assert.equal(paragraph('Continued first').paragraphIndex, 1);
  };
  const standard = await paste('bullet-default');
  assertBullets(standard, '100%', 8);
  await page.getByRole('button', { name: 'Document settings' }).click();
  await setSlider(page.getByRole('slider', { name: 'Line spacing', exact: true }), 1.65);
  await setSlider(page.getByRole('slider', { name: 'Bullet line spacing', exact: true }), 2);
  await setSlider(page.getByRole('slider', { name: 'Between bullets', exact: true }), 12);
  await page.keyboard.press('Escape');
  await page.locator('[data-testid="preview"][data-render-state="ready"]').waitFor();
  const custom = await paste('bullet-custom');
  assertBullets(custom, '200%', 12);
  assert.equal(custom.graphics[0].lineHeight, '165%', 'ordinary prose keeps its separate global line spacing');
});
