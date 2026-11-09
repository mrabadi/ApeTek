import assert from 'node:assert/strict';
import test from 'node:test';
import { closeApp, launchApp } from './helpers';
import type { Page } from 'playwright';

async function alignedRows(page: Page, stage: string) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const rows = await page.evaluate(() => {
    const viewport = document.querySelector('.cm-scroller')!.getBoundingClientRect();
    const numbers = [...document.querySelectorAll<HTMLElement>('.cm-lineNumbers .cm-gutterElement')];
    const rows = [];
    for (const line of document.querySelectorAll<HTMLElement>('.cm-line')) {
      const match = line.textContent?.match(/^Row (\d{3}):/);
      if (!match) continue;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      const text = walker.nextNode();
      if (!text) continue;
      const range = document.createRange(); range.setStart(text, 0); range.setEnd(text, 1);
      const source = range.getBoundingClientRect();
      if (source.top < viewport.top || source.bottom > viewport.bottom) continue;
      const number = Number(match[1]);
      const gutter = numbers.find(element => element.textContent === String(number) && element.getBoundingClientRect().height > 0);
      if (!gutter?.firstChild) continue;
      range.selectNodeContents(gutter);
      const label = range.getBoundingClientRect();
      rows.push({ number, offset: label.top - source.top, lineHeight: line.getBoundingClientRect().height });
    }
    return rows;
  });
  await page.screenshot({ path: `test-results/${process.env.GUTTER_CAPTURE_PREFIX ?? 'gutter'}-${stage}.png` });
  assert.ok(rows.length >= 5, `${stage}: expected at least five visible numbered source rows.`);
  assert.ok(rows.every(row => Math.abs(row.offset) <= 1), `${stage}: gutter labels must align with their source text: ${JSON.stringify(rows)}`);
  return rows;
}

test('line numbers align with source text through wrapped lines, scrolling and pane resizing', async () => {
  const { app, page } = await launchApp();
  try {
    await page.setViewportSize({ width: 880, height: 720 });
    const source = Array.from({ length: 130 }, (_, index) => index % 10 === 9 ? '' :
      `Row ${String(index + 1).padStart(3, '0')}: ${index % 9 === 1 ? 'Long source lines wrap while their line number stays on the first visual row. '.repeat(5) : 'A short source line.'}`).join('\n');
    const editor = page.getByRole('textbox', { name: 'Markdown source' });
    await editor.fill(source);
    await page.waitForFunction(() => document.querySelector('[data-render-state="ready"]')?.textContent?.includes('Row 129:'));
    await editor.press('Control+Home');
    await page.waitForFunction(() => document.querySelector('.cm-scroller')!.scrollTop < 1);
    const top = await alignedRows(page, 'top');
    assert.equal(top[0].number, 1);
    assert.ok(top.some(row => row.lineHeight > top[0].lineHeight * 2), 'The fixture must exercise wrapped source lines.');

    await page.locator('.cm-scroller').evaluate(element => { element.scrollTop = element.scrollHeight / 2; });
    await page.waitForFunction(() => document.querySelector('.cm-scroller')!.scrollTop > 100);
    const middle = await alignedRows(page, 'middle');
    assert.ok(middle[0].number > 20, 'The fixture must exercise virtualized gutter rows away from the start.');

    await page.getByRole('separator', { name: 'Resize editor and preview' }).press('ArrowLeft');
    await page.getByRole('separator', { name: 'Resize editor and preview' }).press('ArrowLeft');
    await alignedRows(page, 'resized');

    await page.locator('.cm-scroller').evaluate(element => { element.scrollTop = element.scrollHeight; });
    await page.waitForFunction(() => {
      const element = document.querySelector('.cm-scroller')!;
      return element.scrollHeight - element.clientHeight - element.scrollTop < 2;
    });
    const bottom = await alignedRows(page, 'bottom');
    assert.equal(bottom.at(-1)!.number, 129);
  } finally { await closeApp(app); }
});
