import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createConfig, getCredentialsOrThrow } from '../../src/lib/config.js';
import { SessionStore } from '../../src/lib/session-store.js';

const mocks = vi.hoisted(() => ({
  start: vi.fn(), destroy: vi.fn().mockResolvedValue(undefined),
  success: vi.fn(), error: vi.fn(),
}));
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts, fn) => fn({})),
  createClientForAuth: vi.fn(async () => ({
    connect: vi.fn().mockResolvedValue(true),
    start: mocks.start, destroy: mocks.destroy,
    session: { save: () => 'synthetic-test-session' },
  })),
}));
vi.mock('../../src/lib/prompt.js', () => ({
  createPrompt: () => ({ ask: vi.fn().mockResolvedValue('+10000000000'), askSecret: vi.fn(), close: vi.fn() }),
}));
vi.mock('../../src/lib/output.js', () => ({
  outputSuccess: mocks.success, outputError: mocks.error, logStatus: vi.fn(),
}));

import { loginAction } from '../../src/commands/auth/login.js';
import { createClientForAuth, withClient } from '../../src/lib/client.js';
import { withAuth } from '../../src/lib/with-auth.js';

describe('login preset persistence and session ownership', () => {
  let dir: string;
  const originalTTY = process.stdin.isTTY;
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('TG_API_ID', undefined);
    vi.stubEnv('TG_API_HASH', undefined);
    dir = mkdtempSync(join(tmpdir(), 'tg-preset-login-'));
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: true });
  });
  afterEach(() => {
    Object.defineProperty(process.stdin, 'isTTY', { configurable: true, value: originalTTY });
    vi.unstubAllEnvs();
    rmSync(dir, { recursive: true, force: true });
  });

  it('persists --client desktop and resolves it on the next invocation', async () => {
    const configPath = join(dir, 'config.json');
    createConfig(configPath).set('presets', {
      desktop: { apiId: 1, apiHash: 'synthetic-api-hash', fetchedAt: new Date().toISOString() },
    });
    const store = new SessionStore(dir);
    // A second owner cannot connect while login or its teardown is running.
    mocks.start.mockImplementationOnce(async () => {
      await expect(store.acquireLock('work')).rejects.toMatchObject({ code: 'ELOCKED' });
    });
    mocks.destroy.mockImplementationOnce(async () => {
      await expect(store.acquireLock('work')).rejects.toMatchObject({ code: 'ELOCKED' });
    });
    await loginAction.call({ optsWithGlobals: () => ({ profile: 'work', config: configPath, client: 'desktop' }) } as any);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(mocks.success).toHaveBeenCalledWith({ loggedIn: true, profile: 'work', phone: '+10000000000' });
    const fresh = createConfig(configPath);
    expect(fresh.get('profiles.work.client')).toBe('desktop');
    await expect(getCredentialsOrThrow(fresh, undefined, 'work')).resolves.toEqual({ apiId: 1, apiHash: 'synthetic-api-hash' });
    await expect(store.load('work')).resolves.toBe('synthetic-test-session');
  });

  it('releases the lock and destroys the client when authentication fails', async () => {
    const configPath = join(dir, 'config.json');
    const config = createConfig(configPath);
    config.set('apiId', 1);
    config.set('apiHash', 'synthetic-api-hash');
    mocks.start.mockRejectedValueOnce(new Error('offline failure'));
    await loginAction.call({ optsWithGlobals: () => ({ profile: 'work', config: configPath }) } as any);
    expect(mocks.destroy).toHaveBeenCalledOnce();
    expect(mocks.error).toHaveBeenCalledWith('offline failure', 'UNKNOWN_ERROR');
    expect(mocks.success).not.toHaveBeenCalled();
    const release = await new SessionStore(dir).acquireLock('work');
    await release();
  });

  it('persists WSS on successful login and uses it on the next direct command', async () => {
    const configPath = join(dir, 'config.json');
    const config = createConfig(configPath);
    config.set('apiId', 1);
    config.set('apiHash', 'synthetic-api-hash');
    await loginAction.call({ optsWithGlobals: () => ({ profile: 'work', config: configPath, transport: 'wss' }) } as any);
    expect(mocks.error).not.toHaveBeenCalled();
    expect(createClientForAuth).toHaveBeenCalledWith(1, 'synthetic-api-hash', 'wss');
    expect(createConfig(configPath).get('profiles.work.transport')).toBe('wss');
    await withAuth({ profile: 'work', config: configPath }, async () => {});
    expect(withClient).toHaveBeenLastCalledWith(expect.objectContaining({ transport: 'wss' }), expect.any(Function), expect.any(Object));
    await withAuth({ profile: 'work', config: configPath, transport: 'tcp' }, async () => {});
    expect(withClient).toHaveBeenLastCalledWith(expect.objectContaining({ transport: 'tcp' }), expect.any(Function), expect.any(Object));
    expect(createConfig(configPath).get('profiles.work.transport')).toBe('wss');
  });

  it('keeps the saved transport and session when a new login fails', async () => {
    const configPath = join(dir, 'config.json');
    const config = createConfig(configPath);
    config.set('apiId', 1);
    config.set('apiHash', 'synthetic-api-hash');
    config.set('profiles.work', { transport: 'tcp' });
    const store = new SessionStore(dir);
    await store.withLock('work', async () => store.saveUnlocked('work', 'previous-session'));
    mocks.start.mockRejectedValueOnce(new Error('offline failure'));
    await loginAction.call({ optsWithGlobals: () => ({ profile: 'work', config: configPath, transport: 'wss' }) } as any);
    expect(createConfig(configPath).get('profiles.work.transport')).toBe('tcp');
    expect(await store.load('work')).toBe('previous-session');
  });
});
