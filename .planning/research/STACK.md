# Stack Research

**Domain:** Telegram CLI v1.1 -- new feature additions (user profiles, contacts, message management, block/unblock, TOON output, polls)
**Researched:** 2026-03-12
**Confidence:** HIGH

**Scope:** This research covers ONLY the stack additions and changes needed for v1.1 features. The existing validated stack (gramjs, Commander, Conf, picocolors, Zod, tsup, vitest) is NOT re-evaluated -- it ships as-is.

## Recommended Stack Additions

### New Runtime Dependency

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| `@toon-format/toon` | ^2.1.0 | TOON output format (`--toon` flag) | The official reference implementation of TOON (Token-Oriented Object Notation). Zero dependencies. Pure ESM with TypeScript declarations (`.d.mts`). Exports `encode(data)` and `decode(toon)` -- we only need `encode`. Achieves ~40% fewer tokens than JSON for structured data while maintaining 99%+ LLM parsing accuracy. Lossless round-trip: `decode(encode(x)) === x`. Particularly effective for this project because message lists and chat data are "uniform arrays of objects" -- TOON's sweet spot where it collapses field names into a schema header and streams row values CSV-style. |

### No Other New Dependencies Needed

Every other v1.1 feature is implemented using **existing gramjs API methods** and **existing project infrastructure**. This is the correct outcome -- gramjs already wraps the full MTProto API surface. Adding libraries for features that gramjs handles natively would be wrong.

## gramjs API Methods for v1.1 Features

All v1.1 features map directly to gramjs methods. No additional Telegram client library or wrapper is needed.

### User Profiles

| Operation | gramjs Method | Confidence |
|-----------|--------------|------------|
| Get full user info (bio, photo, common chats count) | `client.invoke(new Api.users.GetFullUser({ id }))` | HIGH |
| Get common chats with a user | `client.invoke(new Api.messages.GetCommonChats({ userId, maxId: 0, limit: 100 }))` | HIGH |

**Key return type:** `Api.users.UserFull` contains:
- `about` (string) -- user bio
- `commonChatsCount` (number) -- mutual chat count
- `profilePhoto`, `personalPhoto`, `fallbackPhoto` -- profile pictures
- `blocked` (boolean), `phoneCallsAvailable`, `videoCallsAvailable`
- `pinnedMsgId`, `canPinMessage`
- `premiumGifts`, `ttlPeriod`, `themeEmoticon`
- `botInfo` (for bot users)

**Integration point:** Create a `serializeUserFull()` function in `serialize.ts` alongside existing `serializeMessage()`, `serializeMember()`, etc. Reuse `bigIntToString()` for the user ID.

### Contacts Management

| Operation | gramjs Method | Confidence |
|-----------|--------------|------------|
| List contacts | `client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }))` | HIGH |
| Add contact | `client.invoke(new Api.contacts.AddContact({ id, firstName, lastName, phone }))` | HIGH |
| Delete contacts | `client.invoke(new Api.contacts.DeleteContacts({ id: [userId] }))` | HIGH |
| Search contacts | `client.invoke(new Api.contacts.Search({ q: query, limit }))` | HIGH |

**Important:** `contacts.AddContact` cannot be used by bots and requires the user to already exist on Telegram -- it links an existing Telegram user to your contact list by their InputUser ID, not by phone number alone. For importing new contacts by phone, use `contacts.ImportContacts` instead. The project should support both patterns.

### Message Management

| Operation | gramjs Method | Confidence |
|-----------|--------------|------------|
| Get messages by ID | `client.getMessages(entity, { ids: [42, 43, 44] })` | HIGH |
| Get pinned messages | `client.getMessages(entity, { filter: new Api.InputMessagesFilterPinned() })` | HIGH |
| Edit message | `client.editMessage(entity, { message: msgId, text: newText })` | HIGH |
| Delete messages | `client.deleteMessages(entity, [msgId1, msgId2], { revoke: true })` | HIGH |
| Pin message | `client.pinMessage(entity, msgId, { notify: false })` | HIGH |
| Unpin message | `client.unpinMessage(entity, msgId)` | HIGH |
| Unpin all messages | `client.unpinMessage(entity)` (no msgId = unpin all) | HIGH |

**High-level client methods** (`client.editMessage`, `client.deleteMessages`, `client.pinMessage`, `client.unpinMessage`, `client.getMessages`) are preferred over raw `client.invoke(new Api.messages.*)` calls because:
1. They handle entity resolution internally
2. They return properly typed `Message` objects
3. They match the pattern already used in the codebase (`client.sendMessage` in `message/send.ts`)

**Edit limitations to surface in CLI help:**
- Only your own messages can be edited
- Time limit applies (48 hours for regular users in non-channel chats)
- Channel admins can edit channel posts indefinitely

**Delete considerations:**
- `revoke: true` deletes for everyone; `revoke: false` deletes only for you
- Service messages cannot be deleted (error: MESSAGE_DELETE_FORBIDDEN)
- gramjs processes deletes in chunks of 100 internally

### Block/Unblock

| Operation | gramjs Method | Confidence |
|-----------|--------------|------------|
| Block user | `client.invoke(new Api.contacts.Block({ id: inputUser }))` | HIGH |
| Unblock user | `client.invoke(new Api.contacts.Unblock({ id: inputUser }))` | HIGH |
| List blocked users | `client.invoke(new Api.contacts.GetBlocked({ offset, limit }))` | HIGH |

**Note:** These are raw `Api.contacts.*` invoke calls -- there are no high-level client convenience methods for blocking. This matches the pattern used for `Api.users.GetFullUser` and `Api.contacts.GetContacts`.

### Polls

| Operation | gramjs Method | Confidence |
|-----------|--------------|------------|
| Send poll | `client.invoke(new Api.messages.SendMedia({ peer, media: inputMediaPoll }))` | HIGH |

**Poll construction requires assembling three nested types:**

```typescript
const poll = new Api.InputMediaPoll({
  poll: new Api.Poll({
    id: bigInt(0),  // Server assigns actual ID
    question: new Api.TextWithEntities({ text: "Question?", entities: [] }),
    answers: [
      new Api.PollAnswer({ text: new Api.TextWithEntities({ text: "Yes", entities: [] }), option: Buffer.from("0") }),
      new Api.PollAnswer({ text: new Api.TextWithEntities({ text: "No", entities: [] }), option: Buffer.from("1") }),
    ],
    // Optional flags:
    publicVoters: false,    // Anonymous voting (default)
    multipleChoice: false,  // Single choice (default)
    quiz: false,            // Regular poll, not quiz
    closePeriod: 600,       // Auto-close after N seconds (5-600)
  }),
  // Quiz-only fields:
  correctAnswers: [Buffer.from("0")],  // Only for quiz: true
  solution: "Explanation text",         // Only for quiz: true
});
```

**Limits (from Telegram API):**
- 2-10 answer options (poll_answers_max config value, typically 10)
- Question length: up to 255 characters
- Answer text: up to 100 characters each
- Solution text: up to 200 characters, max 2 line feeds
- Close period: 5-600 seconds

### TOON Output Format

**Integration into existing output pipeline:**

The TOON format plugs into the existing `output.ts` output mode system. Currently there are three modes: JSON (default), human-readable (`--human`), and JSONL (`--jsonl`). TOON becomes a fourth mode (`--toon`).

```typescript
// In output.ts -- add alongside existing modes:
import { encode } from '@toon-format/toon';

let _toonMode = false;

export function setToonMode(enabled: boolean): void {
  _toonMode = enabled;
}

// In outputSuccess():
if (_toonMode) {
  process.stdout.write(encode(data) + '\n');
  return;
}
```

**In tg.ts -- add the global option:**
```typescript
program.option('--toon', 'TOON output format (token-efficient for LLMs)');
```

**Mutual exclusivity:** `--toon` is mutually exclusive with `--human` and `--jsonl`. It is compatible with `--fields` (apply field selection before TOON encoding).

**Why this works well:** TOON's `encode()` accepts any JSON-serializable value and returns a string. The existing `outputSuccess<T>(data: T)` pipeline already constructs plain objects before output -- TOON slots in without changing any command implementations.

## No New Dependencies Needed (Verification)

| Feature | Why No New Dep |
|---------|---------------|
| User profiles | gramjs `Api.users.GetFullUser` -- raw invoke, serialize response |
| Contacts CRUD | gramjs `Api.contacts.*` namespace -- complete CRUD coverage |
| Get messages by ID | gramjs `client.getMessages({ ids })` -- existing high-level method |
| Get pinned messages | gramjs `client.getMessages({ filter: InputMessagesFilterPinned })` |
| Edit messages | gramjs `client.editMessage()` -- existing high-level method |
| Delete messages | gramjs `client.deleteMessages()` -- existing high-level method |
| Pin/unpin | gramjs `client.pinMessage()` / `client.unpinMessage()` |
| Block/unblock | gramjs `Api.contacts.Block` / `Api.contacts.Unblock` |
| Polls | gramjs `Api.InputMediaPoll` + `Api.messages.SendMedia` |
| TOON output | `@toon-format/toon` (single new dependency) |

## Installation

```bash
# Single new dependency for v1.1
npm install @toon-format/toon
```

No new dev dependencies needed. Existing vitest, tsup, and TypeScript toolchain handles everything.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| `@toon-format/toon` (official) | `@toon-format-cjs/toon` (CJS fork) | Project is already ESM. The official package is ESM with `.d.mts` types, which is exactly what we need. The CJS fork exists for legacy projects. |
| `@toon-format/toon` (official) | `@byjohann/toon` (community fork) | Unofficial fork. Fewer downloads. No reason to use when the official package works and is actively maintained. |
| `@toon-format/toon` (official) | Custom TOON implementation | TOON spec has 358+ test fixtures and edge cases. Implementing from scratch is error-prone and maintenance burden. The official package is zero-dep and small -- no reason to reinvent. |
| `@toon-format/toon` | YAML output mode | YAML is not optimized for LLM token consumption. TOON achieves 40% fewer tokens than JSON; YAML typically saves only 10-15% and introduces ambiguity (string/number coercion, multiline surprises). TOON was purpose-built for this use case. |
| gramjs high-level methods | Raw `Api.messages.*` invocations | Use high-level methods (`client.editMessage`, `client.deleteMessages`, `client.pinMessage`) when available because they handle entity resolution and return typed Message objects. Fall back to raw `client.invoke()` only for features without high-level wrappers (GetFullUser, contacts, block, polls). |
| gramjs `Api.contacts.AddContact` | `Api.contacts.ImportContacts` | AddContact links an existing Telegram user by ID. ImportContacts imports contacts by phone number (creates them if the phone is on Telegram). Offer both: `tg contact add <user>` for by-ID and consider `--phone` flag for phone import. |

## What NOT to Add

| Avoid | Why | Consequence if Added |
|-------|-----|---------------------|
| `grammy`, `telegraf`, `node-telegram-bot-api` | Bot API libraries. This is an MTProto user client. They use a completely different protocol. | Would not work for user authentication, message history access, or any user-level operations. |
| Database (SQLite, LevelDB, etc.) | All new features are stateless API calls. No data persistence needed beyond existing session/config. | Unnecessary complexity, native compilation issues, breaks `npx` zero-install. |
| Additional serialization libraries (protobuf, msgpack) | TOON covers the token-efficient output need. JSON remains the primary format. | Extra dependencies, output format fragmentation, confusing for consumers. |
| `input-validator` or similar | Zod already handles all validation needs (existing dependency). | Duplicate validation logic, bigger bundle. |
| Markdown rendering libraries | gramjs already has entity-to-markdown conversion (existing `entity-to-markdown.ts`). Edit messages use gramjs built-in MarkdownParser. | Unnecessary; gramjs handles Telegram-flavored markdown internally. |

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| `@toon-format/toon@^2.1.0` | Node.js 18+ | ESM-only (`.mjs`). Ships TypeScript declarations. Works with tsup bundling pipeline. |
| `@toon-format/toon@^2.1.0` | TypeScript 5.x | Provides `.d.mts` type declarations. No `@types/` package needed. |
| `telegram@^2.26.22` | All v1.1 API methods | GetFullUser, GetCommonChats, contacts.*, editMessage, deleteMessages, pinMessage, Block/Unblock, InputMediaPoll -- all available in v2.26.x. These are MTProto layer methods that have been stable for years. |

## Integration Patterns for Existing Codebase

### New serialize functions (in `serialize.ts`)

```typescript
// User profile serialization
export function serializeUserProfile(fullUser: any, user: any): UserProfile { ... }

// Contact serialization
export function serializeContact(user: Api.User): ContactItem { ... }

// Poll serialization (for sent poll result)
export function serializePoll(msg: Api.Message): PollItem { ... }
```

### New types (in `types.ts`)

```typescript
export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  bio: string | null;
  commonChatsCount: number;
  isBot: boolean;
  isPremium: boolean;
  lastSeen: string | null;
  profilePhoto: object | null;
  blocked: boolean;
  canPinMessage: boolean;
}

export interface ContactItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  isBot: boolean;
  status: string | null;
}

export interface PollResult {
  messageId: number;
  question: string;
  answers: { text: string; option: string }[];
  isAnonymous: boolean;
  isQuiz: boolean;
  isMultipleChoice: boolean;
  isClosed: boolean;
}
```

### New format functions (in `format.ts`)

Add `formatUserProfile()`, `formatContacts()`, and `formatPoll()` alongside existing formatters. Update `formatData()` auto-detection to recognize the new data shapes.

### New command files

```
src/commands/user/index.ts         -- user command group
src/commands/user/profile.ts       -- tg user profile <user>
src/commands/user/common-chats.ts  -- tg user common-chats <user>
src/commands/contact/index.ts      -- contact command group
src/commands/contact/list.ts       -- tg contact list
src/commands/contact/add.ts        -- tg contact add <user>
src/commands/contact/delete.ts     -- tg contact delete <user>
src/commands/contact/search.ts     -- tg contact search <query>
src/commands/message/get.ts        -- tg message get <chat> <ids...>
src/commands/message/pinned.ts     -- tg message pinned <chat>
src/commands/message/edit.ts       -- tg message edit <chat> <id> <text>
src/commands/message/delete.ts     -- tg message delete <chat> <ids...>
src/commands/message/pin.ts        -- tg message pin <chat> <id>
src/commands/message/unpin.ts      -- tg message unpin <chat> [id]
src/commands/user/block.ts         -- tg user block <user>
src/commands/user/unblock.ts       -- tg user unblock <user>
src/commands/user/blocked.ts       -- tg user blocked (list blocked)
src/commands/poll/index.ts         -- poll command group
src/commands/poll/send.ts          -- tg poll send <chat> <question> <answers...>
```

### Global option addition (in `tg.ts`)

```typescript
program.option('--toon', 'TOON output (token-efficient for LLMs)');
```

Wire into `preAction` hook alongside existing `--human`, `--jsonl`, `--fields` handling.

## Sources

- [@toon-format/toon npm](https://www.npmjs.com/package/@toon-format/toon) -- v2.1.0, zero dependencies, ESM, verified via `npm view` (HIGH confidence)
- [TOON Format Spec](https://github.com/toon-format/spec) -- SPEC v3.0, ABNF grammar, 358+ test fixtures (HIGH confidence)
- [TOON Getting Started](https://toonformat.dev/guide/getting-started) -- `encode()`/`decode()` API, TypeScript examples (HIGH confidence)
- [gramjs GetFullUser](https://gram.js.org/tl/users/GetFullUser) -- parameters, return type, TypeScript example (HIGH confidence)
- [gramjs UserFull class](https://gram.js.org/beta/classes/Api.UserFull.html) -- all fields: about, commonChatsCount, blocked, profilePhoto, etc. (HIGH confidence)
- [gramjs GetCommonChats](https://gram.js.org/tl/messages/GetCommonChats) -- parameters, return type (HIGH confidence)
- [gramjs contacts namespace](https://gram.js.org/beta/modules/Api.contacts.html) -- full list of contact methods: AddContact, DeleteContacts, GetContacts, Search, Block, Unblock, GetBlocked (HIGH confidence)
- [gramjs AddContact](https://gram.js.org/tl/contacts/AddContact) -- parameters: id, firstName, lastName, phone, addPhonePrivacyException (HIGH confidence)
- [gramjs TelegramClient methods](https://gram.js.org/beta/classes/TelegramClient.html) -- editMessage, deleteMessages, pinMessage, unpinMessage, getMessages signatures (HIGH confidence)
- [gramjs editMessage](https://painor.gitbook.io/gramjs/working-with-messages/messages.editmessage) -- parameters, limitations (ownership, time limit) (HIGH confidence)
- [gramjs deleteMessages](https://painor.gitbook.io/gramjs/working-with-messages/messages.deletemessages) -- revoke parameter, AffectedMessages return (HIGH confidence)
- [gramjs updatePinnedMessage](https://painor.gitbook.io/gramjs/working-with-messages/messages.updatepinnedmessage) -- silent, unpin, pm_oneside parameters (HIGH confidence)
- [gramjs getMessages](https://painor.gitbook.io/gramjs/getting-started/available-methods/getmessages) -- ids parameter, filter parameter, IterMessagesParams (HIGH confidence)
- [gramjs InputMediaPoll](https://gram.js.org/beta/classes/Api.InputMediaPoll.html) -- constructor: poll, correctAnswers, solution, solutionEntities (HIGH confidence)
- [Telegram Poll API](https://core.telegram.org/api/poll) -- poll types (regular/quiz), limits (2-10 answers, 255 char question), close_period (HIGH confidence)
- [gramjs Working with Polls](https://painor.gitbook.io/gramjs/working-with-polls) -- sendVote, getPollResults, getPollVotes (HIGH confidence)
- [InfoQ TOON article](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/) -- 40% token reduction, 99.4% accuracy benchmarks (MEDIUM confidence)

---
*Stack research for: Telegram CLI v1.1 feature additions*
*Researched: 2026-03-12*
