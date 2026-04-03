// tests/unit/daemon-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock telegram (for DaemonServer)
vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  })),
  sessions: { StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })) },
}));

import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';

describe('DaemonClient', () => {
  let tempDir: string;
  let paths: DaemonPaths;
  let server: DaemonServer;

  beforeEach(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'tg-daemon-cli-'));
    paths = new DaemonPaths(tempDir, 'test');
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
  });

  afterEach(async () => {
    await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('sends a ping and receives pong', async () => {
    const client = new DaemonClient(paths.socketPath);
    const result = await client.call('ping', {});
    expect(result).toBe('pong');
    client.close();
  });

  it('receives status response', async () => {
    const client = new DaemonClient(paths.socketPath);
    const result = await client.call('status', {}) as any;
    expect(result.running).toBe(true);
    expect(typeof result.pid).toBe('number');
    client.close();
  });

  it('throws on unknown method', async () => {
    const client = new DaemonClient(paths.socketPath);
    await expect(client.call('bogus', {})).rejects.toThrow(/Unknown method/);
    client.close();
  });

  it('throws when socket does not exist', async () => {
    const client = new DaemonClient('/tmp/nonexistent-tg-daemon.sock');
    await expect(client.call('ping', {})).rejects.toThrow();
    client.close();
  });
});
