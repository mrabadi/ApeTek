import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FileDocument, RecoveryDraft } from '../shared/types';

export async function atomicWrite(destination: string, content: string | Uint8Array): Promise<void> {
  const temporary = path.join(path.dirname(destination), `.${path.basename(destination)}.${randomUUID()}.tmp`);
  let mode = 0o600;
  try { mode = (await stat(destination)).mode & 0o777; }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  try {
    const handle = await open(temporary, 'wx', mode);
    try {
      await handle.writeFile(content, 'utf8');
      await handle.sync();
    } finally { await handle.close(); }
    await rename(temporary, destination);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => undefined);
    throw error;
  }
}

export async function readMarkdown(source: string): Promise<FileDocument> {
  if (!['.md', '.markdown'].includes(path.extname(source).toLowerCase())) {
    throw new Error('Unsupported document format: choose a Markdown (.md) file.');
  }
  return { path: source, content: await readFile(source, 'utf8') };
}

export async function rememberDocument(directory: string, documentPath: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await atomicWrite(path.join(directory, 'last-document.json'), JSON.stringify({ path: documentPath }));
}

export async function loadLastDocument(directory: string): Promise<FileDocument | null> {
  try {
    const value: unknown = JSON.parse(await readFile(path.join(directory, 'last-document.json'), 'utf8'));
    if (!value || typeof value !== 'object' || !('path' in value) || typeof value.path !== 'string' || !path.isAbsolute(value.path)) return null;
    return await readMarkdown(value.path);
  } catch {
    return null;
  }
}

export async function loadRecovery(directory: string): Promise<RecoveryDraft | null> {
  let content: string;
  try { content = await readFile(path.join(directory, 'recovery.json'), 'utf8'); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
  let value: unknown;
  try { value = JSON.parse(content); }
  catch { return null; }
  if (!value || typeof value !== 'object') return null;
  const draft = value as Record<string, unknown>;
  if ((draft.path !== null && typeof draft.path !== 'string') ||
      typeof draft.content !== 'string' || typeof draft.dirty !== 'boolean') return null;
  return { path: draft.path as string | null, content: draft.content, dirty: draft.dirty };
}

export async function saveRecovery(directory: string, draft: RecoveryDraft): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await atomicWrite(path.join(directory, 'recovery.json'), JSON.stringify(draft));
}

export async function discardRecovery(directory: string): Promise<void> {
  await rm(path.join(directory, 'recovery.json'), { force: true });
}

function rasterMime(data: Buffer): string | null {
  if (data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  const header = data.subarray(0, 6).toString('ascii');
  if (header === 'GIF87a' || header === 'GIF89a') return 'image/gif';
  if (data.subarray(0, 4).toString('ascii') === 'RIFF' &&
      data.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  return null;
}

export async function resolveLocalImage(source: string, documentPath: string | null): Promise<string | null> {
  if (source.startsWith('data:')) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp));base64,([a-z0-9+/=\s]+)$/i.exec(source);
    if (!match) return null;
    const data = Buffer.from(match[2], 'base64');
    const mime = rasterMime(data);
    return mime === match[1].toLowerCase() ? `data:${mime};base64,${data.toString('base64')}` : null;
  }
  let target: string;
  try {
    if (/^[a-z][a-z0-9+.-]*:/i.test(source) && !source.startsWith('file:')) return null;
    if (!path.isAbsolute(source) && !source.startsWith('file:') && !documentPath) return null;
    const url = new URL(source, documentPath ? pathToFileURL(documentPath) : 'file:///');
    if (url.protocol !== 'file:') return null;
    target = fileURLToPath(url);
  } catch { return null; }
  let data: Buffer;
  try { data = await readFile(target); }
  catch { return null; }
  const mime = rasterMime(data);
  return mime ? `data:${mime};base64,${data.toString('base64')}` : null;
}
