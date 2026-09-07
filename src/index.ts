/**
 * Public API for programmatic use of @miolamio/tg-cli.
 *
 *   import { withAuth, resolveEntity, ErrorCode } from '@miolamio/tg-cli';
 */

export { outputSuccess, outputError, logStatus } from './lib/output.js';
export { createConfig, resolveCredentials, getCredentialsOrThrow } from './lib/config.js';
export { SessionStore } from './lib/session-store.js';
export { withClient } from './lib/client.js';
export { withAuth } from './lib/with-auth.js';
export type { WithAuthOptions } from './lib/with-auth.js';
export { resolveEntity } from './lib/peer.js';
export { ErrorCode } from './lib/error-codes.js';
export { TgError, CredentialError, SessionError, FloodWaitError } from './lib/errors.js';
export { DaemonClient, DaemonRpcError } from './lib/daemon/client.js';
export { DaemonPaths } from './lib/daemon/pid.js';
export { DAEMON_COMMANDS } from './lib/daemon/command-protocol.js';
export type { DaemonCommandOptions, DaemonCommandRequest, DaemonExecutionResult } from './lib/daemon/command-protocol.js';

export type {
  GlobalOptions,
  Transport,
  TgConfig,
  ProfileData,
  OutputEnvelope,
  SuccessEnvelope,
  ErrorEnvelope,
} from './lib/types.js';
