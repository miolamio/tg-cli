# Roadmap: Telegram CLI

## Overview

This roadmap delivers a full-featured Telegram CLI client from zero to a working npm package that Claude Code agents can use to authenticate, search, read, write, and manage media across Telegram chats. The phases follow the natural dependency chain: foundation and auth first (nothing works without it), then read operations (core value proposition), then write operations, media handling, and finally advanced features like forum topics and multi-chat search.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Auth** - Project scaffolding, npm package, auth flow, session management, JSON output infrastructure, rate limiting (completed 2026-03-11)
- [ ] **Phase 2: Chat Discovery & Message Reading** - List chats, chat info, join/leave groups, peer resolution, message history, search
- [ ] **Phase 3: Messaging & Interaction** - Send messages, reply, forward, react, human-readable output mode
- [ ] **Phase 4: Media & Files** - Download and upload media/files, search filters by media type
- [ ] **Phase 5: Advanced Features & Polish** - Forum topic support, multi-chat search, field selection, JSONL streaming

## Phase Details

### Phase 1: Foundation & Auth
**Goal**: Users can install the CLI via npm/npx, authenticate with Telegram (including 2FA), persist and manage sessions, and receive structured JSON output from all commands
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, OUT-01, OUT-02, OUT-06
**Success Criteria** (what must be TRUE):
  1. User can run `npx telegram-cli auth login` and complete phone + code + 2FA flow to authenticate
  2. User can close the terminal, reopen it, and run commands without re-authenticating (session persists)
  3. User can export a session string, use it on another machine via import, and be authenticated there
  4. User can run `tg auth status` to check login state and `tg auth logout` to destroy the session
  5. Every command returns JSON on stdout with `{ ok, data, error? }` envelope, errors/progress on stderr
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding, build infrastructure, and core library modules (types, output, errors, config, prompt)
- [x] 01-02-PLAN.md — Session store with locking, client lifecycle wrapper, rate limiting, and auth commands (login, status, logout)
- [x] 01-03-PLAN.md — Session commands (export, import), CLI entry point wiring, build, and end-to-end verification

### Phase 2: Chat Discovery & Message Reading
**Goal**: Users can discover their chats, get detailed chat info, join/leave groups, resolve peers, and read/search message history -- delivering the core agent use case of finding and extracting information from Telegram
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, READ-01, READ-02, READ-03, READ-04
**Success Criteria** (what must be TRUE):
  1. User can list all their chats and see names, types, and unread counts in JSON output
  2. User can get detailed info for any chat (title, description, member count) and list members with pagination
  3. User can join a group by username or invite link, and leave any group they belong to
  4. User can read message history from any chat with pagination and date range filtering
  5. User can search messages by keyword within a specific chat or globally across all chats
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Shared foundation: types, serialization, peer resolution, entity-to-markdown, withClient timeout fix
- [x] 02-02-PLAN.md — Chat commands (list, info, join, leave, resolve, invite-info, members) and CLI wiring
- [x] 02-03-PLAN.md — Message commands (history with date filtering, search per-chat and global) and CLI wiring
- [ ] 02-04-PLAN.md — UAT gap closure: fix ignoreMigrated empty results, -q shorthand conflict, DM chatTitle resolution

### Phase 3: Messaging & Interaction
**Goal**: Users can send text messages, reply to specific messages, forward messages between chats, react with emoji, and switch between JSON and human-readable output
**Depends on**: Phase 2
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-05, OUT-03
**Success Criteria** (what must be TRUE):
  1. User can send a text message to any chat (user, group, or channel) and see confirmation in JSON
  2. User can reply to a specific message by ID and forward messages between chats
  3. User can add an emoji reaction to any message
  4. User can pass `--human` or `--no-json` to get human-readable output instead of JSON
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Write commands: send (with reply and stdin pipe), forward (batch), react (with remove), types, tests
- [ ] 03-02-PLAN.md — Human-readable output: format.ts formatters, mode-aware output.ts, --no-json flag, retrofit all existing commands

### Phase 4: Media & Files
**Goal**: Users can download media/files from messages and upload files to chats, and can filter search results by media type (photos, videos, documents, etc.)
**Depends on**: Phase 3
**Requirements**: READ-07, WRITE-04, READ-05
**Success Criteria** (what must be TRUE):
  1. User can download any file or media attachment from a message to a local path
  2. User can upload and send a local file (photo, video, document) to any chat
  3. User can filter search results by media type using `--filter photos|videos|documents|urls|voice|...`
**Plans**: 2 plans

Plans:
- [ ] 04-01-PLAN.md — Media types, utilities (filter map, auto-naming), metadata extraction in serialization, search filter integration (--filter on search), format updates for media annotations
- [ ] 04-02-PLAN.md — Media download command (single + batch, auto-naming, -o override), media send command (single + album, caption, reply-to, voice detection), CLI wiring

### Phase 5: Advanced Features & Polish
**Goal**: Users can interact with forum topics in supergroups, search across multiple specific chats in one command, select output fields, and stream results as JSONL
**Depends on**: Phase 4
**Requirements**: WRITE-06, WRITE-07, WRITE-08, READ-06, OUT-04, OUT-05
**Success Criteria** (what must be TRUE):
  1. User can list forum topics in a supergroup, read messages from a specific topic, and send messages to a topic
  2. User can search across multiple specific chats in a single command using `--chat @a,@b,@c`
  3. User can select specific output fields with `--fields id,text,date,sender` to reduce output noise
  4. User can use `--jsonl` on list commands to get one JSON object per line for streaming consumption
**Plans**: 3 plans

Plans:
- [ ] 05-01-PLAN.md — Forum topic listing command (`tg chat topics`), TopicItem type, serialization, format dispatch, forum guard
- [ ] 05-02-PLAN.md — Output enhancements: field selection (`--fields`), JSONL streaming (`--jsonl`), global option wiring
- [ ] 05-03-PLAN.md — Topic-scoped commands (`--topic` on history/send/search/media), multi-chat search (`--chat @a,@b,@c`)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 3/3 | Complete   | 2026-03-11 |
| 2. Chat Discovery & Message Reading | 3/4 | In progress | - |
| 3. Messaging & Interaction | 0/2 | Not started | - |
| 4. Media & Files | 0/2 | Not started | - |
| 5. Advanced Features & Polish | 0/3 | Not started | - |
