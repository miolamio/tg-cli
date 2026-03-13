# Requirements: Telegram CLI

**Defined:** 2026-03-10
**Core Value:** Claude Code agents can authenticate as a Telegram user and search across groups to find and extract specific information

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [x] **AUTH-01**: User can log in with phone number and SMS/Telegram code
- [x] **AUTH-02**: User can complete 2FA password prompt during login
- [x] **AUTH-03**: User session persists to disk and is reused across CLI invocations
- [x] **AUTH-04**: User can export session as a portable string (`tg session export`)
- [x] **AUTH-05**: User can import a session string to restore auth (`tg session import <string>`)
- [x] **AUTH-06**: User can check current auth status (`tg auth status`)
- [x] **AUTH-07**: User can log out and destroy session (`tg auth logout`)

### Chat Management

- [x] **CHAT-01**: User can list all dialogs/chats with type, name, unread count
- [x] **CHAT-02**: User can get detailed info for a chat (title, username, member count, description)
- [x] **CHAT-03**: User can join a group/channel by username or invite link
- [x] **CHAT-04**: User can leave a group/channel
- [x] **CHAT-05**: User can resolve a peer by username, phone number, or numeric ID
- [x] **CHAT-06**: User can resolve invite links (`t.me/+xxx`) to chat info before joining
- [x] **CHAT-07**: User can list members of a group/channel with pagination

### Messaging — Read

- [x] **READ-01**: User can read message history from any chat with pagination (`--limit`, `--offset`)
- [x] **READ-02**: User can filter message history by date range (`--since`, `--until`)
- [x] **READ-03**: User can search messages in a specific chat by keyword
- [x] **READ-04**: User can search messages globally across all chats
- [x] **READ-05**: User can filter search results using any of the 17 MTProto search filters (`--filter photos|videos|documents|urls|voice|...`)
- [x] **READ-06**: User can search across multiple specific chats in one command (`--chats chat1,chat2,chat3`)
- [x] **READ-07**: User can download files and media from messages to a local path

### Messaging — Write

- [x] **WRITE-01**: User can send a text message to any chat
- [x] **WRITE-02**: User can reply to a specific message by ID
- [x] **WRITE-03**: User can forward messages between chats
- [x] **WRITE-04**: User can upload and send files (photos, videos, documents) from local path
- [x] **WRITE-05**: User can react to a message with an emoji
- [x] **WRITE-06**: User can list forum topics in a supergroup
- [x] **WRITE-07**: User can read messages from a specific forum topic
- [x] **WRITE-08**: User can send messages to a specific forum topic

### Output & Integration

- [x] **OUT-01**: Every command supports `--json` flag for structured JSON output
- [x] **OUT-02**: JSON output uses a consistent envelope: `{ ok: bool, data: {...}, error?: string }`
- [x] **OUT-03**: JSON is the default output mode; human-readable is available via `--human` or `--no-json`
- [x] **OUT-04**: User can select specific output fields with `--fields id,text,date,sender`
- [x] **OUT-05**: Commands returning lists support `--jsonl` for streaming one JSON object per line
- [x] **OUT-06**: stderr is used for progress/status/errors; stdout contains only data

### Infrastructure

- [x] **INFRA-01**: Package installable via `npm install -g telegram-cli` and runnable via `npx telegram-cli`
- [x] **INFRA-02**: Built-in rate limiting wrapper to handle Telegram FloodWait errors automatically
- [x] **INFRA-03**: Session file locking to prevent AUTH_KEY_DUPLICATED from concurrent access
- [x] **INFRA-04**: User supplies their own Telegram API credentials (api_id, api_hash) via config or env vars
- [x] **INFRA-05**: Graceful connection lifecycle management (connect, disconnect, error recovery)
- [x] **INFRA-06**: Configuration file for persistent settings (`~/.config/telegram-cli/config.json`)

## v1.1 Requirements

Requirements for v1.1 milestone "Новые дополнения". Each maps to roadmap phases.

### Messaging — Read (extended)

- [x] **READ-08**: User can get specific messages by ID (`tg message get <chat> <ids>`) with batch support
- [x] **READ-09**: User can get pinned messages from a chat (`tg message pinned <chat>`)

### Messaging — Write (extended)

- [x] **WRITE-09**: User can edit own sent messages (`tg message edit <chat> <id> <text>`) with 48h window error handling
- [x] **WRITE-10**: User can delete messages with explicit revoke control (`tg message delete <chat> <ids> --revoke/--for-me`)
- [x] **WRITE-11**: User can pin a message in a chat (`tg message pin <chat> <id>`) with silent default and `--notify` opt-in
- [x] **WRITE-12**: User can unpin a message (`tg message unpin <chat> <id>`)
- [ ] **WRITE-13**: User can send polls (`tg message poll <chat>`) with quiz mode, multiple choice, anonymous/public, auto-close options

### User Management (new)

- [x] **USER-01**: User can get a detailed profile for any user (`tg user profile <user>`) showing bio, photos count, last seen, common chats, blocked status, and privacy-restricted field indicators
- [x] **USER-02**: User can block a user (`tg user block <user>`)
- [x] **USER-03**: User can unblock a user (`tg user unblock <user>`)
- [x] **USER-04**: User can list blocked users (`tg user blocked`) with pagination

### Contacts (new)

- [ ] **CONT-01**: User can list all contacts (`tg contact list`) with phone, username, status
- [x] **CONT-02**: User can add a contact by username/ID or phone number (`tg contact add`) with dual API routing
- [x] **CONT-03**: User can delete a contact (`tg contact delete <user>`)
- [ ] **CONT-04**: User can search contacts by name (`tg contact search <query>`)

### Output (extended)

- [ ] **OUT-07**: User can use `--toon` flag for TOON output format (token-efficient, LLM-optimized) with mutual exclusion against `--human` and `--jsonl`

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Poll/watch mode for monitoring new messages with `--interval`
- **ADV-02**: Inline bot query support
- **ADV-03**: Channel admin operations (create, set admins, set description)
- **ADV-05**: Broadcast to multiple peers
- **ADV-06**: Interactive TUI mode (separate package)
- **ADV-07**: User profile photo download (use existing media download)
- **ADV-08**: Contact bulk import by phone number
- **ADV-09**: Unpin all messages in chat

## Out of Scope

| Feature | Reason |
|---------|--------|
| Voice/video calls | Enormous WebRTC/VoIP complexity, not useful for CLI/agents |
| Secret chats | Device-specific keys, breaks session portability, rarely used |
| Bot API support | Different protocol entirely; Telegraf/grammY serve this |
| Sticker rendering in terminal | Meaningless in CLI; download as files via `download` command |
| Own account management | Rarely needed, high risk of agent misuse |
| Real-time push streaming | Fundamentally different architecture; poll mode deferred to v2 |
| Interactive TUI | Different product; deferred to v2 as separate package |
| Channel/group administration | Create, edit info, manage admins, ban/kick — not needed yet |
| Forum topic management | Create, close, reopen topics — deferred |
| Mark as read | Deferred |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

### v1.0 (Complete)

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Complete |
| AUTH-07 | Phase 1 | Complete |
| CHAT-01 | Phase 2 | Complete |
| CHAT-02 | Phase 2 | Complete |
| CHAT-03 | Phase 2 | Complete |
| CHAT-04 | Phase 2 | Complete |
| CHAT-05 | Phase 2 | Complete |
| CHAT-06 | Phase 2 | Complete |
| CHAT-07 | Phase 2 | Complete |
| READ-01 | Phase 2 | Complete |
| READ-02 | Phase 2 | Complete |
| READ-03 | Phase 2 | Complete |
| READ-04 | Phase 2 | Complete |
| READ-05 | Phase 4 | Complete |
| READ-06 | Phase 5 | Complete |
| READ-07 | Phase 4 | Complete |
| WRITE-01 | Phase 3 | Complete |
| WRITE-02 | Phase 3 | Complete |
| WRITE-03 | Phase 3 | Complete |
| WRITE-04 | Phase 4 | Complete |
| WRITE-05 | Phase 3 | Complete |
| WRITE-06 | Phase 5 | Complete |
| WRITE-07 | Phase 5 | Complete |
| WRITE-08 | Phase 5 | Complete |
| OUT-01 | Phase 1 | Complete |
| OUT-02 | Phase 1 | Complete |
| OUT-03 | Phase 3 | Complete |
| OUT-04 | Phase 5 | Complete |
| OUT-05 | Phase 5 | Complete |
| OUT-06 | Phase 1 | Complete |
| INFRA-01 | Phase 1 | Complete |
| INFRA-02 | Phase 1 | Complete |
| INFRA-03 | Phase 1 | Complete |
| INFRA-04 | Phase 1 | Complete |
| INFRA-05 | Phase 1 | Complete |
| INFRA-06 | Phase 1 | Complete |

### v1.1 (In Progress)

| Requirement | Phase | Status |
|-------------|-------|--------|
| READ-08 | Phase 6 | Complete |
| READ-09 | Phase 6 | Complete |
| WRITE-09 | Phase 7 | Complete |
| WRITE-10 | Phase 7 | Complete |
| WRITE-11 | Phase 7 | Complete |
| WRITE-12 | Phase 7 | Complete |
| WRITE-13 | Phase 10 | Pending |
| USER-01 | Phase 8 | Complete |
| USER-02 | Phase 8 | Complete |
| USER-03 | Phase 8 | Complete |
| USER-04 | Phase 8 | Complete |
| CONT-01 | Phase 9 | Pending |
| CONT-02 | Phase 9 | Complete |
| CONT-03 | Phase 9 | Complete |
| CONT-04 | Phase 9 | Pending |
| OUT-07 | Phase 11 | Pending |

**Coverage:**
- v1.0 requirements: 41 total, 41 complete
- v1.1 requirements: 16 total, 16 mapped
- Mapped to phases: 16/16
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-12 after v1.1 roadmap creation*
