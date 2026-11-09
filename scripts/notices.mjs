import { execFile } from 'node:child_process';
import { access, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'THIRD_PARTY_NOTICES.txt');
const { stdout } = await run('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], {
  cwd: root, maxBuffer: 64 * 1024 * 1024,
});
const dependencyTree = JSON.parse(stdout);
const directories = new Set();

// Supplement licenses referenced by installed files but omitted as standalone npm files.
// The font copyright/RFN records themselves are extracted from the unmodified TTFs below.
const fontLicense = `SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.
The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.
DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).
"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.
PERMISSION & CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.
2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.
3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.
4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.
5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.
DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.`;
const remarkMathLicense = `(The MIT License)

Copyright (c) Junyoung Choi <fluke8259@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.`;

async function installedDirectory(name, parentDirectory) {
  let current = parentDirectory;
  for (;;) {
    const candidate = path.join(current, 'node_modules', name);
    try { await access(path.join(candidate, 'package.json')); return candidate; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) throw new Error(`Cannot locate installed dependency ${name} from ${parentDirectory}`);
    current = parent;
  }
}

async function collect(tree, parentDirectory) {
  for (const [name, dependency] of Object.entries(tree.dependencies ?? {})) {
    if (dependency.missing) throw new Error(`Missing production dependency: ${name}`);
    if (!dependency.path && !dependency.version) continue;
    const directory = dependency.path ?? await installedDirectory(name, parentDirectory);
    directories.add(await realpath(directory));
    await collect(dependency, directory);
  }
}
await collect(dependencyTree, root);

const noticeName = /^(?:licen[cs]e|copying|notice|copyright)(?:s|[._-].*)?$/i;
async function licenseFiles(directory, relative = '', insideLicenseDirectory = false) {
  const found = [];
  for (const entry of await readdir(path.join(directory, relative), { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git') continue;
    const filename = path.join(relative, entry.name);
    if (entry.isDirectory()) {
      found.push(...await licenseFiles(directory, filename, insideLicenseDirectory || /^licen[cs]es?$/i.test(entry.name)));
    } else if (entry.isFile() && (noticeName.test(entry.name)
      || (insideLicenseDirectory && /(?:\.(?:txt|md|rst|html?)|^[^.]+)$/i.test(entry.name)))) {
      found.push(filename);
    }
  }
  return found.sort();
}

// KaTeX's distributed TTFs also retain embedded copyright/license name records.
function fontNotices(bytes) {
  if (bytes.length < 12) return [];
  const count = bytes.readUInt16BE(4);
  let offset = 0;
  for (let index = 0; index < count && 12 + (index + 1) * 16 <= bytes.length; index++) {
    const record = 12 + index * 16;
    if (bytes.toString('ascii', record, record + 4) === 'name') offset = bytes.readUInt32BE(record + 8);
  }
  if (!offset || offset + 6 > bytes.length) return [];
  const records = bytes.readUInt16BE(offset + 2), strings = offset + bytes.readUInt16BE(offset + 4);
  const notices = new Set();
  for (let index = 0; index < records; index++) {
    const record = offset + 6 + index * 12;
    if (record + 12 > bytes.length) break;
    const platform = bytes.readUInt16BE(record), name = bytes.readUInt16BE(record + 6);
    if (![0, 13, 14].includes(name)) continue;
    const length = bytes.readUInt16BE(record + 8), start = strings + bytes.readUInt16BE(record + 10);
    if (start + length > bytes.length) continue;
    const value = Buffer.from(bytes.subarray(start, start + length));
    const text = (platform === 0 || platform === 3) && length % 2 === 0
      ? value.swap16().toString('utf16le') : value.toString('latin1');
    if (text.trim()) notices.add(text.trim());
  }
  return [...notices];
}

const packages = new Map();
for (const directory of [...directories].sort()) {
  const metadata = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  const key = `${metadata.name}@${metadata.version}`;
  let record = packages.get(key);
  if (!record) {
    const declared = metadata.license ?? metadata.licenses ?? 'Not declared in package.json';
    record = { name: metadata.name, version: metadata.version,
      license: typeof declared === 'string' ? declared : JSON.stringify(declared), texts: new Map() };
    packages.set(key, record);
  }
  for (const filename of await licenseFiles(directory)) {
    const text = (await readFile(path.join(directory, filename), 'utf8')).replace(/\r\n/g, '\n').trim();
    if (text && !record.texts.has(text)) record.texts.set(text, filename.split(path.sep).join('/'));
  }
  if (!record.texts.size) {
    const readme = (await readdir(directory)).find((name) => /^readme(?:\.(?:md|txt|rst))?$/i.test(name));
    if (readme) {
      const text = (await readFile(path.join(directory, readme), 'utf8')).replace(/\r\n/g, '\n');
      const section = /^#{1,6}\s+licen[cs]e\s*$/im.exec(text);
      if (section) {
        const rest = text.slice(section.index + section[0].length);
        const next = /\n(?:#{1,6}\s|<!--\s*Definitions)/i.exec(rest);
        record.texts.set(rest.slice(0, next?.index).trim(), `${readme} (license section)`);
      }
    }
  }
  if (metadata.name === 'remark-math' && metadata.version === '6.0.0') {
    record.texts.set(remarkMathLicense, 'Supplemental upstream license: https://raw.githubusercontent.com/remarkjs/remark-math/main/license');
  }
  if (metadata.name === 'katex') {
    record.texts.set(fontLicense, 'Supplemental font license: https://openfontlicense.org/documents/OFL.txt');
    const fonts = path.join(directory, 'dist/fonts');
    for (const filename of (await readdir(fonts)).filter((name) => name.endsWith('.ttf')).sort()) {
      const notices = fontNotices(await readFile(path.join(fonts, filename)));
      for (const text of notices) if (!record.texts.has(text)) record.texts.set(text, `dist/fonts/${filename} (embedded font notice)`);
    }
  }
}

const records = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));
const lines = [
  'ApeTek — Third-party notices',
  '',
  'Generated from the installed production dependency closure reported by:',
  'npm ls --omit=dev --all --json --long',
  '',
  'Package names, versions, declared licenses and available license/notice texts follow.',
  'Duplicate installed copies of the same package/version are combined without dropping distinct notice texts.',
  'KaTeX entries include available embedded font copyright and licensing metadata.',
  'Supplemental upstream license texts are identified by their source URLs and retained in this generator for offline regeneration.',
  '',
  'The separately distributed Electron runtime retains its own LICENSE and LICENSES.chromium.html files.',
  'The ApeTek project license is provided separately in LICENSE.',
  '',
];
const missing = [];
for (const record of records) {
  lines.push('='.repeat(78), `${record.name}@${record.version}`, `Declared license: ${record.license}`, '');
  if (!record.texts.size) {
    missing.push(`${record.name}@${record.version}`);
    lines.push('No standalone LICENSE/COPYING/NOTICE text was included in the installed package.', '');
  }
  for (const [text, filename] of record.texts) lines.push(`--- ${filename} ---`, '', text, '');
}
await writeFile(output, `${lines.join('\n')}\n`, 'utf8');
console.log(JSON.stringify({ file: path.basename(output), packages: records.length,
  packagesWithoutNoticeText: missing }, null, 2));
