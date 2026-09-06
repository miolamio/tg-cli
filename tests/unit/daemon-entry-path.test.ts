import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { resolveDaemonEntry } from '../../src/lib/daemon/entry-path.js';

describe('resolveDaemonEntry', () => {
  let root: string;
  const origArgv1 = process.argv[1];

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'tg-daemon-entry-'));
  });

  afterEach(() => {
    process.argv[1] = origArgv1;
    rmSync(root, { recursive: true, force: true });
  });

  it('resolves dist/lib/daemon/entry.js from dist/bin/tg.js', () => {
    const binDir = join(root, 'dist', 'bin');
    const entry = join(root, 'dist', 'lib', 'daemon', 'entry.js');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(root, 'dist', 'lib', 'daemon'), { recursive: true });
    writeFileSync(join(binDir, 'tg.js'), '');
    writeFileSync(entry, '');

    process.argv[1] = join(binDir, 'tg.js');
    const url = pathToFileURL(join(binDir, 'tg.js')).href;
    expect(resolveDaemonEntry(url)).toBe(entry);
  });

  it('resolves dist/lib/daemon/entry.js from a dist/ chunk', () => {
    const distDir = join(root, 'dist');
    const entry = join(distDir, 'lib', 'daemon', 'entry.js');
    mkdirSync(join(distDir, 'lib', 'daemon'), { recursive: true });
    writeFileSync(join(distDir, 'chunk-ABC.js'), '');
    writeFileSync(entry, '');

    process.argv[1] = join(distDir, 'chunk-ABC.js');
    const url = pathToFileURL(join(distDir, 'chunk-ABC.js')).href;
    expect(resolveDaemonEntry(url)).toBe(entry);
  });

  it('does not resolve to <pkg>/lib/daemon/entry.js when only dist/ has the file', () => {
    const binDir = join(root, 'dist', 'bin');
    const distEntry = join(root, 'dist', 'lib', 'daemon', 'entry.js');
    const wrongEntry = join(root, 'lib', 'daemon', 'entry.js');
    mkdirSync(binDir, { recursive: true });
    mkdirSync(join(root, 'dist', 'lib', 'daemon'), { recursive: true });
    mkdirSync(join(root, 'lib', 'daemon'), { recursive: true });
    writeFileSync(join(binDir, 'tg.js'), '');
    writeFileSync(distEntry, '');
    writeFileSync(wrongEntry, '');

    process.argv[1] = join(binDir, 'tg.js');
    const url = pathToFileURL(join(binDir, 'tg.js')).href;
    // First existing candidate from dist/bin is ../lib/daemon/entry.js → dist/lib/...
    expect(resolveDaemonEntry(url)).toBe(distEntry);
    expect(resolveDaemonEntry(url)).not.toBe(wrongEntry);
  });
});
