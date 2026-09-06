import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { build } from 'esbuild';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SessionStore } from '../../src/lib/session-store.js';
import { DaemonPaths } from '../../src/lib/daemon/pid.js';
import { DaemonClient } from '../../src/lib/daemon/client.js';

const require = createRequire(import.meta.url);

/** Real fork/IPC, parent process and daemon socket; only MTProto is replaced. */
describe('background daemon detaches from its launcher process', () => {
  let dir: string;
  let parentEntry: string;
  let paths: DaemonPaths;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'tgd-'));
    writeFileSync(join(dir, 'package.json'), '{"type":"module"}');
    const configDir = join(dir, 'config');
    mkdirSync(configDir);
    const config = join(configDir, 'config.json');
    writeFileSync(config, '{"profiles":{}}');
    await new SessionStore(configDir).save('p', 'synthetic-session');
    paths = new DaemonPaths(configDir, 'p');
    parentEntry = join(dir, 'bin', 'tg.mjs');
    const plugins = [{ name: 'offline-mtproto', setup(builder: any) {
      builder.onResolve({ filter: /^telegram$/ }, () => ({ path: 'telegram', namespace: 'offline' }));
      builder.onResolve({ filter: /^\//, namespace: 'offline' }, (args: any) => ({ path: args.path, external: true }));
      builder.onLoad({ filter: /.*/, namespace: 'offline' }, () => ({ loader: 'js', contents: `
        export { Api } from ${JSON.stringify(require.resolve('telegram/tl/api.js'))};
        export const sessions = { StringSession: class { constructor(value) { this.value = value; } save() { return this.value; } } };
        export class TelegramClient { async connect() {} async destroy() {} }
      ` }));
      builder.onResolve({ filter: /^[^./]/ }, (args: any) => ({
        path: args.path.startsWith('node:') ? args.path : require.resolve(args.path), external: true,
      }));
    } }];
    const options = { bundle: true, platform: 'node' as const, format: 'esm' as const, target: 'node20', logLevel: 'silent' as const, plugins };
    await build({ ...options, entryPoints: [resolve('src/lib/daemon/entry.ts')], outfile: join(dir, 'lib', 'daemon', 'entry.js') });
    await build({ ...options, outfile: parentEntry, stdin: { resolveDir: process.cwd(), contents: `
      import { daemonStartAction } from ${JSON.stringify(resolve('src/commands/daemon/start.ts'))};
      await daemonStartAction.call({optsWithGlobals: () => ({profile:'p', quiet:true, config:${JSON.stringify(config)}, idleTimeout:'0'})});
    ` } });
  });

  afterEach(async () => {
    if (!paths.socketExists()) return;
    const rpc = new DaemonClient(paths.socketPath);
    try { await rpc.call('shutdown', {}, { timeoutMs: 1000 }); }
    finally { rpc.close(); }
    await vi.waitFor(() => {
      expect(paths.readPid()).toBeNull();
      expect(paths.socketExists()).toBe(false);
    }, { timeout: 2000 });
  });

  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it('exits normally after reporting success while the detached daemon keeps answering requests', async () => {
    const parent = spawnSync(process.execPath, [parentEntry], {
      encoding: 'utf8', timeout: 2000,
      // No inherited Telegram credentials or user configuration enter the fixture.
      env: { PATH: process.env.PATH, TG_API_ID: '1', TG_API_HASH: 'synthetic-api-hash' },
    });
    const envelope = JSON.parse(parent.stdout.trim());
    expect(envelope).toMatchObject({ ok: true, data: { profile: 'p', socket: paths.socketPath } });
    expect(parent.stderr).toBe('');
    expect(parent.error).toBeUndefined();
    expect(parent.signal).toBeNull();
    expect(parent.status).toBe(0);
    expect(paths.readPid()).toBe(envelope.data.pid);
    const rpc = new DaemonClient(paths.socketPath);
    try { await expect(rpc.call('ping', {}, { timeoutMs: 1000 })).resolves.toBe('pong'); }
    finally { rpc.close(); }
  });
});
