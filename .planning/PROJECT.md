# Telegram CLI

## What This Is

A full-featured command-line Telegram client built on MTProto protocol with TypeScript/Node.js. Distributed as an npm package (`npx telegram-cli` or `npm install -g telegram-cli`), it provides structured CLI commands with `--json` output for machine-readable responses. The primary consumer is Claude Code agents via skills, enabling AI-driven search and information extraction across Telegram groups and channels.

## Core Value

Claude Code agents can authenticate as a Telegram user and search across groups to find and extract specific information — that's the win condition for v1.

## Current Milestone: v1.1 Новые дополнения

**Goal:** Expand the CLI API with user profiles, contacts, message management (edit/delete/pin), block/unblock, TOON output format, and polls.

**Target features:**
- Detailed user profiles (bio, photo, last seen, common chats)
- Contacts (list, add, delete, search)
- Get messages by ID, get pinned messages
- Edit and delete sent messages
- Pin/unpin messages
- Block/unblock users
- TOON output format (`--toon`) for reduced token usage
- Poll creation and sending

## Requirements

### Validated

<!-- Shipped and confirmed in v1.0 -->

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

### Active

- [ ] Detailed user profile (bio, photos, last seen, common chats)
- [ ] Contacts management (list, add, delete, search)
- [ ] Get specific messages by ID
- [ ] Get pinned messages from chat
- [ ] Edit sent messages
- [ ] Delete messages
- [ ] Pin/unpin messages
- [ ] Block/unblock users
- [ ] TOON output format for token-efficient LLM consumption
- [ ] Send polls

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
- Similar projects exist (telegram-cli by vysheng in C, tg-cli, etc.) but most are abandoned or incomplete
- Primary integration point is Claude Code skills — a skill will install and use this CLI
- The CLI needs to handle Telegram's auth flow gracefully in non-interactive environments (session reuse)
- JSON output is critical for agent consumption — every command must support structured output
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
| TypeScript + gramjs | Rich MTProto ecosystem, familiar runtime, npm distribution | — Pending |
| CLI + JSON output (not TUI) | Agent-first design — Claude Code needs structured, parseable output | — Pending |
| npm/npx distribution | Simplest install path, no binary compilation needed | — Pending |
| Full feature scope in v1 | User wants comprehensive Telegram functionality, not just search | — Pending |

---
*Last updated: 2026-03-12 after milestone v1.1 start*
