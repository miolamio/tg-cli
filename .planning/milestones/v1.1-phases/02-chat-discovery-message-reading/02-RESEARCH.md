# Phase 2: Chat Discovery & Message Reading - Research

**Researched:** 2026-03-11
**Domain:** gramjs chat/dialog API, message retrieval, search, peer resolution
**Confidence:** HIGH

## Summary

Phase 2 implements 11 requirements (CHAT-01 through CHAT-07, READ-01 through READ-04) covering chat listing, chat info, join/leave groups, peer resolution, invite link checking, member listing, message history, date filtering, per-chat search, and global search. All operations use gramjs (telegram package v2.26.22) which provides high-level convenience methods (`getDialogs`, `getMessages`, `getParticipants`, `getEntity`) alongside raw MTProto API access via `client.invoke()`.

The existing codebase establishes strong patterns: `withClient` for connection lifecycle, `outputSuccess`/`outputError` for JSON envelopes on stdout, `logStatus` for stderr progress, Commander.js command groups in `src/commands/{noun}/`, and vitest for testing with comprehensive gramjs mocks. Phase 2 follows these patterns exactly, adding `src/commands/chat/` and `src/commands/message/` directories.

A critical finding is that the existing `withClient` has a hardcoded 30-second timeout. Some Phase 2 operations (listing hundreds of dialogs, searching large histories) can exceed this. The timeout must be made configurable or increased for Phase 2 commands.

**Primary recommendation:** Use gramjs high-level methods (`client.getDialogs()`, `client.getMessages()`, `client.getParticipants()`) with their built-in pagination support, falling back to `client.invoke()` only for join/leave/invite operations that lack convenience wrappers.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Chat list output: Minimal fields per chat: id, title, type (user/group/channel/supergroup), username, unreadCount
- Agents call `tg chat info` for detailed data -- list stays lean
- Default sort: last activity (most recently active first, matches Telegram's native dialog order)
- `--type` flag for filtering: `tg chat list --type group`, `--type channel`, etc.
- Paginated with `--limit` / `--offset`, default limit 50
- Chat info detail level: Kitchen sink -- description, member count, creation date, photo URL, linked channel/group, slowmode settings, permissions, admin list, banned users, invite link, migration info
- Include everything gramjs exposes -- some fields may require admin rights (note in output when unavailable)
- Message serialization: Agent-optimized fields: id, text, date, senderId, senderName, replyToMsgId, forwardFrom, mediaType
- Dates in ISO 8601 UTC format (`2026-03-11T09:15:00Z`)
- Text formatting: Convert Telegram entities to Markdown (**bold**, _italic_, [link](url), `code`, etc.)
- Non-text messages: `mediaType` field + caption as `text`. Service messages get `type: "service"` with `actionText`
- Stickers: `mediaType: "sticker"` with `emoji` field
- Pagination model: Offset + limit for both chat list and message history, default limit 50, response includes `total` count for navigation
- Date range filtering: `--since` and `--until` with ISO date strings (date-only or full ISO datetime)
- Per-chat search: Same message format as history, just filtered by query. Same pagination.
- Global search (no `--chat`): Flat list of messages, each including `chatId` and `chatTitle` for context
- Sort order: Newest first (chronological descending)
- `--query` / `-q` is required for search -- browsing without query uses `tg message history`

### Claude's Discretion
- Exact gramjs API calls for each operation (getDialogs, getMessages, etc.)
- Peer resolution implementation (how to map username/ID/phone to InputPeer)
- Join/leave group implementation details
- Member list pagination strategy
- Error handling for private chats, restricted groups, missing permissions
- Command aliases (e.g., `tg ls` for `tg chat list`)

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CHAT-01 | List all dialogs/chats with type, name, unread count | `client.getDialogs()` returns `TotalList<Dialog>` with `.entity`, `.unreadCount`, `.name`, `.isUser`, `.isGroup`, `.isChannel` |
| CHAT-02 | Get detailed info for a chat (title, username, member count, description) | `client.invoke(new Api.channels.GetFullChannel())` / `client.invoke(new Api.messages.GetFullChat())` returns `ChannelFull`/`ChatFull` with full detail |
| CHAT-03 | Join a group/channel by username or invite link | `client.invoke(new Api.channels.JoinChannel())` for public + `client.invoke(new Api.messages.ImportChatInvite())` for invite links |
| CHAT-04 | Leave a group/channel | `client.invoke(new Api.channels.LeaveChannel())` for channels/supergroups |
| CHAT-05 | Resolve a peer by username, phone number, or numeric ID | `client.getEntity()` accepts string usernames, numeric IDs, or phone numbers; returns `User`/`Chat`/`Channel` |
| CHAT-06 | Resolve invite links to chat info before joining | `client.invoke(new Api.messages.CheckChatInvite())` returns `ChatInvite`/`ChatInviteAlready`/`ChatInvitePeek` |
| CHAT-07 | List members of a group/channel with pagination | `client.getParticipants()` with `limit`/`offset`/`search`/`filter` params, returns `TotalList<User>` |
| READ-01 | Read message history with pagination | `client.getMessages(entity, { limit, offsetId })` returns `TotalList<Message>` |
| READ-02 | Filter message history by date range | gramjs `offsetDate`, `minId`, `maxId` params on `getMessages()` + manual date-to-offset conversion |
| READ-03 | Search messages in a specific chat by keyword | `client.getMessages(entity, { search: "query" })` triggers gramjs to use `messages.Search` internally |
| READ-04 | Search messages globally across all chats | `client.getMessages(undefined, { search: "query" })` triggers `messages.SearchGlobal` internally |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | Telegram MTProto client | Already in use; provides getDialogs, getMessages, getParticipants, invoke |
| commander | ^14.0.3 | CLI command/option parsing | Already in use; subcommand groups with optsWithGlobals() |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| zod | ^4.3.6 | Runtime validation of CLI inputs | Validate --since/--until date strings, numeric IDs |

### No New Dependencies
Phase 2 requires NO new npm packages. All functionality is covered by gramjs + existing project dependencies.

**Installation:**
```bash
# No additional packages needed
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    chat/
      index.ts          # createChatCommand() - Commander group
      list.ts           # chatListAction - CHAT-01
      info.ts           # chatInfoAction - CHAT-02
      join.ts           # chatJoinAction - CHAT-03
      leave.ts          # chatLeaveAction - CHAT-04
      resolve.ts        # chatResolveAction - CHAT-05
      invite-info.ts    # chatInviteInfoAction - CHAT-06
      members.ts        # chatMembersAction - CHAT-07
    message/
      index.ts          # createMessageCommand() - Commander group
      history.ts        # messageHistoryAction - READ-01, READ-02
      search.ts         # messageSearchAction - READ-03, READ-04
  lib/
    types.ts            # Add ChatListItem, ChatInfo, MessageItem, etc.
    serialize.ts        # Shared serialization: Dialog -> ChatListItem, Message -> MessageItem
    peer.ts             # Peer resolution helper: username/ID/phone/invite -> entity
    entity-to-markdown.ts  # Convert Telegram MessageEntity[] to Markdown text
```

### Pattern 1: Connect-Per-Command with withClient
**What:** Every command opens a connection, does work, and destroys the client.
**When to use:** All Phase 2 commands.
**Example:**
```typescript
// Source: existing src/commands/auth/status.ts pattern
export async function chatListAction(this: Command): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions & ChatListOptions;
  const config = createConfig(opts.config);
  const { apiId, apiHash } = getCredentialsOrThrow(config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(opts.profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run `tg auth login` first.', 'NOT_AUTHENTICATED');
        return;
      }
      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        const dialogs = await client.getDialogs({ limit: opts.limit });
        // serialize and output
        outputSuccess({ chats: serialized, total: dialogs.total });
      });
    });
  } catch (err: unknown) {
    const { message, code } = formatError(err);
    outputError(message, code);
  }
}
```

### Pattern 2: Commander Subcommand Group
**What:** Group related commands under a noun (`chat`, `message`).
**When to use:** For organizing the two new command groups.
**Example:**
```typescript
// Source: existing src/commands/auth/index.ts pattern
import { Command } from 'commander';
import { chatListAction } from './list.js';
import { chatInfoAction } from './info.js';
// ...

export function createChatCommand(): Command {
  const chat = new Command('chat')
    .description('Chat discovery and management');

  chat
    .command('list')
    .description('List all chats/dialogs')
    .option('--type <type>', 'Filter by type: user, group, channel, supergroup')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(chatListAction);

  chat
    .command('info')
    .argument('<chat>', 'Chat ID, username, or @username')
    .description('Get detailed chat info')
    .action(chatInfoAction);

  // ... more subcommands

  return chat;
}
```

### Pattern 3: Shared Serialization Layer
**What:** Centralized functions that convert gramjs objects to the JSON output shapes defined in CONTEXT.md.
**When to use:** Every command that returns chat or message data.
**Why:** The user decided search and history use identical message shapes. A shared serializer ensures consistency.
**Example:**
```typescript
// src/lib/serialize.ts
import { Api } from 'telegram';
import type { Dialog } from 'telegram/tl/custom/dialog';

export interface ChatListItem {
  id: string;           // bigint -> string for JSON safety
  title: string;
  type: 'user' | 'group' | 'channel' | 'supergroup';
  username: string | null;
  unreadCount: number;
}

export function serializeDialog(dialog: Dialog): ChatListItem {
  return {
    id: dialog.id?.toString() ?? '',
    title: dialog.title ?? dialog.name ?? '',
    type: dialogType(dialog),
    username: entityUsername(dialog.entity) ?? null,
    unreadCount: dialog.unreadCount,
  };
}

function dialogType(dialog: Dialog): ChatListItem['type'] {
  if (dialog.isUser) return 'user';
  if (dialog.isChannel) {
    const entity = dialog.entity as Api.Channel;
    if (entity.megagroup) return 'supergroup';
    return 'channel';
  }
  return 'group';  // isGroup for basic Chat
}
```

### Pattern 4: Peer Resolution Helper
**What:** Unified function to resolve various input formats to gramjs entities.
**When to use:** Any command accepting a chat identifier argument.
**Example:**
```typescript
// src/lib/peer.ts
import { TelegramClient, Api } from 'telegram';

export async function resolveEntity(
  client: TelegramClient,
  input: string,
): Promise<Api.User | Api.Chat | Api.Channel> {
  // gramjs getEntity handles: username strings, numeric IDs, phone numbers
  // For invite links (t.me/+xxx), extract hash and use CheckChatInvite
  if (input.includes('/+') || input.includes('joinchat/')) {
    const hash = extractInviteHash(input);
    const result = await client.invoke(new Api.messages.CheckChatInvite({ hash }));
    // Return chat info from result
  }

  // Try numeric ID first
  const numId = Number(input);
  if (!isNaN(numId)) {
    return await client.getEntity(numId) as Api.User | Api.Chat | Api.Channel;
  }

  // Username (with or without @)
  const username = input.startsWith('@') ? input.slice(1) : input;
  return await client.getEntity(username) as Api.User | Api.Chat | Api.Channel;
}

function extractInviteHash(link: string): string {
  // Handle t.me/+HASH, t.me/joinchat/HASH, telegram.me/+HASH
  const match = link.match(/(?:joinchat\/|\+)([a-zA-Z0-9_-]+)/);
  if (!match) throw new TgError('Invalid invite link', 'INVALID_INVITE');
  return match[1];
}
```

### Anti-Patterns to Avoid
- **Using `client.iterDialogs()` directly in action handlers:** The async iterator pattern is harder to serialize. Use `client.getDialogs({ limit })` which returns a `TotalList<Dialog>` array with a `.total` property.
- **Forgetting to convert BigInteger IDs to strings:** gramjs uses `big-integer` library for IDs. These must be `.toString()` for JSON output. Never use `Number()` on them -- they overflow JS safe integers.
- **Hardcoding entity type checks with `instanceof`:** Use the Dialog helper properties (`dialog.isUser`, `dialog.isGroup`, `dialog.isChannel`) and Channel properties (`entity.megagroup`, `entity.broadcast`) instead.
- **Ignoring the `total` property on TotalList:** `TotalList<T>` extends Array but has a `.total` number property. This must be included in output for pagination navigation.
- **Calling getFullChannel on basic Chat entities:** `channels.GetFullChannel` only works for channels/supergroups. Use `messages.GetFullChat` for basic group chats. The entity type determines which API call to use.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Peer resolution (username/ID/phone -> entity) | Custom MTProto resolver | `client.getEntity(input)` | gramjs handles all EntityLike types: strings, numbers, bigInts, phone numbers. It resolves usernames via contacts.ResolveUsername internally. |
| Message pagination | Custom offset tracking | `client.getMessages(entity, { limit, offsetId })` | gramjs `_MessagesIter` internally picks GetHistory vs Search vs SearchGlobal based on parameters. Returns `TotalList` with `.total`. |
| Dialog pagination | Custom dialog offset management | `client.getDialogs({ limit, offsetDate })` | gramjs `_DialogsIter` handles FloodWait auto-sleep, deduplication, and offset tracking internally. |
| Participant pagination | Custom channel member fetcher | `client.getParticipants(entity, { limit, offset, search })` | gramjs handles the ChannelParticipantsFilter complexity and search internally. |
| Message entity-to-markdown conversion | Regex-based text extraction | Custom but simple entity walker | Telegram entities are offset/length pairs on the raw text. A ~50-line function handles all entity types -- no library needed, but must be purpose-built. |

**Key insight:** gramjs's high-level methods (`getDialogs`, `getMessages`, `getParticipants`, `getEntity`) handle most complexity. The Phase 2 commands are thin wrappers that call these methods and serialize their output. The only raw `client.invoke()` calls needed are for join/leave/invite operations.

## Common Pitfalls

### Pitfall 1: BigInteger ID Serialization
**What goes wrong:** gramjs returns chat/user IDs as `big-integer` BigInteger objects, not JavaScript numbers. `JSON.stringify()` turns them into `{}` (empty object).
**Why it happens:** Telegram IDs can exceed `Number.MAX_SAFE_INTEGER` (2^53 - 1). The gramjs library uses the `big-integer` npm package for safety.
**How to avoid:** Always call `.toString()` on ID values before including in output objects. Use a serialization function like `bigIntToString(id)` to handle null/undefined cases.
**Warning signs:** JSON output shows `"id": {}` or `"id": "[object Object]"` instead of numeric strings.

### Pitfall 2: 30-Second Client Timeout
**What goes wrong:** `withClient` has a hardcoded 30s timeout. Fetching large dialog lists (100+ chats) or searching large histories can exceed this, causing `TIMEOUT` errors.
**Why it happens:** The timeout was designed for quick Phase 1 operations (auth check, logout). Phase 2 operations can be significantly slower due to pagination and FloodWait.
**How to avoid:** Make the timeout configurable in `withClient`, e.g., `withClient(opts, fn, { timeout: 120_000 })`. Use 120s default for Phase 2 operations or remove the timeout for long-running operations and let the user Ctrl+C.
**Warning signs:** `TgError: Client operation timed out after 30 seconds` on large accounts.

### Pitfall 3: Chat Type Disambiguation
**What goes wrong:** gramjs groups and supergroups look similar but use different API calls. A "supergroup" is actually a `Channel` with `megagroup: true`, not a `Chat`.
**Why it happens:** Telegram migrates old groups to supergroups (channels with megagroup flag). The `Dialog.isGroup` property returns true for basic chats only, not for migrated supergroups.
**How to avoid:** Use explicit type checking:
- `entity instanceof Api.User` -> type: "user"
- `entity instanceof Api.Chat` -> type: "group"
- `entity instanceof Api.Channel && entity.megagroup` -> type: "supergroup"
- `entity instanceof Api.Channel && entity.broadcast` -> type: "channel"
**Warning signs:** Supergroups appearing as "channel" type, or basic groups appearing as "supergroup".

### Pitfall 4: Global Search Requires Empty/Undefined Entity
**What goes wrong:** Passing an entity to `client.getMessages()` with `search` parameter does per-chat search. Passing `undefined` does global search.
**Why it happens:** gramjs's `_MessagesIter._init()` checks if entity is undefined and switches between `messages.Search` (per-chat) and `messages.SearchGlobal` (global).
**How to avoid:** For READ-03 (per-chat search), pass the resolved entity. For READ-04 (global search), pass `undefined` as entity.
**Warning signs:** Global search returning results from only one chat, or per-chat search returning results from all chats.

### Pitfall 5: Date Range Filtering Complexity
**What goes wrong:** gramjs `offsetDate` only acts as an "upper bound" (messages before this date). There's no built-in "since" date filter.
**Why it happens:** The MTProto `messages.GetHistory` API uses `offsetDate` to page backwards from a date, but has no `minDate` parameter (unlike `messages.Search` which has `minDate`/`maxDate`).
**How to avoid:** For `--since` with history (no search query), either:
1. Use `client.getMessages()` with `search: ""` and `minDate`/`maxDate` parameters (empty search string triggers Search API which supports date range), or
2. Use `offsetDate` for `--until` and post-filter for `--since` (stop iterating when messages are before the since date).
Option 1 is recommended because it pushes date filtering to the server. The `messages.Search` API accepts `minDate` and `maxDate` as Unix timestamps.
**Warning signs:** `--since` appearing to have no effect, or returning all messages regardless of date.

### Pitfall 6: Leave/Join for Basic Chats vs Channels
**What goes wrong:** `channels.JoinChannel` and `channels.LeaveChannel` only work for channels and supergroups. Basic group chats require different API methods.
**Why it happens:** Telegram has separate APIs for basic chats (messages.* namespace) vs channels/supergroups (channels.* namespace).
**How to avoid:** Resolve the entity first, then branch:
- Channel/supergroup: `Api.channels.JoinChannel` / `Api.channels.LeaveChannel`
- Basic group: Cannot "join" without an invite; for leaving, use `Api.messages.DeleteChatUser` with the user's own ID
**Warning signs:** `PEER_ID_INVALID` errors when trying to join/leave basic groups with channel API.

### Pitfall 7: Invite Link Hash Extraction
**What goes wrong:** Invite links come in multiple formats: `t.me/+HASH`, `t.me/joinchat/HASH`, `telegram.me/+HASH`, sometimes with `https://` prefix or without.
**Why it happens:** Telegram has changed invite link formats over the years. The `+` prefix format is newer.
**How to avoid:** Use a robust regex that handles all variants: `/(?:t\.me|telegram\.me)\/(?:joinchat\/|\+)([a-zA-Z0-9_-]+)/` and also handle raw hashes (no URL prefix).
**Warning signs:** `INVITE_HASH_INVALID` errors on valid-looking invite links.

### Pitfall 8: Participant Listing Limitations
**What goes wrong:** `getParticipants` may not return all members for very large groups, or may throw errors for channels without admin rights.
**Why it happens:** Telegram limits participant listing in channels to admins only (non-admins can only search by name). Groups with >200 members may require search-based pagination.
**How to avoid:** Try `getParticipants` first; if it throws `CHAT_ADMIN_REQUIRED`, fall back to search-based listing or return an error explaining the permission requirement. Always include error context in output.
**Warning signs:** Getting 0 members for a channel with thousands of subscribers, or `CHAT_ADMIN_REQUIRED` errors.

## Code Examples

Verified patterns from gramjs type definitions (installed node_modules/telegram):

### List Dialogs (CHAT-01)
```typescript
// Source: node_modules/telegram/client/dialogs.d.ts
// client.getDialogs() returns TotalList<Dialog>
const dialogs = await client.getDialogs({
  limit: 50,              // max dialogs to fetch
  offsetDate: undefined,  // for pagination: last dialog's date
  ignorePinned: false,    // include pinned chats
  ignoreMigrated: true,   // skip chats migrated to supergroups
  folder: undefined,      // undefined = all folders, 0 = main, 1 = archive
});
// dialogs is TotalList<Dialog> (extends Array)
// dialogs.total contains the total count
// Each Dialog has: .id, .name, .title, .unreadCount, .isUser, .isGroup, .isChannel, .entity, .message
```

### Get Full Chat Info (CHAT-02)
```typescript
// Source: node_modules/telegram/tl/api.d.ts lines 27108-27117, 23499-23508
// For channels/supergroups:
const fullChannel = await client.invoke(
  new Api.channels.GetFullChannel({ channel: entity })
);
// fullChannel.fullChat is ChannelFull with: about, participantsCount, adminsCount,
// linkedChatId, slowmodeSeconds, exportedInvite, migratedFromChatId, etc.
// fullChannel.chats contains the Channel objects
// fullChannel.users contains User objects

// For basic group chats:
const fullChat = await client.invoke(
  new Api.messages.GetFullChat({ chatId: entity.id })
);
// fullChat.fullChat is ChatFull with: about, participants, exportedInvite, etc.
```

### Join Channel/Group (CHAT-03)
```typescript
// Source: node_modules/telegram/tl/api.d.ts lines 27210-27218
// For public channels/groups by username:
await client.invoke(new Api.channels.JoinChannel({
  channel: await client.getInputEntity(username)
}));

// For invite links (t.me/+HASH):
const hash = extractInviteHash(inviteLink);
await client.invoke(new Api.messages.ImportChatInvite({ hash }));
```

### Leave Channel/Group (CHAT-04)
```typescript
// Source: node_modules/telegram/tl/api.d.ts lines 27220-27228
await client.invoke(new Api.channels.LeaveChannel({
  channel: await client.getInputEntity(chatId)
}));
```

### Resolve Peer (CHAT-05)
```typescript
// Source: node_modules/telegram/client/users.d.ts line 15-17
// getEntity accepts EntityLike: bigInt, Phone, Username, PeerID, InputPeer, Entity
const entity = await client.getEntity("username");     // by username
const entity2 = await client.getEntity(-1001234567);   // by numeric ID
const entity3 = await client.getEntity("+15551234567"); // by phone (must be in contacts)
// Returns: Api.User | Api.Chat | Api.Channel
```

### Check Invite Link (CHAT-06)
```typescript
// Source: node_modules/telegram/tl/api.d.ts lines 23799-23817
const result = await client.invoke(
  new Api.messages.CheckChatInvite({ hash: inviteHash })
);
// result is one of:
// - ChatInviteAlready: { chat: Api.TypeChat } -- already a member
// - ChatInvite: { title, about, photo, participantsCount, channel?, broadcast?, ... } -- preview
// - ChatInvitePeek: { chat: Api.TypeChat, expires: int } -- temporary peek
```

### List Members (CHAT-07)
```typescript
// Source: node_modules/telegram/client/chats.d.ts lines 27-42
const participants = await client.getParticipants(entity, {
  limit: 50,
  offset: 0,
  search: "",                                    // filter by name/username
  filter: new Api.ChannelParticipantsRecent(),   // or ChannelParticipantsAdmins, etc.
  showTotal: true,                               // extra request for total count
});
// participants is TotalList<Api.User>
// participants.total is the total member count
```

### Message History (READ-01, READ-02)
```typescript
// Source: node_modules/telegram/client/messages.d.ts lines 47-98
const messages = await client.getMessages(entity, {
  limit: 50,
  offsetId: 0,        // pagination: start from this message ID
  offsetDate: unixTs, // pagination: messages before this timestamp
  minId: 0,           // exclude messages with ID <= this
  maxId: 0,           // exclude messages with ID >= this
  reverse: false,     // false = newest first (default)
});
// messages is TotalList<Api.Message>
// messages.total is the total message count in chat

// For date range: Use search API which supports minDate/maxDate
const filtered = await client.getMessages(entity, {
  limit: 50,
  search: "",         // empty string triggers messages.Search
  filter: new Api.InputMessagesFilterEmpty(),
  // minDate and maxDate as Unix timestamps via raw invoke
});
```

### Search Messages (READ-03, READ-04)
```typescript
// Source: node_modules/telegram/client/messages.d.ts
// Per-chat search (READ-03):
const results = await client.getMessages(entity, {
  search: "keyword",
  limit: 50,
});

// Global search (READ-04):
const globalResults = await client.getMessages(undefined, {
  search: "keyword",
  limit: 50,
});
// Each message has: .id, .message (text), .date, .senderId, .peerId
// For global search, peerId identifies which chat the message is from
```

### Telegram Entity to Markdown Conversion
```typescript
// Source: node_modules/telegram/tl/api.d.ts entity types
// Entity types and their Markdown equivalents:
// MessageEntityBold       -> **text**
// MessageEntityItalic     -> _text_
// MessageEntityCode       -> `text`
// MessageEntityPre        -> ```language\ntext\n```
// MessageEntityTextUrl    -> [text](url)
// MessageEntityMention    -> @username (keep as-is)
// MessageEntityUrl        -> keep as-is (already a URL)
// MessageEntityStrike     -> ~~text~~
// MessageEntityUnderline  -> (no standard MD, use HTML or skip)
// MessageEntityBlockquote -> > text
// MessageEntityMentionName -> [text](tg://user?id=ID)

function entitiesToMarkdown(text: string, entities: Api.TypeMessageEntity[]): string {
  if (!entities || entities.length === 0) return text;
  // Sort entities by offset descending to avoid offset shifts
  const sorted = [...entities].sort((a, b) => b.offset - a.offset);
  let result = text;
  for (const entity of sorted) {
    const start = entity.offset;
    const end = start + entity.length;
    const substr = result.substring(start, end);
    let replacement = substr;
    if (entity instanceof Api.MessageEntityBold) replacement = `**${substr}**`;
    else if (entity instanceof Api.MessageEntityItalic) replacement = `_${substr}_`;
    else if (entity instanceof Api.MessageEntityCode) replacement = `\`${substr}\``;
    else if (entity instanceof Api.MessageEntityPre) {
      const lang = (entity as any).language || '';
      replacement = `\`\`\`${lang}\n${substr}\n\`\`\``;
    }
    else if (entity instanceof Api.MessageEntityTextUrl) {
      replacement = `[${substr}](${(entity as any).url})`;
    }
    else if (entity instanceof Api.MessageEntityStrike) replacement = `~~${substr}~~`;
    else if (entity instanceof Api.MessageEntityBlockquote) {
      replacement = substr.split('\n').map(line => `> ${line}`).join('\n');
    }
    result = result.substring(0, start) + replacement + result.substring(end);
  }
  return result;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `client.disconnect()` | `client.destroy()` | gramjs 2.x | destroy() properly kills _updateLoop; disconnect() leaves zombie goroutines |
| Numeric IDs as JS numbers | BigInteger IDs | Telegram API layer 160+ | Channel IDs exceed 2^53; must use bigint strings in JSON |
| `messages.GetDialogs` (raw) | `client.getDialogs()` (high-level) | gramjs 2.x | High-level method handles pagination, FloodWait, entity caching |
| Basic group chats | Supergroups (migrated) | Ongoing | Most active groups have migrated; Channel with megagroup=true is the norm |
| `t.me/joinchat/HASH` | `t.me/+HASH` | 2022 | New format is shorter; both still work |

**Deprecated/outdated:**
- `client.disconnect()`: Use `client.destroy()` (already done in Phase 1)
- `messages.GetDialogs` raw API: Use `client.getDialogs()` high-level wrapper
- Assuming small IDs: All IDs must be string-serialized for JSON safety

## Open Questions

1. **Date range filtering without search query**
   - What we know: gramjs `getMessages()` with no search parameter uses `messages.GetHistory` which has `offsetDate` but no `minDate`. With a search parameter, it uses `messages.Search` which has `minDate`/`maxDate`.
   - What's unclear: Whether passing `search: ""` (empty string) with `minDate`/`maxDate` correctly triggers the Search API and returns all messages (not just matching ones).
   - Recommendation: Test with empty string search. If it doesn't work, use `offsetDate` for `--until` and iterate until messages are before `--since`, then stop. This adds post-filtering but is reliable.

2. **withClient timeout for long operations**
   - What we know: Current timeout is 30s. Large dialog lists or message searches can take 60s+.
   - What's unclear: Best approach -- configurable timeout per command, or disable timeout for Phase 2 commands entirely.
   - Recommendation: Add an optional `timeout` parameter to `withClient` with a sensible default (120s). Phase 2 commands pass longer timeouts. Document that users with very large accounts may need patience.

3. **Offset-based pagination for dialogs vs ID-based**
   - What we know: CONTEXT.md specifies `--offset` (numeric skip). gramjs `getDialogs()` uses `offsetDate`/`offsetId` for cursor-based pagination, not skip-based.
   - What's unclear: Whether to implement true skip-based offset (fetch offset+limit and discard first offset) or use the cursor pattern.
   - Recommendation: For dialogs, implement skip-based: fetch `offset + limit` dialogs, slice from index `offset`. This is less efficient but matches the simple offset/limit contract the user specified. For messages, `offsetId` from the last message in previous page is more natural -- but surface it as `--offset` to mean "skip N messages from newest."

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/unit/` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CHAT-01 | List dialogs with type/name/unread | unit | `npx vitest run tests/unit/chat-list.test.ts -x` | No - Wave 0 |
| CHAT-02 | Get detailed chat info | unit | `npx vitest run tests/unit/chat-info.test.ts -x` | No - Wave 0 |
| CHAT-03 | Join group by username/invite | unit | `npx vitest run tests/unit/chat-join.test.ts -x` | No - Wave 0 |
| CHAT-04 | Leave group | unit | `npx vitest run tests/unit/chat-leave.test.ts -x` | No - Wave 0 |
| CHAT-05 | Resolve peer by username/ID/phone | unit | `npx vitest run tests/unit/peer-resolve.test.ts -x` | No - Wave 0 |
| CHAT-06 | Check invite link info | unit | `npx vitest run tests/unit/chat-invite.test.ts -x` | No - Wave 0 |
| CHAT-07 | List members with pagination | unit | `npx vitest run tests/unit/chat-members.test.ts -x` | No - Wave 0 |
| READ-01 | Read message history with pagination | unit | `npx vitest run tests/unit/message-history.test.ts -x` | No - Wave 0 |
| READ-02 | Filter by date range | unit | `npx vitest run tests/unit/message-history.test.ts -x` | No - Wave 0 |
| READ-03 | Search in specific chat | unit | `npx vitest run tests/unit/message-search.test.ts -x` | No - Wave 0 |
| READ-04 | Search globally | unit | `npx vitest run tests/unit/message-search.test.ts -x` | No - Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/ -x`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/chat-list.test.ts` -- covers CHAT-01 (dialog listing, type filtering, pagination)
- [ ] `tests/unit/chat-info.test.ts` -- covers CHAT-02 (full chat info for channel, supergroup, basic chat)
- [ ] `tests/unit/chat-join.test.ts` -- covers CHAT-03 (join by username, join by invite link)
- [ ] `tests/unit/chat-leave.test.ts` -- covers CHAT-04 (leave channel/supergroup)
- [ ] `tests/unit/peer-resolve.test.ts` -- covers CHAT-05 (resolve by username, by ID, by phone, error cases)
- [ ] `tests/unit/chat-invite.test.ts` -- covers CHAT-06 (check invite: already member, preview, invalid)
- [ ] `tests/unit/chat-members.test.ts` -- covers CHAT-07 (member list, pagination, permission errors)
- [ ] `tests/unit/message-history.test.ts` -- covers READ-01, READ-02 (history, pagination, date range)
- [ ] `tests/unit/message-search.test.ts` -- covers READ-03, READ-04 (per-chat and global search)
- [ ] `tests/unit/serialize.test.ts` -- covers shared serialization (Dialog->ChatListItem, Message->MessageItem)
- [ ] `tests/unit/entity-markdown.test.ts` -- covers entity-to-markdown conversion

### Testing Pattern (from Phase 1)
All tests mock the `telegram` module with `vi.mock('telegram', ...)` and mock `withClient` to inject a fake client. The established mock pattern from `tests/unit/auth.test.ts` should be reused:
```typescript
// Hoist mock state
const { mockGetDialogs, mockGetMessages, mockInvoke } = vi.hoisted(() => ({
  mockGetDialogs: vi.fn(),
  mockGetMessages: vi.fn(),
  mockInvoke: vi.fn(),
}));

// Mock client instance with all needed methods
const mockClientInstance = {
  getDialogs: mockGetDialogs,
  getMessages: mockGetMessages,
  getParticipants: mockGetParticipants,
  getEntity: mockGetEntity,
  invoke: mockInvoke,
};

// Mock withClient to inject the mock
vi.mock('../../src/lib/client.js', () => ({
  withClient: vi.fn(async (_opts: any, fn: any) => fn(mockClientInstance)),
}));
```

## Sources

### Primary (HIGH confidence)
- `node_modules/telegram/client/dialogs.d.ts` - getDialogs API, IterDialogsParams, Dialog type
- `node_modules/telegram/client/messages.d.ts` - getMessages API, IterMessagesParams, search behavior
- `node_modules/telegram/client/chats.d.ts` - getParticipants API, IterParticipantsParams
- `node_modules/telegram/client/users.d.ts` - getEntity, getInputEntity, _getEntityFromString
- `node_modules/telegram/tl/api.d.ts` - Raw MTProto types: JoinChannel, LeaveChannel, ImportChatInvite, CheckChatInvite, GetFullChannel, GetFullChat, SearchGlobal, Search, GetHistory
- `node_modules/telegram/tl/custom/dialog.d.ts` - Dialog class properties (id, name, title, unreadCount, isUser, isGroup, isChannel, entity)
- `node_modules/telegram/tl/custom/message.d.ts` - CustomMessage class, MessageBaseInterface fields
- `node_modules/telegram/tl/custom/senderGetter.d.ts` - SenderGetter (senderId, sender)
- `node_modules/telegram/tl/custom/chatGetter.d.ts` - ChatGetter (chatId, isPrivate, isGroup, isChannel)
- `node_modules/telegram/Helpers.d.ts` - TotalList<T> definition (extends Array with .total property)
- `node_modules/telegram/define.d.ts` - EntityLike, Entity, DateLike type definitions
- Existing codebase: `src/lib/client.ts`, `src/lib/output.ts`, `src/lib/types.ts`, `src/lib/errors.ts`, `src/commands/auth/index.ts`, `src/commands/auth/status.ts`

### Secondary (MEDIUM confidence)
- gramjs `_MessagesIter` request selection logic (Search vs GetHistory vs SearchGlobal) -- inferred from type declarations showing the `request?` field union type
- Date range filtering via empty search string -- inferred from API structure, needs runtime validation

### Tertiary (LOW confidence)
- Whether `search: ""` with `minDate`/`maxDate` works correctly for date-only filtering without keyword -- needs runtime testing
- Skip-based offset efficiency for large dialog lists -- may need cursor-based pagination fallback

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - gramjs types inspected directly from node_modules, all methods verified
- Architecture: HIGH - follows established Phase 1 patterns exactly (Commander groups, withClient, outputSuccess)
- Pitfalls: HIGH - BigInt, timeout, entity types verified from type definitions; date filtering is MEDIUM
- Serialization: MEDIUM - entity-to-markdown approach is standard but needs nested entity edge case testing
- Date range filtering: MEDIUM - API supports it via Search, but empty search string behavior needs validation

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 (gramjs API is stable; project conventions are locked)
