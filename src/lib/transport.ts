import type Conf from 'conf';
import type { TgConfig, Transport } from './types.js';
import { TgError } from './errors.js';
import { ErrorCode } from './error-codes.js';

/** Validate transport names without reflecting arbitrary config values. */
export function validateTransport(value: unknown): Transport {
  if (value === 'tcp' || value === 'wss') return value;
  throw new TgError('Transport must be tcp or wss', ErrorCode.INVALID_OPTIONS);
}

/** Explicit CLI choice overrides the profile; existing profiles default to TCP. */
export function resolveTransport(config: Conf<TgConfig>, profile: string, explicit?: Transport): Transport {
  return validateTransport(explicit ?? config.get(`profiles.${profile}.transport`) ?? 'tcp');
}
