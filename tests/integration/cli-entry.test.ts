import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..', '..');
const BINARY = join(ROOT, 'dist', 'bin', 'tg.js');

describe('CLI entry point (built binary)', () => {
  beforeAll(() => {
    // Build the project before running integration tests
    execSync('npx tsup', { cwd: ROOT, stdio: 'pipe' });
    expect(existsSync(BINARY)).toBe(true);
  });

  it('--help exits 0 and shows Auth and Session group headings', () => {
    const output = execSync(`node ${BINARY} --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('Auth');
    expect(output).toContain('Session');
    expect(output).toContain('auth');
    expect(output).toContain('session');
  });

  it('--version exits 0 and shows package version + gramjs version', () => {
    const output = execSync(`node ${BINARY} --version`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    // Format: "X.Y.Z (gramjs A.B.C)"
    expect(output.trim()).toMatch(/\d+\.\d+\.\d+ \(gramjs \d+\.\d+\.\d+\)/);
  });

  it('auth --help shows login, status, logout subcommands', () => {
    const output = execSync(`node ${BINARY} auth --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('login');
    expect(output).toContain('status');
    expect(output).toContain('logout');
  });

  it('session --help shows export, import subcommands', () => {
    const output = execSync(`node ${BINARY} session --help`, {
      cwd: ROOT,
      encoding: 'utf-8',
    });

    expect(output).toContain('export');
    expect(output).toContain('import');
  });
});
