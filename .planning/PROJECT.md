# Telegram CLI

## What This Is

A full-featured command-line Telegram client built on MTProto protocol with TypeScript/Node.js. Distributed as an npm package (`npx telegram-cli` or `npm install -g telegram-cli`), it provides structured CLI commands with `--json` output for machine-readable responses. The primary consumer is Claude Code agents via skills, enabling AI-driven search, information extraction, user management, and messaging across Telegram groups and channels. Supports 4 output modes: JSON (default), human-readable, JSONL streaming, and TOON (token-efficient for LLMs).

## Core Value

Claude Code agents can authenticate as a Telegram user and search across groups to find and extract specific information — that's the win condition for v1.

## Requirements

### Validated

- ✓ Interactive login (phone + code + 2FA) with session persistence — v1.0
- ✓ Session import/export for reuse across environments — v1.0
- ✓ List and manage chats (groups, channels, DMs) — v1.0
- ✓ Join and leave groups/channels — v1.0
- ✓ Read message history from any chat — v1.0
- ✓ Search messages across chats by keyword, date, sender — v1.0
- ✓ Send text messages to users, groups, channels — v1.0
- ✓ Send and receive media (photos, videos, documents, voice messages) — v1.0
- ✓ Reactions, replies, forwards, thread support — v1.0
- ✓ Forum/supergroup topic support — v1.0
- ✓ Structured JSON output on all commands (`--json` flag) — v1.0
- ✓ Get chat info and member lists — v1.0
- ✓ Download and upload files/media — v1.0
- ✓ Human-readable output, field selection, JSONL streaming — v1.0
- ✓ Channel post replies/comments — v1.0
- ✓ Get messages by ID with batch support — v1.1
- ✓ Get pinned messages from chat — v1.1
- ✓ Edit sent messages with 48h window handling — v1.1
- ✓ Delete messages with explicit revoke control — v1.1
- ✓ Pin/unpin messages (silent default) — v1.1
- ✓ Detailed user profiles (bio, photos, last seen, common chats, blocked status) — v1.1
- ✓ Block/unblock users with blocked list — v1.1
- ✓ Contacts management (list, add, delete, search) — v1.1
- ✓ Send polls (quiz, multiple choice, anonymous/public, auto-close) — v1.1
- ✓ TOON output format for token-efficient LLM consumption (31-40% savings) — v1.1

### Active

(No active requirements — planning next milestone)

### Out of Scope

- Voice/video calls — high complexity, not useful for CLI/agent use case
- Interactive TUI mode — focus on scriptable CLI commands first
- Standalone binary distribution — npm/npx is sufficient
- Bot API support — this is a user client via MTProto, not a bot framework
- Channel/group administration (create, edit info, manage admins, ban/kick) — not needed yet
- Forum topic management (create, close, reopen) — deferred
- Mark as read — deferred
- Real-time monitoring / watch mode — deferred
- Stickers and GIFs support — deferred
- Inline bot queries — deferred

## Context

- Built on gramjs (Telegram MTProto library for JavaScript/TypeScript)
- 19,242 LOC TypeScript across ~100 source files
- 619 unit tests, 17 integration tests passing
- TOON benchmark gate verified: 31-40% token savings on uniform data
- Primary integration point is Claude Code skills — a skill will install and use this CLI
- JSON output is critical for agent consumption — every command supports structured output
- Telegram API requires api_id and api_hash from https://my.telegram.org

## Constraints

- **Protocol**: MTProto via gramjs — no Bot API, no HTTP bridge
- **Runtime**: Node.js/TypeScript — required for gramjs ecosystem
- **Distribution**: npm package — must work with `npx` for zero-install usage
- **Output**: Every command must support `--json` for machine-readable output
- **Auth**: Must handle 2FA, session persistence, and session portability

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| TypeScript + gramjs | Rich MTProto ecosystem, familiar runtime, npm distribution | ✓ Good |
| CLI + JSON output (not TUI) | Agent-first design — Claude Code needs structured, parseable output | ✓ Good |
| npm/npx distribution | Simplest install path, no binary compilation needed | ✓ Good |
| Full feature scope in v1 | User wants comprehensive Telegram functionality, not just search | ✓ Good |
| translateTelegramError for RPC errors | Consistent human-readable error messages across all commands | ✓ Good |
| Safety-first delete (explicit --revoke/--for-me) | Prevents accidental "delete for everyone" in shared chats | ✓ Good |
| Silent pin default | Avoids mass-notifying group members on pin operations | ✓ Good |
| Dual-route contact add (username vs phone) | Auto-detect input type, route to correct API (addContact vs importContacts) | ✓ Good |
| TOON as highest priority output mode | Token-efficient format must override all others when --toon is passed | ✓ Good |
| TOON benchmark gate (20% min savings) | Ensures TOON delivers measurable value before shipping | ✓ Good (31-40% actual) |
| className-based entity validation | Avoids instanceof issues with gramjs in test environments | ✓ Good |

---
*Last updated: 2026-03-13 after v1.1 milestone*
