import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Command } from 'commander';
import { mkdtempSync, rmSync, readFileSync, writeFileSync, statSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createConfig, getCredentialsOrThrow } from '../../src/lib/config.js';
import { readDesktopSession, desktopKeyFingerprint } from '../../src/lib/desktop-session.js';
import { withClient } from '../../src/lib/client.js';
import { SessionStore } from '../../src/lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../src/lib/output.js';
import { createPrompt } from '../../src/lib/prompt.js';
import { importDesktopAction } from '../../src/commands/session/import-desktop.js';
import { TgError } from '../../src/lib/errors.js';

vi.mock('../../src/lib/config.js', async original => ({ ...await original<object>(), getCredentialsOrThrow: vi.fn() }));
vi.mock('../../src/lib/desktop-session.js', async original => ({ ...await original<object>(), readDesktopSession: vi.fn() }));
vi.mock('../../src/lib/client.js', () => ({ withClient: vi.fn() }));
vi.mock('../../src/lib/output.js', () => ({ outputSuccess: vi.fn(), outputError: vi.fn(), logStatus: vi.fn() }));
vi.mock('../../src/lib/prompt.js', () => ({ createPrompt: vi.fn() }));

let dir: string;
let config: ReturnType<typeof createConfig>;
let store: SessionStore;
const key = Buffer.alloc(256, 32);
const stringSession = '1' + Buffer.concat([Buffer.from([2,149,154,167,51,1,187]), key]).toString('base64');
const imported = { sessionString: stringSession, userId: '1001', keyFingerprints: [desktopKeyFingerprint(key)] };
let verify: ReturnType<typeof vi.fn>;
const hold = new AbortController();

function context(overrides: Record<string, unknown> = {}, explicit = true): Command {
  return { optsWithGlobals: () => ({ profile: 'new-profile', config: config.path, desktopClosed: true, transport: 'wss', quiet: true, ...overrides }),
    getOptionValueSourceWithGlobals: () => explicit ? 'cli' : 'default' } as unknown as Command;
}
function persisted() { return existsSync(store.filePath('new-profile')) || config.has('profiles.new-profile'); }

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('TG_API_ID', undefined); vi.stubEnv('TG_API_HASH', undefined);
  dir = mkdtempSync(join(tmpdir(), 'tg-desktop-command-'));
  config = createConfig(join(dir, 'config.json'));
  store = new SessionStore(dir);
  vi.mocked(readDesktopSession).mockResolvedValue(imported);
  vi.mocked(getCredentialsOrThrow).mockResolvedValue({ apiId: 1234, apiHash: 'a'.repeat(32) });
  verify = vi.fn().mockResolvedValue({ id: { toString: () => '1001' } });
  vi.mocked(withClient).mockImplementation(async (_opts, callback, options) => {
    const cleanup = Promise.resolve(); options?.holdUntil?.(cleanup);
    return callback({ getMe: verify } as any, hold.signal);
  });
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });

describe('TG-63 Desktop import command', () => {
  it('rejects unsafe options before reading tdata or connecting', async () => {
    for (const [options, code] of [
      [{ profile: 'Default' }, 'INVALID_OPTIONS'], [{ desktopClosed: false }, 'INVALID_OPTIONS'],
      [{ account: '../2' }, 'INVALID_OPTIONS'], [{ account: '6' }, 'INVALID_OPTIONS'],
      [{ askPasscode: true }, 'NOT_INTERACTIVE'], [{ daemon: true }, 'DAEMON_PROXY_UNAVAILABLE'],
    ] as const) {
      await importDesktopAction.call(context(options), 'sensitive-source-path');
      expect(outputError).toHaveBeenLastCalledWith(expect.any(String), code);
    }
    await importDesktopAction.call(context({}, false), 'source');
    expect(outputError).toHaveBeenLastCalledWith(expect.any(String), 'INVALID_OPTIONS');
    for (const name of ['TG_API_ID', 'TG_API_HASH']) {
      vi.stubEnv(name, 'synthetic-secret');
      await importDesktopAction.call(context(), 'source');
      expect(outputError).toHaveBeenLastCalledWith(expect.stringContaining('env -u'), 'CREDENTIAL_ERROR');
      vi.stubEnv(name, undefined);
    }
    expect(readDesktopSession).not.toHaveBeenCalled(); expect(withClient).not.toHaveBeenCalled();
    expect(persisted()).toBe(false);
  });
  it('rejects occupied profiles including case aliases and empty session files', async () => {
    config.set('profiles.New-Profile', { created: 'unchanged' });
    const original = readFileSync(config.path);
    await importDesktopAction.call(context(), 'source');
    expect(readFileSync(config.path)).toEqual(original);
    config.delete('profiles.New-Profile');
    writeFileSync(store.filePath('NEW-PROFILE'), '');
    await importDesktopAction.call(context(), 'source');
    expect(readFileSync(store.filePath('NEW-PROFILE'), 'utf8')).toBe('');
    expect(readDesktopSession).not.toHaveBeenCalled();
    expect(outputError).toHaveBeenLastCalledWith(expect.any(String), 'FILE_EXISTS');
  });
  it('refuses duplicate keys and busy existing profiles before networking', async () => {
    await store.save('other', stringSession);
    await importDesktopAction.call(context(), 'source');
    expect(outputError).toHaveBeenLastCalledWith(expect.stringContaining('already stored'), 'FILE_EXISTS');
    expect(withClient).not.toHaveBeenCalled(); expect(persisted()).toBe(false);
    const release = await store.acquireLock('other');
    try {
      await importDesktopAction.call(context(), 'source');
      expect(outputError).toHaveBeenLastCalledWith(expect.stringContaining('Stop its daemon'), 'SESSION_ERROR');
      expect(withClient).not.toHaveBeenCalled();
    } finally { await release(); }
    expect(await store.load('other')).toBe(stringSession);
  });
  it('refuses uppercase session extensions before reading a source', async () => {
    const path = join(dir, 'sessions', 'NEW-PROFILE.SESSION');
    writeFileSync(path, 'synthetic-existing-session');
    await importDesktopAction.call(context(), 'source');
    expect(outputError).toHaveBeenLastCalledWith(expect.any(String), 'FILE_EXISTS');
    expect(readDesktopSession).not.toHaveBeenCalled();
    expect(readFileSync(path, 'utf8')).toBe('synthetic-existing-session');
  });
  it('verifies identity and teardown before saving the Desktop profile', async () => {
    config.set('profiles.unrelated', { client: 'android', transport: 'tcp' });
    let destroyed = false;
    vi.mocked(withClient).mockImplementation(async (opts, callback, options) => {
      expect(opts).toMatchObject({ sessionString: stringSession, transport: 'wss', apiId: 1234 });
      expect(existsSync(store.filePath('new-profile') + '.lock')).toBe(true);
      expect(persisted()).toBe(false);
      const cleanup = new Promise<void>(resolve => setTimeout(() => { destroyed = true; resolve(); }, 15));
      options?.holdUntil?.(cleanup);
      await callback({ getMe: verify } as any, hold.signal);
    });
    const save = vi.spyOn(SessionStore.prototype, 'saveUnlocked');
    save.mockImplementation(function(profile, value) {
      expect(destroyed).toBe(true);
      expect(config.get(`profiles.${profile}.client`)).toBe('desktop');
      writeFileSync(this.filePath(profile), value, { mode: 0o600 });
    });
    await importDesktopAction.call(context({ account: '2' }), 'source');
    expect(readDesktopSession).toHaveBeenCalledWith('source', { account: 2, passcode: undefined });
    expect(getCredentialsOrThrow).toHaveBeenCalledWith(expect.anything(), 'desktop');
    expect(verify).toHaveBeenCalledOnce();
    expect(config.get('profiles.new-profile')).toMatchObject({ client: 'desktop', importedFrom: 'desktop', transport: 'wss' });
    expect(config.get('profiles.unrelated')).toEqual({ client: 'android', transport: 'tcp' });
    expect(await store.load('new-profile')).toBe(stringSession);
    expect(statSync(store.filePath('new-profile')).mode & 0o777).toBe(0o600);
    expect(statSync(join(dir, 'sessions')).mode & 0o777).toBe(0o700);
    expect(outputSuccess).toHaveBeenCalledWith({ imported: true, profile: 'new-profile', verified: true });
    expect(JSON.stringify([vi.mocked(outputSuccess).mock.calls, vi.mocked(logStatus).mock.calls])).not.toContain(stringSession);
    expect(readdirSync(join(dir, 'sessions'))).toEqual(['new-profile.session']);
  });
  it('does not save unauthorized, mismatched or failed verifications', async () => {
    for (const [rpc, code] of [['AUTH_KEY_UNREGISTERED','INVALID_SESSION'], ['SESSION_REVOKED','INVALID_SESSION'], ['AUTH_KEY_DUPLICATED','AUTH_KEY_DUPLICATED'], ['FLOOD_WAIT_60','VERIFY_FAILED'], ['private-raw-error','VERIFY_FAILED']]) {
      verify.mockRejectedValue(Object.assign(new Error('private-raw-error'), { errorMessage: rpc }));
      await importDesktopAction.call(context(), 'source');
      expect(outputError).toHaveBeenLastCalledWith(expect.not.stringContaining('private-raw-error'), code);
      expect(persisted()).toBe(false);
    }
    verify.mockResolvedValue({ id: { toString: () => '999999-private' } });
    await importDesktopAction.call(context(), 'source');
    expect(outputError).toHaveBeenLastCalledWith(expect.not.stringContaining('999999'), 'VERIFY_FAILED');
    expect(persisted()).toBe(false); expect(outputSuccess).not.toHaveBeenCalled();
  });
  it('does not save after cancellation or failed teardown', async () => {
    const aborted = new AbortController(); aborted.abort(new Error('private-abort-reason'));
    vi.mocked(withClient).mockImplementation(async (_opts, callback) => callback({ getMe: verify } as any, aborted.signal));
    await importDesktopAction.call(context(), 'source');
    expect(persisted()).toBe(false); expect(verify).not.toHaveBeenCalled();
    vi.mocked(withClient).mockImplementation(async (_opts, callback, options) => {
      const cleanup = Promise.reject(new Error('private-teardown-failure')); options?.holdUntil?.(cleanup);
      await callback({ getMe: verify } as any, hold.signal);
    });
    await importDesktopAction.call(context(), 'source');
    expect(persisted()).toBe(false); expect(outputSuccess).not.toHaveBeenCalled();
    expect(outputError).toHaveBeenLastCalledWith(expect.not.stringContaining('private-'), 'VERIFY_FAILED');
    expect(existsSync(store.filePath('new-profile') + '.lock')).toBe(true);
  });
  it('rolls back newly created state when persistence fails', async () => {
    config.set('profiles.unrelated', { client: 'android' });
    vi.spyOn(SessionStore.prototype, 'saveUnlocked').mockImplementation(function(profile) {
      writeFileSync(this.filePath(profile), 'partial-write'); throw new Error('private-disk-error');
    });
    await importDesktopAction.call(context(), 'source');
    expect(persisted()).toBe(false);
    expect(config.get('profiles.unrelated')).toEqual({ client: 'android' });
    expect(outputSuccess).not.toHaveBeenCalled();
    expect(outputError).toHaveBeenLastCalledWith(expect.not.stringContaining('private-disk-error'), 'SESSION_ERROR');
  });
  it('retains the lease after timeout until outstanding cleanup settles', async () => {
    let finish!: () => void;
    const cleanup = new Promise<void>(resolve => { finish = resolve; });
    vi.mocked(withClient).mockImplementation(async (_opts, _callback, options) => {
      options?.holdUntil?.(cleanup);
      throw new TgError('timeout', 'TIMEOUT');
    });
    await importDesktopAction.call(context(), 'source');
    expect(outputError).toHaveBeenLastCalledWith(expect.any(String), 'TIMEOUT');
    expect(existsSync(store.filePath('new-profile') + '.lock')).toBe(true);
    expect(persisted()).toBe(false);
    finish();
    const release = await store.acquireLock('new-profile');
    await release();
    expect(persisted()).toBe(false);
  });
  it('does not expose a session when metadata persistence fails', async () => {
    const prototype = Object.getPrototypeOf(config);
    const original = prototype.set;
    vi.spyOn(prototype, 'set').mockImplementation(function(key, value) {
      if (key === 'profiles.new-profile') throw new Error('private-config-failure');
      return original.call(this, key, value);
    });
    await importDesktopAction.call(context(), 'source');
    expect(persisted()).toBe(false);
    expect(outputSuccess).not.toHaveBeenCalled();
  });
  it('retains matching metadata if a partial session cannot be removed', async () => {
    vi.spyOn(SessionStore.prototype, 'saveUnlocked').mockImplementation(function(profile) {
      writeFileSync(this.filePath(profile), 'partial'); throw new Error('disk failure');
    });
    vi.spyOn(SessionStore.prototype, 'deleteUnlocked').mockImplementation(() => { throw new Error('cannot remove'); });
    await importDesktopAction.call(context(), 'source');
    expect(config.get('profiles.new-profile')).toMatchObject({ client: 'desktop', importedFrom: 'desktop' });
    expect(outputSuccess).not.toHaveBeenCalled();
    expect(outputError).toHaveBeenLastCalledWith(expect.any(String), 'SESSION_ERROR');
  });
  it('asks for a Desktop passcode only through the secret terminal prompt', async () => {
    const stdin = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
    const stderr = Object.getOwnPropertyDescriptor(process.stderr, 'isTTY');
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    Object.defineProperty(process.stderr, 'isTTY', { value: true, configurable: true });
    const prompt = { ask: vi.fn(), askSecret: vi.fn().mockResolvedValue('synthetic-local-passcode'), close: vi.fn() };
    vi.mocked(createPrompt).mockReturnValue(prompt);
    try {
      await importDesktopAction.call(context({ askPasscode: true }), 'source');
      expect(prompt.askSecret).toHaveBeenCalledOnce(); expect(prompt.ask).not.toHaveBeenCalled(); expect(prompt.close).toHaveBeenCalledOnce();
      expect(readDesktopSession).toHaveBeenCalledWith('source', { account: undefined, passcode: 'synthetic-local-passcode' });
      expect(JSON.stringify([vi.mocked(outputSuccess).mock.calls, vi.mocked(outputError).mock.calls, vi.mocked(logStatus).mock.calls])).not.toContain('synthetic-local-passcode');
    } finally {
      if (stdin) Object.defineProperty(process.stdin, 'isTTY', stdin); else delete (process.stdin as any).isTTY;
      if (stderr) Object.defineProperty(process.stderr, 'isTTY', stderr); else delete (process.stderr as any).isTTY;
    }
  });
});
