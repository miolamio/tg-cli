import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { createPrompt } from '../../lib/prompt.js';
import { createClientForAuth } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Login action handler for `tg auth login`.
 *
 * Invokes gramjs client.start() with interactive prompts for
 * phone number, verification code, and optional 2FA password.
 * Saves the resulting session string to disk on success.
 */
export async function loginAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile, quiet } = opts;

  const config = createConfig(opts.config);
  const { apiId, apiHash } = getCredentialsOrThrow(config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));
  const prompt = createPrompt();

  let client: Awaited<ReturnType<typeof createClientForAuth>> | undefined;
  let phone = '';

  try {
    client = await createClientForAuth(apiId, apiHash);

    logStatus('Starting authentication...', quiet);

    await client.start({
      phoneNumber: async () => {
        const p = await prompt.ask('Phone number (international format): ');
        phone = p;
        return p;
      },
      phoneCode: async (isCodeViaApp?: boolean) => {
        const msg = isCodeViaApp
          ? 'Code (from Telegram app): '
          : 'Code (from SMS): ';
        return prompt.ask(msg);
      },
      password: async (hint?: string) => {
        const msg = hint
          ? `2FA password (hint: ${hint}): `
          : '2FA password: ';
        return prompt.ask(msg);
      },
      onError: (err: Error) => {
        logStatus(`Auth error: ${err.message}`, quiet);
      },
    });

    // Save session string
    const sessionString = client.session.save() as unknown as string;
    await store.save(profile, sessionString);

    // Update profile in config
    config.set(`profiles.${profile}`, {
      session: sessionString,
      phone,
      created: new Date().toISOString(),
    });

    logStatus('Login successful!', quiet);
    outputSuccess({
      session: sessionString.substring(0, 20) + '...',
      phone,
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  } finally {
    if (client) {
      await client.destroy().catch(() => {});
    }
    prompt.close();
  }
}
