import { execFile } from 'node:child_process';
import { access, chmod, cp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const applicationId = metadata.name;
if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('This package command targets Linux x86_64.');
}
const runtime = path.join(root, 'node_modules/electron/dist');
const icon = path.join(root, 'assets/icon.png');
for (const filename of ['dist/desktop/main.cjs', 'dist/desktop/preload.cjs', 'dist/renderer/index.html', 'dist/renderer/raster.html']) {
  await access(path.join(root, filename)).catch(() => { throw new Error(`Missing ${filename}; run npm run build first.`); });
}
await access(path.join(runtime, 'electron')).catch(() => { throw new Error('Electron runtime is missing; run npm ci first.'); });
await access(icon).catch(() => { throw new Error('assets/icon.png is missing.'); });

const release = path.join(root, 'release');
const portableName = `${applicationId}-${metadata.version}-linux-x64`;
const portable = path.join(release, portableName);
await mkdir(release, { recursive: true });
await rm(portable, { recursive: true, force: true });
await cp(runtime, portable, { recursive: true, preserveTimestamps: true });
await rename(path.join(portable, 'electron'), path.join(portable, `${applicationId}-bin`));
await rm(path.join(portable, 'resources/default_app.asar'), { force: true });
const appDirectory = path.join(portable, 'resources/app');
await mkdir(appDirectory, { recursive: true });
await cp(path.join(root, 'dist'), path.join(appDirectory, 'dist'), { recursive: true });
for (const filename of ['LICENSE', 'README.md']) await cp(path.join(root, filename), path.join(appDirectory, filename));
await cp(path.join(root, 'docs'), path.join(appDirectory, 'docs'), { recursive: true });
await cp(path.join(root, 'README.md'), path.join(portable, 'README.md'));
await cp(path.join(root, 'docs'), path.join(portable, 'docs'), { recursive: true });
await cp(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(portable, 'THIRD_PARTY_NOTICES.txt'));
await cp(path.join(root, 'THIRD_PARTY_NOTICES.txt'), path.join(appDirectory, 'THIRD_PARTY_NOTICES.txt'));
await writeFile(path.join(appDirectory, 'package.json'), JSON.stringify({
  name: metadata.name,
  productName: metadata.productName,
  version: metadata.version,
  description: metadata.description,
  main: 'dist/desktop/main.cjs',
  license: metadata.license,
}, null, 2) + '\n');
await cp(icon, path.join(portable, 'icon.png'));
await mkdir(path.join(appDirectory, 'assets'), { recursive: true });
await cp(icon, path.join(appDirectory, 'assets/icon.png'));
await writeFile(path.join(portable, applicationId), [
  '#!/bin/sh',
  'markdown_platform_given=',
  'for markdown_argument do',
  '  case "$markdown_argument" in --ozone-platform|--ozone-platform=*) markdown_platform_given=1;; esac',
  'done',
  'if [ -n "${DISPLAY:-}" ] && [ -z "$markdown_platform_given" ]; then',
  '  set -- --ozone-platform=x11 "$@"',
  'fi',
  `exec "$(dirname "$(readlink -f "$0")")/${applicationId}-bin" "$@"`,
  '',
].join('\n'));
await chmod(path.join(portable, applicationId), 0o755);
await chmod(path.join(portable, `${applicationId}-bin`), 0o755);
await writeFile(path.join(portable, 'README.txt'), [
  metadata.productName,
  '',
  `Run ./${applicationId} from this directory. All editor dependencies are bundled.`,
  'The application works offline; no Node.js installation is required.',
  '',
  'The Chromium sandbox remains enabled. Ubuntu 22.04 normally supports its',
  'unprivileged user-namespace sandbox. If system policy blocks it, install the',
  'provided .deb package, which configures the setuid sandbox helper correctly.',
  'Do not work around a sandbox error by adding --no-sandbox.',
  '',
  'Keep this complete directory together; moving only the launcher will not work.',
  '',
].join('\n'));
const tarball = path.join(release, `${portableName}.tar.gz`);
console.log('Building portable Linux archive...');
await run('tar', ['-czf', tarball, '-C', release, portableName]);

const staging = path.join(release, '.deb-staging');
await rm(staging, { recursive: true, force: true });
const installedApp = path.join(staging, 'opt', applicationId);
await mkdir(path.dirname(installedApp), { recursive: true });
await cp(portable, installedApp, { recursive: true });
await chmod(path.join(installedApp, 'chrome-sandbox'), 0o4755);
for (const directory of ['DEBIAN', 'usr/bin', 'usr/share/applications', 'usr/share/icons/hicolor/512x512/apps']) {
  await mkdir(path.join(staging, directory), { recursive: true });
}
await symlink(`/opt/${applicationId}/${applicationId}`, path.join(staging, 'usr/bin', applicationId));
await cp(icon, path.join(staging, `usr/share/icons/hicolor/512x512/apps/${applicationId}.png`));
await writeFile(path.join(staging, `usr/share/applications/${applicationId}.desktop`), [
  '[Desktop Entry]',
  'Type=Application',
  `Name=${metadata.productName}`,
  'Comment=Offline Markdown editor with portable equation images',
  `Exec=${applicationId} %F`,
  `Icon=${applicationId}`,
  'Terminal=false',
  'Categories=Office;TextEditor;',
  'MimeType=text/markdown;text/x-markdown;',
  `StartupWMClass=${applicationId}`,
  '',
].join('\n'));
await writeFile(path.join(staging, 'DEBIAN/control'), [
  `Package: ${applicationId}`,
  `Version: ${metadata.version}`,
  'Section: editors',
  'Priority: optional',
  'Architecture: amd64',
  `Maintainer: ${metadata.author}`,
  'Replaces: markdown-local',
  'Conflicts: markdown-local',
  'Depends: libasound2, libatk-bridge2.0-0, libatk1.0-0, libatspi2.0-0, libc6, libcairo2, libcups2, libdbus-1-3, libdrm2, libexpat1, libgbm1, libgcc-s1, libglib2.0-0, libgtk-3-0, libnspr4, libnss3, libpango-1.0-0, libstdc++6, libudev1, libx11-6, libxcb1, libxcomposite1, libxdamage1, libxext6, libxfixes3, libxkbcommon0, libxrandr2',
  'Description: Offline Markdown editor with image-based equations',
  ' Split-pane live preview, source-aware scrolling, rich clipboard copying,',
  ' Markdown file saving, and PDF export. Math and diagrams are embedded images.',
  '',
].join('\n'));
const debianPackage = path.join(release, `${applicationId}_${metadata.version}_amd64.deb`);
console.log('Building Ubuntu package with its sandbox helper...');
await run('dpkg-deb', ['--root-owner-group', '-Zgzip', '-z6', '--build', staging, debianPackage]);
await rm(staging, { recursive: true, force: true });
console.log(JSON.stringify({ portable, tarball, debianPackage }, null, 2));
