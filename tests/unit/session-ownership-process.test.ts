import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { fork, type ChildProcess } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync, writeFileSync, existsSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { SessionStore } from '../../src/lib/session-store.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';
import { createConnection } from 'node:net';
import { once } from 'node:events';

const require = createRequire(import.meta.url);
interface Event { event: string; code?: string; message?: string }
class Worker {
  readonly process: ChildProcess;
  readonly events: Event[] = [];
  stdout = '';
  stderr = '';
  private readonly waiters = new Set<() => void>();
  constructor(entry: string, role: string, dir: string, profile = 'test') {
    this.process = fork(entry, [role, dir, profile], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env, TG_API_ID: '1234', TG_API_HASH: 'synthetic-api-hash' },
    });
    this.process.stdout!.on('data', (data) => { this.stdout += data; });
    this.process.stderr!.on('data', (data) => { this.stderr += data; });
    this.process.on('message', (message) => {
      this.events.push(message as Event);
      for (const notify of this.waiters) notify();
    });
    this.process.on('exit', () => { for (const notify of this.waiters) notify(); });
  }
  send(command: string) { this.process.send(command); }
  event(name: string): Promise<Event> {
    return new Promise((resolve, reject) => {
      const finish = () => {
        const result = this.events.find((event) => event.event === name);
        const failure = this.events.find((event) => event.event === 'failed');
        if (!result && !failure && this.process.exitCode == null && this.process.signalCode == null) return;
        clearTimeout(timeout);
        this.waiters.delete(finish);
        if (result) resolve(result);
        else reject(new Error(`Worker missed ${name}: ${JSON.stringify(failure)} ${this.stderr}`));
      };
      const timeout = setTimeout(() => {
        this.waiters.delete(finish);
        reject(new Error(`Worker timed out awaiting ${name}: ${JSON.stringify(this.events)} ${this.stderr}`));
      }, 5000);
      this.waiters.add(finish);
      finish();
    });
  }
  async exit(): Promise<void> {
    if (this.process.exitCode != null || this.process.signalCode != null) return;
    await new Promise<void>((resolve) => this.process.once('exit', () => resolve()));
  }
}

/** IPC barriers hold precise lifecycle phases; no timing guesses or live Telegram. */
describe('exclusive profile ownership across processes', () => {
  let bundleDir: string;
  let entry: string;
  let dir: string;
  const workers: Worker[] = [];

  beforeAll(async () => {
    bundleDir = mkdtempSync(join(tmpdir(), 'tg-owner-build-'));
    entry = join(bundleDir, 'worker.mjs');
    const telegramMock = resolve('tests/fixtures/daemon-telegram.ts');
    await build({
      entryPoints: [resolve('tests/fixtures/session-ownership.ts')],
      outfile: entry, bundle: true, platform: 'node', format: 'esm', target: 'node20', logLevel: 'silent',
      plugins: [{ name: 'offline-telegram-and-external-packages', setup(builder) {
        builder.onResolve({ filter: /^telegram$/ }, () => ({ path: telegramMock }));
        builder.onResolve({ filter: /^[^./]/ }, (args) => {
          if (args.path.startsWith('node:')) return { path: args.path, external: true };
          return { path: require.resolve(args.path), external: true };
        });
      } }],
    });
  });
  afterAll(() => rmSync(bundleDir, { recursive: true, force: true }));
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tg-owner-'));
    writeFileSync(join(dir, 'config.json'), JSON.stringify({ profiles: {} }));
  });
  afterEach(async () => {
    for (const worker of workers) {
      if (worker.process.exitCode == null && worker.process.signalCode == null) worker.process.kill('SIGKILL');
    }
    await Promise.all(workers.map((worker) => worker.exit()));
    workers.length = 0;
    rmSync(dir, { recursive: true, force: true });
  });
  async function worker(role: string, path = dir, profile = 'test') {
    const current = new Worker(entry, role, path, profile);
    workers.push(current);
    await current.event('ready');
    return current;
  }
  async function probeBlocked(path = dir, profile = 'test') {
    const probe = await worker('probe', path, profile);
    probe.send('run');
    expect(await probe.event('blocked')).toMatchObject({ code: 'ELOCKED' });
    await probe.exit();
    expect(probe.events.some((event) => event.event === 'acquired')).toBe(false);
  }
  async function probeFree() {
    const probe = await worker('probe');
    probe.send('run');
    await probe.event('acquired');
    await probe.exit();
  }
  async function releaseConnected(owner: Worker, role: string) {
    if (role === 'direct') owner.send('operation');
    else if (role === 'foreground' || role === 'background') owner.process.kill('SIGTERM');
    await owner.event('destroying');
    await probeBlocked();
    owner.send('destroying');
    await owner.exit();
    await probeFree();
  }

  it.each(['direct', 'foreground', 'background'])('holds %s ownership before connect through destroy', async (role) => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const owner = await worker(role);
    if (role === 'background') new DaemonPaths(dir, 'test').writePidExclusive(owner.process.pid!);
    owner.send('run');
    await owner.event('connecting');
    await probeBlocked();
    owner.send('connecting');
    await owner.event('connected');
    if (role === 'direct') await owner.event('operation');
    await releaseConnected(owner, role);
  }, 15000);

  it.each(['login', 'import'])('locks a missing profile for the entire %s operation', async (role) => {
    const owner = await worker(role);
    owner.send('run');
    await owner.event('connecting');
    const file = new SessionStore(dir).filePath('test');
    expect(existsSync(file)).toBe(false);
    await probeBlocked();
    owner.send('connecting');
    await owner.event('destroying');
    await probeBlocked();
    owner.send('destroying');
    await owner.exit();
    expect(await new SessionStore(dir).load('test')).toMatch(/^synthetic-/);
    await probeFree();
  }, 15000);

  it('prevents direct connect after its daemon check has already passed', async () => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const direct = await worker('direct-race');
    direct.send('run');
    await direct.event('before-lock');
    const daemon = await worker('background');
    new DaemonPaths(dir, 'test').writePidExclusive(daemon.process.pid!);
    daemon.send('run');
    await daemon.event('connecting');
    direct.send('before-lock');
    await direct.event('done');
    await direct.exit();
    expect(direct.events.some((event) => event.event === 'connecting')).toBe(false);
    expect(JSON.parse(direct.stdout.trim())).toMatchObject({ ok: false });
    daemon.send('connecting');
    await daemon.event('connected');
    await releaseConnected(daemon, 'background');
  }, 15000);

  it('keeps one lock across delete/recreate and symlinked config aliases', async () => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const alias = join(dir, 'alias');
    symlinkSync(dir, alias, 'dir');
    const owner = await worker('delete-recreate');
    owner.send('run');
    await owner.event('deleted');
    await probeBlocked(alias);
    owner.send('deleted');
    await owner.event('saved');
    await probeBlocked(alias);
    owner.send('saved');
    await owner.exit();
    expect(await new SessionStore(dir).load('test')).toBe('synthetic-recreated-session');
    await probeFree();
  }, 15000);

  it('permits a different profile while one connected profile is owned', async () => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const owner = await worker('direct');
    owner.send('run');
    await owner.event('connecting');
    const other = await worker('probe', dir, 'other');
    other.send('run');
    await other.event('acquired');
    await other.exit();
    owner.send('connecting');
    await owner.event('operation');
    await releaseConnected(owner, 'direct');
  }, 15000);

  it('keeps the background daemon alive after an oversized client frame', async () => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const owner = await worker('background');
    const paths = new DaemonPaths(dir, 'test');
    paths.writePidExclusive(owner.process.pid!);
    owner.send('run');
    await owner.event('connecting');
    owner.send('connecting');
    await vi.waitFor(() => expect(paths.socketExists()).toBe(true));

    const bad = createConnection(paths.socketPath);
    bad.on('error', () => {});
    await once(bad, 'connect');
    const closed = new Promise<void>((resolve) => bad.once('close', () => resolve()));
    bad.write(Buffer.alloc(1_100_000, 120));
    await closed;

    const healthy = new DaemonClient(paths.socketPath);
    await expect(healthy.call('ping', {}, { timeoutMs: 1000 })).resolves.toBe('pong');
    healthy.close();
    expect(owner.process.exitCode).toBeNull();
    expect(owner.stderr).not.toMatch(/Unhandled|Message too large/);
    await releaseConnected(owner, 'background');
  }, 15000);

  it('retains ownership after timeout until late connect and its destroy settle', async () => {
    await new SessionStore(dir).save('test', 'synthetic-session');
    const owner = await worker('direct-timeout');
    owner.send('run');
    await owner.event('connecting');
    await owner.event('destroying-1');
    owner.send('destroying-1');
    await owner.event('timed-out');
    await vi.waitFor(() => expect(owner.stdout.endsWith('\n')).toBe(true));
    expect(JSON.parse(owner.stdout.trim())).toMatchObject({ ok: false, code: 'TIMEOUT' });
    await probeBlocked();

    owner.send('connecting');
    await owner.event('connected');
    await owner.event('destroying-2');
    await probeBlocked();
    owner.send('destroying-2');
    await owner.event('destroyed-2');
    // The old process remains alive. Ownership is freed by successful cleanup,
    // rather than the process exit handler or a stale-lock timeout.
    await probeFree();
    expect(owner.events.some((event) => event.event === 'operation')).toBe(false);
    expect(owner.stdout.trim().split('\n')).toHaveLength(1);
    owner.send('finish');
    await owner.exit();
  }, 15000);

  it('keeps ownership after rejected cleanup until the owner process exits', async () => {
    const owner = await worker('hold-reject');
    owner.send('run');
    await owner.event('cleanup-rejected');
    await probeBlocked();
    expect(owner.stderr).not.toMatch(/Unhandled|Synthetic cleanup failure/);
    owner.send('finish');
    await owner.exit();
    await probeFree();
  }, 15000);
});
