import type { Command } from 'commander';
import { createConfig } from '../../lib/config.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import type { GlobalOptions, ProfileData } from '../../lib/types.js';

/**
 * Export action handler for `tg session export`.
 *
 * By default, outputs the raw session string to stdout (ideal for piping).
 * When --json is explicitly passed on the CLI, outputs a JSON envelope
 * with session string plus metadata (phone, created).
 *
 * Uses Commander's getOptionValueSource to detect explicit --json
 * vs the app default (json: true by default).
 */
export async function exportAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  const sessionString = await store.load(profile);

  if (!sessionString) {
    outputError(`No session found for profile '${profile}'`, 'NO_SESSION');
    return;
  }

  // Check if --json was explicitly passed on the CLI vs being the app default.
  // Export's special behavior: raw string for piping unless user explicitly wants JSON.
  const jsonSource = this.parent?.getOptionValueSource('json');
  const jsonExplicit = jsonSource === 'cli';

  if (jsonExplicit) {
    // JSON envelope mode: include metadata
    const profileData = config.get(`profiles.${profile}`) as ProfileData | undefined;
    outputSuccess({
      session: sessionString,
      phone: profileData?.phone,
      created: profileData?.created,
    });
  } else {
    // Raw string mode (default for export): ideal for piping
    logStatus('Exporting session...', quiet);
    process.stdout.write(sessionString + '\n');
  }
}
