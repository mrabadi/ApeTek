import type { ElectronApplication } from 'playwright';

export async function installClipboardGuard(app: ElectronApplication): Promise<void> {
  await app.evaluate(async ({ clipboard, ClipboardItem }) => {
    type Payload = { type: string; bytes?: Uint8Array; bookmark?: { title: string; url: string } };
    type Snapshot = Payload[][];
    const write = clipboard.write.bind(clipboard);
    const state = {
      initial: undefined as Snapshot | undefined,
      last: undefined as Snapshot | undefined,
      async capture(items: Electron.ClipboardItem[]): Promise<Snapshot> {
        return Promise.all(items.map(item => Promise.all([...item.types].sort().map(async type => {
          const value = await item.getType(type);
          return 'arrayBuffer' in value ? { type, bytes: new Uint8Array(await value.arrayBuffer()) } : { type, bookmark: { title: value.title, url: value.url } };
        }))));
      },
      equal(left: Snapshot, right: Snapshot) {
        return left.length === right.length && left.every((entry, index) => entry.length === right[index].length && entry.every((value, part) => {
          const other = right[index][part];
          if (value.type !== other.type) return false;
          if (value.bytes || other.bytes) return Boolean(value.bytes && other.bytes && Buffer.from(value.bytes).equals(Buffer.from(other.bytes)));
          return value.bookmark?.title === other.bookmark?.title && value.bookmark?.url === other.bookmark?.url;
        }));
      },
      async copy(items: Electron.ClipboardItem[]) {
        state.initial ??= await state.capture(await clipboard.read());
        await write(items);
        state.last = await state.capture(await clipboard.read());
      },
      async restore() {
        if (!state.last) return 'untouched';
        if (!state.equal(await state.capture(await clipboard.read()), state.last)) return 'skipped-newer-copy';
        if (!state.initial?.length) clipboard.clear();
        else await write(state.initial.map(entry => new ClipboardItem(Object.fromEntries(entry.map(value => [value.type, value.bytes ? new Blob([new Uint8Array(value.bytes)]) : value.bookmark!])))));
        return 'restored';
      },
    };
    clipboard.write = state.copy.bind(state);
    (globalThis as typeof globalThis & { restoreTestClipboard: () => Promise<string> }).restoreTestClipboard = state.restore.bind(state);
  });
}

export async function restoreClipboardGuard(app: ElectronApplication): Promise<string> {
  return app.evaluate(async () => (globalThis as typeof globalThis & { restoreTestClipboard: () => Promise<string> }).restoreTestClipboard());
}
