import assert from 'node:assert/strict';
import { chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

async function fixture<T>(run: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(path.join(tmpdir(), 'markdown-local-files-'));
  try { return await run(directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test('atomicWrite saves the original Markdown source including Unicode', async () => {
  await fixture(async (directory) => {
    const destination = path.join(directory, 'notes.md');
    await writeFile(destination, 'previous version');
    const content = '# Καλημέρα 🌍\n\nInline $α + β$\n\n$$\\int_0^1 x\\,dx$$\n';
    const { atomicWrite } = await import('../src/desktop/files');
    await atomicWrite(destination, content);
    assert.equal(await readFile(destination, 'utf8'), content);
  });
});

test('preload exposes only the desktop bridge and routes calls and actions', async () => {
  const { build } = await import('esbuild');
  const { runInNewContext } = await import('node:vm');
  const result = await build({ entryPoints: ['src/desktop/preload.ts'], bundle: true,
    platform: 'node', format: 'cjs', external: ['electron'], write: false });
  const invocations: unknown[][] = [];
  const sent: unknown[][] = [];
  const handlers = new Map<string, (event: unknown, action: string) => void>();
  let exposedName: string | undefined;
  let bridge: import('../src/shared/types').DesktopBridge | undefined;
  const electron = {
    contextBridge: { exposeInMainWorld(name: string, value: typeof bridge) { exposedName = name; bridge = value; } },
    ipcRenderer: {
      invoke: async (...args: unknown[]) => { invocations.push(args); return null; },
      send: (...args: unknown[]) => { sent.push(args); },
      on: (channel: string, listener: (event: unknown, action: string) => void) => { handlers.set(channel, listener); },
      removeListener: (channel: string, listener: unknown) => { if (handlers.get(channel) === listener) handlers.delete(channel); },
    },
  };
  runInNewContext(result.outputFiles[0].text, { require: () => electron });
  assert.equal(exposedName, 'desktop');
  assert.ok(bridge);
  const api = bridge as import('../src/shared/types').DesktopBridge;
  await api.openDocument();
  await api.saveDocument({ path: '/tmp/notes.md', content: '$α$' });
  await api.renderAsset({ kind: 'math', source: 'x' });
  await api.loadRecovery();
  await api.persistRecovery({ path: null, content: 'draft', dirty: true });
  await api.discardRecovery();
  await api.readImage('img.png', '/tmp/notes.md');
  await api.copyRendered({ html: '<b>x</b>', text: 'x' });
  await api.exportPdf({ html: '<p>x</p>', pageSize: 'A4' });
  await api.confirmDiscard();
  assert.equal(JSON.stringify(invocations), JSON.stringify([
    ['desktop:open'], ['desktop:save', { path: '/tmp/notes.md', content: '$α$' }],
    ['desktop:renderAsset', { kind: 'math', source: 'x' }], ['desktop:loadRecovery'],
    ['desktop:persistRecovery', { path: null, content: 'draft', dirty: true }],
    ['desktop:discardRecovery'], ['desktop:readImage', 'img.png', '/tmp/notes.md'],
    ['desktop:copyRendered', { html: '<b>x</b>', text: 'x' }],
    ['desktop:exportPdf', { html: '<p>x</p>', pageSize: 'A4' }], ['desktop:confirmDiscard'],
  ]));
  api.setDocumentState({ path: null, dirty: true });
  api.close();
  assert.equal(JSON.stringify(sent), JSON.stringify([
    ['desktop:setDocumentState', { path: null, dirty: true }], ['desktop:close'],
  ]));
  let action: string | undefined;
  const unsubscribe = api.onAction((value) => { action = value; });
  handlers.get('desktop:action')?.({}, 'save');
  assert.equal(action, 'save');
  unsubscribe();
  assert.equal(handlers.has('desktop:action'), false);
  assert.deepEqual(Object.keys(api).sort(), ['renderAsset', 'openDocument', 'saveDocument', 'loadRecovery',
    'persistRecovery', 'discardRecovery', 'readImage', 'copyRendered', 'exportPdf', 'confirmDiscard',
    'setDocumentState', 'close', 'onAction'].sort());
});


test('atomicWrite preserves the previous file when replacement fails', async () => {
  await fixture(async (directory) => {
    const destination = path.join(directory, 'notes.md');
    await writeFile(destination, 'previous version');
    await chmod(directory, 0o555);
    try {
      const { atomicWrite } = await import('../src/desktop/files');
      await assert.rejects(atomicWrite(destination, 'replacement'));
      assert.equal(await readFile(destination, 'utf8'), 'previous version');
      assert.deepEqual(await readdir(directory), ['notes.md']);
    } finally { await chmod(directory, 0o755); }
  });
});

test('readMarkdown loads Markdown source and rejects unsupported document formats', async () => {
  await fixture(async (directory) => {
    const { readMarkdown } = await import('../src/desktop/files');
    const source = '# Notes\n\n```js\nconst value = "你好";\n```\n';
    const destination = path.join(directory, 'notes.MD');
    await writeFile(destination, source);
    assert.deepEqual(await readMarkdown(destination), { path: destination, content: source });
    const unsupported = path.join(directory, 'notes.pdf');
    await writeFile(unsupported, source);
    await assert.rejects(readMarkdown(unsupported), /unsupported/i);
    await assert.rejects(readMarkdown(path.join(directory, 'missing.md')), { code: 'ENOENT' });
  });
});

test('recovery saves, reloads and discards drafts, tolerating absent and corrupt data', async () => {
  await fixture(async (directory) => {
    const { loadRecovery, saveRecovery, discardRecovery } = await import('../src/desktop/files');
    const recoveryDirectory = path.join(directory, 'app-data');
    assert.equal(await loadRecovery(recoveryDirectory), null);
    const draft = { path: null, content: '# Unsaved draft\n\n$α$ 🌍', dirty: true };
    await saveRecovery(recoveryDirectory, draft);
    assert.deepEqual(await loadRecovery(recoveryDirectory), draft);
    await writeFile(path.join(recoveryDirectory, 'recovery.json'), '{ broken json');
    assert.equal(await loadRecovery(recoveryDirectory), null);
    await writeFile(path.join(recoveryDirectory, 'recovery.json'), JSON.stringify({ content: 123 }));
    assert.equal(await loadRecovery(recoveryDirectory), null);
    await saveRecovery(recoveryDirectory, { path: '/tmp/notes.md', content: '', dirty: false });
    assert.deepEqual(await loadRecovery(recoveryDirectory), { path: '/tmp/notes.md', content: '', dirty: false });
    await discardRecovery(recoveryDirectory);
    await discardRecovery(recoveryDirectory);
    assert.equal(await loadRecovery(recoveryDirectory), null);
  });
});

test('resolveLocalImage embeds relative, absolute, file URL and data raster images', async () => {
  await fixture(async (directory) => {
    const { resolveLocalImage } = await import('../src/desktop/files');
    const { pathToFileURL } = await import('node:url');
    const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
    const source = path.join(directory, 'tiny image.png');
    await writeFile(source, Buffer.from(png, 'base64'));
    const expected = `data:image/png;base64,${png}`;
    assert.equal(await resolveLocalImage('tiny%20image.png', path.join(directory, 'notes.md')), expected);
    assert.equal(await resolveLocalImage(source, null), expected);
    assert.equal(await resolveLocalImage(pathToFileURL(source).href, null), expected);
    assert.equal(await resolveLocalImage(expected, null), expected);
    assert.equal(await resolveLocalImage('tiny image.png', null), null);
    assert.equal(await resolveLocalImage('missing.png', path.join(directory, 'notes.md')), null);
    assert.equal(await resolveLocalImage('https://example.com/picture.png', null), null);
    assert.equal(await resolveLocalImage('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=', null), null);
    await writeFile(path.join(directory, 'unsafe.png'), '<svg onload="alert(1)"></svg>');
    assert.equal(await resolveLocalImage('unsafe.png', path.join(directory, 'notes.md')), null);
  });
});

test('resolveLocalImage detects JPEG, GIF and WebP signatures instead of trusting extensions or MIME', async () => {
  await fixture(async (directory) => {
    const { resolveLocalImage } = await import('../src/desktop/files');
    const images = [
      { mime: 'image/jpeg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]) },
      { mime: 'image/gif', data: Buffer.from('GIF89a\x01\x00\x01\x00', 'binary') },
      { mime: 'image/webp', data: Buffer.from('RIFF\x00\x00\x00\x00WEBP', 'binary') },
    ];
    for (const [index, image] of images.entries()) {
      const filename = path.join(directory, `image-${index}.bin`);
      await writeFile(filename, image.data);
      const expected = `data:${image.mime};base64,${image.data.toString('base64')}`;
      assert.equal(await resolveLocalImage(filename, null), expected);
      assert.equal(await resolveLocalImage(expected, null), expected);
      assert.equal(await resolveLocalImage(`data:image/png;base64,${image.data.toString('base64')}`, null), null);
    }
    assert.equal(await resolveLocalImage('javascript:alert(1)', null), null);
    assert.equal(await resolveLocalImage('file://remote-host/image.png', null), null);
    assert.equal(await resolveLocalImage('data:image/png;base64,not-an-image', null), null);
  });
});

test('atomicWrite preserves binary PDF bytes without UTF-8 conversion', async () => {
  await fixture(async (directory) => {
    const { atomicWrite } = await import('../src/desktop/files');
    const destination = path.join(directory, 'document.pdf');
    const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x00, 0xff, 0x80]);
    await atomicWrite(destination, content);
    assert.deepEqual(await readFile(destination), content);
  });
});
