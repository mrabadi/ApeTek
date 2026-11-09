import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadLastDocument, rememberDocument } from '../src/desktop/files';

test('last-document recall falls back safely for missing, unreadable or corrupt session data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'apetek-session-'));
  try {
    const metadata = path.join(directory, 'last-document.json');
    assert.equal(await loadLastDocument(directory), null);
    await rememberDocument(directory, path.join(directory, 'deleted.md'));
    assert.equal(await loadLastDocument(directory), null, 'A deleted last file must not fail startup.');
    for (const value of ['{ corrupt', 'null', '{}', '{"path":17}', '{"path":"relative.md"}', JSON.stringify({ path: path.join(directory, 'unsupported.pdf') })]) {
      await writeFile(metadata, value);
      assert.equal(await loadLastDocument(directory), null);
    }
    const locked = path.join(directory, 'locked.md');
    await writeFile(locked, '# Private file');
    await rememberDocument(directory, locked);
    await chmod(locked, 0);
    try { assert.equal(await loadLastDocument(directory), null); }
    finally { await chmod(locked, 0o600); }
    await writeFile(locked, '');
    assert.deepEqual(await loadLastDocument(directory), { path: locked, content: '' });
  } finally { await rm(directory, { recursive: true, force: true }); }
});
