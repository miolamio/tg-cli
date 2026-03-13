import type { Command } from 'commander';
import { Api } from 'telegram';
import { generateRandomLong } from 'telegram/Helpers.js';
import { createConfig, getCredentialsOrThrow } from '../../lib/config.js';
import { withClient } from '../../lib/client.js';
import { SessionStore } from '../../lib/session-store.js';
import { outputSuccess, outputError } from '../../lib/output.js';
import { translateTelegramError } from '../../lib/errors.js';
import { resolveEntity } from '../../lib/peer.js';
import { serializeMessage } from '../../lib/serialize.js';
import type { GlobalOptions } from '../../lib/types.js';

/**
 * Options for the poll subcommand.
 */
interface PollOpts {
  question: string;
  option: string[];
  quiz?: boolean;
  correct?: string;
  solution?: string;
  multiple?: boolean;
  public?: boolean;
  closeIn?: string;
}

/**
 * Validate poll options before sending to Telegram API.
 * Returns null if valid, or { error, code } describing the first validation failure.
 *
 * Fail-fast: reports first error found.
 */
export function validatePollOpts(opts: Pick<PollOpts, 'question' | 'option' | 'quiz' | 'correct' | 'solution' | 'multiple' | 'closeIn'>): { error: string; code: string } | null {
  // Question validation
  if (!opts.question || opts.question.trim().length === 0) {
    return { error: 'Poll question cannot be empty', code: 'EMPTY_QUESTION' };
  }
  if (opts.question.length > 300) {
    return { error: 'Question too long (max 300 chars)', code: 'QUESTION_TOO_LONG' };
  }

  // Options count validation
  if (opts.option.length < 2) {
    return { error: 'Poll requires 2-10 options', code: 'TOO_FEW_OPTIONS' };
  }
  if (opts.option.length > 10) {
    return { error: 'Poll requires 2-10 options', code: 'TOO_MANY_OPTIONS' };
  }

  // Individual option validation
  for (const opt of opts.option) {
    if (!opt || opt.trim().length === 0) {
      return { error: 'Poll option cannot be empty', code: 'EMPTY_OPTION' };
    }
    if (opt.length > 100) {
      return { error: 'Option too long (max 100 chars)', code: 'OPTION_TOO_LONG' };
    }
  }

  // Duplicate detection
  const seen = new Set<string>();
  for (const opt of opts.option) {
    if (seen.has(opt)) {
      return { error: `Duplicate option text: '${opt}'`, code: 'DUPLICATE_OPTION' };
    }
    seen.add(opt);
  }

  // Quiz constraints
  if (opts.quiz && !opts.correct) {
    return { error: 'Quiz mode requires --correct <index>', code: 'QUIZ_MISSING_CORRECT' };
  }
  if (opts.solution && !opts.quiz) {
    return { error: '--solution requires --quiz mode', code: 'SOLUTION_WITHOUT_QUIZ' };
  }
  if (opts.quiz && opts.multiple) {
    return { error: 'Quiz mode cannot use --multiple', code: 'QUIZ_MULTIPLE_CONFLICT' };
  }

  // --correct range validation
  if (opts.correct) {
    const idx = parseInt(opts.correct, 10);
    if (isNaN(idx) || idx < 1 || idx > opts.option.length) {
      return { error: `Correct index must be 1-${opts.option.length}`, code: 'INVALID_CORRECT_INDEX' };
    }
  }

  // --close-in validation
  if (opts.closeIn) {
    const seconds = parseInt(opts.closeIn, 10);
    if (isNaN(seconds) || seconds <= 0) {
      return { error: 'Close-in seconds must be > 0', code: 'INVALID_CLOSE_IN' };
    }
  }

  return null;
}

/**
 * Action handler for `tg message poll <chat>`.
 *
 * Sends a poll to a chat with full configuration support:
 * basic polls, quiz mode, multiple choice, anonymous/public, auto-close timer.
 *
 * Validates all options client-side before making the API call.
 * Returns serialized MessageItem via outputSuccess on success.
 */
export async function messagePollAction(this: Command, chat: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & PollOpts;
  const { profile } = opts;

  // Client-side validation
  const validation = validatePollOpts(opts);
  if (validation) {
    outputError(validation.error, validation.code);
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

        // Build poll answers
        const answers = opts.option.map((text, i) => new Api.PollAnswer({
          text: new Api.TextWithEntities({ text, entities: [] }),
          option: Buffer.from(String(i)),
        }));

        const closeInSeconds = opts.closeIn ? parseInt(opts.closeIn, 10) : undefined;

        const poll = new Api.Poll({
          id: generateRandomLong(),
          question: new Api.TextWithEntities({ text: opts.question, entities: [] }),
          answers,
          quiz: opts.quiz || undefined,
          publicVoters: opts.public || undefined,
          multipleChoice: opts.multiple || undefined,
          closePeriod: closeInSeconds || undefined,
        });

        const correctIdx = opts.correct ? parseInt(opts.correct, 10) - 1 : undefined;
        const inputMedia = new Api.InputMediaPoll({
          poll,
          correctAnswers: opts.quiz && correctIdx !== undefined
            ? [Buffer.from(String(correctIdx))]
            : undefined,
          solution: opts.solution || undefined,
          solutionEntities: opts.solution ? [] : undefined,
        });

        const sentMsg = await client.sendFile(entity, { file: inputMedia });
        const serialized = serializeMessage(sentMsg as any);
        outputSuccess(serialized);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
