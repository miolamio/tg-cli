import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer, type Server, type Socket } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DaemonClient, DaemonRpcError } from '../../src/lib/daemon/client.js';
import { encodeError, encodeNotification, encodeResponse } from '../../src/lib/daemon/protocol.js';

/** Real local sockets; the daemon transport is the only substituted boundary. */
describe('DaemonClient transport failures', () => {
  let dir: string;
  let path: string;
  let server: Server;
  let client: DaemonClient;
  const sockets = new Set<Socket>();

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tg-rpc-'));
    path = join(dir, 'rpc.sock');
    client = new DaemonClient(path);
  });

  afterEach(async () => {
    client.close();
    for (const socket of sockets) socket.destroy();
    sockets.clear();
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    rmSync(dir, { recursive: true, force: true });
  });

  async function listen(onConnection: (socket: Socket) => void) {
    server = createServer((socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.on('close', () => sockets.delete(socket));
      onConnection(socket);
      socket.resume();
    });
    await new Promise<void>((resolve) => server.listen(path, resolve));
  }

  it('rejects immediate EOF without waiting for its request deadline', async () => {
    await listen((socket) => socket.end());
    const start = Date.now();
    await expect(client.call('ping', {}, { timeoutMs: 3000 })).rejects.toThrow('closed before response');
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('accepts a final complete response before EOF', async () => {
    await listen((socket) => socket.on('data', () => socket.end(encodeResponse('pong', 1) + '\n')));
    await expect(client.call('ping', {})).resolves.toBe('pong');
  });

  it('ignores mismatched response and error IDs, then accepts the matching result', async () => {
    await listen((socket) => socket.on('data', () => socket.write([
      encodeResponse('wrong', 999), encodeError(-32000, 'unrelated', null, 998), encodeResponse('pong', 1), '',
    ].join('\n'))));
    await expect(client.call('ping', {})).resolves.toBe('pong');
  });

  it('does not treat an unmatched ID as success on EOF', async () => {
    await listen((socket) => socket.on('data', () => socket.end(encodeResponse('wrong', 999) + '\n')));
    await expect(client.call('ping', {})).rejects.toThrow('closed before response');
  });

  it('preserves matching RPC error codes and structured details', async () => {
    const data = { tgCode: 'FLOOD_WAIT', seconds: 42 };
    await listen((socket) => socket.on('data', () => socket.write(encodeError(-32001, 'Try later', data, 1) + '\n')));
    const error = await client.call('ping', {}).catch((err: unknown) => err);
    expect(error).toBeInstanceOf(DaemonRpcError);
    expect(error).toMatchObject({ code: -32001, message: 'Try later', data });
  });

  it('rejects malformed and unterminated responses', async () => {
    await listen((socket) => socket.on('data', () => socket.end('not json\n')));
    await expect(client.call('ping', {})).rejects.toThrow('Invalid JSON');
  });

  it('times out a connected request that gets only unrelated responses', async () => {
    await listen((socket) => socket.on('data', () => socket.write(encodeResponse('wrong', 999) + '\n')));
    await expect(client.call('ping', {}, { timeoutMs: 30 })).rejects.toThrow('timed out');
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  });

  it('times out a missing subscribe ack and releases the connection', async () => {
    await listen(() => {});
    await expect(client.watch({}, () => {}, { timeoutMs: 30 })).rejects.toThrow('subscribe timed out');
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  });

  it('rejects unexpected disconnection after subscribe ack', async () => {
    await listen((socket) => socket.on('data', () => socket.end(encodeResponse({ subscribed: true }, 1) + '\n')));
    await expect(client.watch({}, () => {})).rejects.toThrow('disconnected while watching');
  });

  it('delivers only notifications after matching ack and resolves intentional cancellation', async () => {
    const seen: unknown[] = [];
    await listen((socket) => socket.on('data', () => socket.write([
      encodeNotification('message', { before: true }),
      encodeResponse({ subscribed: true }, 999),
      encodeNotification('message', { stillBefore: true }),
      encodeResponse({ subscribed: true }, 1),
      encodeNotification('message', { after: true }), '',
    ].join('\n'))));
    await client.watch({}, (message) => { seen.push(message); client.close(); });
    expect(seen).toEqual([{ after: true }]);
  });

  it('keeps watching past the ack deadline and closes cleanly on demand', async () => {
    let peer: Socket | undefined;
    await listen((socket) => {
      peer = socket;
      socket.on('data', () => socket.write(encodeResponse({ subscribed: true }, 1) + '\n'));
    });
    const seen = vi.fn();
    const watching = client.watch({}, seen, { timeoutMs: 40 });
    await new Promise((resolve) => setTimeout(resolve, 80));
    peer!.write(encodeNotification('message', { id: 1 }) + '\n');
    await vi.waitFor(() => expect(seen).toHaveBeenCalledWith({ id: 1 }));
    client.close();
    await expect(watching).resolves.toBeUndefined();
  });

  it('cancels concurrent calls and watches, including before connection', async () => {
    await listen(() => {});
    const calls = [client.call('ping', {}), client.call('status', {})];
    const assertions = calls.map((call) => expect(call).rejects.toThrow('cancelled'));
    const watch = client.watch({}, () => {});
    client.close();
    await Promise.all([...assertions, expect(watch).resolves.toBeUndefined()]);
    await vi.waitFor(() => expect(sockets.size).toBe(0));
  });

  it('contains callback exceptions and closes the failed watcher', async () => {
    await listen((socket) => socket.on('data', () => socket.write([
      encodeResponse({}, 1), encodeNotification('message', { id: 1 }), '',
    ].join('\n'))));
    await expect(client.watch({}, () => { throw new Error('Consumer failed'); })).rejects.toThrow('Consumer failed');
  });
});
