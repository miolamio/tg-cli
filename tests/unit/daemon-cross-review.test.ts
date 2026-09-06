import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';
import { SessionStore } from '../../src/lib/session-store.js';

const mocks = vi.hoisted(() => ({ connect: vi.fn(), destroy: vi.fn(), add: vi.fn(), remove: vi.fn() }));
vi.mock('telegram', async importOriginal => {
  const actual = await importOriginal<typeof import('telegram')>();
  return {
    ...actual,
    sessions: { StringSession: class {} },
    TelegramClient: class {
      connect = mocks.connect;
      destroy = mocks.destroy;
      addEventHandler = mocks.add;
      removeEventHandler = mocks.remove;
      getEntity = vi.fn().mockResolvedValue(new actual.Api.User({ id: 7n as any, firstName: 'Fixture' }));
    },
  };
});

describe('independent daemon lifecycle review', () => {
  let dir: string;
  let daemon: DaemonServer;
  let rpc: DaemonClient;
  let releaseConnect: (() => void) | undefined;

  beforeEach(async () => {
    vi.clearAllMocks();
    mocks.connect.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(undefined);
    dir = await mkdtemp(join(tmpdir(), 'tg-daemon-cross-'));
    await new SessionStore(dir).save('fixture', 'synthetic-session');
    const paths = new DaemonPaths(dir, 'fixture');
    daemon = new DaemonServer(paths, { apiId: 1, apiHash: 'synthetic' }, { idleTimeout: 0 });
    rpc = new DaemonClient(paths.socketPath);
  });

  afterEach(async () => {
    releaseConnect?.();
    releaseConnect = undefined;
    rpc.close();
    await daemon.stop();
    await rm(dir, { recursive: true, force: true });
  });

  it('shutdown interrupts an in-flight connect before waiting for startup completion', async () => {
    let failConnect!: (err: Error) => void;
    const connecting = new Promise<void>((resolve, reject) => {
      releaseConnect = resolve;
      failConnect = reject;
    });
    mocks.connect.mockReturnValue(connecting);
    mocks.destroy.mockImplementation(async () => { failConnect(new Error('Connection interrupted')); });
    const starting = daemon.start().catch(err => err);
    await vi.waitFor(() => expect(mocks.connect).toHaveBeenCalledOnce());
    const stopping = daemon.stop();
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalled(), { timeout: 150 });
    await stopping;
    expect(await starting).toBeInstanceOf(Error);
    await expect(new SessionStore(dir).withLock('fixture', async () => true)).resolves.toBe(true);
  });

  it('RPC subscription rejects an explicitly empty topic instead of broadening it to all messages', async () => {
    await daemon.start();
    await expect(rpc.call('subscribe', { chat: 'fixture', topic: '' }, { timeoutMs: 500 })).rejects.toThrow(/topic/i);
    expect(mocks.add).not.toHaveBeenCalled();
  });

  it('stopping a rejected duplicate instance preserves the running owner socket and PID', async () => {
    await daemon.start();
    const paths = new DaemonPaths(dir, 'fixture');
    const duplicate = new DaemonServer(paths, { apiId: 1, apiHash: 'synthetic' }, { idleTimeout: 0 });
    await expect(duplicate.start()).rejects.toThrow(/already running/);
    await duplicate.stop();
    expect(paths.readPid()).toBe(process.pid);
    await expect(rpc.call('ping', {}, { timeoutMs: 500 })).resolves.toBe('pong');
  });
});
