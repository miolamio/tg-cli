/**
 * Global CLI options available on all commands via optsWithGlobals().
 */
export interface GlobalOptions {
  json: boolean;
  human: boolean;
  verbose: boolean;
  quiet: boolean;
  profile: string;
  config?: string;
}

/**
 * Stored data for a named profile (session + metadata).
 */
export interface ProfileData {
  session: string;
  phone?: string;
  created?: string;
}

/**
 * Configuration schema for the tg-cli config file.
 */
export interface TgConfig {
  apiId?: number;
  apiHash?: string;
  profiles: Record<string, ProfileData>;
}

/**
 * JSON output envelope for successful responses.
 */
export interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

/**
 * JSON output envelope for error responses.
 */
export interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

/**
 * Union type for all JSON output envelopes.
 */
export type OutputEnvelope<T> = SuccessEnvelope<T> | ErrorEnvelope;
