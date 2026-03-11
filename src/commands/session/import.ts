import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Read all data from stdin until EOF.
 * Used when session string is piped via stdin instead of passed as argument.
 */
function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', reject);
  });
}

/**
 * Import action handler for `tg session import [session]`.
 *
 * Accepts a session string as a positional argument, or reads from stdin
 * when piped. Saves the session to the SessionStore and updates the
 * config profile with the session string and creation timestamp.
 */
export async function importAction(
  this: Command,
  sessionString: string | undefined,
): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;

  let session = sessionString;

  if (!session) {
    // Check if stdin is piped (not a TTY)
    if (process.stdin.isTTY) {
      outputError(
        'Provide session string as argument or pipe via stdin',
        'NO_INPUT',
      );
      return;
    }

    logStatus('Reading session from stdin...', quiet);
    session = await readStdin();
  }

  // Trim and validate
  session = session.trim();
  if (!session) {
    outputError(
      'Provide session string as argument or pipe via stdin',
      'NO_INPUT',
    );
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  // Save session to file store
  await store.save(profile, session);

  // Update config profile with metadata
  config.set(`profiles.${profile}`, {
    session,
    created: new Date().toISOString(),
  });

  logStatus('Session imported successfully!', quiet);
  outputSuccess({ imported: true, profile });
}
