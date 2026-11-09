import assert from 'node:assert/strict';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

test('renaming the app preserves the legacy recovery profile while the test override takes priority', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'apetek-profile-'));
  try {
    const result = await build({ entryPoints: ['src/desktop/main.ts'], bundle: true, platform: 'node',
      format: 'cjs', external: ['electron'], write: false });
    const require = createRequire(import.meta.url);
    const appData = path.join(directory, 'settings');
    const configure = (override?: string) => {
      const configured = new Map<string, string>();
      const app = {
        setName: () => undefined,
        getPath: (name: string) => { assert.equal(name, 'appData'); return appData; },
        setPath: (name: string, value: string) => { configured.set(name, value); },
        whenReady: () => new Promise<void>(() => undefined), on: () => undefined,
        commandLine: { hasSwitch: () => true, appendSwitch: () => undefined },
      };
      runInNewContext(result.outputFiles[0].text, {
        require: (name: string) => name === 'electron' ? { app } : require(name),
        process: { env: { MARKDOWN_LOCAL_USER_DATA: override }, platform: 'linux', argv: [] },
        __dirname: '/app/dist/desktop', Buffer, URL,
      });
      return configured.get('userData');
    };
    const legacy = path.join(appData, 'Markdown Local');
    assert.equal(configure(), legacy);
    assert.equal((await stat(legacy)).isDirectory(), true);
    const override = path.join(directory, 'isolated-test-profile');
    assert.equal(configure(override), override);
    assert.equal((await stat(override)).isDirectory(), true);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
