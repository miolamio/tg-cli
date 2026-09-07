import type { Command } from 'commander';
import { LogLevel } from 'telegram/extensions/Logger.js';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { resolveTransport } from '../../lib/transport.js';
import { createPrompt } from '../../lib/prompt.js';
import { createClientForAuth } from '../../lib/client.js';
import { connectOrThrow } from '../../lib/connect.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError, logStatus } from '../../lib/output.js';
import { formatError } from '../../lib/errors.js';
import { ErrorCode } from '../../lib/error-codes.js';
import { refuseDirectConnectIfDaemon } from '../../lib/daemon/guard.js';
import { showLoginBanner } from '../../lib/branding.js';
import { validatePhone } from '../../lib/validate.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Login action handler for `tg auth login`.
 *
 * Requires an interactive terminal (TTY). Fails fast with a structured
 * error when stdin is not a TTY (CI, piped input, agent automation).
 *
 * Invokes gramjs client.start() with interactive prompts for
 * phone number, verification code, and optional 2FA password.
 * Saves the resulting session string to disk on success.
 */
export async function loginAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & { client?: string; phone?: string };
  const { profile, quiet } = opts;

  if (await refuseDirectConnectIfDaemon(opts)) return;

  // Fail fast when not running in an interactive terminal
  if (!process.stdin.isTTY) {
    outputError(
      'Interactive login requires a terminal (TTY). Use `tg session import` for non-interactive auth.',
      ErrorCode.NOT_INTERACTIVE,
    );
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));
  try {
    await store.withLock(profile, async () => {
      const prompt = createPrompt();
      let client: Awaited<ReturnType<typeof createClientForAuth>> | undefined;
      let phone = '';
      const ask = async (question: string, secret = false): Promise<string> => {
        // Only this client's SDK logger is paused; restore it even on rejection.
        const logger = client?.logger;
        const previousLevel = logger?.logLevel;
        logger?.setLevel(LogLevel.NONE);
        try { return await (secret ? prompt.askSecret(question) : prompt.ask(question)); }
        finally { if (logger && previousLevel !== undefined) logger.setLevel(previousLevel); }
      };
      try {
        showLoginBanner(quiet);
        // Collect the phone before credential fetching, connect(), or the SDK's
        // authorization check can block or fill the terminal with diagnostics.
        phone = validatePhone(opts.phone ?? await ask('Phone number (international format): '));
        const { apiId, apiHash } = await getCredentialsOrThrow(config, opts.client, profile);
        const transport = resolveTransport(config, profile, opts.transport);
        client = await createClientForAuth(apiId, apiHash, transport);

        logStatus('Starting authentication...', quiet);

        await connectOrThrow(client);
        logStatus('Connected. Starting sign-in...', quiet);
        let phoneRequests = 0;
        await client.start({
          // A literal --phone makes gramjs propagate sendCode failures instead
          // of repeatedly submitting the same invalid phone via a callback.
          phoneNumber: opts.phone !== undefined ? phone : async () => {
            if (phoneRequests++ > 0) phone = validatePhone(await ask('Phone number (international format): '));
            logStatus('Requesting login code...', quiet);
            return phone;
          },
          phoneCode: async (isCodeViaApp?: boolean) => {
            const msg = isCodeViaApp
              ? 'Code (from Telegram app): '
              : 'Code (from SMS): ';
            return ask(msg);
          },
          password: async (hint?: string) => {
            const msg = hint
              ? `2FA password (hint: ${hint}): `
              : '2FA password: ';
            return ask(msg, true);
          },
          onError: (err: Error) => {
            logStatus(`Auth error: ${err.message}`, quiet);
          },
        });

        // Save session string
        const sessionString = client.session.save() as unknown as string;
        store.saveUnlocked(profile, sessionString);

        // Update profile in config
        const clientName = opts.client ?? config.get(`profiles.${profile}.client`);
        config.set(`profiles.${profile}`, {
          ...(clientName ? { client: clientName } : {}),
          transport,
          phone,
          created: new Date().toISOString(),
        });

        logStatus('Login successful!', quiet);
        outputSuccess({
          loggedIn: true,
          profile,
          phone,
        });
      } finally {
        if (client) await client.destroy().catch(() => {});
        prompt.close();
      }
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code ?? ErrorCode.UNKNOWN_ERROR);
  }
}
