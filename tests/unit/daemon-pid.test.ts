// tests/unit/daemon-pid.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
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

  it('returns null when PID file does not exist', () => {
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
});
