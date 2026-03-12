# Architecture Research

**Domain:** Telegram CLI v1.1 Feature Integration (user profiles, contacts, message management, block/unblock, TOON output, polls)
**Researched:** 2026-03-12
**Confidence:** HIGH

## Existing Architecture Summary

The codebase follows a consistent layered pattern:

```
CLI Entry (src/bin/tg.ts)
    |
    v
Command Groups (src/commands/{auth,session,chat,message,media}/)
    |  Each group: index.ts (Commander wiring) + action files (one per subcommand)
    |
    v
Shared Libraries (src/lib/)
    |  client.ts    -- withClient() connection lifecycle
    |  peer.ts      -- resolveEntity() for username/ID/phone/invite resolution
    |  serialize.ts -- gramjs objects -> lean JSON types
    |  format.ts    -- formatData() auto-dispatch for human output
    |  output.ts    -- outputSuccess/outputError (JSON/human/JSONL modes)
    |  fields.ts    -- --fields selection, extractListItems() for JSONL
    |  types.ts     -- all TypeScript interfaces (data shapes + option interfaces)
    |  errors.ts    -- TgError hierarchy
    |  config.ts    -- Conf-based config/credentials
    |  session-store.ts -- file-locked session persistence
    |
    v
gramjs TelegramClient (MTProto)
```

### Established Patterns (every command follows these)

1. **Action signature:** `async function xAction(this: Command, ...args): Promise<void>`
2. **Options extraction:** `const opts = this.optsWithGlobals() as GlobalOptions & { ... }`
3. **Session lifecycle:** `store.withLock(profile, async (sessionString) => { ... })`
4. **Client lifecycle:** `withClient({ apiId, apiHash, sessionString }, async (client) => { ... })`
5. **Entity resolution:** `const entity = await resolveEntity(client, chatInput)`
6. **Serialization:** gramjs object -> typed interface via `serialize*.ts` functions
7. **Output:** `outputSuccess(data)` / `outputError(message, code)`
8. **Error handling:** try/catch with `formatError(err)` -> `outputError()`

### Output Pipeline (critical for TOON integration)

```
Command produces data (typed interface)
    |
    v
outputSuccess(data)
    |
    +-- JSONL mode? -> extractListItems() -> pickFields() -> stdout (one JSON/line)
    |
    +-- Human mode? -> formatData(data) auto-dispatch by shape detection -> stdout
    |
    +-- JSON mode?  -> applyFieldSelection() -> { ok: true, data } envelope -> stdout
```

Shape detection in `formatData()` uses duck-typing checks in priority order:
- `.path + .filename + .size + .mediaType + .messageId` -> DownloadResult
- `.files[] + .downloaded` -> batch download
- `.messages[] + .sent` -> AlbumResult
- `.id + .text + .date + .type` (no messages/chats) -> single MessageItem
- `.messages[0].chatTitle` -> SearchResults
- `.messages[0].text + .date` -> Messages
- `.chats[0].type + .title` -> ChatList
- `.title + .type + .memberCount` -> ChatInfo
- `.topics[0].title + .isClosed` -> Topics
- `.members[0].isBot` -> Members
- Fallback -> `formatGeneric()` (JSON.stringify pretty-print)

### Known List Keys (in fields.ts)

```typescript
const LIST_KEYS = ['messages', 'chats', 'members', 'topics', 'files'] as const;
```

This array determines JSONL extraction. New list-shaped outputs need their key added here.

## Integration Plan: New Components vs Modifications

### New Command Group: `user`

**Path:** `src/commands/user/`

New top-level command group for user-centric operations that don't belong to `chat` (which is peer/dialog oriented).

| Subcommand | gramjs API | Returns |
|------------|-----------|---------|
| `tg user profile <user>` | `users.GetFullUser` | `UserProfile` (new type) |
| `tg user block <user>` | `contacts.Block` | `{ userId, action: 'blocked' }` |
| `tg user unblock <user>` | `contacts.Unblock` | `{ userId, action: 'unblocked' }` |

**Files to create:**
- `src/commands/user/index.ts` -- Commander wiring (createUserCommand)
- `src/commands/user/profile.ts` -- profile action
- `src/commands/user/block.ts` -- block/unblock action

**Registration:** Add to `src/bin/tg.ts`:
```typescript
import { createUserCommand } from '../commands/user/index.js';
const userCmd = createUserCommand();
userCmd.helpGroup('User');
program.addCommand(userCmd);
```

### New Command Group: `contact`

**Path:** `src/commands/contact/`

Contacts are a distinct Telegram concept (not chats, not users). Warrants its own group.

| Subcommand | gramjs API | Returns |
|------------|-----------|---------|
| `tg contact list` | `contacts.GetContacts` | `{ contacts: ContactItem[] }` |
| `tg contact add <user>` | `contacts.AddContact` | `ContactItem` |
| `tg contact delete <user-ids>` | `contacts.DeleteContacts` | `{ deleted: string[] }` |
| `tg contact search <query>` | `contacts.Search` | `{ contacts: ContactItem[] }` |

**Files to create:**
- `src/commands/contact/index.ts` -- Commander wiring
- `src/commands/contact/list.ts`
- `src/commands/contact/add.ts`
- `src/commands/contact/delete.ts`
- `src/commands/contact/search.ts`

### Extended Command Group: `message` (add subcommands)

Existing `src/commands/message/` gains new subcommands. Pattern: add action file + wire in index.ts.

| Subcommand | gramjs API | Returns |
|------------|-----------|---------|
| `tg message get <chat> <msg-ids>` | `client.getMessages(entity, { ids })` | `{ messages: MessageItem[] }` |
| `tg message pinned <chat>` | `messages.Search` with `InputMessagesFilterPinned` | `{ messages: MessageItem[] }` |
| `tg message edit <chat> <msg-id> <text>` | `client.editMessage(entity, { message, text })` | `MessageItem` |
| `tg message delete <chat> <msg-ids>` | `client.deleteMessages(entity, ids, { revoke })` | `{ deleted: number[] }` |
| `tg message pin <chat> <msg-id>` | `client.pinMessage(entity, msgId)` | `{ messageId, chatId, action: 'pinned' }` |
| `tg message unpin <chat> <msg-id>` | `client.unpinMessage(entity, msgId)` | `{ messageId, chatId, action: 'unpinned' }` |
| `tg message poll <chat> <question> <options>` | `messages.SendMedia` with `InputMediaPoll` | `MessageItem` (with poll data) |

**Files to create:**
- `src/commands/message/get.ts`
- `src/commands/message/pinned.ts`
- `src/commands/message/edit.ts`
- `src/commands/message/delete.ts`
- `src/commands/message/pin.ts`
- `src/commands/message/poll.ts`

**Files to modify:**
- `src/commands/message/index.ts` -- wire new subcommands

### Output Pipeline: TOON Format

**What TOON is:** A token-optimized output format for LLM consumption. Strips noise, uses compact representations, minimizes token count while preserving semantic content. Example:

```
# Instead of full JSON:
{"ok":true,"data":{"messages":[{"id":42,"text":"Hello","date":"2026-03-12T10:30:00.000Z","senderId":"123","senderName":"Alice","replyToMsgId":null,"forwardFrom":null,"mediaType":null,"type":"message","views":null,"forwards":null}],"total":1}}

# TOON format:
42|Alice|2026-03-12T10:30|Hello
```

**Integration point:** Output pipeline in `src/lib/output.ts`.

TOON follows the same pattern as JSONL: a mode flag that intercepts before JSON/human dispatch.

**Files to modify:**
- `src/lib/output.ts` -- add `_toonMode` flag, `setToonMode()`, TOON branch in `outputSuccess()`
- `src/bin/tg.ts` -- add `--toon` global option, parse in preAction hook, mutual exclusion with `--human` and `--jsonl`
- `src/lib/types.ts` -- add `toon?: boolean` to `GlobalOptions`

**New file to create:**
- `src/lib/toon.ts` -- TOON formatting functions (one per data shape, analogous to format.ts)

**TOON design principles:**
1. Pipe-delimited fields (easy to parse, minimal tokens)
2. Short date format (ISO without milliseconds/timezone)
3. Omit null fields entirely
4. One line per item for lists
5. Header line with field names for discoverability
6. No envelope (like JSONL, data only)

**Pipeline with TOON:**
```
outputSuccess(data)
    |
    +-- TOON mode? -> toonFormat(data) auto-dispatch by shape -> stdout
    |
    +-- JSONL mode? -> ...
    +-- Human mode? -> ...
    +-- JSON mode?  -> ...
```

## New Types (additions to src/lib/types.ts)

```typescript
// ---- v1.1: User Profile types ----

export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  bio: string | null;
  isBot: boolean;
  isVerified: boolean;
  isRestricted: boolean;
  isPremium: boolean;
  lastSeen: string | null;       // "recently", "lastWeek", ISO date, etc.
  profilePhotos: number | null;  // count
  commonChatsCount: number | null;
}

// ---- v1.1: Contact types ----

export interface ContactItem {
  id: string;
  username: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  isMutualContact: boolean;
}

// ---- v1.1: Poll types ----

export interface PollInfo {
  question: string;
  options: PollOption[];
  isAnonymous: boolean;
  isQuiz: boolean;
  isClosed: boolean;
  totalVoters: number;
}

export interface PollOption {
  text: string;
  voters: number;
}
```

## New Serializers (additions to src/lib/serialize.ts)

```typescript
export function serializeUserProfile(
  user: Api.User,
  fullUser: Api.UserFull,
): UserProfile { ... }

export function serializeContact(user: Api.User): ContactItem { ... }
```

The `serializeMessage()` function already handles media types generically. For polls, the `MessageItem` already has `mediaType` (will be "poll") and `text` (poll question from message text). We need to extend `MessageItem` optionally:

```typescript
export interface MessageItem {
  // ... existing fields ...
  poll?: PollInfo;  // Only present when mediaType is 'poll'
}
```

And extend `serializeMessage()` to detect `Api.MessageMediaPoll` and populate the `poll` field.

## New Human Formatters (additions to src/lib/format.ts)

Add functions and wire into `formatData()` auto-dispatch:

| Function | Detects | Example Output |
|----------|---------|----------------|
| `formatUserProfile(profile)` | `.bio` + `.lastSeen` + `.firstName` | Key-value pairs like formatChatInfo |
| `formatContacts(contacts)` | `.contacts[0].isMutualContact` | Table with name, username, phone |
| `formatPoll(msg)` | `msg.poll` present | Question + bar chart of options |

**Shape detection additions to `formatData()`:**
```typescript
// Before ChatInfo check:
if ('bio' in obj && 'lastSeen' in obj && 'firstName' in obj) {
  return formatUserProfile(obj as UserProfile);
}

// After existing messages checks:
if (Array.isArray(obj.contacts)) {
  return formatContacts(obj.contacts as ContactItem[]);
}
```

## New LIST_KEYS Addition (src/lib/fields.ts)

```typescript
const LIST_KEYS = ['messages', 'chats', 'members', 'topics', 'files', 'contacts'] as const;
```

Add `'contacts'` so JSONL mode works for `tg contact list` and `tg contact search`.

## Data Flow: New Features

### User Profile Flow

```
tg user profile @alice
    |
    v
resolveEntity(client, "@alice") -> Api.User
    |
    v
client.invoke(new Api.users.GetFullUser({ id: entity }))
    |  Returns Api.users.UserFull with { fullUser, users[], chats[] }
    v
serializeUserProfile(user, fullUser.fullUser) -> UserProfile
    |
    v
outputSuccess(profile)
```

### Contacts List Flow

```
tg contact list
    |
    v
client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }))
    |  Returns Api.contacts.Contacts with { contacts[], users[] }
    v
Map contacts to users -> serializeContact(user) for each -> ContactItem[]
    |
    v
outputSuccess({ contacts })
```

### Message Edit Flow

```
tg message edit @group 42 "new text"
    |
    v
resolveEntity(client, "@group") -> entity
    |
    v
client.editMessage(entity, { message: 42, text: "new text" })
    |  Returns Api.Message (edited)
    v
serializeMessage(editedMsg) -> MessageItem
    |
    v
outputSuccess(serialized)
```

### Message Delete Flow

```
tg message delete @group 42,43,44 --revoke
    |
    v
resolveEntity(client, "@group") -> entity
    |
    v
client.deleteMessages(entity, [42, 43, 44], { revoke: true })
    |  Returns Api.messages.AffectedMessages[]
    v
outputSuccess({ deleted: [42, 43, 44], chat: chatId })
```

### Pin/Unpin Flow

```
tg message pin @group 42
    |
    v
resolveEntity(client, "@group") -> entity
    |
    v
client.pinMessage(entity, 42, { notify: false })
    |
    v
outputSuccess({ messageId: 42, chatId, action: 'pinned' })
```

### Block/Unblock Flow

```
tg user block @spammer
    |
    v
resolveEntity(client, "@spammer") -> entity (must be User)
    |
    v
client.invoke(new Api.contacts.Block({ id: entity }))
    |  Returns boolean
    v
outputSuccess({ userId: id, username, action: 'blocked' })
```

### Poll Creation Flow

```
tg message poll @group "Favorite color?" "Red,Green,Blue" --anonymous
    |
    v
resolveEntity(client, "@group") -> entity
    |
    v
Build Api.Poll({ question, answers: [...] })
Build Api.InputMediaPoll({ poll })
    |
    v
client.invoke(new Api.messages.SendMedia({ peer: entity, media: inputMediaPoll, message: '' }))
    |  Returns Api.Updates with message
    v
serializeMessage(sentMsg) -> MessageItem (with poll field)
    |
    v
outputSuccess(serialized)
```

### TOON Output Flow

```
tg message history @group --toon
    |
    v
[normal command execution produces data]
    |
    v
outputSuccess(data)
    |-- _toonMode is true
    v
toonFormat(data) -- auto-detect shape, format as compact pipe-delimited
    |
    v
stdout: "id|sender|date|text\n42|Alice|2026-03-12T10:30|Hello\n..."
```

## Recommended Project Structure (after v1.1)

```
src/
├── bin/
│   └── tg.ts                    # MODIFY: add --toon global option, register user + contact commands
├── commands/
│   ├── auth/                    # unchanged
│   ├── session/                 # unchanged
│   ├── chat/                    # unchanged
│   ├── message/
│   │   ├── index.ts             # MODIFY: wire get, pinned, edit, delete, pin, poll
│   │   ├── history.ts           # unchanged
│   │   ├── search.ts            # unchanged
│   │   ├── send.ts              # unchanged
│   │   ├── forward.ts           # unchanged
│   │   ├── react.ts             # unchanged
│   │   ├── replies.ts           # unchanged
│   │   ├── get.ts               # NEW: get messages by ID
│   │   ├── pinned.ts            # NEW: get pinned messages
│   │   ├── edit.ts              # NEW: edit sent message
│   │   ├── delete.ts            # NEW: delete messages
│   │   ├── pin.ts               # NEW: pin/unpin messages
│   │   └── poll.ts              # NEW: create and send poll
│   ├── media/                   # unchanged
│   ├── user/                    # NEW command group
│   │   ├── index.ts             # Commander wiring
│   │   ├── profile.ts           # detailed user profile
│   │   └── block.ts             # block/unblock
│   └── contact/                 # NEW command group
│       ├── index.ts             # Commander wiring
│       ├── list.ts              # list contacts
│       ├── add.ts               # add contact
│       ├── delete.ts            # delete contacts
│       └── search.ts            # search contacts
└── lib/
    ├── client.ts                # unchanged
    ├── peer.ts                  # unchanged
    ├── serialize.ts             # MODIFY: add serializeUserProfile, serializeContact, extend serializeMessage for polls
    ├── format.ts                # MODIFY: add formatUserProfile, formatContacts, formatPoll; add shape detections
    ├── output.ts                # MODIFY: add TOON mode (toonMode flag, setToonMode, toon branch)
    ├── toon.ts                  # NEW: TOON formatters (toonFormat auto-dispatch, per-shape formatters)
    ├── fields.ts                # MODIFY: add 'contacts' to LIST_KEYS
    ├── types.ts                 # MODIFY: add UserProfile, ContactItem, PollInfo, PollOption; extend GlobalOptions; extend MessageItem
    ├── errors.ts                # unchanged
    ├── config.ts                # unchanged
    ├── session-store.ts         # unchanged
    ├── media-utils.ts           # unchanged (may add poll to detectMedia)
    ├── entity-to-markdown.ts    # unchanged
    ├── rate-limit.ts            # unchanged
    └── prompt.ts                # unchanged
```

## Architectural Patterns

### Pattern 1: Consistent Action Handler Boilerplate

**What:** Every command action follows the same 7-step pattern (see "Established Patterns" above). New commands MUST follow this exactly.

**When to use:** Every new subcommand action.

**Example (message get):**
```typescript
export async function messageGetAction(this: Command, chat: string, msgIds: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;

  // Parse comma-separated IDs
  const ids = msgIds.split(',').map(s => parseInt(s.trim(), 10));
  // ... validate ...

  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) { outputError('Not logged in...', 'NOT_AUTHENTICATED'); return; }
      const { apiId, apiHash } = getCredentialsOrThrow(config);

      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const entity = await resolveEntity(client, chat);
        const result = await client.getMessages(entity, { ids });
        const messages = result.filter(Boolean).map(m => serializeMessage(m));
        outputSuccess({ messages, total: messages.length });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
```

### Pattern 2: High-Level Client Methods vs Raw API Invoke

**What:** gramjs provides high-level `client.editMessage()`, `client.deleteMessages()`, `client.pinMessage()`, `client.getMessages()` methods that handle entity resolution and edge cases internally. Use these when available. Fall back to `client.invoke(new Api.xxx.Yyy())` for operations without high-level wrappers.

**When to use high-level:** edit, delete, pin, unpin, getMessages (by ID)
**When to use raw invoke:** GetFullUser, contacts.*, contacts.Block/Unblock, messages.SendMedia (polls)

**Trade-offs:** High-level methods handle edge cases (channel vs chat distinction for delete, entity input normalization) but provide less control. Raw invoke gives full API access but requires understanding Telegram API nuances.

### Pattern 3: Shape-Based Format Dispatch

**What:** `formatData()` in format.ts uses duck-typing to detect output shape and call the right formatter. New data shapes need new detection rules AND a fallback via `formatGeneric()`.

**When to use:** Every new output type that needs human-readable formatting.

**Important ordering:** Detection rules are checked top-to-bottom. More specific shapes (e.g., UserProfile with `bio` + `lastSeen`) must come before generic ones (e.g., single object with `id`). The fallback `formatGeneric()` handles anything unmatched as pretty-printed JSON, so new features work immediately even without a custom formatter.

### Pattern 4: TOON as a Fourth Output Mode

**What:** TOON joins JSON/human/JSONL as a parallel output mode. It follows the same module-level flag pattern (`_toonMode`, `setToonMode()`). Implementation lives in a dedicated `toon.ts` module to keep `output.ts` clean.

**Trade-offs:** Adding another mode increases the output.ts branching complexity. However, the pattern is already established for JSONL (flag + mode check + early return), so TOON follows naturally. The `toon.ts` module mirrors `format.ts` structure (auto-dispatch + per-type formatters).

## Anti-Patterns

### Anti-Pattern 1: Mixing Command Groups by Entity Type

**What people do:** Put `block` under `chat` because blocking happens "in a chat context", or put `profile` under `chat info` because "a user is a chat type".

**Why it's wrong:** The existing `chat` group is about dialogs/peers. User identity operations (profile, block) and contacts (phone-book entries) are distinct Telegram concepts. Mixing them creates confusing UX (`tg chat block`? `tg chat profile`?).

**Do this instead:** Create dedicated `user` and `contact` command groups. This matches Telegram's own API namespaces (`users.*`, `contacts.*`) and keeps the CLI taxonomy clean.

### Anti-Pattern 2: Duplicating Session/Client Boilerplate

**What people do:** Copy-paste the config/store/withLock/withClient chain into every action, making slight modifications.

**Why it's wrong:** The boilerplate is ~12 lines of identical code in every action. Any change (e.g., adding a new global option) requires touching every file.

**Do this instead:** For v1.1, keep the existing pattern for consistency (every existing command uses it). The boilerplate is repetitive but explicit and debuggable. A future refactor could extract a `withSession()` helper, but v1.1 should not introduce that abstraction mid-flight.

### Anti-Pattern 3: Forgetting to Update the Output Pipeline

**What people do:** Add a new command that returns a new data shape, forget to add a human formatter, forget to add the list key to LIST_KEYS.

**Why it's wrong:** The command works in JSON mode but breaks in `--human` (falls through to `formatGeneric` which dumps raw JSON) or `--jsonl` (silently outputs nothing because the list key isn't recognized).

**Do this instead:** For every new output shape:
1. Add TypeScript interface to `types.ts`
2. Add serializer to `serialize.ts`
3. Add human formatter to `format.ts` AND add detection rule in `formatData()`
4. Add TOON formatter to `toon.ts`
5. If it's a list: add the key to `LIST_KEYS` in `fields.ts`

### Anti-Pattern 4: Using Raw API When High-Level Exists

**What people do:** Use `client.invoke(new Api.messages.DeleteMessages({ ... }))` instead of `client.deleteMessages()`.

**Why it's wrong:** The high-level method handles important edge cases: channels need `channels.DeleteMessages` (not `messages.DeleteMessages`), the method figures out the right API call based on entity type. Using raw API means you have to handle channel vs chat yourself.

**Do this instead:** Check if gramjs TelegramClient has a high-level method first (see `node_modules/telegram/client/messages.d.ts`). Use raw invoke only for APIs without high-level wrappers (GetFullUser, contacts.*, SendMedia for polls).

## Integration Points

### gramjs API Methods Required

| Feature | gramjs Method | Type | Notes |
|---------|--------------|------|-------|
| User profile | `client.invoke(new Api.users.GetFullUser({ id }))` | Raw | Returns UserFull with bio, common chats count, photos count |
| Get messages by ID | `client.getMessages(entity, { ids })` | High-level | Handles channel vs chat automatically |
| Get pinned | `client.getMessages(entity, { filter: InputMessagesFilterPinned })` | High-level | Or use message search with pinned filter (already exists) |
| Edit message | `client.editMessage(entity, { message, text })` | High-level | Returns edited Message, 48h time limit enforced by API |
| Delete messages | `client.deleteMessages(entity, ids, { revoke })` | High-level | `revoke` = delete for everyone |
| Pin message | `client.pinMessage(entity, msgId)` | High-level | notify defaults to false |
| Unpin message | `client.unpinMessage(entity, msgId)` | High-level | undefined msgId = unpin all |
| List contacts | `client.invoke(new Api.contacts.GetContacts({ hash: bigInt(0) }))` | Raw | hash=0 forces full list |
| Add contact | `client.invoke(new Api.contacts.AddContact({ id, firstName, lastName, phone }))` | Raw | id is InputUser |
| Delete contacts | `client.invoke(new Api.contacts.DeleteContacts({ id: [...] }))` | Raw | Takes array of InputUser |
| Search contacts | `client.invoke(new Api.contacts.Search({ q, limit }))` | Raw | Returns Found with users + chats |
| Block user | `client.invoke(new Api.contacts.Block({ id }))` | Raw | id is InputPeer |
| Unblock user | `client.invoke(new Api.contacts.Unblock({ id }))` | Raw | id is InputPeer |
| Send poll | `client.invoke(new Api.messages.SendMedia({ peer, media: InputMediaPoll, message }))` | Raw | Complex construction needed |

### Internal Module Boundaries

| Boundary | Communication | Modifications |
|----------|---------------|---------------|
| tg.ts -> user/index.ts | `program.addCommand(createUserCommand())` | Add import + registration |
| tg.ts -> contact/index.ts | `program.addCommand(createContactCommand())` | Add import + registration |
| tg.ts -> output.ts | `setToonMode()` in preAction | Add TOON flag handling |
| message/index.ts -> new actions | Import + Commander wiring | Add 6 new subcommand definitions |
| output.ts -> toon.ts | `toonFormat(data)` call | New dependency |
| serialize.ts -> types.ts | New interfaces | Add UserProfile, ContactItem, PollInfo |
| format.ts -> types.ts | New interfaces for type assertions | Import new types |
| fields.ts | LIST_KEYS constant | Add 'contacts' |

## Build Order (dependency-aware)

The features have these dependencies:

```
types.ts (new interfaces)
    |
    +-- serialize.ts (new serializers depend on types)
    |       |
    |       +-- All new commands (depend on serializers)
    |
    +-- format.ts (new formatters depend on types)
    |
    +-- toon.ts (depends on types, mirrors format.ts)
    |       |
    |       +-- output.ts (depends on toon.ts)
    |               |
    |               +-- tg.ts (depends on output.ts for new mode)
    |
    +-- fields.ts (trivial: add one key)
```

**Recommended build order:**

1. **Foundation types + serializers** -- types.ts additions, serialize.ts additions
2. **Message get + pinned** -- simplest new commands, reuse existing MessageItem type and formatMessages
3. **Message edit + delete + pin/unpin** -- next simplest, use high-level gramjs methods, minimal new types
4. **User profile + block/unblock** -- new command group, new UserProfile type, new formatter
5. **Contacts CRUD** -- new command group, new ContactItem type, new formatter
6. **Poll creation** -- most complex gramjs construction (InputMediaPoll), extends MessageItem
7. **TOON output format** -- cross-cutting concern, add last so all data shapes exist for testing
8. **Output pipeline wiring** -- tg.ts --toon option, mutual exclusion, toon.ts formatters

## Sources

- [gramjs users.GetFullUser docs](https://painor.gitbook.io/gramjs/working-with-other-users/users.getfulluser)
- [gramjs contacts.GetContacts docs](https://painor.gitbook.io/gramjs/working-with-contacts-and-top-peers/contacts.getcontacts)
- [gramjs contacts.AddContact docs](https://painor.gitbook.io/gramjs/working-with-contacts-and-top-peers/contacts.addcontact)
- [gramjs contacts.Search docs](https://painor.gitbook.io/gramjs/working-with-contacts-and-top-peers/contacts.search)
- [gramjs messages.EditMessage docs](https://painor.gitbook.io/gramjs/working-with-messages/messages.editmessage)
- [gramjs messages.DeleteMessages docs](https://painor.gitbook.io/gramjs/working-with-messages/messages.deletemessages)
- [gramjs messages.GetMessages docs](https://gram.js.org/tl/messages/GetMessages)
- [gramjs InputMediaPoll class](https://gram.js.org/beta/classes/Api.InputMediaPoll.html)
- [Telegram core API - contacts.Block](https://core.telegram.org/api/block)
- [Telegram core API - Polls](https://core.telegram.org/api/poll)
- [gramjs client messages.d.ts](local: node_modules/telegram/client/messages.d.ts) -- HIGH confidence, verified locally
- [gramjs client users.d.ts](local: node_modules/telegram/client/users.d.ts) -- HIGH confidence, verified locally
- Existing codebase patterns -- HIGH confidence, verified by reading all source files

---
*Architecture research for: Telegram CLI v1.1 feature integration*
*Researched: 2026-03-12*
