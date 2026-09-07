import 'telegram';
import { createServer, type Socket } from 'node:net';
import { once } from 'node:events';
import { inspect } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PromisedNetSockets } from 'telegram/extensions/PromisedNetSockets.js';
import { FullPacketCodec } from 'telegram/network/connection/TCPFull.js';
import { InvalidBufferError, InvalidChecksumError, TypeNotFoundError, SecurityError } from 'telegram/errors/Common.js';
import { describeTransportError, DiagnosticTCPFull } from '../../src/lib/transport-diagnostics.js';
import { createGramjsLogger } from '../../src/lib/gramjs-logger.js';
import { createClientForAuth } from '../../src/lib/client.js';
import { connectOrThrow } from '../../src/lib/connect.js';
import { setQuietMode, setVerboseMode } from '../../src/lib/cli-mode.js';
import { MTProtoSender } from 'telegram/network/MTProtoSender.js';

afterEach(() => {
  setQuietMode(false);
  setVerboseMode(false);
  vi.restoreAllMocks();
});

describe('safe transport diagnostics', () => {
  it.each(['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'EPIPE', 'ENETUNREACH'])('retains %s without error contents', code => {
    const error = Object.assign(new Error('synthetic-secret'), { code, payload: 'synthetic-session' });
    expect(describeTransportError(error)).toBe(code);
  });

  it('classifies SDK errors without exposing their payloads or messages', () => {
    const rateLimit = Buffer.alloc(4);
    rateLimit.writeInt32LE(-429);
    expect(describeTransportError(new InvalidBufferError(rateLimit))).toBe('INVALID_BUFFER (code=429)');
    expect(describeTransportError(new InvalidBufferError(Buffer.from('synthetic-secret')))).toBe('INVALID_BUFFER');
    expect(describeTransportError(new InvalidChecksumError(1, 2))).toBe('INVALID_CHECKSUM');
    expect(describeTransportError(new TypeNotFoundError(123, Buffer.from('synthetic-secret')))).toBe('UNKNOWN_CONSTRUCTOR');
    expect(describeTransportError(new SecurityError('synthetic-secret'))).toBe('SECURITY_CHECK_FAILED');
    expect(describeTransportError(new Error('NetSocket was closed'))).toBe('CONNECTION_CLOSED');
    expect(describeTransportError(new Error('TIMEOUT'))).toBe('TIMEOUT');
  });

  it('does not evaluate getters, custom inspection or arbitrary strings', () => {
    const getter = vi.fn(() => { throw new Error('synthetic-secret'); });
    const error = Object.defineProperties({}, {
      code: { get: getter }, message: { get: getter }, [inspect.custom]: { value: getter },
    });
    expect(describeTransportError(error)).toBe('UNKNOWN_ERROR');
    expect(describeTransportError('synthetic-secret')).toBe('UNKNOWN_ERROR');
    expect(describeTransportError(new Error('synthetic-secret'))).toBe('UNKNOWN_ERROR');
    expect(getter).not.toHaveBeenCalled();
  });

  it('handles hostile proxies without interrupting cleanup', () => {
    const error = new Proxy({}, { getPrototypeOf() { throw new Error('synthetic-secret'); } });
    expect(describeTransportError(error)).toBe('UNKNOWN_ERROR');
  });

  it.each([false, true])('preserves real SDK top-level diagnostics (quiet=%s)', async quiet => {
    setQuietMode(quiet);
    setVerboseMode(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const client = await createClientForAuth(1, 'synthetic-secret');
    try {
      await client._errorHandler!(Object.assign(new Error('synthetic-secret'), { code: 'ECONNRESET' }));
    } finally { await client.destroy(); }
    const logged = stderr.mock.calls.flat().join('');
    expect(stdout).not.toHaveBeenCalled();
    expect(logged).not.toContain('synthetic-');
    if (quiet) expect(logged).toBe('');
    else expect(logged).toContain('Telegram client failed: ECONNRESET');
  });
});

describe('real TCPFull receive loop against a local server', () => {
  it.each([
    { failure: 'rate-limit', expected: 'INVALID_BUFFER (code=429)', quiet: false },
    { failure: 'checksum', expected: 'INVALID_CHECKSUM', quiet: false },
    { failure: 'eof', expected: 'CONNECTION_CLOSED', quiet: false },
    { failure: 'reset', expected: 'ECONNRESET', quiet: false },
    { failure: 'rate-limit', expected: '', quiet: true },
  ])('keeps the cause before gramjs discards it: $failure, quiet=$quiet', async ({ failure, expected, quiet }) => {
    setQuietMode(quiet);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const sockets = new Set<Socket>();
    const server = createServer(socket => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('data', () => {
        if (failure === 'reset') { socket.resetAndDestroy(); return; }
        if (failure === 'eof') { socket.end(); return; }
        if (failure === 'rate-limit') {
          const frame = Buffer.alloc(12);
          for (const offset of [0, 4, 8]) frame.writeInt32LE(-429, offset);
          socket.end(frame);
        } else {
          const frame = new FullPacketCodec(undefined as any).encodePacket(Buffer.from('synthetic-secret'));
          frame[frame.length - 1] ^= 0xff;
          socket.end(frame);
        }
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const port = (server.address() as { port: number }).port;
    const connection = new DiagnosticTCPFull({
      ip: '127.0.0.1', port, dcId: 4, loggers: createGramjsLogger(),
      socket: PromisedNetSockets, testServers: false,
    });
    try {
      await connection.connect();
      await connection.send(Buffer.alloc(20));
      await expect(connection.recv()).rejects.toThrow('Not connected');
      const logged = stderr.mock.calls.flat().join('');
      expect(stdout).not.toHaveBeenCalled();
      expect(logged).not.toContain('synthetic-');
      if (quiet) expect(logged).toBe('');
      else expect(logged).toContain(`Transport receive failed: ${expected}`);
    } finally {
      await connection.disconnect();
      for (const socket of sockets) socket.destroy();
      await new Promise<void>(resolve => server.close(() => resolve()));
    }
  });
});

describe('failed connection retries', () => {
  it('detects the real SDK false return and allows destroy to clean up its loop', async () => {
    vi.spyOn(MTProtoSender.prototype, 'connect').mockResolvedValue(false);
    const client = await createClientForAuth(1, 'synthetic-secret');
    try {
      await expect(connectOrThrow(client)).rejects.toMatchObject({ code: 'CONNECTION_FAILED' });
    } finally { await client.destroy(); }
  });

  it('accepts false for a client that is already connected', async () => {
    await expect(connectOrThrow({ connect: async () => false, connected: true } as any)).resolves.toBeUndefined();
  });
});
