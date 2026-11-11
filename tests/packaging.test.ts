import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const run = promisify(execFile);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN1cAAAAASUVORK5CYII=', 'base64');

test('Linux packages identify ApeTek and replace the previous installed application', { timeout: 30_000 }, async () => {
  const fixture = await mkdtemp(path.join(os.tmpdir(), 'apetek-packaging-'));
  try {
    for (const directory of ['scripts', 'assets', 'docs', 'dist/desktop', 'dist/renderer', 'node_modules/electron/dist/resources']) {
      await mkdir(path.join(fixture, directory), { recursive: true });
    }
    await cp('scripts/package.mjs', path.join(fixture, 'scripts/package.mjs'));
    await cp('package.json', path.join(fixture, 'package.json'));
    for (const filename of ['dist/desktop/main.cjs', 'dist/desktop/preload.cjs', 'dist/renderer/index.html', 'dist/renderer/raster.html', 'LICENSE', 'README.md', 'THIRD_PARTY_NOTICES.txt', 'docs/USAGE.md']) {
      await writeFile(path.join(fixture, filename), 'Packaging acceptance fixture\n');
    }
    await writeFile(path.join(fixture, 'assets/icon.png'), png);
    await writeFile(path.join(fixture, 'assets/icon.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
    const runtime = path.join(fixture, 'node_modules/electron/dist');
    await writeFile(path.join(runtime, 'electron'), '#!/bin/sh\nprintf \'%s\\n\' "$@"\n');
    await chmod(path.join(runtime, 'electron'), 0o755);
    await writeFile(path.join(runtime, 'chrome-sandbox'), 'Fixture sandbox helper\n');

    const { stdout } = await run(process.execPath, [path.join(fixture, 'scripts/package.mjs')], { timeout: 20_000 });
    const artifacts = JSON.parse(stdout.slice(stdout.indexOf('{'))) as { portable: string; tarball: string; debianPackage: string };
    assert.equal(path.basename(artifacts.tarball), 'apetek-1.3.5-linux-x64.tar.gz');
    assert.equal(path.basename(artifacts.debianPackage), 'apetek_1.3.5_amd64.deb');
    const app = JSON.parse(await readFile(path.join(artifacts.portable, 'resources/app/package.json'), 'utf8'));
    assert.equal(app.name, 'apetek');
    assert.equal(app.productName, 'ApeTek');
    assert.equal(app.version, '1.3.5');
    assert.deepEqual(await readFile(path.join(artifacts.portable, 'icon.png')), png);
    assert.deepEqual(await readFile(path.join(artifacts.portable, 'resources/app/assets/icon.png')), png);
    const { stdout: defaultArguments } = await run(path.join(artifacts.portable, 'apetek'), ['notes.md'], { env: { ...process.env, DISPLAY: ':99' } });
    assert.equal(defaultArguments, '--ozone-platform=x11\nnotes.md\n');
    const { stdout: explicitArguments } = await run(path.join(artifacts.portable, 'apetek'), ['--ozone-platform=wayland', 'notes.md'], { env: { ...process.env, DISPLAY: ':99' } });
    assert.equal(explicitArguments, '--ozone-platform=wayland\nnotes.md\n');

    const { stdout: control } = await run('dpkg-deb', ['--field', artifacts.debianPackage]);
    assert.match(control, /^Package: apetek$/m);
    assert.match(control, /^Version: 1\.3\.5$/m);
    assert.match(control, /^Replaces: markdown-local$/m);
    assert.match(control, /^Conflicts: markdown-local$/m);
    const { stdout: contents } = await run('dpkg-deb', ['--contents', artifacts.debianPackage]);
    assert.match(contents, /^-rwsr-xr-x root\/root[^\n]*\.\/opt\/apetek\/chrome-sandbox$/m);
    assert.match(contents, /\.\/usr\/bin\/apetek -> \/opt\/apetek\/apetek/);
    const extracted = path.join(fixture, 'installed');
    await run('dpkg-deb', ['--extract', artifacts.debianPackage, extracted]);
    assert.deepEqual(await readFile(path.join(extracted, 'usr/share/icons/hicolor/512x512/apps/apetek.png')), png);
    const desktop = await readFile(path.join(extracted, 'usr/share/applications/apetek.desktop'), 'utf8');
    assert.match(desktop, /^Name=ApeTek$/m);
    assert.match(desktop, /^Exec=apetek %F$/m);
    assert.match(desktop, /^Icon=apetek$/m);
    const { stdout: archive } = await run('tar', ['-tzf', artifacts.tarball]);
    assert.match(archive, /apetek-1\.3\.5-linux-x64\/apetek-bin\n/);
    assert.match(archive, /apetek-1\.3\.5-linux-x64\/resources\/app\/THIRD_PARTY_NOTICES\.txt\n/);
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
});
