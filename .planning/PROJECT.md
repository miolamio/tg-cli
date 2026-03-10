# Telegram CLI

## What This Is

A full-featured command-line Telegram client built on MTProto protocol with TypeScript/Node.js. Distributed as an npm package (`npx telegram-cli` or `npm install -g telegram-cli`), it provides structured CLI commands with `--json` output for machine-readable responses. The primary consumer is Claude Code agents via skills, enabling AI-driven search and information extraction across Telegram groups and channels.

## Core Value

Claude Code agents can authenticate as a Telegram user and search across groups to find and extract specific information — that's the win condition for v1.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Interactive login (phone + code + 2FA) with session persistence
- [ ] Session import/export for reuse across environments
- [ ] List and manage chats (groups, channels, DMs)
- [ ] Join and leave groups/channels
- [ ] Read message history from any chat
- [ ] Search messages across chats by keyword, date, sender
- [ ] Send text messages to users, groups, channels
- [ ] Send and receive media (photos, videos, documents, voice messages)
- [ ] Reactions, replies, forwards, thread support
- [ ] Stickers and GIFs support
- [ ] Forum/supergroup topic support
- [ ] Inline bot queries
- [ ] Structured JSON output on all commands (`--json` flag)
- [ ] Get chat info and member lists
- [ ] Download and upload files/media

### Out of Scope

- Voice/video calls — high complexity, not useful for CLI/agent use case
- Interactive TUI mode — focus on scriptable CLI commands first
- Standalone binary distribution — npm/npx is sufficient for v1
- Bot API support — this is a user client via MTProto, not a bot framework

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
*Last updated: 2026-03-10 after initialization*
