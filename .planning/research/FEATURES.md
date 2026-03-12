# Feature Research

**Domain:** Telegram CLI Client v1.1 -- User profiles, contacts, message management, block/unblock, TOON output, polls
**Researched:** 2026-03-12
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features that complete the v1.1 CLI as a fully capable Telegram client for agent workflows. Missing these undermines the value proposition of the existing commands.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Get messages by ID** | Agents frequently need to fetch specific messages after search results return IDs. The existing `history` command fetches ranges, but cherry-picking by ID is a fundamental operation. Two API routes: `messages.getMessages` for DMs/groups and `channels.getMessages` for channels/supergroups. | LOW | gramjs high-level `client.getMessages(entity, { ids: [...] })` handles routing automatically. Accept comma-separated IDs. Return same `MessageItem` shape as history. Existing `serializeMessage` reused. |
| **Get pinned messages** | Pinned messages are high-signal content (rules, FAQs, announcements). Agents reading a new group need pinned messages first. Telegram supports multiple pinned messages per chat. | LOW | Use existing `messages.search` with `inputMessagesFilterPinned` filter. The search command already supports `--filter pinned` since v1.0, but a dedicated `message pinned <chat>` subcommand is more discoverable. Alternatively, could be a flag on history: `--pinned`. |
| **Edit sent messages** | Agents that send messages need to correct mistakes. Standard Telegram operation. 48-hour edit window for regular chats; unlimited for saved messages and channel admins. | LOW | gramjs `client.editMessage(entity, { message: id, text: newText })`. Returns updated message. Must handle `MESSAGE_EDIT_TIME_EXPIRED` and `MESSAGE_NOT_MODIFIED` errors gracefully. |
| **Delete messages** | Agents need cleanup capability (remove temporary messages, retract errors). Telegram allows deleting own messages with no time limit. `--revoke` flag controls "delete for everyone". | LOW | gramjs `client.deleteMessages(entity, [ids], { revoke })`. Different API methods for channels vs chats but gramjs abstracts this. Returns affected message count. Must handle `MESSAGE_DELETE_FORBIDDEN` for service messages. |
| **Pin/unpin messages** | Agents managing channels or groups need to pin important announcements. Standard admin operation. | LOW | gramjs `client.pinMessage(entity, msgId)` or raw `Api.messages.UpdatePinnedMessage`. Flags: `--silent` (no notification), `--unpin`, `--one-side` (PM only, pin only for yourself). Also: `messages.unpinAllMessages` for bulk unpin. |
| **User profile (basic)** | Agents need to understand who they're interacting with. `chat info` already returns minimal user data but lacks bio, last seen, common chats, photos. `users.getFullUser` returns the full profile. | MEDIUM | Requires new `user` command group or subcommand. `users.getFullUser` returns: about (bio), profile photos, common_chats_count, blocked status, phone_calls_available, birthday, premium status. Also need `photos.getUserPhotos` for profile photo list and `messages.getCommonChats` for shared groups. Privacy restrictions mean last-seen may return approximate values (recently/last week/last month). |
| **Block/unblock users** | Safety feature -- agents need to block spam senders. Standard Telegram operation. | LOW | `contacts.block({ id: inputPeer })` and `contacts.unblock({ id: inputPeer })`. Returns bool. Also `contacts.getBlocked` for listing blocked users with pagination. Two blocklists: main (blocks all interaction) and story-only. For CLI, default to main blocklist. |

### Differentiators (Competitive Advantage)

Features that make this CLI uniquely valuable for agent and power-user workflows. No competitor offers these.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **TOON output format (`--toon`)** | Token-Oriented Object Notation reduces token consumption by 30-60% for LLM agent contexts. For an agent-first CLI where every byte of output counts against context windows, this is transformative. No Telegram CLI has anything like this. | MEDIUM | Use `@toon-format/toon` npm package. `encode()` converts any JSON-serializable value to TOON format. TOON excels at uniform arrays of objects (message lists, chat lists, member lists) which is exactly what this CLI outputs most. Integrate as new output mode alongside JSON, JSONL, and human. Key decision: TOON replaces the envelope or wraps the data? Recommend: output raw TOON data (no envelope) since TOON itself is structured. Needs formatters that mirror the JSON output shapes. |
| **Contacts management (list/add/delete/search)** | While v1.0 research flagged contacts as "anti-feature," the v1.1 scope explicitly includes them. For agents that manage user relationships (CRM workflows, outreach), contacts are essential. No competing CLI tool has full contact CRUD. | MEDIUM | `contacts.getContacts` (list all), `contacts.addContact` (add by userId, firstName, lastName, phone), `contacts.deleteContacts` (remove), `contacts.search` (search by query). The add operation accepts a user entity plus name fields -- does not require phone number. Import via `contacts.importContacts` for phone-number-based bulk add. Design as `contact` command group: `contact list`, `contact add`, `contact delete`, `contact search`. |
| **Send polls** | Polls are a uniquely interactive Telegram feature. Agent-driven polls enable survey workflows, team decision-making, and quiz creation. No CLI tool supports poll creation. | MEDIUM | Uses `messages.sendMedia` with `InputMediaPoll`. Poll constructor: question (1-255 chars), answers (2-10 options), flags for multiple_choice, quiz mode, public_voters, close_period (5-600 seconds), close_date. Quiz mode requires specifying correct_answer index and optional solution text. CLI design: `poll send <chat> --question "..." --option "A" --option "B" [--quiz --correct 0] [--multiple] [--anonymous false] [--close-in 300]`. |
| **User profile with rich data** | Beyond basic user info, return bio, common chats, profile photos, last seen status, premium status, birthday, blocked status. No CLI tool provides this depth. | MEDIUM | Combine `users.getFullUser` + `photos.getUserPhotos` + `messages.getCommonChats`. Design as `user info <user>` with kitchen-sink output. Add `user photos <user>` for photo list. UserStatus types: Online (with expiry), Offline (with was_online timestamp), Recently (1s-3d), LastWeek, LastMonth, LongTimeAgo, Empty. Privacy rules mean approximate values are common. |
| **Batch message get by ID** | Fetch multiple specific messages in one call across the same chat. Enables efficient "get these 5 messages I found in search" workflows. | LOW | Already natural from the API -- `getMessages` accepts a vector of IDs. CLI: `message get <chat> <id1,id2,id3>`. Comma-separated like existing `replies` command pattern. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem useful for v1.1 but should be explicitly excluded or handled carefully.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Bulk message deletion** | "Delete all my messages in a chat" | Extremely dangerous for agents. Telegram rate-limits delete operations. One mistake could wipe entire chat history. No undo. | Support deleting specific IDs only (comma-separated). Never add `--all` or range-based deletion. Agents must be explicit about what to delete. |
| **Edit others' messages** | "I'm an admin, let me edit any message" | Telegram only allows editing your own messages (except channel posts by admins). Attempting to edit others' messages silently fails or errors. Creates confusion. | Document the ownership requirement clearly. Return `MESSAGE_AUTHOR_REQUIRED` with helpful error text. |
| **Auto-close polls** | "Set a timer to automatically close the poll" | `close_period` (5-600 seconds max) and `close_date` are API-level features but close_period max is only 10 minutes. Users expect hours/days. CLI would need to stay running or use scheduled messages. | Expose `--close-in <seconds>` for API-native timer (max 600s). For longer durations, suggest the user runs a separate close command later. |
| **Contact import by phone number** | "Import my phone contacts" | `contacts.importContacts` uploads phone numbers to Telegram servers. Privacy concern -- agents should not be bulk-uploading phone numbers. | Support `contact add` which adds existing Telegram users. Do not implement bulk phone import. |
| **Real-time block status monitoring** | "Notify me when someone I blocked messages me" | Requires persistent connection and update handling. Blocked users cannot message you anyway. | `contacts.getBlocked` for listing. Block action returns success/failure. No monitoring needed. |
| **TOON as default output** | "Make TOON the default since this is agent-first" | TOON is new (2025), not universally supported by all LLMs/tools, and not human-readable. JSON is the established standard for CLI tools and existing integrations would break. | TOON as opt-in via `--toon` flag, alongside `--json` (default), `--human`, `--jsonl`. Recommend TOON in documentation for token-conscious agents. |
| **User profile photo download** | "Download all profile photos" | `photos.getUserPhotos` returns photo metadata but downloading each requires separate `client.downloadProfilePhoto()` calls. Mixes concerns of profile viewing with media download. | `user info` returns photo metadata (count, dates). For actual download, reuse existing `media download` command or add `user photos <user> --download`. Keep profile viewing and downloading separate. |

## Feature Dependencies

```
[Existing: Peer Resolution + Client + Session + Output]
    |
    +---> [Get Messages by ID] (no new deps, uses existing getMessages/serialize)
    |
    +---> [Get Pinned Messages] (no new deps, uses existing search with filter)
    |
    +---> [Edit Messages] (requires: existing send capability for testing)
    |         |
    |         +---> depends on knowing message ownership
    |
    +---> [Delete Messages] (no new deps, independent operation)
    |
    +---> [Pin/Unpin Messages] (no new deps, independent operation)
    |
    +---> [User Profile] (new command group, new types, new serialize/format)
    |         |
    |         +---> [User Photos] (enhances user profile)
    |         |
    |         +---> [Common Chats] (enhances user profile)
    |
    +---> [Contacts Management] (new command group, new types)
    |         |
    |         +---> [Contact List]
    |         +---> [Contact Add] (requires peer resolution)
    |         +---> [Contact Delete]
    |         +---> [Contact Search]
    |
    +---> [Block/Unblock] (new command group or subcommand, simple API calls)
    |
    +---> [TOON Output] (cross-cutting, modifies output.ts, adds new mode)
    |         |
    |         +---> enhances ALL existing commands
    |         +---> requires @toon-format/toon npm dependency
    |
    +---> [Send Polls] (requires: existing send infrastructure + new InputMediaPoll)
              |
              +---> uses messages.sendMedia (similar pattern to media send)

[TOON Output] ----cross-cuts-all-commands----> (every existing + new command)
```

### Dependency Notes

- **Get Messages by ID requires nothing new:** The API call is trivial, the serialize/format infrastructure exists. This is the easiest feature to ship.
- **Get Pinned Messages is already partially done:** The search command's `--filter pinned` already works. A dedicated command is a UX convenience, not new infrastructure.
- **Edit/Delete/Pin are independent operations:** Each is a single API call with simple request/response. No shared dependencies between them. Can be built in parallel.
- **User Profile is the most complex new feature:** Requires a new `user` command group, new TypeScript types (`UserProfile`, `UserPhoto`), new serializer and formatter functions. Three separate API calls to assemble full profile data.
- **Contacts Management is a self-contained module:** New `contact` command group with list/add/delete/search subcommands. No dependency on other v1.1 features. Needs new types for contact list items.
- **Block/Unblock is trivially simple:** Two API calls (block/unblock) plus a list call. Could be subcommands under `user` or a standalone `block` command.
- **TOON Output is cross-cutting but isolated:** Modifies `output.ts` to add a fourth mode. Does not change any command logic, only how results are serialized. Should be done after other features are stable so it can format all output shapes.
- **Polls require the most API knowledge:** Must construct `Poll` and `InputMediaPoll` objects with correct flags. Quiz mode adds complexity (correct answer, solution). Similar pattern to `media send` but with structured data instead of files.

## MVP Definition

### Ship in v1.1 (All Features)

This is a subsequent milestone, not a first launch. All listed features are committed scope.

- [x] **Get messages by ID** -- agents need cherry-picking after search results
- [x] **Get pinned messages** -- high-signal content discovery for new chats
- [x] **Edit sent messages** -- correct agent-sent messages without delete/resend
- [x] **Delete messages** -- cleanup capability for agent workflows
- [x] **Pin/unpin messages** -- admin operations for agents managing channels
- [x] **User profile** -- understand who agents are interacting with
- [x] **Contacts list/add/delete/search** -- user relationship management
- [x] **Block/unblock** -- safety operations for agents
- [x] **TOON output** -- token efficiency for the primary consumer (Claude Code agents)
- [x] **Send polls** -- interactive content creation for agent workflows

### Defer to v1.2+ (Not in Scope)

- [ ] **User profile photo download** -- use existing media download; not a profile concern
- [ ] **Contact import from phone numbers** -- privacy risk, not needed for agent workflows
- [ ] **Poll results reading/tracking** -- can use search to find poll messages; dedicated tracking is complex
- [ ] **Unpin all messages** -- edge case, can be done with pin --unpin on each ID
- [ ] **Block list management (bulk)** -- contacts.setBlocked replaces entire list; too risky
- [ ] **User status monitoring** -- requires persistent connection, different execution model

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority | Dependencies on Existing |
|---------|------------|---------------------|----------|--------------------------|
| Get messages by ID | HIGH | LOW | P1 | Uses getMessages, serializeMessage, existing output |
| Get pinned messages | HIGH | LOW | P1 | Uses search with filter, existing output |
| Edit sent messages | MEDIUM | LOW | P1 | Uses editMessage, serializeMessage |
| Delete messages | MEDIUM | LOW | P1 | Uses deleteMessages, returns affected count |
| Pin/unpin messages | MEDIUM | LOW | P1 | Uses updatePinnedMessage, simple bool result |
| User profile | HIGH | MEDIUM | P1 | New command group, new types, 3 API calls |
| Block/unblock | MEDIUM | LOW | P1 | Simple API calls, minimal new types |
| Contacts management | MEDIUM | MEDIUM | P2 | New command group, 4 subcommands, new types |
| TOON output | HIGH | MEDIUM | P2 | Cross-cutting, new npm dep, new output mode |
| Send polls | LOW | MEDIUM | P2 | Complex constructor, quiz mode flags |

**Priority key:**
- P1: Core operations that complete the messaging and user management story
- P2: Valuable but can ship slightly later without blocking the others

## Detailed Feature Specifications

### Get Messages by ID

**Command:** `tg message get <chat> <msg-ids>`
**Arguments:**
- `chat` -- Chat ID, username, or @username
- `msg-ids` -- Comma-separated message IDs (matches existing `replies` pattern)

**Output:** Same `{ messages: MessageItem[], count: number }` shape as `message history`.

**API calls:**
- DMs/basic groups: `messages.getMessages({ id: [InputMessageID(id=N)] })`
- Channels/supergroups: `channels.getMessages({ channel: inputChannel, id: [InputMessageID(id=N)] })`
- gramjs `client.getMessages(entity, { ids: [1, 2, 3] })` abstracts routing

**Edge cases:**
- Deleted messages return `MessageEmpty` objects -- filter these out, report count of found vs requested
- Invalid IDs silently return empty -- no error from API, just missing results
- Channel messages require channel access (membership or public)

### Get Pinned Messages

**Command:** `tg message pinned <chat>`
**Options:** `--limit <n>` (default 50), `--offset <n>`

**Implementation:** Reuse `messages.search` with `filter: new Api.InputMessagesFilterPinned()`. Same pagination as search. The existing search infrastructure handles this; the new command is a convenience wrapper.

**Alternative:** Could be `tg message history <chat> --pinned` flag. Recommend dedicated subcommand for discoverability.

### Edit Sent Messages

**Command:** `tg message edit <chat> <msg-id> <text>`
**Arguments:**
- `chat` -- Target chat
- `msg-id` -- Message ID to edit
- `text` -- New message text (supports stdin via `-`)

**API call:** `client.editMessage(entity, { message: msgId, text: newText })`

**Error handling:**
- `MESSAGE_EDIT_TIME_EXPIRED` -- "Cannot edit: message is older than 48 hours"
- `MESSAGE_NOT_MODIFIED` -- "Message text is unchanged"
- `MESSAGE_EMPTY` -- "New text cannot be empty"
- `CHAT_ADMIN_REQUIRED` -- "Admin privileges required to edit this message"
- `MESSAGE_AUTHOR_REQUIRED` -- "Can only edit your own messages"

**Returns:** Updated `MessageItem` (the edited message).

### Delete Messages

**Command:** `tg message delete <chat> <msg-ids>`
**Arguments:**
- `chat` -- Target chat
- `msg-ids` -- Comma-separated message IDs

**Options:** `--revoke` -- Delete for all participants (default: only for self)

**API calls:**
- Regular chats: `messages.deleteMessages({ id: [...], revoke })`
- Channels: `channels.deleteMessages({ channel, id: [...] })` (always deletes for everyone)

**Returns:** `{ deleted: number, messageIds: number[] }`

**Edge cases:**
- `MESSAGE_DELETE_FORBIDDEN` for service messages (join/leave notifications)
- Channel deletion always affects everyone regardless of `--revoke`
- Cannot delete others' messages unless admin with delete permission

### Pin/Unpin Messages

**Command:** `tg message pin <chat> <msg-id>`
**Options:**
- `--unpin` -- Unpin instead of pin
- `--silent` -- No notification to chat members
- `--one-side` -- Pin only for yourself (DMs only)

**API call:** `messages.updatePinnedMessage({ peer, id, silent, unpin, pm_oneside })`

**Returns:** `{ pinned: boolean, messageId: number, silent: boolean }`

### User Profile

**Command:** `tg user info <user>`
**Arguments:** `user` -- User ID, username, or @username

**API calls (composed):**
1. `users.getFullUser({ id: inputUser })` -- bio, blocked, premium, birthday, common_chats_count
2. `photos.getUserPhotos({ userId, offset: 0, maxId: 0, limit: 10 })` -- profile photo metadata
3. `messages.getCommonChats({ userId, maxId: 0, limit: 100 })` -- shared groups (optional, expensive)

**Output type (new `UserProfile`):**
```typescript
interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  bio: string | null;
  isBot: boolean;
  isPremium: boolean;
  isVerified: boolean;
  isBlocked: boolean;
  lastSeen: string | null;       // ISO date or "recently" | "lastWeek" | "lastMonth" | "longTimeAgo"
  commonChatsCount: number;
  profilePhotos: number;          // count only; use photos subcommand for details
  birthday: string | null;
  canPinMessage: boolean;
  phoneCallsAvailable: boolean;
  voiceMessagesForbidden: boolean;
}
```

**UserStatus mapping:**
- `UserStatusOnline` -> ISO date of expiry (they're online now)
- `UserStatusOffline` -> ISO date of was_online
- `UserStatusRecently` -> string "recently" (privacy: 1s-3 days ago)
- `UserStatusLastWeek` -> string "within_week"
- `UserStatusLastMonth` -> string "within_month"
- `UserStatusEmpty` -> null

### Contacts Management

**Commands:**
- `tg contact list` -- List all contacts
- `tg contact add <user> [--first-name <n>] [--last-name <n>] [--phone <p>]` -- Add user as contact
- `tg contact delete <user-ids>` -- Remove contacts (comma-separated)
- `tg contact search <query>` -- Search contacts by name/username

**API calls:**
- List: `contacts.getContacts({ hash: 0 })` -> returns User objects with contact info
- Add: `contacts.addContact({ id: inputUser, firstName, lastName, phone, addPhonePrivacyException })` -> returns Updates
- Delete: `contacts.deleteContacts({ id: [inputUsers] })` -> returns Updates
- Search: `contacts.search({ q: query, limit })` -> returns users and chats matching query

**Output type (new `ContactItem`):**
```typescript
interface ContactItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null;
  isBot: boolean;
  status: string | null;          // last seen status
}
```

### Block/Unblock

**Commands:**
- `tg user block <user>` -- Block user (main blocklist)
- `tg user unblock <user>` -- Unblock user
- `tg user blocked` -- List blocked users

**API calls:**
- Block: `contacts.block({ id: inputPeer })` -> returns bool
- Unblock: `contacts.unblock({ id: inputPeer })` -> returns bool
- List: `contacts.getBlocked({ offset: 0, limit: 100 })` -> returns blocked users

**Returns:**
- Block/unblock: `{ blocked: boolean, userId: string }`
- List: `{ users: BlockedUser[], count: number }`

### TOON Output

**Flag:** `--toon` (global option, like `--json`, `--human`, `--jsonl`)

**Implementation in output.ts:**
1. Add `_toonMode` flag alongside existing `_humanMode`, `_jsonlMode`
2. In `outputSuccess()`, when TOON mode: `encode(data)` from `@toon-format/toon`
3. No envelope in TOON mode (like JSONL) -- TOON is self-describing
4. Errors still go to stderr in human-readable form (same as JSONL mode)

**Example output for message list:**
```
messages[3]{id,text,date,senderId,senderName,mediaType,type}:
  42,Hello world,2026-03-12T10:00:00Z,12345,Alice,,message
  43,Check this out,2026-03-12T10:01:00Z,12345,Alice,photo,message
  44,Thanks!,2026-03-12T10:02:00Z,67890,Bob,,message
count: 3
```

**Key design decisions:**
- TOON mode and JSONL mode are mutually exclusive
- `--fields` selection applies before TOON encoding (reduces columns)
- TOON excels at uniform arrays -- chat lists, message lists, member lists, contact lists
- Nested objects (like ChatInfo) are fine in TOON; it uses YAML-style indentation
- Add `@toon-format/toon` as production dependency

### Send Polls

**Command:** `tg poll send <chat> --question <q> --option <o1> --option <o2> [--option <o3>...]`
**Options:**
- `--question <text>` -- Poll question (1-255 characters)
- `--option <text>` -- Poll answer (repeatable, 2-10 options, each 1-100 characters)
- `--quiz` -- Quiz mode (one correct answer)
- `--correct <index>` -- Correct answer index (0-based, required with --quiz)
- `--solution <text>` -- Explanation shown after answering (quiz mode only)
- `--multiple` -- Allow multiple answer selection
- `--public` -- Make votes publicly visible (non-anonymous)
- `--close-in <seconds>` -- Auto-close after N seconds (5-600)
- `--reply-to <msgId>` -- Reply to specific message
- `--topic <topicId>` -- Forum topic

**API call:** `messages.sendMedia` with `InputMediaPoll`:
```typescript
new Api.messages.SendMedia({
  peer: inputPeer,
  media: new Api.InputMediaPoll({
    poll: new Api.Poll({
      id: BigInt(0),  // auto-assigned by server
      question: new Api.TextWithEntities({ text: question, entities: [] }),
      answers: options.map((text, i) => new Api.PollAnswer({
        text: new Api.TextWithEntities({ text, entities: [] }),
        option: Buffer.from([i]),
      })),
      publicVoters: isPublic,
      multipleChoice: isMultiple,
      quiz: isQuiz,
      closePeriod: closeIn,
    }),
    correctAnswers: isQuiz ? [Buffer.from([correctIndex])] : undefined,
    solution: solution,
  }),
  message: '',
  replyTo: replyToMsgId,
})
```

**Returns:** `MessageItem` (the sent poll message, with mediaType: 'poll')

**Edge cases:**
- Quiz mode requires exactly one correct answer
- Cannot combine `--close-in` with `--close-date` (API limitation, but we only expose close-in)
- Maximum 10 options enforced client-side with clear error
- Question length 1-255 characters enforced client-side
- Anonymous by default (must explicitly pass `--public` to show voters)

## Competitor Feature Analysis

| Feature | vysheng telegram-cli | tg (paul-nameless) | tegracli | Our v1.1 Approach |
|---------|---------------------|-------------------|----------|-------------------|
| Get messages by ID | `get_message` | No | No | `message get <chat> <ids>` with batch support |
| Pinned messages | No | View pinned | No | `message pinned <chat>` with pagination |
| Edit messages | No | Edit own | No | `message edit <chat> <id> <text>` with stdin support |
| Delete messages | `delete_msg` | Delete | No | `message delete <chat> <ids>` with `--revoke` |
| Pin messages | No | No | No | `message pin <chat> <id>` with `--silent`, `--unpin` |
| User profile | `user_info` (basic) | View profile | No | `user info <user>` with bio, photos, common chats, last seen |
| Contacts | `add_contact`, `del_contact` | View contacts | No | Full CRUD: `contact list/add/delete/search` |
| Block/unblock | `block_user`, `unblock_user` | Block in UI | No | `user block/unblock <user>`, `user blocked` list |
| Token-efficient output | N/A | N/A | N/A | `--toon` flag, 30-60% token reduction |
| Polls | No | Send polls in UI | No | `poll send` with quiz mode, multiple choice, timers |

### Key Takeaway

The v1.1 features bring this CLI to feature parity with vysheng's telegram-cli on user/contact/message management, while adding capabilities no tool has (TOON output, poll creation from CLI, batch message-by-ID fetching). The edit/delete/pin operations are the most commonly requested features for any messaging CLI. TOON output is a genuine innovation for the agent-first positioning.

## Sources

- [Telegram users.getFullUser API](https://core.telegram.org/method/users.getFullUser) -- User profile method (HIGH confidence)
- [Telegram UserFull constructor](https://core.telegram.org/constructor/userFull) -- All profile fields (HIGH confidence)
- [Telegram UserStatus types](https://core.telegram.org/type/UserStatus) -- Last seen status values (HIGH confidence)
- [Telegram messages.editMessage API](https://core.telegram.org/method/messages.editMessage) -- Edit method and error codes (HIGH confidence)
- [Telegram messages.deleteMessages API](https://core.telegram.org/method/messages.deleteMessages) -- Delete method with revoke flag (HIGH confidence)
- [Telegram messages.updatePinnedMessage API](https://core.telegram.org/method/messages.updatePinnedMessage) -- Pin/unpin with flags (HIGH confidence)
- [Telegram Pinned Messages API](https://core.telegram.org/api/pin) -- Pin architecture overview (HIGH confidence)
- [Telegram Contacts API](https://core.telegram.org/api/contacts) -- Contact management methods (HIGH confidence)
- [Telegram Block API](https://core.telegram.org/api/block) -- Block/unblock with story blocklist (HIGH confidence)
- [Telegram Poll constructor](https://core.telegram.org/constructor/poll) -- Poll fields and constraints (HIGH confidence)
- [Telegram channels.getMessages API](https://core.telegram.org/method/channels.getMessages) -- Channel-specific message fetch (HIGH confidence)
- [GramJS GetFullUser](https://gram.js.org/tl/users/GetFullUser) -- gramjs usage example (HIGH confidence)
- [GramJS editMessage](https://painor.gitbook.io/gramjs/working-with-messages/messages.editmessage) -- gramjs edit example (HIGH confidence)
- [GramJS deleteMessages](https://painor.gitbook.io/gramjs/working-with-messages/messages.deletemessages) -- gramjs delete example (HIGH confidence)
- [GramJS GetUserPhotos](https://gram.js.org/tl/photos/GetUserPhotos) -- gramjs photo retrieval (HIGH confidence)
- [GramJS GetCommonChats](https://gram.js.org/tl/messages/GetCommonChats) -- gramjs common chats (HIGH confidence)
- [TOON Format specification](https://github.com/toon-format/toon) -- TOON syntax, SDK, examples (HIGH confidence)
- [TOON API reference](https://toonformat.dev/reference/api) -- encode/decode function signatures (HIGH confidence)
- [@toon-format/toon npm](https://www.npmjs.com/package/@toon-format/toon) -- TypeScript SDK (HIGH confidence)
- [Telegram message edit 48h limit](https://www.ticktechtold.com/how-to-edit-telegram-sent-message/) -- 48-hour edit window (MEDIUM confidence, community source)
- [Telegram message delete no time limit](https://www.oreateai.com/blog/editing-telegram-messages-how-long-do-you-have/) -- Unlimited delete window (MEDIUM confidence, community source)
- [TOON token reduction benchmarks](https://betterstack.com/community/guides/ai/toon-explained/) -- 30-60% token savings (MEDIUM confidence)

---
*Feature research for: Telegram CLI v1.1 -- User profiles, contacts, message management, block/unblock, TOON output, polls*
*Researched: 2026-03-12*
