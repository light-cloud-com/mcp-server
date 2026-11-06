// Tests for src/upload/unpack.ts - template archives into a folder

import { afterEach, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gzipSync } from 'zlib';
import { readTar, templatePath, unpackTemplate } from '../upload/unpack.js';

/** One tar entry (ustar header + padded body); the reader does not check checksums. */
function entry(name: string, body = '', type = '0', options: { prefix?: string; mode?: string } = {}): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write(`${options.mode ?? '0000644'}\0`, 100, 'latin1');
  header.write(`${Buffer.byteLength(body).toString(8).padStart(11, '0')}\0`, 124, 'latin1');
  header.write(type, 156, 'latin1');
  header.write('ustar\0', 257, 'latin1');
  header.write('00', 263, 'latin1');
  if (options.prefix) header.write(options.prefix, 345, 'utf8');
  const data = Buffer.alloc(Math.ceil(Buffer.byteLength(body) / 512) * 512);
  data.write(body);
  return Buffer.concat([header, data]);
}

/** A pax record: "<length> key=value\n", the length counting itself. */
function pax(key: string, value: string): string {
  const tail = ` ${key}=${value}\n`;
  let length = tail.length;
  while (String(length).length + tail.length !== length) length++;
  return `${length}${tail}`;
}

const archive = (...entries: Buffer[]) => Buffer.concat([...entries, Buffer.alloc(1024)]);
const tarGz = (...entries: Buffer[]) => gzipSync(archive(...entries));

const temp: string[] = [];
const tempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lc-unpack-'));
  temp.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of temp.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

describe('readTar', () => {
  it('reads files and folders, long names from the ustar prefix and pax headers', () => {
    const deep = `src/${'a'.repeat(120)}.ts`;
    const entries = readTar(archive(
      entry('pax_global_header', pax('comment', 'abc123'), 'g'),
      entry('repo-main/', '', '5'),
      entry('repo-main/index.html', '<h1>Hi</h1>'),
      entry('index.ts', 'long', '0', { prefix: 'repo-main/src/very/deep' }),
      entry('PaxHeader', pax('path', `repo-main/${deep}`), 'x'),
      entry('repo-main/truncated-name', 'pax wins'),
      entry('repo-main/link', '', '2'),
    ));
    expect(entries.map((e) => [e.path, e.type])).toEqual([
      ['repo-main/', 'dir'],
      ['repo-main/index.html', 'file'],
      ['repo-main/src/very/deep/index.ts', 'file'],
      [`repo-main/${deep}`, 'file'],
    ]);
    expect(entries[1].data.toString()).toBe('<h1>Hi</h1>');
    expect(entries[3].data.toString()).toBe('pax wins');
  });
});

describe('templatePath', () => {
  it('drops the top folder and the root directory', () => {
    expect(templatePath('repo-main/src/app.ts')).toBe('src/app.ts');
    expect(templatePath('repo-main/apps/web/package.json', 'apps/web')).toBe('package.json');
    expect(templatePath('repo-main/apps/web/src/a.ts', '/apps/web/')).toBe('src/a.ts');
    expect(templatePath('repo-main/apps/api/a.ts', 'apps/web')).toBeNull();
    expect(templatePath('repo-main/', null)).toBeNull();
  });

  it('refuses paths that climb out or are absolute', () => {
    expect(() => templatePath('repo-main/../../etc/passwd')).toThrow(/unsafe path/);
    expect(() => templatePath('/etc/passwd')).toThrow(/unsafe path/);
    expect(() => templatePath('C:\\Windows\\x')).toThrow(/unsafe path/);
    expect(() => templatePath('repo-main\\..\\..\\x')).toThrow(/unsafe path/);
  });
});

describe('unpackTemplate', () => {
  it('writes the files under the root directory, keeping the executable bit', () => {
    const target = path.join(tempDir(), 'site');
    const written = unpackTemplate(tarGz(
      entry('repo-main/README.md', 'root readme'),
      entry('repo-main/apps/web/index.html', '<p>web</p>'),
      entry('repo-main/apps/web/bin/run', '#!/bin/sh', '0', { mode: '0000755' }),
    ), target, 'apps/web');
    expect(written.sort()).toEqual(['bin/run', 'index.html']);
    expect(fs.readFileSync(path.join(target, 'index.html'), 'utf8')).toBe('<p>web</p>');
    expect(fs.existsSync(path.join(target, 'README.md'))).toBe(false);
    if (process.platform !== 'win32') expect(fs.statSync(path.join(target, 'bin/run')).mode & 0o111).not.toBe(0);
  });

  it('writes nothing when any entry would land outside the folder', () => {
    const parent = tempDir();
    const target = path.join(parent, 'site');
    expect(() => unpackTemplate(tarGz(
      entry('repo-main/ok.txt', 'fine'),
      entry('repo-main/../escaped.txt', 'bad'),
    ), target)).toThrow(/unsafe path/);
    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(path.join(parent, 'escaped.txt'))).toBe(false);
  });

  it('refuses a folder that already has files', () => {
    const target = tempDir();
    fs.writeFileSync(path.join(target, 'mine.txt'), 'keep');
    expect(() => unpackTemplate(tarGz(entry('repo-main/a.txt', 'a')), target)).toThrow(/not empty/);
    expect(fs.readdirSync(target)).toEqual(['mine.txt']);
  });

  it('says so when the root directory has no files', () => {
    expect(() => unpackTemplate(tarGz(entry('repo-main/a.txt', 'a')), path.join(tempDir(), 'x'), 'apps/web')).toThrow(/no files under apps\/web/);
  });
});
