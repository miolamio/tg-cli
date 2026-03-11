import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { resolveCredentials, createConfig } from '../../src/lib/config.js';

describe('createConfig', () => {
  it('returns a Conf instance', () => {
    const config = createConfig();
    expect(config).toBeDefined();
    expect(typeof config.get).toBe('function');
    expect(typeof config.set).toBe('function');
  });
});

describe('resolveCredentials', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns credentials from env vars when set', () => {
    process.env.TG_API_ID = '12345';
    process.env.TG_API_HASH = 'abc123hash';

    const config = createConfig();
    const creds = resolveCredentials(config);

    expect(creds).toEqual({ apiId: 12345, apiHash: 'abc123hash' });
  });

  it('returns credentials from config when env vars are not set', () => {
    delete process.env.TG_API_ID;
    delete process.env.TG_API_HASH;

    const config = createConfig();
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

    const config = createConfig();
    config.clear();

    const creds = resolveCredentials(config);

    expect(creds).toBeNull();
  });

  it('prioritizes env vars over config file values', () => {
    process.env.TG_API_ID = '11111';
    process.env.TG_API_HASH = 'env_hash';

    const config = createConfig();
    config.set('apiId', 22222);
    config.set('apiHash', 'config_hash');

    const creds = resolveCredentials(config);

    expect(creds).toEqual({ apiId: 11111, apiHash: 'env_hash' });

    // Clean up config
    config.clear();
  });
});
