import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { Api } from 'telegram';
import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';
import { SessionStore } from '../../src/lib/session-store.js';

const mocks = vi.hoisted(() => ({ constructor: vi.fn(), connect: vi.fn(), destroy: vi.fn(), entity: vi.fn(), invoke: vi.fn(), messages: vi.fn() }));
vi.mock('telegram', async importOriginal => {
  const actual = await importOriginal<typeof import('telegram')>();
  return {
    ...actual,
    sessions: { StringSession: class {} },
    TelegramClient: class {
      connected = false;
      constructor(...args: unknown[]) { mocks.constructor(...args); }
      async connect() { await mocks.connect(); this.connected = true; }
      async destroy() { await mocks.destroy(); this.connected = false; }
      getEntity = mocks.entity;
      invoke = mocks.invoke;
      getMessages = mocks.messages;
      addEventHandler = vi.fn();
      removeEventHandler = vi.fn();
    },
  };
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

/** Real sockets + real command handlers/ALS; only MTProto transport is replaced. */
describe('persistent daemon execute API', () => {
  let dir: string;
  let paths: DaemonPaths;
  let server: DaemonServer;
  let skipStop = false;
  const clients: DaemonClient[] = [];
  beforeEach(() => {
    vi.clearAllMocks();
    skipStop = false;
    process.exitCode = 0;
    mocks.connect.mockResolvedValue(undefined);
    mocks.destroy.mockResolvedValue(undefined);
    mocks.entity.mockResolvedValue(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
    mocks.invoke.mockResolvedValue(true);
    mocks.messages.mockResolvedValue([]);
    dir = mkdtempSync(join(tmpdir(), 'tg-execute-'));
    paths = new DaemonPaths(dir, 'fixture');
  });
  afterEach(async () => {
    for (const client of clients) client.close();
    clients.length = 0;
    if (server && !skipStop) await server.stop();
    vi.restoreAllMocks();
    process.exitCode = 0;
    rmSync(dir, { recursive: true, force: true });
  });
  function client() {
    const current = new DaemonClient(paths.socketPath);
    clients.push(current);
    return current;
  }
  async function start(opts?: { idleTimeout?: number; onIdle?: () => void }) {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'synthetic', sessionString: 'synthetic-session' }, opts);
    await server.start();
  }
  async function status() { return client().call('status', {}) as Promise<Record<string, unknown>>; }

  it('reuses one connected client for multiple commands and advertises the API', async () => {
    await start();
    writeFileSync(join(dir, 'config.json'), 'invalid JSON: execute must never load this');
    const rpc = client();
    for (const name of ['alice', 'bob']) {
      await expect(rpc.execute(['chat', 'resolve', name])).resolves.toMatchObject({ output: { ok: true, data: { id: '7', title: 'Fixture' } }, exitCode: 0 });
    }
    expect(mocks.constructor).toHaveBeenCalledOnce();
    expect(mocks.connect).toHaveBeenCalledOnce();
    expect(mocks.destroy).not.toHaveBeenCalled();
    expect(await status()).toMatchObject({ running: true, connected: true, apiVersion: 1, capabilities: ['execute', 'subscribe'], activeRequests: 0 });
  });

  it('isolates concurrent success/failure outputs and keeps stdout and daemon exit status untouched', async () => {
    await start();
    const good = deferred<Api.User>();
    const bad = deferred<Api.User>();
    mocks.entity.mockImplementation((name: string) => name === 'good' ? good.promise : bad.promise);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const success = client().execute(['chat', 'resolve', 'good']);
    const failure = client().execute(['chat', 'resolve', 'bad']);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledTimes(2));
    bad.reject(Object.assign(new Error('Access denied'), { errorMessage: 'CHAT_ADMIN_REQUIRED', code: 400 }));
    expect(await failure).toMatchObject({ output: { ok: false, code: 'CHAT_ADMIN_REQUIRED' }, exitCode: 1 });
    good.resolve(new Api.User({ id: 8n as any, firstName: 'Good' }));
    expect(await success).toMatchObject({ output: { ok: true, data: { id: '8', title: 'Good' } }, exitCode: 0 });
    expect(stdout).not.toHaveBeenCalled();
    expect(stderr).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(0);
    expect(await client().call('ping', {})).toBe('pong');
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('returns structured command validation errors without harming the connection', async () => {
    await start();
    const rpc = client();
    for (const argv of [['auth', 'logout'], ['message', 'send'], ['chat', 'resolve', 'alice', '--config', '/unused']]) {
      await expect(rpc.call('execute', { argv })).resolves.toMatchObject({ output: { ok: false }, exitCode: 1 });
    }
    expect(mocks.entity).not.toHaveBeenCalled();
    await expect(rpc.execute(['chat', 'resolve', 'alice'])).resolves.toMatchObject({ output: { ok: true } });
  });

  it('times out promptly but keeps late work active and prevents a subsequent write', async () => {
    const onIdle = vi.fn();
    await start({ idleTimeout: 40, onIdle });
    mocks.entity.mockResolvedValue(new Api.Chat({ id: 7n as any, title: 'Chat' }));
    const pending = deferred<boolean>();
    mocks.invoke.mockReturnValue(pending.promise);
    const result = client().execute(['chat', 'edit', 'chat', '--title', 'First', '--description', 'Second'], { timeoutMs: 30 });
    await expect(result).rejects.toMatchObject({ data: { tgCode: 'TIMEOUT' }, message: expect.stringContaining('unknown') });
    expect(mocks.invoke).toHaveBeenCalledOnce();
    await new Promise(resolve => setTimeout(resolve, 90));
    expect(onIdle).not.toHaveBeenCalled();
    expect(await status()).toMatchObject({ activeRequests: 1, connected: true });
    pending.resolve(true);
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce());
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.destroy).toHaveBeenCalledOnce();
  });

  it('aborts disconnected callers while retaining their unfinished work', async () => {
    await start();
    mocks.entity.mockResolvedValue(new Api.Chat({ id: 7n as any, title: 'Chat' }));
    const pending = deferred<boolean>();
    mocks.invoke.mockReturnValue(pending.promise);
    const rpc = client();
    const result = rpc.execute(['chat', 'edit', 'chat', '--title', 'First', '--description', 'Second']);
    const rejected = expect(result).rejects.toThrow('cancelled');
    await vi.waitFor(() => expect(mocks.invoke).toHaveBeenCalledOnce());
    rpc.close();
    await rejected;
    await vi.waitFor(() => expect((server as any).sockets.size).toBe(0));
    expect(await status()).toMatchObject({ activeRequests: 1 });
    pending.resolve(true);
    await vi.waitFor(() => expect((server as any).activeRequests.size).toBe(0));
    expect(mocks.invoke).toHaveBeenCalledOnce();
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('keeps detached SDK work active even after returning a successful command result', async () => {
    const onIdle = vi.fn();
    await start({ idleTimeout: 30, onIdle });
    const pending = deferred<boolean>();
    mocks.invoke.mockReturnValue(pending.promise);
    mocks.entity.mockImplementation(async function (this: any) {
      void this.invoke({ synthetic: true });
      return new Api.User({ id: 7n as any, firstName: 'Fixture' });
    });
    await expect(client().execute(['chat', 'resolve', 'alice'])).resolves.toMatchObject({ output: { ok: true } });
    await vi.waitFor(() => expect((server as any).sockets.size).toBe(0));
    expect((server as any).activeRequests.size).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(onIdle).not.toHaveBeenCalled();
    expect(mocks.destroy).not.toHaveBeenCalled();
    pending.reject(new Error('Late detached RPC failure'));
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce());
    expect((server as any).activeRequests.size).toBe(0);
  });

  it('retains unfinished subscription preparation after caller cancellation and prevents late handler registration', async () => {
    const onIdle = vi.fn();
    await start({ idleTimeout: 30, onIdle });
    const shared = server.getClient()!;
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    const rpc = client();
    const subscribed = rpc.call('subscribe', { chat: 'wait' }).catch(error => error);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledOnce());
    rpc.close();
    await subscribed;
    await vi.waitFor(() => expect((server as any).sockets.size).toBe(0));
    expect((server as any).activeRequests.size).toBe(1);
    await new Promise(resolve => setTimeout(resolve, 70));
    expect(onIdle).not.toHaveBeenCalled();
    pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce());
    expect(shared.addEventHandler).not.toHaveBeenCalled();
  });

  it('holds the session lease through late subscription setup during daemon shutdown', async () => {
    await start();
    const shared = server.getClient()!;
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    const result = client().call('subscribe', { chat: 'wait' }).catch(error => error);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledOnce());
    const stopping = server.stop();
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    await expect(new SessionStore(dir).acquireLock('fixture')).rejects.toMatchObject({ code: 'ELOCKED' });
    pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
    await Promise.all([stopping, result]);
    expect(shared.addEventHandler).not.toHaveBeenCalled();
    await expect(new SessionStore(dir).withLock('fixture', async () => 'free')).resolves.toBe('free');
  });

  it('enforces the concurrent command limit and never retries rejected work', async () => {
    await start();
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    const rpcClients = Array.from({ length: 16 }, () => client());
    const running = rpcClients.map(rpc => rpc.execute(['chat', 'resolve', 'wait']).catch(err => err));
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledTimes(16));
    await expect(client().execute(['chat', 'resolve', 'overflow'])).rejects.toMatchObject({ data: { tgCode: 'DAEMON_BUSY' } });
    expect(mocks.entity).toHaveBeenCalledTimes(16);
    for (const rpc of rpcClients) rpc.close();
    pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
    await Promise.all(running);
    await vi.waitFor(() => expect((server as any).activeRequests.size).toBe(0));
  });

  it('returns a small structured error when a completed response exceeds the frame bound', async () => {
    await start();
    mocks.entity.mockResolvedValue(new Api.User({ id: 7n as any, firstName: 'x'.repeat(1_048_576) }));
    await expect(client().execute(['chat', 'resolve', 'large'])).rejects.toMatchObject({ data: { tgCode: 'DAEMON_RESPONSE_TOO_LARGE' } });
    await expect(client().call('ping', {})).resolves.toBe('pong');
    expect(mocks.destroy).not.toHaveBeenCalled();
  });

  it('keeps the session lease during shutdown until already-started operations settle', async () => {
    await start();
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    const result = client().execute(['chat', 'resolve', 'wait']).catch(error => error);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledOnce());
    let stopped = false;
    const stopping = server.stop().then(() => { stopped = true; });
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    await expect(new SessionStore(dir).acquireLock('fixture')).rejects.toMatchObject({ code: 'ELOCKED' });
    expect(stopped).toBe(false);
    pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
    await Promise.all([stopping, result]);
    await expect(new SessionStore(dir).withLock('fixture', async () => 'free')).resolves.toBe('free');
  });

  it('destroys a transport recreated by late DC migration before releasing the session lease', async () => {
    await start();
    const migrating = deferred<void>();
    const shared = server.getClient() as any;
    shared._switchDC = async function () {
      await migrating.promise;
      this.connected = true;
    };
    mocks.entity.mockImplementation(async function (this: any) {
      await this._switchDC(2);
      return new Api.User({ id: 7n as any, firstName: 'Fixture' });
    });
    const result = client().execute(['chat', 'resolve', 'wait']).catch(error => error);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledOnce());
    const stopping = server.stop();
    await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
    expect(shared.connected).toBe(false);
    migrating.resolve();
    await Promise.all([stopping, result]);
    expect(mocks.destroy).toHaveBeenCalledTimes(2);
    expect(shared.connected).toBe(false);
    await expect(new SessionStore(dir).withLock('fixture', async () => 'free')).resolves.toBe('free');
  });

  it('retains ownership if destroying a late transport fails after the initial teardown succeeded', async () => {
    const originalAcquire = SessionStore.prototype.acquireLock;
    let releaseLease!: () => Promise<void>;
    const acquire = vi.spyOn(SessionStore.prototype, 'acquireLock').mockImplementation(async function (profile) {
      releaseLease = await originalAcquire.call(this, profile);
      return releaseLease;
    });
    await start();
    acquire.mockRestore();
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    mocks.destroy.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('Late transport teardown failed'));
    const result = client().execute(['chat', 'resolve', 'wait']).catch(error => error);
    await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledOnce());
    skipStop = true;
    try {
      const stopping = server.stop();
      const failure = expect(stopping).rejects.toThrow('Late transport teardown failed');
      await vi.waitFor(() => expect(mocks.destroy).toHaveBeenCalledOnce());
      pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
      await Promise.all([failure, result]);
      expect(mocks.destroy).toHaveBeenCalledTimes(2);
      await expect(new SessionStore(dir).acquireLock('fixture')).rejects.toMatchObject({ code: 'ELOCKED' });
    } finally {
      await releaseLease();
    }
  });

  it('cancels all pipelined requests on one socket without accumulating per-request close listeners', async () => {
    await start();
    const pending = deferred<Api.User>();
    mocks.entity.mockReturnValue(pending.promise);
    const socket = createConnection(paths.socketPath);
    await new Promise<void>((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); });
    try {
      socket.write(Array.from({ length: 16 }, (_, id) => JSON.stringify({
        jsonrpc: '2.0', id, method: 'execute', params: { argv: ['chat', 'resolve', 'wait'] },
      }) + '\n').join(''));
      await vi.waitFor(() => expect(mocks.entity).toHaveBeenCalledTimes(16));
      const acceptedSocket = [...(server as any).sockets][0];
      expect(acceptedSocket.listenerCount('close')).toBeLessThan(10);
      socket.destroy();
      await vi.waitFor(() => expect((server as any).sockets.size).toBe(0));
      for (const request of (server as any).activeRequests) {
        expect(request.controller.signal.aborted).toBe(true);
      }
      expect((server as any).activeRequests.size).toBe(16);
    } finally {
      socket.destroy();
      pending.resolve(new Api.User({ id: 7n as any, firstName: 'Fixture' }));
      await vi.waitFor(() => expect((server as any).activeRequests.size).toBe(0));
    }
  });

  it('does not release session ownership after shared-client destruction fails', async () => {
    const originalAcquire = SessionStore.prototype.acquireLock;
    let releaseLease!: () => Promise<void>;
    const acquire = vi.spyOn(SessionStore.prototype, 'acquireLock').mockImplementation(async function (profile) {
      releaseLease = await originalAcquire.call(this, profile);
      return releaseLease;
    });
    await start();
    acquire.mockRestore();
    mocks.destroy.mockRejectedValueOnce(new Error('Synthetic teardown failure'));
    skipStop = true;
    try {
      await expect(server.stop()).rejects.toThrow('Synthetic teardown failure');
      await expect(new SessionStore(dir).acquireLock('fixture')).rejects.toMatchObject({ code: 'ELOCKED' });
    } finally {
      // The client is a fake; explicitly dispose the intentionally retained lease.
      await releaseLease();
    }
  });

  it.each([0, -1, 0.5, 120001, '30', null])('rejects invalid execute timeout %j before SDK work', async (timeoutMs) => {
    await start();
    await expect(client().call('execute', { argv: ['chat', 'resolve', 'alice'], timeoutMs })).rejects.toMatchObject({ data: { tgCode: 'INVALID_INPUT' } });
    expect(mocks.entity).not.toHaveBeenCalled();
  });
});
