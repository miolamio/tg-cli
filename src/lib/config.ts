import Conf from 'conf';
import { dirname, basename, extname } from 'node:path';
import type { TgConfig } from './types.js';
import { CredentialError, TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/** Telegram API IDs are positive TL int values; reject partial numeric strings. */
function parseApiId(value: unknown, source: string): number {
  const parsed = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isSafeInteger(parsed) || parsed <= 0 || parsed > 2_147_483_647) {
    throw new CredentialError(`${source} must be a positive integer within Telegram's 32-bit range`);
  }
  return parsed;
}

/**
 * Create a Conf instance for tg-cli configuration.
 * Default path: ~/.config/tg-cli/config.json (XDG via projectName).
 * When configPath is provided (--config flag), uses that exact file path.
 *
 * @param configPath - Optional custom config file path from --config flag
 */
export function createConfig(configPath?: string): Conf<TgConfig> {
  try {
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
  } catch {
    // Do not expose malformed JSON contents: config files contain credentials.
    throw new TgError('Cannot read configuration. Check that the config file is accessible and contains valid JSON.', ErrorCode.CONFIG_ERROR);
  }
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

  const rawApiId = envApiId || config.get('apiId');
  const apiId = rawApiId == null ? undefined : parseApiId(rawApiId, envApiId ? 'TG_API_ID' : 'Config apiId');
  const apiHash = envApiHash ?? config.get('apiHash');

  if (apiHash != null && typeof apiHash !== 'string') {
    throw new CredentialError('API hash must be a string');
  }
  if (apiId && apiHash) {
    return { apiId, apiHash };
  }

  return null;
}

/**
 * Resolve API credentials or throw a helpful error.
 * Provides a clear message with link to https://my.telegram.org/apps.
 *
 * When clientName is provided, fetches credentials from opentele presets
 * (runtime fetch, no keys stored in source). Env vars still take priority.
 * Otherwise, a selected profile's saved client preset precedes global config
 * credentials. Older profiles without a client name retain config fallback.
 */
export async function getCredentialsOrThrow(
  config: Conf<TgConfig>,
  clientName?: string,
  profile?: string,
): Promise<{ apiId: number; apiHash: string }> {
  // Env vars always take priority
  const envApiId = process.env.TG_API_ID;
  const envApiHash = process.env.TG_API_HASH;
  if (envApiId && envApiHash) {
    const apiId = parseApiId(envApiId, 'TG_API_ID');
    return { apiId, apiHash: envApiHash };
  }

  // Client preset (fetched at runtime from opentele)
  const presetName = clientName ?? (profile ? config.get(`profiles.${profile}.client`) as string | undefined : undefined);
  if (presetName) {
    const { getPreset } = await import('./presets.js');
    return getPreset(config, presetName);
  }

  // Config file values
  const creds = resolveCredentials(config);
  if (!creds) {
    throw new CredentialError(
      'API credentials required. Get them at https://my.telegram.org/apps\n' +
        'Set TG_API_ID and TG_API_HASH environment variables, or put apiId/apiHash in the config file.\n' +
        'Or use a preset: tg auth login --client desktop',
    );
  }
  return creds;
}
