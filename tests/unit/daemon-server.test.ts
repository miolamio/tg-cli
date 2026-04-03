// tests/unit/daemon-server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { once } from 'node:events';

// Mock telegram
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: { StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })) },
}));

import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { encodeRequest, parseMessage } from '../../src/lib/daemon/protocol.js';

describe('DaemonServer', () => {
  let tempDir: string;
  let paths: DaemonPaths;
  let server: DaemonServer;

  beforeEach(() => {
    vi.clearAllMocks();
    tempDir = mkdtempSync(join(tmpdir(), 'tg-daemon-srv-'));
    paths = new DaemonPaths(tempDir, 'test');
  });

  afterEach(async () => {
    if (server) await server.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('starts and accepts connections on Unix socket', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    expect(paths.socketExists()).toBe(true);

    // Connect and send ping
    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');
    sock.write(encodeRequest('ping', {}, 1) + '\n');

    const [data] = await once(sock, 'data');
    const msg = parseMessage(data.toString().trim());
    expect(msg.type).toBe('response');
    expect((msg as any).result).toBe('pong');

    sock.destroy();
  });

  it('responds with error for unknown methods', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();

    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');
    sock.write(encodeRequest('nonexistent', {}, 2) + '\n');

    const [data] = await once(sock, 'data');
    const msg = parseMessage(data.toString().trim());
    expect(msg.type).toBe('error');
    expect((msg as any).error.code).toBe(-32601);
  });

  it('stops cleanly and removes socket', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    await server.stop();
    expect(paths.socketExists()).toBe(false);
  });
});
