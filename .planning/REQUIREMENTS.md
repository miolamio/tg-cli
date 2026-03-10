# Requirements: Telegram CLI

**Defined:** 2026-03-10
**Core Value:** Claude Code agents can authenticate as a Telegram user and search across groups to find and extract specific information

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Authentication

- [ ] **AUTH-01**: User can log in with phone number and SMS/Telegram code
- [ ] **AUTH-02**: User can complete 2FA password prompt during login
- [ ] **AUTH-03**: User session persists to disk and is reused across CLI invocations
- [ ] **AUTH-04**: User can export session as a portable string (`tg session export`)
- [ ] **AUTH-05**: User can import a session string to restore auth (`tg session import <string>`)
- [ ] **AUTH-06**: User can check current auth status (`tg auth status`)
- [ ] **AUTH-07**: User can log out and destroy session (`tg auth logout`)

### Chat Management

- [ ] **CHAT-01**: User can list all dialogs/chats with type, name, unread count
- [ ] **CHAT-02**: User can get detailed info for a chat (title, username, member count, description)
- [ ] **CHAT-03**: User can join a group/channel by username or invite link
- [ ] **CHAT-04**: User can leave a group/channel
- [ ] **CHAT-05**: User can resolve a peer by username, phone number, or numeric ID
- [ ] **CHAT-06**: User can resolve invite links (`t.me/+xxx`) to chat info before joining
- [ ] **CHAT-07**: User can list members of a group/channel with pagination

### Messaging — Read

- [ ] **READ-01**: User can read message history from any chat with pagination (`--limit`, `--offset`)
- [ ] **READ-02**: User can filter message history by date range (`--since`, `--until`)
- [ ] **READ-03**: User can search messages in a specific chat by keyword
- [ ] **READ-04**: User can search messages globally across all chats
- [ ] **READ-05**: User can filter search results using any of the 17 MTProto search filters (`--filter photos|videos|documents|urls|voice|...`)
- [ ] **READ-06**: User can search across multiple specific chats in one command (`--chats chat1,chat2,chat3`)
- [ ] **READ-07**: User can download files and media from messages to a local path

### Messaging — Write

- [ ] **WRITE-01**: User can send a text message to any chat
- [ ] **WRITE-02**: User can reply to a specific message by ID
- [ ] **WRITE-03**: User can forward messages between chats
- [ ] **WRITE-04**: User can upload and send files (photos, videos, documents) from local path
- [ ] **WRITE-05**: User can react to a message with an emoji
- [ ] **WRITE-06**: User can list forum topics in a supergroup
- [ ] **WRITE-07**: User can read messages from a specific forum topic
- [ ] **WRITE-08**: User can send messages to a specific forum topic

### Output & Integration

- [ ] **OUT-01**: Every command supports `--json` flag for structured JSON output
- [ ] **OUT-02**: JSON output uses a consistent envelope: `{ ok: bool, data: {...}, error?: string }`
- [ ] **OUT-03**: JSON is the default output mode; human-readable is available via `--human` or `--no-json`
- [ ] **OUT-04**: User can select specific output fields with `--fields id,text,date,sender`
- [ ] **OUT-05**: Commands returning lists support `--jsonl` for streaming one JSON object per line
- [ ] **OUT-06**: stderr is used for progress/status/errors; stdout contains only data

### Infrastructure

- [ ] **INFRA-01**: Package installable via `npm install -g telegram-cli` and runnable via `npx telegram-cli`
- [ ] **INFRA-02**: Built-in rate limiting wrapper to handle Telegram FloodWait errors automatically
- [ ] **INFRA-03**: Session file locking to prevent AUTH_KEY_DUPLICATED from concurrent access
- [ ] **INFRA-04**: User supplies their own Telegram API credentials (api_id, api_hash) via config or env vars
- [ ] **INFRA-05**: Graceful connection lifecycle management (connect, disconnect, error recovery)
- [ ] **INFRA-06**: Configuration file for persistent settings (`~/.config/telegram-cli/config.json`)

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Features

- **ADV-01**: Poll/watch mode for monitoring new messages with `--interval`
- **ADV-02**: Inline bot query support
- **ADV-03**: Channel admin operations (create, set admins, set description)
- **ADV-04**: Message deletion with safety guards
- **ADV-05**: Broadcast to multiple peers
- **ADV-06**: Interactive TUI mode (separate package)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Voice/video calls | Enormous WebRTC/VoIP complexity, not useful for CLI/agents |
| Secret chats | Device-specific keys, breaks session portability, rarely used |
| Bot API support | Different protocol entirely; Telegraf/grammY serve this |
| Sticker rendering in terminal | Meaningless in CLI; download as files via `download` command |
| Profile/account management | Rarely needed, high risk of agent misuse |
| Contact list CRUD | Phone-book concept; username/ID resolution covers the use case |
| Real-time push streaming | Fundamentally different architecture; poll mode deferred to v2 |
| Interactive TUI | Different product; deferred to v2 as separate package |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| AUTH-01 | Phase 1 | Pending |
| AUTH-02 | Phase 1 | Pending |
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Pending |
| AUTH-05 | Phase 1 | Pending |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Pending |
| CHAT-01 | Phase 2 | Pending |
| CHAT-02 | Phase 2 | Pending |
| CHAT-03 | Phase 2 | Pending |
| CHAT-04 | Phase 2 | Pending |
| CHAT-05 | Phase 2 | Pending |
| CHAT-06 | Phase 2 | Pending |
| CHAT-07 | Phase 2 | Pending |
| READ-01 | Phase 2 | Pending |
| READ-02 | Phase 2 | Pending |
| READ-03 | Phase 2 | Pending |
| READ-04 | Phase 2 | Pending |
| READ-05 | Phase 4 | Pending |
| READ-06 | Phase 5 | Pending |
| READ-07 | Phase 4 | Pending |
| WRITE-01 | Phase 3 | Pending |
| WRITE-02 | Phase 3 | Pending |
| WRITE-03 | Phase 3 | Pending |
| WRITE-04 | Phase 4 | Pending |
| WRITE-05 | Phase 3 | Pending |
| WRITE-06 | Phase 5 | Pending |
| WRITE-07 | Phase 5 | Pending |
| WRITE-08 | Phase 5 | Pending |
| OUT-01 | Phase 1 | Pending |
| OUT-02 | Phase 1 | Pending |
| OUT-03 | Phase 3 | Pending |
| OUT-04 | Phase 5 | Pending |
| OUT-05 | Phase 5 | Pending |
| OUT-06 | Phase 1 | Pending |
| INFRA-01 | Phase 1 | Pending |
| INFRA-02 | Phase 1 | Pending |
| INFRA-03 | Phase 1 | Pending |
| INFRA-04 | Phase 1 | Pending |
| INFRA-05 | Phase 1 | Pending |
| INFRA-06 | Phase 1 | Pending |

**Coverage:**
- v1 requirements: 41 total
- Mapped to phases: 41
- Unmapped: 0

---
*Requirements defined: 2026-03-10*
*Last updated: 2026-03-10 after roadmap creation*
