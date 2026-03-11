/**
 * Library re-exports for programmatic use of tg-cli.
 *
 * These are the public APIs that can be imported when using
 * @miolamio/tg-cli as a library (not just a CLI binary).
 */

// Output helpers
export { outputSuccess, outputError, logStatus } from './lib/output.js';

// Configuration
export { createConfig, resolveCredentials } from './lib/config.js';

// Session management
export { SessionStore } from './lib/session-store.js';

// Client lifecycle
export { withClient } from './lib/client.js';

// Types
export type {
  GlobalOptions,
  TgConfig,
  ProfileData,
  OutputEnvelope,
} from './lib/types.js';
