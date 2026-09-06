// tests/unit/daemon-server.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConnection } from 'node:net';
import { once } from 'node:events';

// Mock telegram
const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockDestroy = vi.fn().mockResolvedValue(undefined);
const mockGetEntity = vi.fn().mockResolvedValue({ id: 42, className: 'User' });
const updateHandlers: Array<(event: any) => void> = [];
const mockAddEventHandler = vi.fn((handler: (event: any) => void) => {
  updateHandlers.push(handler);
});
const mockClientInstance = {
  connect: mockConnect,
  destroy: mockDestroy,
  getEntity: mockGetEntity,
  addEventHandler: mockAddEventHandler,
  removeEventHandler: vi.fn(),
};

vi.mock('telegram', () => ({
  TelegramClient: vi.fn().mockImplementation(() => mockClientInstance),
  sessions: { StringSession: vi.fn().mockImplementation((s: string) => ({ _session: s })) },
}));

vi.mock('telegram/events/NewMessage.js', () => ({
  NewMessage: class NewMessage {
    constructor(_opts: any = {}) {}
  },
}));

import { NewMessage } from 'telegram/events/NewMessage.js';
import { DaemonServer } from '../../src/lib/daemon/server.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { encodeRequest, parseMessage } from '../../src/lib/daemon/protocol.js';

describe('DaemonServer', () => {
  let tempDir: string;
  let paths: DaemonPaths;
  let server: DaemonServer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetEntity.mockImplementation(async () => ({ id: 42, className: 'User' }));
    mockAddEventHandler.mockImplementation((handler: (event: any) => void) => {
      updateHandlers.push(handler);
    });
    updateHandlers.length = 0;
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

  it.each([-1, 0.5, NaN, Infinity, 2_147_483_648])('rejects unsafe idle timeout %s before connecting', (idleTimeout) => {
    expect(() => new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' }, { idleTimeout }))
      .toThrow('Daemon idle timeout');
    expect(mockConnect).not.toHaveBeenCalled();
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

  it('subscribe acks then pushes message notifications on the same socket', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();

    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');

    const lines: string[] = [];
    sock.on('data', (buf) => {
      for (const line of buf.toString().split('\n').filter(Boolean)) lines.push(line);
    });

    sock.write(encodeRequest('subscribe', { chat: 'alice' }, 3) + '\n');
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(1));

    const ack = parseMessage(lines[0]);
    expect(ack.type).toBe('response');
    expect((ack as any).result).toEqual({ subscribed: true, chat: 'alice', topic: null });
    expect(updateHandlers.length).toBe(1);

    updateHandlers[0]({
      message: { id: 9, date: 1_700_000_000, message: 'hello', chatId: 42 },
    });
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(2));

    const note = parseMessage(lines[1]);
    expect(note.type).toBe('notification');
    expect((note as any).method).toBe('message');
    expect((note as any).params.id).toBe(9);
    expect((note as any).params.text).toBe('hello');
    expect(mockAddEventHandler).toHaveBeenCalledWith(expect.any(Function), expect.any(NewMessage));

    sock.destroy();
  });

  it('stops cleanly and removes socket', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    await server.stop();
    expect(paths.socketExists()).toBe(false);
  });

  it('calls onIdle after idle timeout stop', async () => {
    const onIdle = vi.fn();
    server = new DaemonServer(
      paths,
      { apiId: 1, apiHash: 'h', sessionString: 's' },
      { idleTimeout: 40, onIdle },
    );
    await server.start();
    await vi.waitFor(() => expect(onIdle).toHaveBeenCalledOnce(), { timeout: 2000 });
    expect(paths.socketExists()).toBe(false);
  });

  it('does not idle-stop while a client is connected', async () => {
    const onIdle = vi.fn();
    server = new DaemonServer(
      paths,
      { apiId: 1, apiHash: 'h', sessionString: 's' },
      { idleTimeout: 40, onIdle },
    );
    await server.start();
    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');
    await new Promise((r) => setTimeout(r, 80));
    expect(onIdle).not.toHaveBeenCalled();
    expect(paths.socketExists()).toBe(true);
    sock.destroy();
  });

  it('stop() is safe to call concurrently', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    await Promise.all([server.stop(), server.stop()]);
    expect(paths.socketExists()).toBe(false);
  });

  it('drops updates with no peer id and matches basic groups as -{id}', async () => {
    mockGetEntity.mockResolvedValueOnce({ id: 99, className: 'Chat' });
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();

    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');
    const lines: string[] = [];
    sock.on('data', (buf) => {
      for (const line of buf.toString().split('\n').filter(Boolean)) lines.push(line);
    });

    sock.write(encodeRequest('subscribe', { chat: 'groupchat' }, 4) + '\n');
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(1));

    updateHandlers[0]({ message: { id: 1, date: 1, message: 'no-peer' } });
    updateHandlers[0]({
      message: { id: 2, date: 1, message: 'group-hi', peerId: { chatId: 99 } },
    });
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(2));

    const note = parseMessage(lines[1]);
    expect(note.type).toBe('notification');
    expect((note as any).params.id).toBe(2);
    expect(lines.length).toBe(2);

    sock.destroy();
  });

  it('does not replace a live daemon socket', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    const other = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await expect(other.start()).rejects.toThrow(/already running/);
    expect(paths.socketExists()).toBe(true);
  });

  it('does not unlink a live socket when the pid file is missing', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    unlinkSync(paths.pidPath);
    const other = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await expect(other.start()).rejects.toThrow(/already running/);
    expect(paths.socketExists()).toBe(true);
  });

  it('starts when the parent already wrote this process pid', async () => {
    expect(paths.writePidExclusive(process.pid)).toBe(true);
    server = new DaemonServer(
      paths,
      { apiId: 1, apiHash: 'h', sessionString: 's' },
      { pidPreclaimed: true },
    );
    await server.start();
    expect(paths.socketExists()).toBe(true);
    expect(paths.readPid()).toBe(process.pid);
  });

  it('passes topic-root and General unthreaded messages through --topic', async () => {
    mockGetEntity.mockResolvedValue({ id: 42, className: 'User' });
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();

    const sock = createConnection(paths.socketPath);
    await once(sock, 'connect');
    const lines: string[] = [];
    sock.on('data', (buf) => {
      for (const line of buf.toString().split('\n').filter(Boolean)) lines.push(line);
    });

    sock.write(encodeRequest('subscribe', { chat: 'alice', topic: 1 }, 5) + '\n');
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(1));

    const handler = updateHandlers[updateHandlers.length - 1];
    handler({
      message: { id: 1, date: 1, message: 'root', chatId: 42 },
    });
    handler({
      message: { id: 8, date: 1, message: 'general', chatId: 42 },
    });
    handler({
      message: {
        id: 12,
        date: 1,
        message: 'general-reply',
        chatId: 42,
        replyTo: { replyToMsgId: 8 },
      },
    });
    handler({
      message: {
        id: 20,
        date: 1,
        message: 'other-topic',
        chatId: 42,
        replyTo: { forumTopic: true, replyToTopId: 9, replyToMsgId: 15 },
      },
    });
    await vi.waitFor(() => expect(lines.length).toBeGreaterThanOrEqual(4));

    const texts = lines.slice(1).map((line) => {
      const note = parseMessage(line);
      return (note as any).params.text;
    });
    expect(texts).toEqual(['root', 'general', 'general-reply']);
    expect(lines.length).toBe(4);

    sock.destroy();
  });

  it('isolates oversized fragmented frames and keeps subscribers and ping alive', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    const subscriber = createConnection(paths.socketPath);
    const seen: string[] = [];
    subscriber.on('data', (buf) => seen.push(buf.toString()));
    await once(subscriber, 'connect');
    subscriber.write(encodeRequest('subscribe', { chat: 'alice' }, 8) + '\n');
    await vi.waitFor(() => expect(updateHandlers.length).toBe(1));

    const offender = createConnection(paths.socketPath);
    offender.on('error', () => {});
    await once(offender, 'connect');
    const closed = new Promise<void>((resolve) => offender.once('close', () => resolve()));
    offender.write(Buffer.alloc(700_000, 120));
    offender.write(Buffer.alloc(400_000, 120));
    await closed;

    updateHandlers[0]({ message: { id: 13, date: 1, message: 'still alive', chatId: 42 } });
    await vi.waitFor(() => expect(seen.join('')).toContain('still alive'));
    const healthy = createConnection(paths.socketPath);
    await once(healthy, 'connect');
    const reply = once(healthy, 'data');
    healthy.write(encodeRequest('ping', {}, 9) + '\n');
    expect(parseMessage((await reply)[0].toString().trim())).toMatchObject({ type: 'response', result: 'pong', id: 9 });
    healthy.destroy();
    subscriber.destroy();
  });

  it('contains socket errors raised after connection and preserves the server', async () => {
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    const peer = createConnection(paths.socketPath);
    peer.on('error', () => {});
    await once(peer, 'connect');
    await vi.waitFor(() => expect((server as any).sockets.size).toBe(1));
    const socket = [...(server as any).sockets][0] as import('node:net').Socket;
    socket.destroy(new Error('Synthetic connection failure'));
    await new Promise<void>((resolve) => peer.once('close', () => resolve()));
    expect(paths.socketExists()).toBe(true);
  });

  it('does not attach a leaked update handler when subscriber closes during entity resolution', async () => {
    let resolveEntity!: (entity: unknown) => void;
    mockGetEntity.mockImplementationOnce(() => new Promise((resolve) => { resolveEntity = resolve; }));
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await server.start();
    const peer = createConnection(paths.socketPath);
    await once(peer, 'connect');
    peer.write(encodeRequest('subscribe', { chat: 'alice' }, 10) + '\n');
    await vi.waitFor(() => expect(mockGetEntity).toHaveBeenCalled());
    peer.destroy();
    await vi.waitFor(() => expect((server as any).sockets.size).toBe(0));
    resolveEntity({ id: 42, className: 'User' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(mockAddEventHandler).not.toHaveBeenCalled();
  });

  it('releases session ownership after a failed MTProto connection', async () => {
    mockConnect.mockRejectedValueOnce(new Error('Cannot connect'));
    server = new DaemonServer(paths, { apiId: 1, apiHash: 'h', sessionString: 's' });
    await expect(server.start()).rejects.toThrow('Cannot connect');
    const { SessionStore } = await import('../../src/lib/session-store.js');
    await expect(new SessionStore(tempDir).withLock('test', async () => 'free')).resolves.toBe('free');
    expect(mockDestroy).toHaveBeenCalledOnce();
  });

});
