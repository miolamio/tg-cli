# Phase 10: Polls - Research

**Researched:** 2026-03-13
**Domain:** Telegram Poll API via gramjs (MTProto), Commander CLI options, message serialization
**Confidence:** HIGH

## Summary

Sending polls in gramjs requires constructing an `Api.InputMediaPoll` containing an `Api.Poll` with `Api.PollAnswer[]` options, then sending via `client.sendFile(entity, { file: inputMediaPoll })`. The `sendFile` function detects `InputMedia` subclasses and routes them through `messages.SendMedia`, returning a standard `Api.Message`. The returned message's `.media` is `Api.MessageMediaPoll` containing both the poll definition and results, which can be extracted during serialization.

The poll option bytes (`PollAnswer.option`) are arbitrary unique identifiers (1-100 bytes); the standard pattern is sequential `Buffer.from('0')`, `Buffer.from('1')`, etc. Quiz mode requires `correctAnswers` in `InputMediaPoll` to reference the correct option's bytes. The `close_period` field (5-600 seconds) is the relative duration; the API rejects values outside this range. The poll `id` field is a `BigInteger` (long) that must be generated client-side via `helpers.generateRandomLong()`.

**Primary recommendation:** Use `client.sendFile()` with `Api.InputMediaPoll` (same pattern as dice/contact sending in gramjs). Extend `serializeMessage()` to detect `MessageMediaPoll` and extract a structured `poll` field. Add a `formatPoll()` function for the expanded multi-line human-readable display.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Poll command is a subcommand under message: `tg message poll <chat>` -- not a separate top-level command
- Returns full MessageItem via `serializeMessage()` -- same as send/edit commands
- Extend serialization with a `poll` field in MessageItem containing structured poll data: question, options[], isQuiz, isPublic, isMultiple, closeDate, correctOption, solution
- The `poll` field appears on ALL poll messages everywhere (history, get, pinned) -- not just the poll command response
- Vote counts included in the poll field structure (per-option voters count, totalVoters)
- Expanded multi-line format: `📊 Poll: {question}\n  1. {option1}\n  2. {option2}\n  {tags}`
- Config tags on last line: Quiz / Public / Multiple / Closes in {N}s (only show applicable tags)
- Quiz polls mark correct answer with checkmark: `2. Paris ✓`
- Polls with votes show counts: `1. Red (5 votes)`
- Closed polls show "Closed" tag and total voter count
- Same expanded format used in history/get, not just send confirmation
- Fail-fast: report first validation error and exit
- `--question` required (non-empty)
- 2-10 options required
- Option text <= 100 chars per option
- Question text <= 300 chars (note: Telegram API limit is 255, but user decided 300 -- API will reject if > 255)
- `--correct` required when `--quiz` is set
- `--correct` index must be in range (1-based indexing)
- `--solution` requires `--quiz` mode -- error otherwise
- `--multiple` conflicts with `--quiz` -- error
- `--close-in` must be > 0 seconds (no client-side max -- let Telegram API reject)
- Duplicate option text: rejected with error "Duplicate option text: '{text}'"
- Whitespace-only or empty options: rejected with error (no silent trimming)
- Empty `--question`: rejected with error
- `--close-in` seconds only -- no human-friendly duration parsing
- `--option` is a repeatable flag: `--option "Red" --option "Blue" --option "Green"`
- `--correct` uses 1-based indexing (matches numbered display)

### Claude's Discretion
- gramjs API method for sending polls (RESOLVED: use `client.sendFile()` with `Api.InputMediaPoll`)
- Exact poll serialization field structure and naming
- Vote count field inclusion (per-option or summary) in serialization
- Error code naming conventions for validation errors
- How `--close-in` converts to Telegram's closeDate/closePeriod (RESOLVED: use `closePeriod` directly -- it's seconds from creation)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| WRITE-13 | User can send polls (`tg message poll <chat>`) with quiz mode, multiple choice, anonymous/public, auto-close options | gramjs `Api.InputMediaPoll` via `client.sendFile()` supports all poll features; serialization extension for `MessageMediaPoll`; Commander repeatable `--option` flag; comprehensive client-side validation before API call |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | `Api.InputMediaPoll`, `Api.Poll`, `Api.PollAnswer`, `client.sendFile()` | Already in project; native MTProto poll support |
| commander | ^14.0.3 | CLI command registration, repeatable `--option` flag | Already in project; built-in support for repeatable options via custom parser |
| big-integer | (gramjs dep) | `generateRandomLong()` for poll ID generation | gramjs internal dependency, available via `telegram/Helpers` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | ^1.1.1 | Colored poll format output | Human-readable poll display |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `client.sendFile()` | `client.invoke(new Api.messages.SendMedia(...))` | Raw invoke works but sendFile handles entity resolution and message parsing; sendFile is the established pattern in this codebase |

**Installation:** No new packages needed. All required libraries already installed.

## Architecture Patterns

### Recommended Project Structure
```
src/
├── commands/message/
│   ├── index.ts          # ADD poll subcommand registration
│   └── poll.ts           # NEW: poll action handler + validation
├── lib/
│   ├── serialize.ts      # MODIFY: add poll extraction to serializeMessage()
│   ├── types.ts          # MODIFY: add PollData, PollOption interfaces; extend MessageItem
│   ├── format.ts         # MODIFY: add formatPoll(), update formatData() dispatch
│   ├── fields.ts         # MODIFY: add 'poll' to field paths awareness
│   └── errors.ts         # MODIFY: add poll-specific error translations
tests/
├── unit/
│   ├── message-poll.test.ts    # NEW: poll command tests
│   ├── serialize.test.ts       # MODIFY: add poll serialization tests
│   └── format.test.ts          # MODIFY: add poll format tests
```

### Pattern 1: Poll Command via sendFile with InputMediaPoll
**What:** Construct `Api.InputMediaPoll` containing `Api.Poll` and pass to `client.sendFile(entity, { file: pollMedia })`
**When to use:** Always -- this is how gramjs sends any InputMedia type
**Example:**
```typescript
// Source: gramjs node_modules/telegram/client/uploads.js lines 175-194, 484-497
// sendFile detects InputMedia subclass and calls messages.SendMedia
import { Api } from 'telegram';
import { generateRandomLong } from 'telegram/Helpers.js';

const answers = options.map((text, i) => new Api.PollAnswer({
  text: new Api.TextWithEntities({ text, entities: [] }),
  option: Buffer.from([i]),  // unique byte identifier per option
}));

const poll = new Api.Poll({
  id: generateRandomLong(),
  question: new Api.TextWithEntities({ text: question, entities: [] }),
  answers,
  quiz: isQuiz || undefined,
  publicVoters: isPublic || undefined,
  multipleChoice: isMultiple || undefined,
  closePeriod: closeIn || undefined,
});

const inputMedia = new Api.InputMediaPoll({
  poll,
  correctAnswers: isQuiz ? [Buffer.from([correctIndex])] : undefined,
  solution: solutionText || undefined,
  solutionEntities: solutionText ? [] : undefined,
});

const sentMsg = await client.sendFile(entity, { file: inputMedia });
const serialized = serializeMessage(sentMsg as any);
```

### Pattern 2: Poll Serialization in serializeMessage
**What:** Detect `MessageMediaPoll` in message.media, extract poll data into a `poll` field on MessageItem
**When to use:** In `serializeMessage()` -- applies to ALL messages with polls (history, get, pinned, send)
**Example:**
```typescript
// Source: gramjs type definitions (api.d.ts lines 1656-1667, 11295-11322, 11341-1362)
// MessageMediaPoll { poll: Poll, results: PollResults }
// Poll { id, question, answers[], closed?, publicVoters?, multipleChoice?, quiz?, closePeriod?, closeDate? }
// PollResults { results?: PollAnswerVoters[], totalVoters?, solution?, solutionEntities? }
// PollAnswerVoters { chosen?, correct?, option: bytes, voters: int }

function extractPollData(media: any): PollData | null {
  if (!(media instanceof Api.MessageMediaPoll)) return null;

  const poll = media.poll;
  const results = media.results;

  const options: PollOption[] = poll.answers.map((answer: any, i: number) => {
    const optionBytes = Buffer.from(answer.option);
    // Find matching voter result
    const voterResult = results?.results?.find(
      (r: any) => Buffer.from(r.option).equals(optionBytes)
    );
    return {
      text: answer.text?.text ?? '',
      voters: voterResult?.voters ?? 0,
      chosen: voterResult?.chosen ?? false,
      correct: voterResult?.correct ?? false,
    };
  });

  return {
    question: poll.question?.text ?? '',
    options,
    isQuiz: !!poll.quiz,
    isPublic: !!poll.publicVoters,
    isMultiple: !!poll.multipleChoice,
    isClosed: !!poll.closed,
    closePeriod: poll.closePeriod ?? null,
    closeDate: poll.closeDate ? new Date(poll.closeDate * 1000).toISOString() : null,
    totalVoters: results?.totalVoters ?? 0,
    correctOption: null, // derived from options[].correct
    solution: results?.solution ?? null,
  };
}
```

### Pattern 3: Commander Repeatable Option
**What:** Use Commander's custom processing function to accumulate `--option` values into an array
**When to use:** For the `--option` flag that accepts 2-10 poll answers
**Example:**
```typescript
// Source: Commander.js documentation (npmjs.com/package/commander)
function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

message
  .command('poll')
  .argument('<chat>', 'Chat ID, username, or @username')
  .description('Send a poll to a chat')
  .requiredOption('--question <text>', 'Poll question')
  .option('--option <text>', 'Poll option (repeat 2-10 times)', collect, [])
  .option('--quiz', 'Quiz mode (one correct answer)')
  .option('--correct <index>', 'Correct answer index (1-based, requires --quiz)')
  .option('--solution <text>', 'Solution explanation (requires --quiz)')
  .option('--multiple', 'Allow multiple choices')
  .option('--public', 'Show voter names (non-anonymous)')
  .option('--close-in <seconds>', 'Auto-close after N seconds')
  .action(messagePollAction);
```

### Anti-Patterns to Avoid
- **Using `client.invoke()` directly for SendMedia:** The `sendFile` wrapper handles entity input conversion and response message parsing. Using raw invoke requires manual InputPeer conversion and update parsing.
- **Using string-based option bytes:** Always use `Buffer.from([index])` for poll option identifiers. Strings like `Buffer.from('option0')` work but are unnecessarily complex.
- **Using `closeDate` instead of `closePeriod`:** `closeDate` requires an absolute Unix timestamp 5-600 seconds in the future. `closePeriod` is simpler -- just pass the duration in seconds and Telegram calculates the absolute time.
- **Checking `instanceof Api.TextWithEntities`:** The `question` and answer `text` fields use `TextWithEntities`. Access `.text` property directly; don't try to destructure the wrapper.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Poll ID generation | Random number generator | `generateRandomLong()` from `telegram/Helpers.js` | Generates proper BigInteger for gramjs `long` type |
| Option byte identifiers | String encoding schemes | `Buffer.from([index])` sequential bytes | Simple, unique, matches Telegram convention |
| InputMedia routing | Manual `messages.SendMedia` invoke | `client.sendFile(entity, { file: inputMediaPoll })` | gramjs `sendFile` auto-detects InputMedia subclass (verified: SUBCLASS_OF_ID 0xfaf846f4 match at uploads.js:794) and handles entity resolution, response parsing |
| Human poll format | Custom string building from scratch | Dedicated `formatPoll()` matching existing format function patterns | Keeps format.ts consistent with other formatters |

**Key insight:** gramjs's `sendFile` is a universal media sender, not just a file uploader. When given any `InputMedia` subclass, it passes through to `messages.SendMedia` without attempting upload. This is verified in the source code.

## Common Pitfalls

### Pitfall 1: PollAnswer.text is TextWithEntities, Not String
**What goes wrong:** Constructing `PollAnswer` with `text: "option text"` causes a type error or runtime crash.
**Why it happens:** gramjs API layer 214+ changed `PollAnswer.text` from `string` to `TextWithEntities`.
**How to avoid:** Always wrap: `new Api.TextWithEntities({ text: "option text", entities: [] })`.
**Warning signs:** TypeError or "Cannot read property 'text' of undefined" at runtime.

### Pitfall 2: Poll.question is Also TextWithEntities
**What goes wrong:** Same as Pitfall 1 but for the question field.
**Why it happens:** Same API layer change. Both `question` and answer `text` use `TextWithEntities`.
**How to avoid:** Wrap question the same way: `new Api.TextWithEntities({ text: questionStr, entities: [] })`.
**Warning signs:** Serialization failure on returned message.

### Pitfall 3: correctAnswers Must Match option Bytes Exactly
**What goes wrong:** Quiz poll created but no answer marked as correct, or API error `QUIZ_CORRECT_ANSWERS_EMPTY`.
**Why it happens:** `InputMediaPoll.correctAnswers` is `bytes[]` that must exactly match the `option` bytes from the corresponding `PollAnswer`. If you use `Buffer.from([0])` for answer index 0, `correctAnswers` must be `[Buffer.from([0])]`.
**How to avoid:** Use the same buffer construction for both `PollAnswer.option` and `correctAnswers`.
**Warning signs:** `QUIZ_CORRECT_ANSWERS_EMPTY` or `QUIZ_CORRECT_ANSWERS_TOO_MUCH` API errors.

### Pitfall 4: closePeriod Range is 5-600 Seconds (API-Enforced)
**What goes wrong:** API returns error for `--close-in 1` or `--close-in 3600`.
**Why it happens:** Telegram enforces 5-600 second range for close_period. CONTEXT.md says no client-side max, but the minimum is also API-enforced.
**How to avoid:** Client validates `> 0` per user decision. Let API handle 5-600 range enforcement. Document in help text that Telegram accepts 5-600 seconds.
**Warning signs:** API error on poll creation with unusual close-in values.

### Pitfall 5: Multiple Choice Conflicts with Quiz Mode
**What goes wrong:** API error when both `--multiple` and `--quiz` are specified.
**Why it happens:** Quiz polls require exactly one correct answer; multiple choice allows selecting many.
**How to avoid:** Client-side validation rejects `--multiple` + `--quiz` combination before API call.
**Warning signs:** Telegram API error `POLL_ANSWERS_INVALID`.

### Pitfall 6: Buffer.from([index]) vs Buffer.from(String(index))
**What goes wrong:** Option bytes don't match between PollAnswer and correctAnswers.
**Why it happens:** `Buffer.from([0])` creates a 1-byte buffer with value 0x00. `Buffer.from('0')` creates a 1-byte buffer with value 0x30 (ASCII '0'). They are not equal.
**How to avoid:** Use consistent buffer construction. Recommend `Buffer.from(String(i))` for readability since option bytes are arbitrary -- just be consistent.
**Warning signs:** Correct answer not highlighted in quiz results.

### Pitfall 7: Extracting Poll Data from MessageMediaPoll for Serialization
**What goes wrong:** Poll data not appearing in serialized messages.
**Why it happens:** `serializeMessage()` currently only checks for `MessageMediaPhoto` and `MessageMediaDocument`. `MessageMediaPoll` falls through to the `'other'` media type.
**How to avoid:** Add explicit `MessageMediaPoll` detection in both `detectMedia()` (for mediaType) and a new `extractPollData()` function.
**Warning signs:** Poll messages showing `mediaType: 'other'` without poll data.

### Pitfall 8: PollAnswerVoters.option is bytes, needs Buffer comparison
**What goes wrong:** Vote counts not matched to correct options during deserialization.
**Why it happens:** `PollAnswerVoters.option` is bytes. Direct `===` comparison between Buffer objects checks reference equality, not content.
**How to avoid:** Use `Buffer.from(a.option).equals(Buffer.from(b.option))` for matching voters to answers.
**Warning signs:** All vote counts showing as 0 even when votes exist.

## Code Examples

### Validated Poll Command Action Pattern
```typescript
// Source: Existing codebase pattern from pin.ts, send.ts + gramjs API types
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

export async function messagePollAction(this: Command, chat: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & PollOpts;
  // ... validation, then:
  // Build poll answers
  const answers = opts.option.map((text, i) => new Api.PollAnswer({
    text: new Api.TextWithEntities({ text, entities: [] }),
    option: Buffer.from(String(i)),
  }));

  // Build poll object
  const poll = new Api.Poll({
    id: generateRandomLong(),
    question: new Api.TextWithEntities({ text: opts.question, entities: [] }),
    answers,
    quiz: opts.quiz || undefined,
    publicVoters: opts.public || undefined,
    multipleChoice: opts.multiple || undefined,
    closePeriod: closeInSeconds || undefined,
  });

  // Build input media
  const correctIdx = opts.correct ? parseInt(opts.correct, 10) - 1 : undefined;
  const inputMedia = new Api.InputMediaPoll({
    poll,
    correctAnswers: opts.quiz && correctIdx !== undefined
      ? [Buffer.from(String(correctIdx))]
      : undefined,
    solution: opts.solution || undefined,
    solutionEntities: opts.solution ? [] : undefined,
  });

  // Send via sendFile (gramjs universal media sender)
  const sentMsg = await client.sendFile(entity, { file: inputMedia });
  const serialized = serializeMessage(sentMsg as any);
  outputSuccess(serialized);
}
```

### Poll Serialization Type Definitions
```typescript
// Source: gramjs api.d.ts types (lines 11295-11362) mapped to project conventions

/** Single poll option with vote data. */
export interface PollOption {
  text: string;
  voters: number;
  chosen: boolean;  // current user voted for this
  correct: boolean; // marked as correct in quiz
}

/** Structured poll data extracted from MessageMediaPoll. */
export interface PollData {
  question: string;
  options: PollOption[];
  isQuiz: boolean;
  isPublic: boolean;
  isMultiple: boolean;
  isClosed: boolean;
  closePeriod: number | null;
  closeDate: string | null;  // ISO string
  totalVoters: number;
  correctOption: number | null;  // 1-based index of correct option (quiz only)
  solution: string | null;
}

// Extend MessageItem:
export interface MessageItem {
  // ... existing fields ...
  poll?: PollData;  // Present when message contains a poll
}
```

### Human-Readable Poll Format
```typescript
// Source: Project convention from format.ts, user decisions in CONTEXT.md
// Format: 📊 Poll: {question}\n  1. {option1}\n  2. {option2}\n  {tags}

function formatPoll(poll: PollData): string {
  const lines: string[] = [];
  lines.push(`📊 Poll: ${poll.question}`);

  poll.options.forEach((opt, i) => {
    const num = i + 1;
    const correct = opt.correct ? ' ✓' : '';
    const votes = opt.voters > 0 ? ` (${opt.voters} vote${opt.voters !== 1 ? 's' : ''})` : '';
    lines.push(`  ${num}. ${opt.text}${correct}${votes}`);
  });

  // Config tags
  const tags: string[] = [];
  if (poll.isQuiz) tags.push('Quiz');
  if (poll.isPublic) tags.push('Public');
  if (poll.isMultiple) tags.push('Multiple');
  if (poll.closePeriod) tags.push(`Closes in ${poll.closePeriod}s`);
  if (poll.isClosed) {
    tags.push('Closed');
    tags.push(`${poll.totalVoters} voter${poll.totalVoters !== 1 ? 's' : ''}`);
  }
  if (tags.length > 0) {
    lines.push(`  ${tags.join(' · ')}`);
  }

  return lines.join('\n');
}
```

### Validation Logic Pattern
```typescript
// Source: User decisions in CONTEXT.md, existing validation patterns in pin.ts/delete.ts

function validatePollOpts(opts: PollOpts): string | null {
  // Question validation
  if (!opts.question || opts.question.trim().length === 0) {
    return 'EMPTY_QUESTION';  // --question required (non-empty)
  }
  if (opts.question.length > 300) {
    return 'QUESTION_TOO_LONG';  // <= 300 chars
  }

  // Option count validation
  if (opts.option.length < 2) {
    return 'TOO_FEW_OPTIONS';  // minimum 2
  }
  if (opts.option.length > 10) {
    return 'TOO_MANY_OPTIONS';  // maximum 10
  }

  // Option text validation
  for (const text of opts.option) {
    if (!text || text.trim().length === 0) {
      return 'EMPTY_OPTION';  // no whitespace-only or empty
    }
    if (text.length > 100) {
      return 'OPTION_TOO_LONG';  // <= 100 chars
    }
  }

  // Duplicate detection
  const seen = new Set<string>();
  for (const text of opts.option) {
    if (seen.has(text)) {
      return 'DUPLICATE_OPTION';  // with message: "Duplicate option text: '{text}'"
    }
    seen.add(text);
  }

  // Quiz mode validation
  if (opts.quiz && !opts.correct) {
    return 'QUIZ_MISSING_CORRECT';  // --correct required with --quiz
  }
  if (opts.solution && !opts.quiz) {
    return 'SOLUTION_WITHOUT_QUIZ';  // --solution requires --quiz
  }
  if (opts.multiple && opts.quiz) {
    return 'QUIZ_MULTIPLE_CONFLICT';  // --multiple conflicts with --quiz
  }

  // Correct answer validation
  if (opts.correct) {
    const idx = parseInt(opts.correct, 10);
    if (isNaN(idx) || idx < 1 || idx > opts.option.length) {
      return 'INVALID_CORRECT_INDEX';  // 1-based, in range
    }
  }

  // Close-in validation
  if (opts.closeIn) {
    const seconds = parseInt(opts.closeIn, 10);
    if (isNaN(seconds) || seconds <= 0) {
      return 'INVALID_CLOSE_IN';  // must be > 0
    }
  }

  return null;  // valid
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `PollAnswer.text: string` | `PollAnswer.text: TextWithEntities` | gramjs API layer 214 | Must wrap answer text in `new Api.TextWithEntities({ text, entities: [] })` |
| `Poll.question: string` | `Poll.question: TextWithEntities` | gramjs API layer 214 | Same wrapping needed for question |
| `close_date` absolute timestamp | `close_period` relative seconds | Both available | Use `closePeriod` for simpler implementation; avoid clock synchronization issues |

**Deprecated/outdated:**
- Direct `string` assignment to `PollAnswer.text` or `Poll.question`: These now require `TextWithEntities` wrapper objects.

## Open Questions

1. **Poll ID: generateRandomLong vs BigInt(0)**
   - What we know: `Poll.id` is `long` (BigInteger). `generateRandomLong()` from `telegram/Helpers.js` generates proper BigInteger values.
   - What's unclear: Whether the server would accept `BigInt(0)` and auto-assign an ID, or if a unique random ID is required.
   - Recommendation: Use `generateRandomLong()` -- it's the established gramjs pattern and avoids any risk of ID collision.

2. **Question length: 300 (user decision) vs 255 (API limit)**
   - What we know: CONTEXT.md specifies `<= 300 chars` for question validation. Telegram official docs say question max is 255 characters.
   - What's unclear: The user decision of 300 is more permissive than the API. The API will reject questions > 255 chars.
   - Recommendation: Honor the user's 300-char client-side limit. The API's 255 limit acts as a secondary enforcement. This lets the API error surface naturally for the 256-300 range, consistent with the `--close-in` philosophy of "let Telegram API reject."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/unit/message-poll.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WRITE-13a | Basic poll send with 2-10 options | unit | `npx vitest run tests/unit/message-poll.test.ts -t "sends basic poll"` | No -- Wave 0 |
| WRITE-13b | Quiz mode with --correct and --solution | unit | `npx vitest run tests/unit/message-poll.test.ts -t "quiz"` | No -- Wave 0 |
| WRITE-13c | --multiple, --public, --close-in flags | unit | `npx vitest run tests/unit/message-poll.test.ts -t "flags"` | No -- Wave 0 |
| WRITE-13d | Client-side validation (too few options, missing --correct, etc.) | unit | `npx vitest run tests/unit/message-poll.test.ts -t "validation"` | No -- Wave 0 |
| WRITE-13e | Poll serialization from MessageMediaPoll | unit | `npx vitest run tests/unit/serialize.test.ts -t "poll"` | No -- Wave 0 |
| WRITE-13f | Human-readable poll format | unit | `npx vitest run tests/unit/format.test.ts -t "poll"` | No -- Wave 0 |
| WRITE-13g | formatData dispatch for poll messages | unit | `npx vitest run tests/unit/format.test.ts -t "formatData.*poll"` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/message-poll.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/message-poll.test.ts` -- covers WRITE-13a through WRITE-13d (poll command action + validation)
- [ ] Poll serialization tests in `tests/unit/serialize.test.ts` -- covers WRITE-13e
- [ ] Poll format tests in `tests/unit/format.test.ts` -- covers WRITE-13f, WRITE-13g

*(No framework install needed -- vitest already configured)*

## Telegram API Error Codes for Polls

These should be added to `TELEGRAM_ERROR_MAP` in errors.ts:

| API Error Code | Human-Readable Message |
|----------------|----------------------|
| `POLL_ANSWERS_INVALID` | Invalid poll: need 2-10 answer options |
| `POLL_OPTION_DUPLICATE` | Duplicate poll option |
| `POLL_OPTION_INVALID` | Poll option text is invalid or too long |
| `POLL_QUESTION_INVALID` | Poll question is invalid or too long |
| `QUIZ_CORRECT_ANSWERS_EMPTY` | Quiz poll requires a correct answer |
| `QUIZ_CORRECT_ANSWERS_TOO_MUCH` | Quiz poll allows only one correct answer |
| `CHAT_SEND_POLL_FORBIDDEN` | You cannot send polls in this chat |

## Sources

### Primary (HIGH confidence)
- gramjs `node_modules/telegram/tl/api.d.ts` -- Poll (lines 11295-11322), PollAnswer (11283-11294), PollResults (11341-1362), InputMediaPoll (451-468), MessageMediaPoll (1656-1667), TextWithEntities (13782-13793)
- gramjs `node_modules/telegram/client/uploads.js` -- sendFile implementation (lines 418-498), _fileToMedia InputMedia detection (175-194)
- gramjs `node_modules/telegram/Utils.js` -- getInputMedia InputMedia passthrough (lines 790-797, SUBCLASS_OF_ID 0xfaf846f4 === 4210575092)
- gramjs `node_modules/telegram/define.d.ts` -- FileLike type includes `Api.TypeInputMedia` (lines 48-54)
- gramjs `node_modules/telegram/Helpers.d.ts` -- `generateRandomLong()` signature (line 48)
- Existing codebase: serialize.ts, types.ts, format.ts, output.ts, errors.ts, fields.ts, commands/message/index.ts, commands/message/send.ts, commands/message/pin.ts, commands/media/send.ts

### Secondary (MEDIUM confidence)
- [Telegram MTProto Poll API](https://core.telegram.org/api/poll) -- Poll sending, quiz mode, timing, voting
- [Telegram constructor: poll](https://core.telegram.org/constructor/poll) -- close_period 5-600 seconds constraint
- [Telegram constructor: inputMediaPoll](https://core.telegram.org/constructor/inputMediaPoll) -- correctAnswers as bytes[], solution constraints
- [Telegram constructor: pollAnswer](https://core.telegram.org/constructor/pollAnswer) -- option field as unique bytes identifier
- [Commander.js docs](https://www.npmjs.com/package/commander) -- Repeatable option pattern with custom processing function

### Tertiary (LOW confidence)
- Poll question max 255 chars (from web search, not directly verified in gramjs types -- the `int` type doesn't encode max length)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in project, APIs verified against type definitions
- Architecture: HIGH -- follows established codebase patterns (send.ts, pin.ts, serialize.ts, format.ts)
- Pitfalls: HIGH -- verified against gramjs source code (TextWithEntities wrapper, Buffer comparison, sendFile routing)
- API integration: HIGH -- InputMediaPoll -> sendFile -> SendMedia path verified in source

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- gramjs API types unlikely to change in 30 days)
