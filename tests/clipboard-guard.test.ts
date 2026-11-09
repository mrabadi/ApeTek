import assert from 'node:assert/strict';
import test from 'node:test';
import type { ElectronApplication } from 'playwright';
import { installClipboardGuard, restoreClipboardGuard } from './clipboard-guard';

class Item {
  readonly types: string[];
  constructor(private readonly values: Record<string, string | Blob>) { this.types = Object.keys(values); }
  async getType(type: string): Promise<Blob> {
    const value = this.values[type];
    return typeof value === 'string' ? new Blob([value], { type }) : value;
  }
}

function fixture(normalize = false) {
  let entries = [new Item({ 'text/plain': 'original fixture', 'text/html': '<b>original fixture</b>' })];
  let reads = 0, writes = 0;
  const clipboard = {
    read: async () => { reads++; return entries; },
    write: async (items: Item[]) => {
      writes++;
      entries = normalize ? await Promise.all(items.map(async item => new Item(Object.fromEntries([
        ...await Promise.all(item.types.map(async type => [type, await item.getType(type)] as const)),
        ['application/x-native-alias', 'normalized fixture'],
      ])))) : items;
    },
    clear: () => { writes++; entries = []; },
  };
  const app = { evaluate: async (callback: (electron: unknown) => unknown) => callback({ clipboard, ClipboardItem: Item }) } as unknown as ElectronApplication;
  return { app, clipboard, counts: () => ({ reads, writes }), externalCopy: () => { entries = [new Item({ 'text/plain': 'newer user fixture' })]; } };
}

test('clipboard guard restores all initial formats after the last own write', async () => {
  const { app, clipboard } = fixture();
  await installClipboardGuard(app);
  await clipboard.write([new Item({ 'text/plain': 'test fixture' })]);
  assert.equal(await restoreClipboardGuard(app), 'restored');
  const restored = (await clipboard.read())[0];
  assert.deepEqual(restored.types.sort(), ['text/html', 'text/plain']);
  assert.equal(await (await restored.getType('text/plain')).text(), 'original fixture');
});

test('clipboard guard leaves a newer external copy untouched', async () => {
  const { app, clipboard, externalCopy, counts } = fixture();
  await installClipboardGuard(app);
  await clipboard.write([new Item({ 'text/plain': 'test fixture' })]);
  externalCopy();
  assert.equal(await restoreClipboardGuard(app), 'skipped-newer-copy');
  assert.equal(counts().writes, 1);
  assert.equal(await (await (await clipboard.read())[0].getType('text/plain')).text(), 'newer user fixture');
});

test('clipboard guard does not read or write when the app never copies', async () => {
  const { app, counts } = fixture();
  await installClipboardGuard(app);
  assert.equal(await restoreClipboardGuard(app), 'untouched');
  assert.deepEqual(counts(), { reads: 0, writes: 0 });
});

test('clipboard guard compares the native normalized representation of its write', async () => {
  const { app, clipboard } = fixture(true);
  await installClipboardGuard(app);
  await clipboard.write([new Item({ 'text/plain': 'test fixture' })]);
  assert.equal(await restoreClipboardGuard(app), 'restored');
  assert.equal(await (await (await clipboard.read())[0].getType('text/plain')).text(), 'original fixture');
});
