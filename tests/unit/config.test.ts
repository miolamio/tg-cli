import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, statSync, chmodSync } from 'node:fs';
import * as fs from 'node:fs';
import * as output from '../../src/lib/output.js';
import { resolveCredentials, createConfig, getCredentialsOrThrow } from '../../src/lib/config.js';

vi.mock('node:fs', async original => {
  const fs = await original<typeof import('node:fs')>();
  return { ...fs, chmodSync: vi.fn(fs.chmodSync) };
});

describe('createConfig', () => {
  it('keeps config private after subsequent writes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-config-mode-'));
    try {
      const config = createConfig(join(dir, 'config.json'));
      chmodSync(config.path, 0o644);
      const reopened = createConfig(config.path);
      expect(statSync(config.path).mode & 0o777).toBe(0o600);
      reopened.set('profiles.example', { client: 'desktop' });
      expect(statSync(config.path).mode & 0o777).toBe(0o600);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it('can read a config when best-effort chmod is denied', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tg-config-readonly-'));
    const config = createConfig(join(dir, 'config.json'));
    vi.mocked(fs.chmodSync).mockImplementationOnce(() => { throw Object.assign(new Error('denied'), { code: 'EPERM' }); });
    try { expect(createConfig(config.path).get('profiles')).toEqual({}); }
    finally { rmSync(dir, { recursive: true, force: true }); }
  });
  it('returns a Conf instance', () => {
    const config = createConfig();
    expect(config).toBeDefined();
    expect(typeof config.get).toBe('function');
    expect(typeof config.set).toBe('function');
  });

  it('default config path uses telegram-cli project name', () => {
    const config = createConfig();
    expect(config.path).toContain('telegram-cli');
  });

  it('uses custom config path when provided', () => {
    const tmpDir = join(tmpdir(), `tg-cfg-test-${randomUUID()}`);
    const customPath = join(tmpDir, 'custom.json');

    const config = createConfig(customPath);
    expect(config.path).toBe(customPath);

    // Clean up
    config.clear();
    try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  });
});

describe('resolveCredentials', () => {
  let configDir: string;
  beforeEach(() => { configDir = mkdtempSync(join(tmpdir(), 'tg-creds-test-')); });
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    rmSync(configDir, { recursive: true, force: true });
  });

  it('warns when environment credentials override an imported Desktop profile', async () => {
    const config = createConfig(join(configDir, 'config.json'));
    config.set('profiles.imported', { client: 'desktop', importedFrom: 'desktop' });
    config.set('profiles.normal', { client: 'desktop' });
    process.env.TG_API_ID = '123'; process.env.TG_API_HASH = 'synthetic-env-secret';
    const log = vi.spyOn(output, 'logStatus').mockImplementation(() => {});
    try {
      await expect(getCredentialsOrThrow(config, undefined, 'imported')).resolves.toEqual({ apiId: 123, apiHash: 'synthetic-env-secret' });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('env -u TG_API_ID -u TG_API_HASH'));
      expect(JSON.stringify(log.mock.calls)).not.toContain('synthetic-env-secret');
      log.mockClear();
      await getCredentialsOrThrow(config, undefined, 'normal');
      expect(log).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });

  it('returns credentials from env vars when set', () => {
    process.env.TG_API_ID = '12345';
    process.env.TG_API_HASH = 'abc123hash';

    const config = createConfig(join(configDir, 'config.json'));
    const creds = resolveCredentials(config);

    expect(creds).toEqual({ apiId: 12345, apiHash: 'abc123hash' });
  });

  it('returns credentials from config when env vars are not set', () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;

    const config = createConfig(join(configDir, 'config.json'));
    config.set('apiId', 99999);
    config.set('apiHash', 'config_hash_value');

    const creds = resolveCredentials(config);

    expect(creds).toEqual({ apiId: 99999, apiHash: 'config_hash_value' });

    // Clean up config
    config.clear();
  });

  it('returns null when neither env vars nor config have credentials', () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;

    const config = createConfig(join(configDir, 'config.json'));
    config.clear();

    const creds = resolveCredentials(config);

    expect(creds).toBeNull();
  });

  it('getCredentialsOrThrow rejects non-numeric TG_API_ID', async () => {
    process.env.TG_API_ID = 'foo';
    process.env.TG_API_HASH = 'abc';
    const config = createConfig(join(configDir, 'config.json'));
    await expect(getCredentialsOrThrow(config)).rejects.toThrow(/positive integer/);
  });

  it('getCredentialsOrThrow does not mention tg config set', async () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;
    const config = createConfig(join(configDir, 'config.json'));
    config.clear();
    try {
      await getCredentialsOrThrow(config);
      throw new Error('expected throw');
    } catch (err: any) {
      expect(err.message).toContain('config file');
      expect(err.message).not.toContain('tg config set');
    }
  });

  it('prioritizes env vars over config file values', () => {
    process.env.TG_API_ID = '11111';
    process.env.TG_API_HASH = 'env_hash';

    const config = createConfig(join(configDir, 'config.json'));
    config.set('apiId', 22222);
    config.set('apiHash', 'config_hash');

    const creds = resolveCredentials(config);

    expect(creds).toEqual({ apiId: 11111, apiHash: 'env_hash' });

    // Clean up config
    config.clear();
  });

  it('loads each saved profile preset after a new config instance is created', async () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;
    const path = join(configDir, 'config.json');
    const config = createConfig(path);
    config.set('presets', {
      desktop: { apiId: 1, apiHash: 'desktop-synthetic', fetchedAt: new Date().toISOString() },
      android: { apiId: 2, apiHash: 'android-synthetic', fetchedAt: new Date().toISOString() },
    });
    config.set('profiles', {
      work: { client: 'desktop', created: '2026-09-06T00:00:00Z' },
      personal: { client: 'android', created: '2026-09-06T00:00:00Z' },
    });
    const reloaded = createConfig(path);
    await expect(getCredentialsOrThrow(reloaded, undefined, 'work')).resolves.toEqual({ apiId: 1, apiHash: 'desktop-synthetic' });
    await expect(getCredentialsOrThrow(reloaded, undefined, 'personal')).resolves.toEqual({ apiId: 2, apiHash: 'android-synthetic' });
    await expect(getCredentialsOrThrow(reloaded, undefined, 'missing')).rejects.toMatchObject({ code: 'CREDENTIAL_ERROR' });
    await expect(getCredentialsOrThrow(reloaded, 'android', 'work')).resolves.toMatchObject({ apiId: 2 });
    process.env.TG_API_ID = '3';
    process.env.TG_API_HASH = 'environment-synthetic';
    await expect(getCredentialsOrThrow(reloaded, 'android', 'work')).resolves.toEqual({ apiId: 3, apiHash: 'environment-synthetic' });
  });

  it('keeps config credentials usable for older profiles without a preset', async () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;
    const config = createConfig(join(configDir, 'config.json'));
    config.set('apiId', 123);
    config.set('apiHash', 'synthetic');
    config.set('profiles', { default: { created: '2026-09-06T00:00:00Z' } });
    await expect(getCredentialsOrThrow(config, undefined, 'default')).resolves.toEqual({ apiId: 123, apiHash: 'synthetic' });
  });

  it.each(['12junk', '1.5', '-2', '0', '9007199254740992'])('rejects malformed TG_API_ID=%s', async (value) => {
    process.env.TG_API_ID = value;
    process.env.TG_API_HASH = 'synthetic';
    await expect(getCredentialsOrThrow(createConfig(join(configDir, 'config.json')))).rejects.toMatchObject({ code: 'CREDENTIAL_ERROR' });
  });
});
