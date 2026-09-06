import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { TelegramClient, sessions } from 'telegram';
import { AuthKey } from 'telegram/crypto/AuthKey.js';
import { withClient } from '../../src/lib/client.js';
import { createConfig, getCredentialsOrThrow } from '../../src/lib/config.js';
import { SessionStore } from '../../src/lib/session-store.js';
import { importAction } from '../../src/commands/session/import.js';
import { setQuietMode, setVerboseMode } from '../../src/lib/cli-mode.js';

/** Independent checks using the real SDK/config/store, with transport kept offline. */
describe('core fixes: independent boundary review', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'tg-core-review-'));
    vi.stubEnv('TG_API_ID', undefined);
    vi.stubEnv('TG_API_HASH', undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('Network forbidden in regression test'))));
    setQuietMode(true);
    setVerboseMode(false);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    setQuietMode(false);
    setVerboseMode(false);
    process.exitCode = 0;
    rmSync(dir, { recursive: true, force: true });
  });

  it('destroys a sender created by the real SDK connect after the deadline', async () => {
    vi.useFakeTimers();
    let resume!: () => void;
    let connected = false;
    let disconnects = 0;
    const originalInit = (TelegramClient.prototype as any)._initSession;
    vi.spyOn(TelegramClient.prototype as any, '_initSession').mockImplementation(async function (this: any) {
      await new Promise<void>((resolve) => { resume = resolve; });
      await originalInit.call(this);
      // Substitute just the sender transport. TelegramClient.connect() and
      // destroy() stay real, including SDK work that occurs after initialization.
      this._sender = {
        authKey: this.session.getAuthKey(),
        connect: async () => { connected = true; return true; },
        send: async () => ({}),
        disconnect: async () => { connected = false; disconnects++; },
      };
    });
    const callback = vi.fn();
    const pending = withClient({ apiId: 1, apiHash: 'synthetic', sessionString: '' }, callback, { timeout: 10 });
    const rejected = expect(pending).rejects.toMatchObject({ code: 'TIMEOUT' });
    await vi.advanceTimersByTimeAsync(10);
    await rejected;
    expect(connected).toBe(false);
    resume();
    await vi.advanceTimersByTimeAsync(0);
    expect(callback).not.toHaveBeenCalled();
    expect(connected).toBe(false);
    expect(disconnects).toBeGreaterThanOrEqual(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('preserves preset precedence through a real session import and config reload', async () => {
    const path = join(dir, 'config.json');
    const config = createConfig(path);
    config.set('apiId', 10);
    config.set('apiHash', 'global-synthetic');
    config.set('presets', {
      desktop: { apiId: 20, apiHash: 'desktop-synthetic', fetchedAt: new Date().toISOString() },
      android: { apiId: 30, apiHash: 'android-synthetic', fetchedAt: new Date().toISOString() },
    });
    config.set('profiles', {
      work: { client: 'desktop', created: '2026-09-06T00:00:00Z' },
      personal: { client: 'android', created: '2026-09-06T00:00:00Z' },
    });
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await importAction.call({ optsWithGlobals: () => ({ profile: 'work', config: path, skipVerify: true, quiet: true }) } as any, 'synthetic-imported-session');
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({ ok: true, data: { imported: true, profile: 'work' } });
    expect(stderr).not.toHaveBeenCalled();
    const fresh = createConfig(path);
    expect(fresh.get('profiles.work.client')).toBe('desktop');
    expect(fresh.get('profiles.personal.client')).toBe('android');
    expect(await new SessionStore(dir).load('work')).toBe('synthetic-imported-session');
    await expect(getCredentialsOrThrow(fresh, undefined, 'work')).resolves.toMatchObject({ apiId: 20 });
    await expect(getCredentialsOrThrow(fresh, 'android', 'work')).resolves.toMatchObject({ apiId: 30 });
    await expect(getCredentialsOrThrow(fresh, undefined, 'legacy')).resolves.toMatchObject({ apiId: 10 });
    vi.stubEnv('TG_API_ID', '40');
    vi.stubEnv('TG_API_HASH', 'environment-synthetic');
    await expect(getCredentialsOrThrow(fresh, 'android', 'work')).resolves.toMatchObject({ apiId: 40 });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects a malformed environment API ID when only the hash comes from config', async () => {
    const config = createConfig(join(dir, 'config.json'));
    config.set('apiHash', 'synthetic');
    vi.stubEnv('TG_API_ID', '12junk');
    await expect(getCredentialsOrThrow(config)).rejects.toMatchObject({ code: 'CREDENTIAL_ERROR' });
  });

  it('verifies import with the selected preset even if unused global credentials are invalid', async () => {
    const path = join(dir, 'config.json');
    const config = createConfig(path);
    config.set('apiId', 'obsolete-invalid-global-id' as any);
    config.set('apiHash', 'unused-global-synthetic');
    config.set('presets', {
      desktop: { apiId: 20, apiHash: 'desktop-synthetic', fetchedAt: new Date().toISOString() },
    });
    config.set('profiles', { work: { client: 'desktop', created: '2026-09-06T00:00:00Z' } });
    const session = new sessions.StringSession('');
    session.setDC(2, '127.0.0.1', 443);
    const key = new AuthKey();
    await key.setKey(Buffer.alloc(256, 7));
    session.setAuthKey(key);
    const serialized = session.save();
    vi.spyOn(TelegramClient.prototype, 'connect').mockResolvedValue(true);
    vi.spyOn(TelegramClient.prototype, 'checkAuthorization').mockResolvedValue(true);
    const stdout = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    await importAction.call({ optsWithGlobals: () => ({ profile: 'work', config: path, quiet: true }) } as any, serialized);
    expect(JSON.parse(String(stdout.mock.calls[0][0]))).toMatchObject({ ok: true, data: { imported: true, verified: true } });
    expect(await new SessionStore(dir).load('work')).toBe(serialized);
    expect(createConfig(path).get('profiles.work.client')).toBe('desktop');
    expect(fetch).not.toHaveBeenCalled();
  });
});
