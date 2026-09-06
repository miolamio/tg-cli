import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Api, type TelegramClient } from 'telegram';
import bigInt from 'big-integer';
import type { Command } from 'commander';
import { runWithDaemonContext, type DaemonExecutionContext } from '../../src/lib/daemon/execution-context.js';

const forbidden = vi.hoisted(() => ({
  config: vi.fn(() => { throw new Error('Unexpected config access'); }),
  credentials: vi.fn(() => { throw new Error('Unexpected credential access'); }),
  session: vi.fn(() => { throw new Error('Unexpected session access'); }),
  client: vi.fn(() => { throw new Error('Unexpected client creation'); }),
}));
vi.mock('../../src/lib/config.js', () => ({ createConfig: forbidden.config, getCredentialsOrThrow: forbidden.credentials }));
vi.mock('../../src/lib/session-store.js', () => ({ SessionStore: forbidden.session }));
vi.mock('../../src/lib/client.js', () => ({ withClient: forbidden.client }));
vi.mock('../../src/lib/peer.js', () => ({
  resolveEntity: vi.fn(async () => ({ id: bigInt(42), className: 'User' })),
  assertForum: vi.fn(async () => {}),
}));

import { messageSendAction } from '../../src/commands/message/send.js';
import { messageEditAction } from '../../src/commands/message/edit.js';
import { mediaSendAction } from '../../src/commands/media/send.js';
import { mediaDownloadAction } from '../../src/commands/media/download.js';

function command(args: string[] = [], extra: Record<string, unknown> = {}): Command {
  return {
    args,
    optsWithGlobals: () => ({ profile: 'default', quiet: false, verbose: true, json: true, human: false, ...extra }),
  } as unknown as Command;
}

function message(id = 42, text = 'result'): Api.Message {
  return new Api.Message({ id, peerId: new Api.PeerUser({ userId: bigInt(42) }), date: 1700000000, message: text });
}

function mediaMessage(id = 42): Api.Message {
  const msg = message(id);
  msg.media = new Api.MessageMediaDocument({
    document: new Api.Document({
      id: bigInt(123), accessHash: bigInt(456), fileReference: Buffer.alloc(0),
      date: 1700000000, mimeType: 'text/plain', size: bigInt(7), dcId: 2,
      attributes: [new Api.DocumentAttributeFilename({ fileName: 'payload.txt' })],
    }),
  });
  return msg;
}

function context(extra: Partial<DaemonExecutionContext> = {}): DaemonExecutionContext {
  return {
    profile: 'default', signal: new AbortController().signal, exitCode: 0,
    client: {
      connect: vi.fn(), destroy: vi.fn(),
      sendMessage: vi.fn(async (_entity, opts) => message(42, opts.message)),
      editMessage: vi.fn(async (_entity, opts) => message(opts.message, opts.text)),
      sendFile: vi.fn(async () => message()),
      getMessages: vi.fn(async (_entity, opts) => [mediaMessage(opts.ids[0])]),
      downloadMedia: vi.fn(async () => Buffer.from('payload')),
    } as unknown as TelegramClient,
    ...extra,
  };
}

let directory: string;
let originalExitCode: typeof process.exitCode;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'tg-daemon-command-io-'));
  originalExitCode = process.exitCode;
  process.exitCode = 0;
  vi.clearAllMocks();
});
afterEach(async () => {
  process.exitCode = originalExitCode;
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
  for (const fn of Object.values(forbidden)) expect(fn).not.toHaveBeenCalled();
});

const textActions = [
  { name: 'send', action: () => messageSendAction.call(command(), '@user', '-') },
  { name: 'edit', action: () => messageEditAction.call(command(), '@user', '42', '-') },
];

describe('daemon message stdin', () => {
  it.each(textActions)('$name uses only request stdin and preserves the local trimEnd behavior', async ({ name, action }) => {
    const stdin = vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() => { throw new Error('Daemon stdin must never be read'); });
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const current = context({ stdin: '  request message\n\n' });
    await runWithDaemonContext(current, action);
    const method = name === 'send' ? current.client.sendMessage : current.client.editMessage;
    expect(method).toHaveBeenCalledWith(expect.anything(), expect.objectContaining(name === 'send'
      ? { message: '  request message' } : { text: '  request message', message: 42 }));
    expect(current.output).toMatchObject({ ok: true, data: { id: 42, text: '  request message' } });
    expect(stdin).not.toHaveBeenCalled();
    expect(stdout).not.toHaveBeenCalled();
  });

  it.each(textActions)('$name reports missing request stdin without reading daemon stdin or making RPCs', async ({ action }) => {
    const stdin = vi.spyOn(process.stdin, Symbol.asyncIterator).mockImplementation(() => { throw new Error('Daemon stdin must never be read'); });
    const current = context();
    await runWithDaemonContext(current, action);
    expect(current.output).toMatchObject({ ok: false, code: 'STDIN_REQUIRED' });
    expect(current.exitCode).toBe(1);
    expect(process.exitCode).toBe(0);
    expect(current.client.sendMessage).not.toHaveBeenCalled();
    expect(current.client.editMessage).not.toHaveBeenCalled();
    expect(stdin).not.toHaveBeenCalled();
  });

  it.each(textActions)('$name distinguishes provided empty stdin from missing stdin', async ({ action }) => {
    const current = context({ stdin: '' });
    await runWithDaemonContext(current, action);
    expect(current.output).toMatchObject({ ok: false, code: 'EMPTY_MESSAGE' });
  });

  it('keeps simultaneous stdin values and outputs isolated', async () => {
    const first = context({ stdin: 'first\n' });
    const second = context({ stdin: 'second\n' });
    await Promise.all([
      runWithDaemonContext(first, () => messageSendAction.call(command(), '@first', '-')),
      runWithDaemonContext(second, () => messageEditAction.call(command(), '@second', '43', '-')),
    ]);
    expect(first.output).toMatchObject({ ok: true, data: { id: 42, text: 'first' } });
    expect(second.output).toMatchObject({ ok: true, data: { id: 43, text: 'second' } });
  });
});

describe('daemon media paths', () => {
  it('checks and uploads files relative to the calling client cwd, including albums and absolute paths', async () => {
    const cwd = join(directory, 'caller');
    await mkdir(cwd);
    await writeFile(join(cwd, 'one.jpg'), 'synthetic image');
    const absolute = join(directory, 'two.jpg');
    await writeFile(absolute, 'synthetic image');
    const current = context({ cwd });
    vi.mocked(current.client.sendFile).mockResolvedValue([message(1), message(2)] as any);
    const processCwd = process.cwd();
    const chdir = vi.spyOn(process, 'chdir');
    await runWithDaemonContext(current, () => mediaSendAction.call(command(['@user', 'one.jpg', absolute])));
    expect(current.client.sendFile).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ file: [join(cwd, 'one.jpg'), absolute] }));
    expect(current.output).toMatchObject({ ok: true, data: { sent: 2, partial: false, errors: [] } });
    expect(chdir).not.toHaveBeenCalled();
    expect(process.cwd()).toBe(processCwd);
  });

  it('reports unavailable files from the request cwd before upload', async () => {
    const current = context({ cwd: directory });
    await runWithDaemonContext(current, () => mediaSendAction.call(command(['@user', 'absent.jpg'])));
    expect(current.output).toMatchObject({ ok: false, code: 'FILE_NOT_FOUND' });
    expect(current.client.sendFile).not.toHaveBeenCalled();
  });

  it.each([
    { output: undefined, ids: '42', expected: 'payload.txt' },
    { output: 'renamed.txt', ids: '42', expected: 'renamed.txt' },
    { output: 'batch', ids: '42,43', expected: 'batch/payload.txt' },
  ])('resolves download paths from request cwd: $output / $ids', async ({ output, ids, expected }) => {
    const current = context({ cwd: directory });
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const chdir = vi.spyOn(process, 'chdir');
    vi.mocked(current.client.downloadMedia).mockImplementation(async (_msg, opts) => {
      opts!.progressCallback?.(bigInt(7), bigInt(7));
      return Buffer.from('payload');
    });
    await runWithDaemonContext(current, () => mediaDownloadAction.call(command(['@user', ids], { output })));
    expect(current.client.downloadMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outputFile: resolve(directory, expected) }));
    expect(current.output).toMatchObject({ ok: true });
    expect(current.exitCode).toBe(0);
    expect(stderr).not.toHaveBeenCalled();
    expect(chdir).not.toHaveBeenCalled();
  });

  it('preserves absolute download targets', async () => {
    const target = join(directory, 'absolute.txt');
    const current = context({ cwd: join(directory, 'other') });
    await runWithDaemonContext(current, () => mediaDownloadAction.call(command(['@user', '42'], { output: target })));
    expect(current.client.downloadMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outputFile: target }));
  });

  it.each([undefined, 'relative'])('rejects absent or relative API cwd=%j before file access or RPC', async cwd => {
    for (const action of [mediaSendAction, mediaDownloadAction]) {
      const current = context({ cwd });
      await runWithDaemonContext(current, () => action.call(command(['@user', action === mediaSendAction ? 'a.jpg' : '42'])));
      expect(current.output).toMatchObject({ ok: false, code: 'INVALID_OPTIONS' });
      expect(current.client.sendFile).not.toHaveBeenCalled();
      expect(current.client.getMessages).not.toHaveBeenCalled();
    }
  });

  it('uses independent directories for concurrent downloads', async () => {
    const first = context({ cwd: join(directory, 'first') });
    const second = context({ cwd: join(directory, 'second') });
    await Promise.all([first, second].map(current => runWithDaemonContext(current, () => mediaDownloadAction.call(command(['@user', '42'])))));
    expect(first.client.downloadMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outputFile: join(directory, 'first/payload.txt') }));
    expect(second.client.downloadMedia).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ outputFile: join(directory, 'second/payload.txt') }));
  });
});
