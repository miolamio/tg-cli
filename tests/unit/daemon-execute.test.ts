import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from 'telegram';
import bigInt from 'big-integer';
import { executeDaemonCommand } from '../../src/lib/daemon/execute.js';
import { validateDaemonCommand } from '../../src/lib/daemon/command-protocol.js';
import { TgError } from '../../src/lib/errors.js';
import { ErrorCode } from '../../src/lib/error-codes.js';

describe('daemon execute request boundary', () => {
  let client: any;
  let controller: AbortController;
  let previousExitCode: typeof process.exitCode;
  beforeEach(() => {
    previousExitCode = process.exitCode;
    controller = new AbortController();
    client = {
      getEntity: vi.fn().mockResolvedValue(new Api.User({ id: bigInt(7), accessHash: bigInt(11), firstName: 'Synthetic' })),
      sendMessage: vi.fn().mockResolvedValue(new Api.Message({
        id: 31, peerId: new Api.PeerUser({ userId: bigInt(7) }), date: 1700000000, message: 'Synthetic reply',
      })),
      connect: vi.fn(), destroy: vi.fn(),
    };
  });
  afterEach(() => { expect(process.exitCode).toBe(previousExitCode); process.exitCode = previousExitCode; });
  const invoke = (argv: string[], extras = {}) => executeDaemonCommand(client, 'default', { argv, ...extras }, controller.signal);

  it('retains a literal option-looking message and request stdin as data', async () => {
    const literal = await invoke(['message', 'send', '--', 'me', '--profile=another']);
    expect(literal.exitCode).toBe(0);
    expect(client.sendMessage.mock.calls[0][1].message).toBe('--profile=another');
    const piped = await invoke(['message', 'send', 'me', '-'], { stdin: 'piped\ntext\n' });
    expect(piped.output.ok).toBe(true);
    expect(client.sendMessage.mock.calls[1][1].message).toBe('piped\ntext');
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it.each([
    ['message', 'send', '--profile=another', 'me', 'text'],
    ['message', 'send', '--config=/tmp/unrelated', 'me', 'text'],
    ['message', 'send', '--daemon', 'me', 'text'],
    ['message', 'send', '--fields=id', 'me', 'text'],
    ['message', 'send', '--help'],
    ['message', 'send', 'me', 'text', 'extra'],
  ])('rejects global flags/help/excess arguments before a Telegram call: %j', async (...argv) => {
    const result = await invoke(argv);
    expect(result).toMatchObject({ output: { ok: false, code: ErrorCode.INVALID_OPTIONS }, exitCode: 1 });
    expect(client.getEntity).not.toHaveBeenCalled();
    expect(client.sendMessage).not.toHaveBeenCalled();
  });

  it.each([['auth', 'logout'], ['session', 'export'], ['daemon', 'stop'], ['completion', 'bash'], ['message', 'watch', 'me']])(
    'refuses lifecycle/streaming paths: %j', async (...argv) => {
      const result = await invoke(argv);
      expect(result).toMatchObject({ output: { ok: false, code: ErrorCode.DAEMON_PROXY_UNAVAILABLE }, exitCode: 1 });
      expect(client.getEntity).not.toHaveBeenCalled();
    },
  );

  it('validates required and repeated options through Commander before RPC', async () => {
    const result = await invoke(['message', 'poll', '--option=First', '--option=Second', 'me']);
    expect(result).toMatchObject({ output: { ok: false, code: ErrorCode.INVALID_OPTIONS }, exitCode: 1 });
    expect(client.getEntity).not.toHaveBeenCalled();
  });

  it('returns cancellation even if an operation has a late successful result', async () => {
    client.sendMessage.mockImplementation(async () => {
      controller.abort(new TgError('Outcome may be unknown', ErrorCode.TIMEOUT));
      return new Api.Message({ id: 31, peerId: new Api.PeerUser({ userId: bigInt(7) }), date: 1700000000, message: 'late' });
    });
    const result = await invoke(['message', 'send', 'me', 'text']);
    expect(result).toMatchObject({ output: { ok: false, code: ErrorCode.TIMEOUT }, exitCode: 1 });
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(client.destroy).not.toHaveBeenCalled();
  });

  it.each([
    null, [], { argv: 'message history me' }, { argv: ['message', 'send', 'me', '\0'] },
    { argv: ['chat', 'list'], config: '/tmp/other' },
    { argv: ['chat', 'list'], timeoutMs: 0 }, { argv: ['chat', 'list'], timeoutMs: 120001 },
    { argv: ['chat', 'list'], stdin: 123 }, { argv: ['media', 'send', 'me', 'file'], cwd: 'relative' },
    { argv: ['media', 'download', 'me', '1'] },
  ])('rejects malformed request shapes: %j', params => {
    expect(() => validateDaemonCommand(params as any)).toThrow(TgError);
  });

  it('counts UTF-8 bytes rather than characters for request frame limits', () => {
    expect(() => validateDaemonCommand({ argv: ['message', 'send', 'me', '-'], stdin: '😀'.repeat(270000) })).toThrow(/frame limit/);
  });
});
