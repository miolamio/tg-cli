import Conf from 'conf';
import { dirname, basename, extname } from 'node:path';
import type { TgConfig } from './types.js';
import { CredentialError } from './errors.js';

/**
 * Create a Conf instance for tg-cli configuration.
 * Default path: ~/.config/tg-cli/config.json (XDG via projectName).
 * When configPath is provided (--config flag), uses that exact file path.
 *
 * @param configPath - Optional custom config file path from --config flag
 */
export function createConfig(configPath?: string): Conf<TgConfig> {
  if (configPath) {
    return new Conf<TgConfig>({
      projectName: 'tg-cli',
      configName: basename(configPath, extname(configPath)),
      cwd: dirname(configPath),
      defaults: {
        profiles: {},
      },
    });
  }
  return new Conf<TgConfig>({
    projectName: 'telegram-cli',
    configName: 'config',
    defaults: {
      profiles: {},
    },
  });
}

/**
 * Resolve API credentials from environment variables or config file.
 * Priority: env vars (TG_API_ID, TG_API_HASH) > config file values.
 *
 * @returns Credentials object or null if neither source has them.
 */
export function resolveCredentials(
  config: Conf<TgConfig>,
): { apiId: number; apiHash: string } | null {
  const envApiId = process.env.TG_API_ID;
  const envApiHash = process.env.TG_API_HASH;

  const apiId = envApiId ? parseInt(envApiId, 10) : config.get('apiId');
  const apiHash = envApiHash ?? config.get('apiHash');

  if (apiId && apiHash) {
    return { apiId: apiId as number, apiHash: apiHash as string };
  }

  return null;
}

/**
 * Resolve API credentials or throw a helpful error.
 * Provides a clear message with link to https://my.telegram.org/apps.
 *
 * When clientName is provided, fetches credentials from opentele presets
 * (runtime fetch, no keys stored in source). Env vars still take priority.
 */
export async function getCredentialsOrThrow(
  config: Conf<TgConfig>,
  clientName?: string,
): Promise<{ apiId: number; apiHash: string }> {
  // Env vars always take priority
  const envApiId = process.env.TG_API_ID;
  const envApiHash = process.env.TG_API_HASH;
  if (envApiId && envApiHash) {
    return { apiId: parseInt(envApiId, 10), apiHash: envApiHash };
  }

  // Client preset (fetched at runtime from opentele)
  if (clientName) {
    const { getPreset } = await import('./presets.js');
    return getPreset(config, clientName);
  }

  // Config file values
  const creds = resolveCredentials(config);
  if (!creds) {
    throw new CredentialError(
      'API credentials required. Get them at https://my.telegram.org/apps\n' +
        'Set TG_API_ID and TG_API_HASH environment variables, or configure via: tg config set apiId <id>\n' +
        'Or use a preset: tg auth login --client desktop',
    );
  }
  return creds;
}
