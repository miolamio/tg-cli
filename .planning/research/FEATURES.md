# Feature Research

**Domain:** Telegram CLI Client (scriptable, agent-first)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Feature Landscape

### Table Stakes (Users Expect These)

Features users assume exist. Missing these = product feels incomplete.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Phone + code authentication** | Every Telegram client requires it; no auth = no app | MEDIUM | Must handle SMS code, Telegram service notification delivery, and phone number input. gramjs supports this natively. |
| **2FA password support** | Many power users have 2FA enabled; failing on 2FA = broken for target audience | MEDIUM | Telegram uses SRP protocol for 2FA. gramjs wraps this but interactive prompt needed for initial login. |
| **Session persistence** | Re-authenticating every run is unusable for CLI/agent workflows | LOW | gramjs StringSession or file-based session. Save to disk, reload on next invocation. Critical for `npx` usage. |
| **List dialogs/chats** | The most basic operation after auth; equivalent to opening the app | LOW | `messages.getDialogs` via gramjs. Must show chat name, type (group/channel/DM), unread count, last message preview. |
| **Send text messages** | The core function of a messaging client | LOW | `messages.sendMessage` via gramjs. Target by username, phone, or chat ID. |
| **Read message history** | Reading messages is the other half of messaging | LOW | `messages.getHistory` with pagination via offset/limit/max_id. Default limit ~100, support pagination for deep history. |
| **Search messages by keyword** | vysheng telegram-cli had `search` command; tegracli's primary feature; users expect it | MEDIUM | `messages.search` supports query text, peer filtering, date range (min_date/max_date). Expose all filter params. |
| **Download files/media** | Every existing CLI tool supports file download; telegram-cli had `load_photo`, `load_video`, `load_document` | MEDIUM | gramjs supports `client.downloadMedia()`. Must handle photos, videos, documents, voice. Output to configurable path. |
| **Upload and send files** | telegram-cli had `send_photo`, `send_video`, `send_document`, `send_audio` | MEDIUM | gramjs `client.sendFile()`. Accept local file path, detect MIME type, send to specified peer. |
| **Chat info and metadata** | vysheng had `user_info`, `chat_info`, `channel_info`; essential for understanding what you're looking at | LOW | gramjs `client.getEntity()` for users/chats/channels. Return member count, title, username, description, photo. |
| **Join/leave groups and channels** | vysheng had `channel_join`, `channel_leave`; basic group management | LOW | `channels.joinChannel` / `channels.leaveChannel` via gramjs raw API. Accept invite links or usernames. |
| **Get member list** | vysheng had `channel_get_members`, `channel_get_admins`; needed for group reconnaissance | MEDIUM | `client.getParticipants()` with pagination. Can be slow for large groups (Telegram rate limits). |
| **Reply to messages** | vysheng had `reply`; nchat and tg both support replies; fundamental threading primitive | LOW | `messages.sendMessage` with `replyTo` parameter. Requires message ID reference. |
| **Forward messages** | vysheng had `fwd` and `fwd_media`; standard messaging operation | LOW | `messages.forwardMessages` via gramjs. Accept source chat + message IDs + target chat. |
| **`--json` flag on all commands** | PROJECT.md core requirement; agent-first design; tegracli outputs JSONL; this is the whole point for Claude Code | MEDIUM | Not a single feature but a cross-cutting concern. Every command must have a structured JSON output mode. Design the output schema up front. |
| **Contact/peer resolution** | Users need to reference chats by name, username, phone, or ID; vysheng used tab-completion, we need flexible resolution | LOW | gramjs `client.getEntity()` accepts usernames (`@name`), phone numbers, numeric IDs. Build a resolver layer. |

### Differentiators (Competitive Advantage)

Features that set the product apart. Not required, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Structured JSON output by default** | No existing CLI tool was built JSON-first. vysheng outputs plain text. tegracli added JSON as afterthought. Our CLI is agent-native -- every command returns parseable JSON with consistent schema. | MEDIUM | Design a unified response envelope: `{ ok: bool, data: {...}, error?: string }`. This is the single biggest differentiator vs every existing tool. |
| **Search with all MTProto filters** | Telegram API supports 17 message filters (photos, videos, docs, URLs, voice, GIFs, geo, mentions, pinned, etc.). No existing CLI exposes all of them. tegracli only does text search. | MEDIUM | Expose `--filter` flag mapping to `inputMessagesFilter*` types. Enables "find all documents in this chat" or "show me all URLs shared". Huge for research/agent use. |
| **Global cross-chat search** | `messages.searchGlobal` searches across ALL chats at once. vysheng's `search` was per-chat only. tegracli's search is limited. | MEDIUM | Accept `--global` flag. Support `--broadcasts-only`, `--groups-only`, `--users-only` sub-filters matching the API. |
| **Date range filtering on all read operations** | tegracli has `--offset_date` and telegram-download-chat has `--min-date`/`--max-date`, but no tool makes date filtering first-class on every read command. | LOW | Expose `--since` and `--until` as ISO date strings on `history`, `search`, and `get` commands. Maps directly to min_date/max_date API params. |
| **Session export/import as portable string** | gramjs StringSession serializes the entire auth state to a single string. No other CLI tool offers copy-paste session portability. | LOW | `session export` outputs a base64 string. `session import <string>` restores it. Critical for CI/CD, multi-machine agent use, sharing sessions across environments. |
| **Forum/topic support** | Telegram forums are relatively new (2022+). vysheng predates them entirely. No existing CLI tool supports forum topics. | MEDIUM | `channels.getForumTopics`, `channels.createForumTopic`. Send messages to specific topics via `reply_to_msg_id` with topic ID. List topics, read topic history. |
| **Reactions support** | `messages.sendReaction` with emoji or custom emoji. No CLI tool supports this. tg (paul-nameless) doesn't support it. | LOW | `react <chat> <msg_id> <emoji>`. Simple but no competitor has it. Useful for agents acknowledging messages. |
| **Piped/streaming output** | JSONL (one JSON object per line) for streaming large result sets. tegracli does this but poorly. | LOW | `--jsonl` flag for commands returning lists. Each message/chat/member on its own line. Enables `telegram-cli history @chat --jsonl | jq '.text'` pipelines. |
| **npx zero-install usage** | No existing tool works with `npx`. vysheng requires C compilation. tegracli requires pipx. tg requires Python + pip. | LOW | Already planned per PROJECT.md. Genuine differentiator -- `npx telegram-cli login` just works. |
| **Batch operations** | vysheng had `broadcast` for multi-user sends. No tool offers batch search across multiple chats. | MEDIUM | `search --chats chat1,chat2,chat3 --query "keyword"`. Aggregate results with source attribution. Powerful for agents scanning multiple groups. |
| **Configurable output fields** | No tool lets you choose which fields to include in output. | LOW | `--fields id,text,date,sender` to select specific JSON fields. Reduces noise for agents parsing output. |
| **Resolve invite links** | Accept `t.me/+xxxxx` or `t.me/joinchat/xxxxx` links and resolve them to chat info before joining. | LOW | `messages.checkChatInvite` then optionally `messages.importChatInvite`. Useful for agents given invite links. |

### Anti-Features (Commonly Requested, Often Problematic)

Features that seem good but create problems.

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| **Interactive TUI mode** | Users want a "full Telegram experience" in terminal; nchat and tg do this | Massive complexity (ncurses/blessed UI, real-time updates, keyboard handling). Completely different product from a scriptable CLI. Splits focus, doubles maintenance. TUI and CLI have fundamentally different architectures. | Build scriptable CLI first. If TUI is wanted later, it should be a separate package that imports the CLI's core library. |
| **Voice/video calls** | "Complete Telegram client" | WebRTC/VoIP stack is enormous complexity. No existing CLI tool supports it. Not useful for agents or scripting. Telegram's call protocol is poorly documented for third-party clients. | Explicitly out of scope. Not even a future consideration. |
| **Real-time message streaming / live updates** | Users want `tail -f` style live message feed | Requires persistent connection, update handling loop, reconnection logic. Fundamentally changes the CLI from request-response to long-running daemon. Conflicts with `npx` ephemeral usage pattern. | Offer `poll` command with `--interval` flag for periodic checking. Or `--watch` flag that polls. Avoid true push-based streaming in v1. |
| **Bot API support** | "Can I run my bot through this?" | This is a user client (MTProto), not a bot framework. Bot API is a completely different protocol with different auth. Telegraf and grammY already do this well. Adding bot support dilutes the product. | Explicitly out of scope. Direct users to Telegraf/grammY for bot development. |
| **End-to-end encrypted secret chats** | vysheng had `create_secret_chat`; security-conscious users want it | Secret chats require device-specific key exchange, cannot be used from multiple devices, break session portability, and are rarely used in practice. Most Telegram groups/channels (the primary use case) don't support secret chat. gramjs support for secret chats is limited. | Document as out of scope for v1. Cloud chats (the default) are sufficient for the agent/search use case. |
| **Sticker/GIF sending and rendering** | "Full messaging experience" | Stickers are binary blobs (TGS/WebP/WebM). Rendering them in a terminal is meaningless. Downloading sticker packs is a niche feature better served by dedicated tools like TStickers. Adds complexity with zero value for agent use case. | Support downloading sticker files if explicitly requested (`download` command handles any media type). Do not build sticker browsing, pack management, or terminal rendering. |
| **Profile/account management** | vysheng had `set_profile_name`, `set_profile_photo`, `set_username` | Rarely needed, high risk of misuse (agents accidentally changing profile), not related to the core search/read/write use case. | Omit from v1. Can be added trivially later since it's just API calls with no architectural impact. |
| **Contact list management** | vysheng had `add_contact`, `del_contact`, `rename_contact` | Contacts are a phone-book concept that predates Telegram's current username system. Most agent workflows use usernames or chat IDs, not phone contacts. | Support resolving contacts by phone number in the peer resolver. Don't build contact CRUD operations. |
| **Custom notification sounds/settings** | Desktop notification support | CLI tools don't need notification management. Agents don't need sounds. | Omit entirely. |

## Feature Dependencies

```
[Authentication (phone + code + 2FA)]
    |
    v
[Session Persistence]
    |
    +---> [Session Export/Import]
    |
    v
[Peer Resolution (username/phone/ID -> entity)]
    |
    +---> [List Dialogs] ---> [Chat Info/Metadata]
    |                              |
    |                              +---> [Get Member List]
    |
    +---> [Send Messages] ---> [Reply to Messages]
    |         |                     |
    |         |                     +---> [Reactions]
    |         |
    |         +---> [Forward Messages]
    |         |
    |         +---> [Upload/Send Files]
    |
    +---> [Read Message History] ---> [Date Range Filtering]
    |         |
    |         +---> [Search Messages] ---> [MTProto Search Filters]
    |                    |
    |                    +---> [Global Cross-Chat Search]
    |                    |
    |                    +---> [Batch Multi-Chat Search]
    |
    +---> [Download Files/Media]
    |
    +---> [Join/Leave Groups]
    |
    +---> [Forum Topic Support] (requires: Peer Resolution + Read History + Send Messages)

[JSON Output] ----cross-cuts-all-commands---->  (every feature above)

[JSONL Streaming] --enhances--> [Read History, Search, List Dialogs, Get Members]

[Configurable Output Fields] --enhances--> [JSON Output]
```

### Dependency Notes

- **Authentication is the root dependency:** Nothing works without it. Must be the first thing built and tested.
- **Session Persistence requires Authentication:** Session can only be saved after successful auth. Export/import builds on persistence.
- **Peer Resolution is the second critical dependency:** Every command that targets a chat/user needs entity resolution. Build this as a shared utility early.
- **JSON Output cross-cuts everything:** Not a dependency per se, but every command's output layer must be designed with JSON in mind from day one. Retrofitting JSON output is painful.
- **Search requires Read History foundation:** The search command is architecturally similar to history reading (pagination, message formatting) but with additional query/filter parameters.
- **Forum Topics require three things:** Peer resolution (to find the forum), message reading (to list topic history), and message sending (to post to topics). Build after core messaging works.
- **JSONL Streaming enhances list commands:** Any command returning multiple items benefits from JSONL. Build the streaming output adapter once, apply to all list commands.

## MVP Definition

### Launch With (v1.0)

Minimum viable product -- what's needed to validate the core value proposition ("Claude Code agents can authenticate and search across Telegram groups").

- [ ] **Phone + code + 2FA authentication** -- without auth, nothing works
- [ ] **Session persistence and export/import** -- agents need to reuse sessions across invocations
- [ ] **List dialogs/chats** -- agents need to discover available chats
- [ ] **Read message history** with pagination and date filtering -- core data access
- [ ] **Search messages** with keyword, peer filter, and date range -- the primary use case from PROJECT.md
- [ ] **Global cross-chat search** -- search across all chats without specifying each one
- [ ] **Chat info and metadata** -- agents need context about what they're reading
- [ ] **Send text messages** -- agents need to report findings or ask follow-up questions
- [ ] **Reply to messages** -- contextual responses in group conversations
- [ ] **Download files/media** -- extract documents, images shared in chats
- [ ] **JSON output on all commands** -- the entire point of agent-first design
- [ ] **Peer resolution** (username, phone, ID, invite link) -- flexible chat targeting
- [ ] **Join/leave groups** -- agents may need to join groups to search them

### Add After Validation (v1.x)

Features to add once core search/read/write loop is working.

- [ ] **All 17 MTProto search filters** -- when users want "find all PDFs" or "show all links" (trigger: users requesting media-type-specific search)
- [ ] **Upload/send files** -- when agents need to share files, not just text (trigger: agent workflow requiring document sharing)
- [ ] **Forward messages** -- when agents need to relay information between chats (trigger: cross-chat workflow requests)
- [ ] **Forum/topic support** -- when users have forum-based communities (trigger: users reporting forum chats don't work)
- [ ] **Reactions** -- when agents need to acknowledge messages non-verbally (trigger: agent etiquette in group chats)
- [ ] **Get member list** -- when agents need to understand group composition (trigger: research/analysis workflows)
- [ ] **Batch multi-chat search** -- when searching one chat at a time is too slow (trigger: users with 10+ target chats)
- [ ] **JSONL streaming output** -- when large result sets cause memory issues (trigger: users downloading full chat histories)
- [ ] **Configurable output fields** -- when JSON payloads are too large for agent context windows (trigger: token budget concerns)

### Future Consideration (v2+)

Features to defer until product-market fit is established.

- [ ] **Poll/watch mode** -- periodic re-checking for new messages; fundamentally different execution model
- [ ] **Inline bot queries** -- using bots within the client; niche use case, complex protocol
- [ ] **Sticker/GIF download** -- already handled by `download` for any media; dedicated sticker support is niche
- [ ] **Channel management** (create, set admins, set description) -- admin operations are rare for agent workflows
- [ ] **Broadcast to multiple peers** -- batch sending; potential for abuse, needs careful design
- [ ] **Message deletion** -- destructive operation; needs safety guards for agent use

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Phone + code + 2FA auth | HIGH | MEDIUM | P1 |
| Session persistence | HIGH | LOW | P1 |
| Session export/import | HIGH | LOW | P1 |
| List dialogs | HIGH | LOW | P1 |
| Read message history | HIGH | LOW | P1 |
| Search messages (keyword + date) | HIGH | MEDIUM | P1 |
| Global cross-chat search | HIGH | MEDIUM | P1 |
| Send text messages | HIGH | LOW | P1 |
| Reply to messages | MEDIUM | LOW | P1 |
| Download files/media | HIGH | MEDIUM | P1 |
| Chat info/metadata | MEDIUM | LOW | P1 |
| Join/leave groups | MEDIUM | LOW | P1 |
| JSON output (all commands) | HIGH | MEDIUM | P1 |
| Peer resolution layer | HIGH | LOW | P1 |
| MTProto search filters (all 17) | MEDIUM | LOW | P2 |
| Upload/send files | MEDIUM | MEDIUM | P2 |
| Forward messages | MEDIUM | LOW | P2 |
| Forum/topic support | MEDIUM | MEDIUM | P2 |
| Reactions | LOW | LOW | P2 |
| Get member list | MEDIUM | MEDIUM | P2 |
| Batch multi-chat search | MEDIUM | MEDIUM | P2 |
| JSONL streaming | MEDIUM | LOW | P2 |
| Configurable output fields | LOW | LOW | P2 |
| Resolve invite links | LOW | LOW | P2 |
| Poll/watch mode | LOW | HIGH | P3 |
| Inline bot queries | LOW | HIGH | P3 |
| Channel admin operations | LOW | LOW | P3 |
| Message deletion | LOW | LOW | P3 |

**Priority key:**
- P1: Must have for launch (the agent search/read/write loop)
- P2: Should have, add when possible (power user and completeness features)
- P3: Nice to have, future consideration (niche or high-complexity features)

## Competitor Feature Analysis

| Feature | vysheng telegram-cli (C) | tg (paul-nameless, Python TUI) | tegracli (Python CLI) | nchat (C++ TUI) | Our Approach |
|---------|--------------------------|-------------------------------|----------------------|-----------------|--------------|
| **Status** | Abandoned (~2016) | Maintained but limited | Research-focused, active | Active, multi-protocol | New, agent-first |
| **Auth** | Phone + code | Phone + code + 2FA | Phone + code + 2FA | Phone + code + 2FA | Phone + code + 2FA + session export |
| **Output format** | Plain text (JSON via fork) | TUI (no scriptable output) | JSONL | TUI (no scriptable output) | JSON-first on every command |
| **Search** | Per-chat text search | Basic search | Text search + date offset | In-chat search | Per-chat + global + 17 filters + date range |
| **Media download** | load_photo/video/doc | View in TUI | No media focus | View in TUI | Download any media type to file |
| **Media upload** | send_photo/video/doc | Send files | No | Send attachments | Send any file type |
| **Groups/channels** | Full CRUD | Join/manage | Get messages | View/send | Join/leave + info + members |
| **Forum topics** | Not supported (predates forums) | Not supported | Not supported | Not supported | Full topic support |
| **Reactions** | Not supported (predates reactions) | Not supported | Not supported | Supported | Supported |
| **Replies/forwards** | reply, fwd, fwd_media | Reply, forward | No | Reply | Reply + forward |
| **Secret chats** | Full support | Supported | No | No | Out of scope |
| **Daemon/socket mode** | Yes (-d, -S, -P) | No | No | No | No (stateless CLI by design) |
| **Distribution** | Compile from source | pip install | pipx install | Compile from source | npx / npm install -g |
| **Scriptability** | Lua scripting, socket API | Not scriptable | CLI + JSONL | Not scriptable | Full CLI + JSON + pipes |
| **Inline bots** | No | No | No | No | Future consideration |

### Key Takeaway from Competitor Analysis

No existing tool combines: (1) JSON-first output, (2) comprehensive search with all Telegram filters, (3) zero-install npm distribution, and (4) session portability. The closest competitor is tegracli, but it's Python-only, research-focused, and lacks media handling, forum support, and sending capabilities. vysheng's telegram-cli was the most feature-complete but is abandoned and outputs plain text. The TUI clients (tg, nchat) serve a completely different use case (interactive messaging) and are not scriptable.

## Sources

- [vysheng/tg (telegram-cli) - GitHub](https://github.com/vysheng/tg) - The original C-based Telegram CLI, abandoned ~2016
- [telegram-cli commands gist](https://gist.github.com/weibeld/281feed0b2f5d141fa7e85fc618dd7fc) - Complete command reference for vysheng's telegram-cli
- [paul-nameless/tg - GitHub](https://github.com/paul-nameless/tg) - Python terminal Telegram client with TUI
- [d99kris/nchat - GitHub](https://github.com/d99kris/nchat) - C++ ncurses multi-protocol terminal client
- [Leibniz-HBI/tegracli - GitHub](https://github.com/Leibniz-HBI/tegracli) - Python research CLI wrapper around Telethon
- [tegracli on PyPI](https://pypi.org/project/tegracli/) - tegracli package details
- [gram-js/gramjs - GitHub](https://github.com/gram-js/gramjs) - The JavaScript/TypeScript MTProto library this project will use
- [Telegram MTProto Search API](https://core.telegram.org/api/search) - Official search filter documentation (17 filter types)
- [Telegram Forum API](https://core.telegram.org/api/forum) - Official forum/topic documentation
- [Telegram Reactions API](https://core.telegram.org/api/reactions) - Official reactions documentation
- [Telegram User Authorization](https://core.telegram.org/api/auth) - Official auth flow documentation
- [telegram-messages-dump - GitHub](https://github.com/Kosat/telegram-messages-dump) - Python tool for dumping chat history to JSONL
- [telegram-download-chat - GitHub](https://github.com/popstas/telegram-download-chat) - Multi-format Telegram chat download tool

---
*Feature research for: Telegram CLI Client (scriptable, agent-first)*
*Researched: 2026-03-10*
