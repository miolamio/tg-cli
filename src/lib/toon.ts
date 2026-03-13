import { encode } from '@toon-format/toon';

/** Fixed TOON encode options per project decisions. */
const TOON_OPTIONS = {
  indent: 2,
  delimiter: '\t' as const,
  keyFolding: 'safe' as const,
} as const;

/**
 * Encode any JSON-serializable value to TOON format.
 * Uses tab delimiter and safe key folding for optimal token efficiency.
 */
export function encodeToon(value: unknown): string {
  return encode(value, TOON_OPTIONS);
}
