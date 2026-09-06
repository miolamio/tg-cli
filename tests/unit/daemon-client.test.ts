// tests/unit/daemon-client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const { clientHandlers, mockGetEntity } = vi.hoisted(() => {
  const clientHandlers: Array<(event: any) => void> = [];
  return {
    clientHandlers,
    mockGetEntity: vi.fn(async () => ({ id: 42, className: 'User' })),
  };
});
vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
    getEntity: mockGetEntity,
    addEventHandler: vi.fn((h: (event: any) => void) => {
      clientHandlers.push(h);
    }),
    removeEventHandler: vi.fn(),
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
    clientHandlers.length = 0;
    mockGetEntity.mockImplementation(async () => ({ id: 42, className: 'User' }));
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

  it('watch yields serialized messages after subscribe ack', async () => {
    const client = new DaemonClient(paths.socketPath);
    const seen: unknown[] = [];

    const watching = client.watch({ chat: 'alice' }, (payload) => {
      seen.push(payload);
      client.close();
    });

    await vi.waitFor(() => expect(clientHandlers.length).toBe(1));
    clientHandlers[0]({
      message: { id: 11, date: 1_700_000_000, message: 'ping', chatId: 42 },
    });

    await watching;
    expect(seen).toHaveLength(1);
    expect((seen[0] as any).id).toBe(11);
    expect((seen[0] as any).text).toBe('ping');
  });

  it('throws when socket does not exist', async () => {
    const client = new DaemonClient('/tmp/nonexistent-tg-daemon.sock');
    await expect(client.call('ping', {})).rejects.toThrow();
    client.close();
  });
});
