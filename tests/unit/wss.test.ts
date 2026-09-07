import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramClient, sessions } from 'telegram';
import { PromisedWebSockets } from 'telegram/extensions/PromisedWebSockets.js';
import { Logger } from 'telegram/extensions/Logger.js';
import { DiagnosticWSS, WssSocket, wssHost } from '../../src/lib/wss.js';
import { connectionOptions } from '../../src/lib/connection-options.js';
import { resolveTransport } from '../../src/lib/transport.js';
import { createClientForAuth } from '../../src/lib/client.js';

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

const params = (dcId = 4) => ({
  ip: '149.154.167.91', port: 80, dcId, loggers: new Logger('none'),
  socket: PromisedWebSockets, testServers: false,
});

describe('WSS routing', () => {
  it.each(['pluto', 'venus', 'aurora', 'vesta', 'flora'])('maps the %s data center independently of the saved address', name => {
    const dcId = ['pluto', 'venus', 'aurora', 'vesta', 'flora'].indexOf(name) + 1;
    const connection = new DiagnosticWSS(params(dcId));
    expect(connection._ip).toBe(`${name}.web.telegram.org`);
    expect(connection._port).toBe(443);
    expect(connection.toString()).toBe(`${name}.web.telegram.org:443/WSS`);
  });

  it.each([0, -1, 6, 2.5, NaN, 203])('rejects unsupported DC %s before connecting', dcId => {
    expect(() => wssHost(dcId)).toThrow('does not support');
  });

  it('uses TLS, the binary WebSocket protocol and obfuscated framing', async () => {
    const connect = vi.spyOn(PromisedWebSockets.prototype, 'connect').mockResolvedValue(undefined);
    const write = vi.spyOn(PromisedWebSockets.prototype, 'write').mockImplementation(() => {});
    const connection = new DiagnosticWSS(params());
    await connection._connect();
    expect(connect).toHaveBeenCalledWith(443, 'vesta.web.telegram.org', false);
    expect(connection.socket.getWebSocketLink(connection._ip, connection._port, false))
      .toBe('wss://vesta.web.telegram.org:443/apiws');
    expect(write.mock.calls[0][0]).toHaveLength(64);
  });

  it('closes the socket on a failed upgrade and logs no error payload', async () => {
    vi.spyOn(PromisedWebSockets.prototype, 'connect').mockRejectedValue(new Error('private payload'));
    const close = vi.spyOn(PromisedWebSockets.prototype, 'close').mockResolvedValue();
    const options = params();
    const log = vi.spyOn(options.loggers, 'error');
    await expect(new DiagnosticWSS(options)._connect()).rejects.toThrow('private payload');
    expect(close).toHaveBeenCalled();
    expect(log).toHaveBeenCalledWith('Transport connect failed: UNKNOWN_ERROR');
  });

  it('does not rewrite the address or key in an existing session', async () => {
    const session = new sessions.StringSession('');
    session.setDC(2, '149.154.167.51', 80);
    const client = new TelegramClient(session, 1, 'synthetic', { ...connectionOptions('wss'), baseLogger: new Logger('none') });
    try {
      const connection = new (client as any)._connection({ ...params(session.dcId), ip: session.serverAddress });
      expect(connection._ip).toBe('venus.web.telegram.org');
      expect(session.serverAddress).toBe('149.154.167.51');
      expect(session.dcId).toBe(2);
    } finally { await client.destroy(); }
  });

  it('routes a real SDK DC migration through WSS and clears the old DC key', async () => {
    const client = await createClientForAuth(1, 'synthetic', 'wss');
    const clearKey = vi.fn();
    (client as any)._sender = { authKey: { setKey: clearKey } };
    vi.spyOn(client, 'invoke').mockResolvedValue({ dcOptions: [{ id: 2, ipAddress: '149.154.167.51' }] } as any);
    vi.spyOn(client as any, '_disconnect').mockResolvedValue(undefined);
    vi.spyOn(client, 'connect').mockImplementation(async () => {
      const connection = new (client as any)._connection({ ...params(client.session.dcId), ip: client.session.serverAddress });
      expect(connection._ip).toBe('venus.web.telegram.org');
      expect(client.useWSS).toBe(true);
      return true;
    });
    try {
      await client._switchDC(2);
      expect(client.session.dcId).toBe(2);
      expect(clearKey).toHaveBeenCalledWith(undefined);
      expect(client.connect).toHaveBeenCalledOnce();
    } finally { (client as any)._sender = undefined; await client.destroy(); }
  });
});

describe('WSS lifetime', () => {
  it('bounds an upgrade that never completes', async () => {
    vi.useFakeTimers();
    vi.spyOn(PromisedWebSockets.prototype, 'connect').mockReturnValue(new Promise(() => {}));
    const close = vi.spyOn(PromisedWebSockets.prototype, 'close').mockResolvedValue();
    const socket = new WssSocket();
    const rejected = expect(socket.connect(443, 'vesta.web.telegram.org')).rejects.toThrow('TIMEOUT');
    await vi.advanceTimersByTimeAsync(10_000);
    await rejected;
    expect(close).toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([0, 5])('cancels an upgrade before readiness after %s microtasks', async ticks => {
    vi.spyOn(PromisedWebSockets.prototype, 'connect').mockReturnValue(new Promise(() => {}));
    vi.spyOn(PromisedWebSockets.prototype, 'close').mockResolvedValue();
    const connection = new DiagnosticWSS(params());
    const rejected = expect(connection._connect()).rejects.toThrow('WebSocket was closed');
    for (let i = 0; i < ticks; i++) await Promise.resolve();
    await connection.disconnect();
    await rejected;
    expect(connection.isConnected()).toBe(false);
  });

  it('isolates late SDK events from a previous socket after reconnecting', async () => {
    const instances: PromisedWebSockets[] = [];
    vi.spyOn(PromisedWebSockets.prototype, 'connect').mockImplementation(async function () {
      instances.push(this);
      (this as any).closed = false;
    });
    vi.spyOn(PromisedWebSockets.prototype, 'close').mockImplementation(async function () {
      (this as any).closed = true;
    });
    vi.spyOn(PromisedWebSockets.prototype, 'read').mockImplementation(async function () {
      if ((this as any).closed) throw new Error('WebSocket was closed');
      return Buffer.from('new connection');
    });
    const socket = new WssSocket();
    await socket.connect(443, 'vesta.web.telegram.org');
    await socket.connect(443, 'vesta.web.telegram.org');
    expect(instances[0]).not.toBe(instances[1]);
    await instances[0].close();
    await expect(socket.read(14)).resolves.toEqual(Buffer.from('new connection'));
    await socket.close();
  });
});

describe('transport selection', () => {
  it('uses CLI, then the selected profile, then TCP', () => {
    const config = { get: vi.fn(key => key === 'profiles.work.transport' ? 'wss' : undefined) } as any;
    expect(resolveTransport(config, 'work')).toBe('wss');
    expect(resolveTransport(config, 'work', 'tcp')).toBe('tcp');
    expect(resolveTransport(config, 'default')).toBe('tcp');
  });

  it('rejects malformed config values without echoing them', () => {
    expect(() => resolveTransport({ get: () => 'private-config-value' } as any, 'work'))
      .toThrow('Transport must be tcp or wss');
    expect(() => connectionOptions('https' as any)).toThrow('Transport must be tcp or wss');
  });
});
