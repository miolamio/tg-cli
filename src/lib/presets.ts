import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

const OPENTELE_URL = 'https://raw.githubusercontent.com/thedemons/opentele/main/src/api.py';

/** Cache TTL: 30 days in milliseconds. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Known test API IDs that must never be used in production. */
export const TEST_API_IDS = new Set([17349]);

/** Map opentele Python class names to user-friendly preset names. */
export const PRESET_NAME_MAP: Record<string, string> = {
  TelegramDesktop: 'desktop',
  TelegramAndroid: 'android',
  TelegramAndroidX: 'android-x',
  TelegramIOS: 'ios',
  TelegramMacOS: 'macos',
  TelegramWeb_Z: 'web-z',
  TelegramWeb_K: 'web-k',
  Webogram: 'webogram',
};

export interface PresetCredentials {
  apiId: number;
  apiHash: string;
}

interface CachedPreset extends PresetCredentials {
  fetchedAt: string;
}

/**
 * Parse opentele's api.py content and extract API credentials.
 * Filters out known test API IDs.
 *
 * @returns Map of preset name to credentials
 */
export function parseApiPy(content: string): Map<string, PresetCredentials> {
  const result = new Map<string, PresetCredentials>();

  // Match: class ClassName(APIData): ... api_id = N ... api_hash = "..."
  const classRegex = /class\s+(\w+)\(APIData\):[^]*?api_id\s*=\s*(\d+)[^]*?api_hash\s*=\s*"([a-f0-9]+)"/g;

  let match;
  while ((match = classRegex.exec(content)) !== null) {
    const [, className, apiIdStr, apiHash] = match;
    const apiId = parseInt(apiIdStr, 10);

    // Filter test keys
    if (TEST_API_IDS.has(apiId)) continue;

    const presetName = PRESET_NAME_MAP[className] ?? className.toLowerCase();
    result.set(presetName, { apiId, apiHash });
  }

  return result;
}

/**
 * Fetch presets from opentele GitHub and cache them in config.
 *
 * @param config - Conf instance to store cached presets
 * @returns Map of preset name to credentials
 * @throws TgError with FETCH_FAILED if network request fails and no cache exists
 */
export async function fetchAndCachePresets(
  config: { get: (key: string) => unknown; set: (key: string, value: unknown) => void },
): Promise<Map<string, PresetCredentials>> {
  let content: string;

  try {
    const response = await fetch(OPENTELE_URL);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    content = await response.text();
  } catch (err) {
    // Try stale cache as fallback
    const cached = config.get('presets') as Record<string, CachedPreset> | undefined;
    if (cached && Object.keys(cached).length > 0) {
      process.stderr.write('Warning: Failed to fetch fresh presets, using cached values\n');
      const map = new Map<string, PresetCredentials>();
      for (const [name, data] of Object.entries(cached)) {
        map.set(name, { apiId: data.apiId, apiHash: data.apiHash });
      }
      return map;
    }

    throw new TgError(
      `Failed to fetch client presets. Check internet connection: ${(err as Error).message}`,
      ErrorCode.FETCH_FAILED,
    );
  }

  const presets = parseApiPy(content);

  // Cache with timestamp
  const cacheObj: Record<string, CachedPreset> = {};
  for (const [name, creds] of presets) {
    cacheObj[name] = { ...creds, fetchedAt: new Date().toISOString() };
  }
  config.set('presets', cacheObj);

  return presets;
}

/**
 * Get credentials for a specific client preset.
 * Uses cache if fresh, fetches otherwise.
 *
 * @throws TgError with UNKNOWN_PRESET if preset name is not found
 * @throws TgError with FETCH_FAILED if fetch fails and no cache
 */
export async function getPreset(
  config: { get: (key: string) => unknown; set: (key: string, value: unknown) => void },
  name: string,
): Promise<PresetCredentials> {
  // Check cache first
  const cached = config.get('presets') as Record<string, CachedPreset> | undefined;
  if (cached && cached[name]) {
    const entry = cached[name];
    const age = Date.now() - new Date(entry.fetchedAt).getTime();
    if (age < CACHE_TTL_MS) {
      return { apiId: entry.apiId, apiHash: entry.apiHash };
    }
  }

  // Fetch fresh
  const presets = await fetchAndCachePresets(config);
  const preset = presets.get(name);

  if (!preset) {
    const available = [...presets.keys()].join(', ');
    throw new TgError(
      `Unknown client "${name}". Available: ${available}`,
      ErrorCode.UNKNOWN_PRESET,
    );
  }

  return preset;
}

/**
 * List all available presets.
 * Uses cache if fresh, fetches otherwise.
 */
export async function listPresets(
  config: { get: (key: string) => unknown; set: (key: string, value: unknown) => void },
): Promise<Map<string, PresetCredentials>> {
  const cached = config.get('presets') as Record<string, CachedPreset> | undefined;
  if (cached && Object.keys(cached).length > 0) {
    const first = Object.values(cached)[0];
    const age = Date.now() - new Date(first.fetchedAt).getTime();
    if (age < CACHE_TTL_MS) {
      const map = new Map<string, PresetCredentials>();
      for (const [name, data] of Object.entries(cached)) {
        map.set(name, { apiId: data.apiId, apiHash: data.apiHash });
      }
      return map;
    }
  }

  return fetchAndCachePresets(config);
}
