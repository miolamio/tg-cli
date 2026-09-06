// tests/unit/daemon-pid.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';

describe('DaemonPaths', () => {
  let tempDir: string;
  let paths: DaemonPaths;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tg-daemon-test-'));
    paths = new DaemonPaths(tempDir, 'default');
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('computes socket path under config dir', () => {
    expect(paths.socketPath).toBe(join(tempDir, 'daemon', 'default.sock'));
  });

  it('computes pid path under config dir', () => {
    expect(paths.pidPath).toBe(join(tempDir, 'daemon', 'default.pid'));
  });

  it('strips path traversal from the profile name', () => {
    const sneaky = new DaemonPaths(tempDir, '../tmp/evil');
    expect(sneaky.socketPath).toBe(join(tempDir, 'daemon', 'evil.sock'));
    expect(sneaky.socketPath).not.toContain('..');
  });

  it('validates socket path length for AF_UNIX limit', () => {
    expect(() => paths.validateSocketPath()).not.toThrow();
  });

  it('rejects socket path exceeding 104 chars', () => {
    const longDir = join(tempDir, 'a'.repeat(100));
    const longPaths = new DaemonPaths(longDir, 'default');
    expect(() => longPaths.validateSocketPath()).toThrow(/too long/);
  });

  it('writes and reads PID file', () => {
    paths.writePid(12345);
    expect(paths.readPid()).toBe(12345);
  });

  it('writePidExclusive fails if the pid file already exists', () => {
    expect(paths.writePidExclusive(1)).toBe(true);
    expect(paths.writePidExclusive(2)).toBe(false);
    expect(paths.readPid()).toBe(1);
  });

  it('returns null when PID file does not exist', () => {
    expect(paths.readPid()).toBeNull();
  });

  it.each(['123junk', '1.5', '-1', '0', '4194305', '1e3', ''])('rejects malformed or unsafe pid %j', (value) => {
    paths.ensureDir();
    writeFileSync(paths.pidPath, value);
    expect(paths.readPid()).toBeNull();
  });

  it('removes PID and socket files on cleanup', () => {
    paths.writePid(12345);
    paths.cleanup();
    expect(paths.readPid()).toBeNull();
  });

  it('checks if socket file exists', () => {
    expect(paths.socketExists()).toBe(false);
  });

  it('cleanupOwned unlinks socket then pid only when the file still has our pid', () => {
    paths.writePidExclusive(111);
    writeFileSync(paths.socketPath, '');
    paths.cleanupOwned(111);
    expect(paths.readPid()).toBeNull();
    expect(paths.socketExists()).toBe(false);
  });

  it('cleanupOwned does not unlink a successor pid or socket', () => {
    paths.writePidExclusive(222);
    writeFileSync(paths.socketPath, '');
    paths.cleanupOwned(111);
    expect(paths.readPid()).toBe(222);
    expect(paths.socketExists()).toBe(true);
  });
});
