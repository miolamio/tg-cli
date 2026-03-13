import type { Command } from 'commander';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Read all data from stdin as a UTF-8 string.
 * Used when the text argument is "-" (dash placeholder) to support piped input.
 */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf-8').trimEnd();
}

/**
 * Action handler for `tg message edit <chat> <id> <text>`.
 *
 * Edits a text message in any chat. Supports:
 * - Piped stdin input via dash placeholder: echo "new text" | tg message edit <chat> <id> -
 * - gramjs built-in markdown parsing for **bold**, __italic__, `code`, [links](url)
 *
 * Returns the edited message as a serialized MessageItem (includes editDate).
 * Uses translateTelegramError for Telegram-specific permission errors.
 */
export async function messageEditAction(this: Command, chat: string, msgId: string, text: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  // Parse and validate message ID (strict: digits only, positive)
  if (!/^\d+$/.test(msgId)) {
    outputError('Invalid message ID: must be a positive integer', 'INVALID_MESSAGE_ID');
    return;
  }
  const messageId = parseInt(msgId, 10);
  if (messageId <= 0) {
    outputError('Invalid message ID: must be a positive integer', 'INVALID_MESSAGE_ID');
    return;
  }

  // Handle stdin pipe via dash placeholder
  if (text === '-') {
    if (process.stdin.isTTY) {
      outputError('"-" requires piped input. Example: echo "new text" | tg message edit @user 42 -', 'STDIN_REQUIRED');
      return;
    }
    text = await readStdin();
  }

  // Validate non-empty text
  if (!text) {
    outputError('Message text is required', 'EMPTY_MESSAGE');
    return;
  }

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }

      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, chat);

        // gramjs built-in MarkdownParser handles **bold**, __italic__, `code`, [links](url) automatically
        const editedMsg = await client.editMessage(entity, {
          message: messageId,
          text,
        });

        const serialized = serializeMessage(editedMsg as any, (editedMsg as any)._sender);
        outputSuccess(serialized);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
