import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { build, type Plugin } from 'esbuild';
import { spawn, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SessionStore } from '../../src/lib/session-store.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';

const require = createRequire(import.meta.url);
interface ProcessResult { stdout: string; stderr: string; code: number | null; signal: NodeJS.Signals | null }
interface JournalEvent { event: string; pid: number; text?: string }

/** Real CLI children, persistent daemon process and Unix sockets, with no Telegram network. */
describe('daemon command API across real processes', () => {
  let dir: string;
  let cliEntry: string;
  let config: string;
  let journalPath: string;
  let paths: DaemonPaths;
  let daemonPid: number;
  let sessionPath: string;
  const children = new Set<ChildProcess>();

  function journal(): JournalEvent[] {
    if (!existsSync(journalPath)) return [];
    return readFileSync(journalPath, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line));
  }

  function launch(args: string[], stdin = ''): { child: ChildProcess; result: Promise<ProcessResult>; stdout: () => string } {
    const child = spawn(process.execPath, [cliEntry, '--config', config, '--profile', 'p', '--quiet', ...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
      // Explicit config and synthetic credentials only. Never inherit a real account/session.
      env: { PATH: process.env.PATH, HOME: dir, TG_API_ID: '1', TG_API_HASH: 'synthetic-api-hash', TG_DAEMON_API_TEST_JOURNAL: journalPath },
    });
    children.add(child);
    let stdout = '';
    let stderr = '';
    child.stdout!.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr!.on('data', (chunk) => { stderr += chunk.toString(); });
    const result = new Promise<ProcessResult>((resolveResult, reject) => {
      const timeout = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`Offline CLI did not exit: ${JSON.stringify(args)}; stdout=${stdout}; stderr=${stderr}`));
      }, 10_000);
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
      child.once('close', (code, signal) => {
        clearTimeout(timeout);
        children.delete(child);
        resolveResult({ stdout, stderr, code, signal });
      });
    });
    child.stdin!.end(stdin);
    return { child, result, stdout: () => stdout };
  }

  async function cli(args: string[], stdin?: string): Promise<ProcessResult> {
    return launch(args, stdin).result;
  }

  function envelope(result: ProcessResult, code = 0): any {
    expect(result.signal).toBeNull();
    expect(result.code).toBe(code);
    expect(result.stderr).toBe('');
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    return JSON.parse(lines[0]);
  }

  async function rpc(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const client = new DaemonClient(paths.socketPath);
    try { return await client.call(method, params, { timeoutMs: 3000 }); }
    finally { client.close(); }
  }

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tga-'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ type: 'module', version: '0.0.0-offline' }));
    const configDir = join(dir, 'c');
    mkdirSync(configDir);
    config = join(configDir, 'config.json');
    writeFileSync(config, '{"profiles":{}}');
    await new SessionStore(configDir).save('p', 'synthetic-session');
    sessionPath = join(configDir, 'sessions', 'p.session');
    journalPath = join(dir, 'events.jsonl');
    paths = new DaemonPaths(configDir, 'p');
    cliEntry = join(dir, 'bin', 'tg.mjs');
    const plugin: Plugin = { name: 'offline-daemon-api', setup(builder) {
      builder.onResolve({ filter: /^telegram$/ }, () => ({ path: resolve('tests/fixtures/daemon-api-telegram.ts') }));
      builder.onResolve({ filter: /^[^./]/ }, (args) => ({
        path: args.path.startsWith('node:') ? args.path : require.resolve(args.path), external: true,
      }));
    } };
    const options = { bundle: true, platform: 'node' as const, format: 'esm' as const, target: 'node20', logLevel: 'silent' as const, plugins: [plugin] };
    await Promise.all([
      build({ ...options, entryPoints: [resolve('src/bin/tg.ts')], outfile: cliEntry }),
      build({ ...options, entryPoints: [resolve('src/lib/daemon/entry.ts')], outfile: join(dir, 'lib', 'daemon', 'entry.js') }),
    ]);
    const started = envelope(await cli(['daemon', 'start', '--idle-timeout', '0']));
    expect(started).toMatchObject({ ok: true, data: { profile: 'p', socket: paths.socketPath } });
    daemonPid = started.data.pid;
    expect(paths.readPid()).toBe(daemonPid);
    expect(await rpc('ping')).toBe('pong');
  }, 20_000);

  afterAll(async () => {
    for (const child of children) child.kill('SIGKILL');
    if (paths?.socketExists()) {
      try { await rpc('shutdown'); }
      catch { if (daemonPid) { try { process.kill(daemonPid, 'SIGTERM'); } catch {} } }
      await vi.waitFor(() => {
        expect(paths.socketExists()).toBe(false);
        expect(paths.readPid()).toBeNull();
      }, { timeout: 3000 });
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it('routes sequential list, history and send through the same daemon session', async () => {
    expect(envelope(await cli(['--daemon', 'chat', 'list', '--limit', '2']))).toMatchObject({
      ok: true, data: { chats: [{ id: '7' }, { id: '-1001234567890' }], total: 2 },
    });
    expect(envelope(await cli(['--daemon', 'message', 'history', 'me', '--limit', '2']))).toMatchObject({
      ok: true, data: { messages: [{ id: 30, text: 'seed newest' }, { id: 20 }], total: 3 },
    });
    const sent = envelope(await cli(['--daemon', 'message', 'send', 'me', 'sequential send']));
    expect(sent).toMatchObject({ ok: true, data: { text: 'sequential send', senderId: '7' } });
    expect(envelope(await cli(['--daemon', 'message', 'history', 'me', '--limit', '1']))).toMatchObject({
      ok: true, data: { messages: [{ id: sent.data.id, text: sent.data.text }] },
    });
  });

  it('transports piped stdin and literal option-shaped message text without reparsing it', async () => {
    const piped = envelope(await cli(['--daemon', 'message', 'send', 'me', '-'], 'first line\nsecond line\n'));
    expect(piped).toMatchObject({ ok: true, data: { text: 'first line\nsecond line' } });
    const literal = '--daemon --profile other $(echo must-stay-literal)';
    expect(envelope(await cli(['--daemon', 'message', 'send', '--', 'me', literal]))).toMatchObject({
      ok: true, data: { text: literal },
    });
    expect(envelope(await cli(['--daemon', 'message', 'send', 'me', '-'], ''), 1)).toMatchObject({ ok: false, code: 'EMPTY_MESSAGE' });
  });

  it('keeps raw API envelopes and stdin independent from CLI formatting', async () => {
    expect(await rpc('execute', { argv: ['message', 'send', '--', 'me', 'raw API'] })).toMatchObject({
      output: { ok: true, data: { text: 'raw API' } }, exitCode: 0,
    });
    expect(await rpc('execute', { argv: ['message', 'send', '--', 'me', '-'], stdin: 'API stdin\n' })).toMatchObject({
      output: { ok: true, data: { text: 'API stdin' } }, exitCode: 0,
    });
    expect(await rpc('execute', { argv: ['message', 'send', '--', 'me', '-'] })).toMatchObject({
      output: { ok: false, code: 'STDIN_REQUIRED' }, exitCode: 1,
    });
  });

  it('isolates concurrent success, failure, field projection and JSONL output', async () => {
    const [slow, failure, lines, full] = await Promise.all([
      cli(['--daemon', '--fields', 'id,text', 'message', 'send', 'me', 'fixture:slow concurrent']),
      cli(['--daemon', 'message', 'send', 'me', 'fixture:fail']),
      cli(['--daemon', '--jsonl', '--fields', 'id,text', 'message', 'history', 'me', '--limit', '2']),
      cli(['--daemon', 'message', 'history', 'me', '--limit', '1']),
    ]);
    const sent = envelope(slow);
    expect(sent).toEqual({ ok: true, data: { id: expect.any(Number), text: 'fixture:slow concurrent' } });
    expect(envelope(failure, 1)).toMatchObject({ ok: false, code: 'CHAT_WRITE_FORBIDDEN' });
    expect(lines).toMatchObject({ code: 0, signal: null, stderr: '' });
    const rows = lines.stdout.trim().split('\n').map((line) => JSON.parse(line));
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row).toEqual({ id: expect.any(Number), text: expect.any(String) });
    expect(envelope(full)).toMatchObject({ ok: true, data: { messages: [{ date: expect.any(String), senderId: '7' }], total: expect.any(Number) } });
    expect(envelope(await cli(['--daemon', 'chat', 'list', '--limit', '1']))).toMatchObject({ ok: true, data: { chats: [{ title: 'Saved Messages' }] } });
  });

  it('returns structured invalid arguments without changing the daemon exit status', async () => {
    for (const args of [
      ['--daemon', 'chat', 'list', '--limit', 'NaN'],
      ['--daemon', 'message', 'history', 'me', '--limit', '-1'],
      ['--daemon', 'message', 'send', 'me'],
      ['--daemon', 'unknown-command'],
    ]) expect(envelope(await cli(args), 1)).toMatchObject({ ok: false, code: expect.any(String) });
    expect(await rpc('execute', { argv: ['message', 'history', '--nonsense', 'me'] })).toMatchObject({ output: { ok: false, code: 'INVALID_OPTIONS' }, exitCode: 1 });
    expect(await rpc('ping')).toBe('pong');
  });

  it('blocks direct connection and auth/session commands while the daemon owns the profile', async () => {
    const before = journal().filter((event) => event.event === 'constructor').length;
    expect(envelope(await cli(['chat', 'list']), 1)).toMatchObject({ ok: false, code: 'DAEMON_ALREADY_RUNNING' });
    for (const args of [['auth', 'status'], ['--daemon', 'auth', 'status'], ['--daemon', 'session', 'export']]) {
      expect(envelope(await cli(args), 1)).toMatchObject({ ok: false, code: expect.any(String) });
    }
    for (const argv of [['auth', 'status'], ['session', 'export'], ['daemon', 'stop'], ['message', 'watch', 'me']]) {
      expect(await rpc('execute', { argv })).toMatchObject({ output: { ok: false, code: 'DAEMON_PROXY_UNAVAILABLE' }, exitCode: 1 });
    }
    expect(journal().filter((event) => event.event === 'constructor')).toHaveLength(before);
    expect(readFileSync(sessionPath, 'utf8')).toBe('synthetic-session');
  });

  it('delivers watch events during execute without capturing them in the command response', async () => {
    const subscriptions = journal().filter((event) => event.event === 'subscribe').length;
    const watcher = launch(['message', 'watch', 'me']);
    try {
      await vi.waitFor(() => expect(journal().filter((event) => event.event === 'subscribe')).toHaveLength(subscriptions + 1), { timeout: 3000 });
      const sent = envelope(await cli(['--daemon', 'message', 'send', 'me', 'watched execute']));
      expect(sent).toMatchObject({ ok: true, data: { text: 'watched execute' } });
      await vi.waitFor(() => expect(watcher.stdout()).toContain('watched execute'), { timeout: 3000 });
      watcher.child.kill('SIGINT');
      const notification = envelope(await watcher.result);
      expect(notification).toMatchObject({ ok: true, data: { id: sent.data.id, text: 'watched execute' } });
      await vi.waitFor(() => expect(journal().some((event) => event.event === 'unsubscribe')).toBe(true), { timeout: 1000 });
    } finally {
      if (watcher.child.exitCode === null) watcher.child.kill('SIGKILL');
    }
  });

  it('constructs and connects exactly once for every CLI and API request', () => {
    expect(journal().filter((event) => event.event === 'constructor')).toEqual([{ event: 'constructor', pid: daemonPid }]);
    expect(journal().filter((event) => event.event === 'connect')).toEqual([{ event: 'connect', pid: daemonPid }]);
    expect(journal().filter((event) => event.event === 'destroy')).toHaveLength(0);
    expect(new Set(journal().map((event) => event.pid))).toEqual(new Set([daemonPid]));
  });
});
