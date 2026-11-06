/**
 * Unpack a template's .tar.gz (GitHub's codeload tarball) into a folder.
 *
 * Node's zlib does the gunzip; the tar format is simple enough to read here
 * rather than add a dependency. Only regular files and folders are written:
 * links are skipped, because a link could point outside the target folder.
 */

import * as fs from 'fs';
import * as path from 'path';
import { gunzipSync } from 'zlib';

export interface TarEntry {
  path: string;
  type: 'file' | 'dir';
  mode: number;
  data: Buffer;
}

/** A pax extended header's `path` record ("<length> path=<value>\n"), if it has one. */
function paxPath(body: Buffer): string | undefined {
  let found: string | undefined;
  for (let at = 0; at < body.length; ) {
    const space = body.indexOf(0x20, at);
    const length = space < 0 ? 0 : parseInt(body.subarray(at, space).toString('latin1'), 10);
    if (!length) break;
    const record = body.subarray(space + 1, at + length - 1).toString('utf8');
    const equals = record.indexOf('=');
    if (record.slice(0, equals) === 'path') found = record.slice(equals + 1);
    at += length;
  }
  return found;
}

/** Regular files and folders of an uncompressed tar archive, in archive order. */
export function readTar(archive: Buffer): TarEntry[] {
  const entries: TarEntry[] = [];
  let longPath: string | undefined;
  for (let offset = 0; offset + 512 <= archive.length; ) {
    const header = archive.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break; // end of archive
    const field = (start: number, length: number) =>
      header.subarray(start, start + length).toString('utf8').replace(/\0[\s\S]*$/, '');
    const size = parseInt(field(124, 12).trim() || '0', 8);
    const type = field(156, 1) || '0';
    const body = archive.subarray(offset + 512, offset + 512 + size);
    offset += 512 + Math.ceil(size / 512) * 512;

    if (type === 'x') { longPath = paxPath(body) ?? longPath; continue; }
    if (type === 'L') { longPath = body.toString('utf8').replace(/\0[\s\S]*$/, ''); continue; }
    if (type === 'g') continue; // global header: GitHub puts the commit id here

    // The ustar prefix field holds the start of a long name; other formats use those bytes differently.
    const prefix = header.subarray(257, 263).toString('latin1') === 'ustar\0' ? field(345, 155) : '';
    const name = longPath ?? (prefix ? `${prefix}/${field(0, 100)}` : field(0, 100));
    longPath = undefined;
    if (type === '0' || type === '7') {
      entries.push({ path: name, type: 'file', mode: parseInt(field(100, 8).trim() || '644', 8), data: body });
    } else if (type === '5') {
      entries.push({ path: name, type: 'dir', mode: 0o755, data: Buffer.alloc(0) });
    }
  }
  return entries;
}

/**
 * Where an archive entry lands inside the target folder: the archive's top
 * folder and the template's `rootDirectory` are dropped. null = outside
 * `rootDirectory` (or the root itself). Throws on an absolute path or `..`.
 */
export function templatePath(archivePath: string, rootDirectory?: string | null): string | null {
  const parts = archivePath.split(/[\\/]/);
  if (/^([\\/]|[a-zA-Z]:)/.test(archivePath) || parts.includes('..')) {
    throw new Error(`The template archive has an unsafe path: ${archivePath}`);
  }
  const rest = parts.slice(1).filter((part) => part && part !== '.');
  const root = (rootDirectory ?? '').split(/[\\/]/).filter((part) => part && part !== '.');
  if (root.some((part, i) => rest[i] !== part)) return null;
  return rest.slice(root.length).join('/') || null;
}

/** Templates go into a new or empty folder, so nothing of the user's is overwritten. */
export function assertEmptyFolder(target: string): void {
  if (fs.existsSync(target) && fs.readdirSync(target).length > 0) {
    throw new Error(`${path.resolve(target)} is not empty. Choose a new or empty folder.`);
  }
}

/**
 * Write a template's .tar.gz into `target` (a new or empty folder) and
 * answer with the files written, relative to it. Everything is checked
 * before the first write, so a bad archive leaves nothing behind.
 * shortcut: the archive is held in memory like the upload packager's zip; stream it if templates outgrow ~100 MB.
 */
export function unpackTemplate(tarGz: Buffer, target: string, rootDirectory?: string | null): string[] {
  const base = path.resolve(target);
  const planned = readTar(gunzipSync(tarGz)).flatMap((entry) => {
    const relative = templatePath(entry.path, rootDirectory);
    if (!relative) return [];
    const full = path.resolve(base, relative);
    if (!full.startsWith(base + path.sep)) throw new Error(`The template archive has an unsafe path: ${entry.path}`);
    return [{ ...entry, relative, full }];
  });
  if (!planned.some((entry) => entry.type === 'file')) {
    throw new Error(`The template archive has no files${rootDirectory ? ` under ${rootDirectory}` : ''}.`);
  }
  assertEmptyFolder(base);

  const written: string[] = [];
  for (const entry of planned) {
    if (entry.type === 'dir') {
      fs.mkdirSync(entry.full, { recursive: true });
      continue;
    }
    fs.mkdirSync(path.dirname(entry.full), { recursive: true });
    fs.writeFileSync(entry.full, entry.data, { mode: entry.mode & 0o111 ? 0o755 : 0o644 });
    written.push(entry.relative);
  }
  return written;
}
