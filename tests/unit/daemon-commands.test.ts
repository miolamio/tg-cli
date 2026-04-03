import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';

describe('DaemonPaths integration for commands', () => {
  let tempDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'tg-daemon-cmd-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('status reports not running when no PID file', () => {
    const paths = new DaemonPaths(tempDir, 'default');
    expect(paths.readPid()).toBeNull();
    expect(paths.socketExists()).toBe(false);
  });

  it('status reports PID when PID file exists', () => {
    const paths = new DaemonPaths(tempDir, 'default');
    paths.writePid(99999);
    expect(paths.readPid()).toBe(99999);
  });
});
