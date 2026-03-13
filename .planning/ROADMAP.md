# Roadmap: Telegram CLI

## Milestones

- ✅ **v1.0 MVP** - Phases 1-5 (shipped 2026-03-12)
- 🚧 **v1.1 Новые дополнения** - Phases 6-11 (in progress)

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

<details>
<summary>✅ v1.0 MVP (Phases 1-5) - SHIPPED 2026-03-12</summary>

- [x] **Phase 1: Foundation & Auth** - Project scaffolding, npm package, auth flow, session management, JSON output infrastructure, rate limiting (completed 2026-03-11)
- [x] **Phase 2: Chat Discovery & Message Reading** - List chats, chat info, join/leave groups, peer resolution, message history, search (completed 2026-03-11)
- [x] **Phase 3: Messaging & Interaction** - Send messages, reply, forward, react, human-readable output mode (completed 2026-03-11)
- [x] **Phase 4: Media & Files** - Download and upload media/files, search filters by media type (completed 2026-03-11)
- [x] **Phase 5: Advanced Features & Polish** - Forum topic support, multi-chat search, field selection, JSONL streaming (completed 2026-03-12)

### Phase 1: Foundation & Auth
**Goal**: Users can install the CLI via npm/npx, authenticate with Telegram (including 2FA), persist and manage sessions, and receive structured JSON output from all commands
**Depends on**: Nothing (first phase)
**Requirements**: INFRA-01, INFRA-02, INFRA-03, INFRA-04, INFRA-05, INFRA-06, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, OUT-01, OUT-02, OUT-06
**Plans**: 3 plans

Plans:
- [x] 01-01-PLAN.md — Project scaffolding, build infrastructure, and core library modules
- [x] 01-02-PLAN.md — Session store with locking, client lifecycle wrapper, rate limiting, and auth commands
- [x] 01-03-PLAN.md — Session commands (export, import), CLI entry point wiring, build, and end-to-end verification

### Phase 2: Chat Discovery & Message Reading
**Goal**: Users can discover their chats, get detailed chat info, join/leave groups, resolve peers, and read/search message history
**Depends on**: Phase 1
**Requirements**: CHAT-01, CHAT-02, CHAT-03, CHAT-04, CHAT-05, CHAT-06, CHAT-07, READ-01, READ-02, READ-03, READ-04
**Plans**: 4 plans

Plans:
- [x] 02-01-PLAN.md — Shared foundation: types, serialization, peer resolution, entity-to-markdown
- [x] 02-02-PLAN.md — Chat commands (list, info, join, leave, resolve, invite-info, members)
- [x] 02-03-PLAN.md — Message commands (history with date filtering, search per-chat and global)
- [x] 02-04-PLAN.md — UAT gap closure: fix ignoreMigrated, -q shorthand conflict, DM chatTitle resolution

### Phase 3: Messaging & Interaction
**Goal**: Users can send text messages, reply to specific messages, forward messages between chats, react with emoji, and switch between JSON and human-readable output
**Depends on**: Phase 2
**Requirements**: WRITE-01, WRITE-02, WRITE-03, WRITE-05, OUT-03
**Plans**: 2 plans

Plans:
- [x] 03-01-PLAN.md — Write commands: send (with reply and stdin pipe), forward (batch), react (with remove)
- [x] 03-02-PLAN.md — Human-readable output: format.ts formatters, mode-aware output.ts, --no-json flag

### Phase 4: Media & Files
**Goal**: Users can download media/files from messages and upload files to chats, and can filter search results by media type
**Depends on**: Phase 3
**Requirements**: READ-07, WRITE-04, READ-05
**Plans**: 2 plans

Plans:
- [x] 04-01-PLAN.md — Media types, utilities, metadata extraction, search filter integration
- [x] 04-02-PLAN.md — Media download command, media send command, CLI wiring

### Phase 5: Advanced Features & Polish
**Goal**: Users can interact with forum topics in supergroups, search across multiple specific chats, select output fields, and stream results as JSONL
**Depends on**: Phase 4
**Requirements**: WRITE-06, WRITE-07, WRITE-08, READ-06, OUT-04, OUT-05
**Plans**: 3 plans

Plans:
- [x] 05-01-PLAN.md — Forum topic listing, TopicItem type, serialization, format dispatch
- [x] 05-02-PLAN.md — Output enhancements: field selection (--fields), JSONL streaming (--jsonl)
- [x] 05-03-PLAN.md — Topic-scoped commands (--topic on history/send/search/media), multi-chat search

</details>

### v1.1 Новые дополнения (In Progress)

**Milestone Goal:** Expand the CLI with message management (get/edit/delete/pin), user profiles, contacts, polls, and TOON output format for token-efficient agent consumption.

- [ ] **Phase 6: Message Read Operations** - Get messages by ID, get pinned messages from a chat
- [ ] **Phase 7: Message Write Operations** - Edit, delete, pin, and unpin messages
- [x] **Phase 8: User Profiles & Block/Unblock** - New `user` command group with profile, block, unblock, blocked list (completed 2026-03-13)
- [ ] **Phase 9: Contacts CRUD** - New `contact` command group with list, add, delete, search
- [ ] **Phase 10: Polls** - Send polls with quiz mode, multiple choice, anonymous/public, auto-close
- [ ] **Phase 11: TOON Output Format** - Token-efficient output mode (`--toon`) for LLM consumers

## Phase Details

### Phase 6: Message Read Operations
**Goal**: Users can retrieve specific messages by ID and discover pinned messages in any chat
**Depends on**: Phase 5 (v1.0 complete)
**Requirements**: READ-08, READ-09
**Success Criteria** (what must be TRUE):
  1. User can run `tg message get <chat> <id1> <id2> ...` and receive the specified messages with full serialization (text, sender, date, media)
  2. User can request messages by ID in batch and see both found messages and a list of IDs that were not found (deleted or invalid)
  3. User can run `tg message pinned <chat>` and receive all currently pinned messages in the chat
  4. Both commands produce correct JSON, human-readable, JSONL, and field-selected output using existing output pipeline
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Get messages by ID (with notFound tracking) and pinned messages command, shared entity-map utility

### Phase 7: Message Write Operations
**Goal**: Users can edit, delete, pin, and unpin messages with clear permission feedback and safe defaults
**Depends on**: Phase 6
**Requirements**: WRITE-09, WRITE-10, WRITE-11, WRITE-12
**Success Criteria** (what must be TRUE):
  1. User can run `tg message edit <chat> <id> <text>` to edit their own sent messages, and receives a clear error when the 48-hour window has expired or the message is not theirs
  2. User can run `tg message delete <chat> <ids>` with explicit `--revoke` (delete for everyone) or `--for-me` (delete only for self) control, with no silent default that deletes for everyone
  3. User can run `tg message pin <chat> <id>` which defaults to silent (no notification) and supports `--notify` to opt in to notifying members
  4. User can run `tg message unpin <chat> <id>` to unpin a specific pinned message
  5. All four commands translate Telegram permission errors (MESSAGE_EDIT_TIME_EXPIRED, MESSAGE_AUTHOR_REQUIRED, MESSAGE_DELETE_FORBIDDEN, CHAT_ADMIN_REQUIRED) into actionable CLI messages
**Plans**: 2 plans

Plans:
- [ ] 07-01-PLAN.md — Shared types, error translation, editDate serialization, and edit command
- [ ] 07-02-PLAN.md — Delete, pin, unpin commands with CLI wiring and human-readable formatters

### Phase 8: User Profiles & Block/Unblock
**Goal**: Users can inspect detailed profiles for any Telegram user and manage their block list
**Depends on**: Phase 6
**Requirements**: USER-01, USER-02, USER-03, USER-04
**Success Criteria** (what must be TRUE):
  1. User can run `tg user profile <user>` and see bio, photo count, last seen status, common chats count, and blocked status, with privacy-restricted fields clearly labeled rather than shown as empty
  2. User can run `tg user block <user>` and `tg user unblock <user>` to manage blocking, with confirmation in output
  3. User can run `tg user blocked` to list all blocked users with pagination support
  4. All user commands produce correct JSON and human-readable output using the existing output pipeline
**Plans**: 2 plans

Plans:
- [ ] 08-01-PLAN.md — Types, error map extension, profile command (multi-user with partial success), block and unblock commands
- [ ] 08-02-PLAN.md — Blocked list command, formatters, formatData dispatch, fields.ts, command group index, CLI wiring

### Phase 9: Contacts CRUD
**Goal**: Users can manage their Telegram contacts -- list, add, delete, and search
**Depends on**: Phase 6
**Requirements**: CONT-01, CONT-02, CONT-03, CONT-04
**Success Criteria** (what must be TRUE):
  1. User can run `tg contact list` and see all contacts with phone number, username, and online status
  2. User can run `tg contact add` with either a username/ID (routed to addContact API) or a phone number (routed to importContacts API) and see the added contact in output
  3. User can run `tg contact delete <user>` to remove a contact
  4. User can run `tg contact search <query>` to find contacts by name, returning matching results
**Plans**: 2 plans

Plans:
- [ ] 09-01-PLAN.md — Contact types, error map, delete and add commands (dual routing)
- [ ] 09-02-PLAN.md — List and search commands, formatters, formatData dispatch, CLI wiring

### Phase 10: Polls
**Goal**: Users can create and send polls with full configuration (quiz mode, multiple choice, anonymous/public, auto-close)
**Depends on**: Phase 6
**Requirements**: WRITE-13
**Success Criteria** (what must be TRUE):
  1. User can run `tg message poll <chat> --question <q> --option <o1> --option <o2>` to send a basic poll with 2-10 options
  2. User can create a quiz poll with `--quiz --correct <index> --solution <text>` where exactly one correct answer is required
  3. User can configure poll behavior with `--multiple` (multiple choice), `--public` (non-anonymous), and `--close-in <seconds>` (auto-close timer)
  4. Client-side validation rejects invalid configurations before API call (too few/many options, missing --correct in quiz mode, option text too long)
**Plans**: 2 plans

Plans:
- [ ] 10-01-PLAN.md — Poll types (PollData, PollOption), serialization (extractPollData), error codes
- [ ] 10-02-PLAN.md — Poll command handler with validation, human-readable formatter, CLI wiring

### Phase 11: TOON Output Format
**Goal**: Users can use `--toon` for a token-efficient output format that reduces LLM context consumption by 30-60% on uniform data
**Depends on**: Phase 10 (all data shapes must exist)
**Requirements**: OUT-07
**Success Criteria** (what must be TRUE):
  1. User can pass `--toon` on any command that returns data and receive TOON-formatted output instead of JSON
  2. `--toon` is mutually exclusive with `--human` and `--jsonl` -- passing conflicting flags produces a clear error
  3. `--fields` selection works with `--toon` (field filtering applied before TOON encoding)
  4. TOON output produces measurably fewer tokens than equivalent JSON output on a benchmark of 100+ real messages (benchmark gate: minimum 20% savings)
**Plans**: TBD

Plans:
- [ ] TBD (run /gsd:plan-phase 11 to break down)

## Progress

**Execution Order:**
Phases execute in numeric order: 6 → 7 → 8 → 9 → 10 → 11

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Foundation & Auth | v1.0 | 3/3 | Complete | 2026-03-11 |
| 2. Chat Discovery & Message Reading | v1.0 | 4/4 | Complete | 2026-03-11 |
| 3. Messaging & Interaction | v1.0 | 2/2 | Complete | 2026-03-11 |
| 4. Media & Files | v1.0 | 2/2 | Complete | 2026-03-11 |
| 5. Advanced Features & Polish | v1.0 | 3/3 | Complete | 2026-03-12 |
| 6. Message Read Operations | v1.1 | 0/1 | Planning | - |
| 7. Message Write Operations | v1.1 | 0/2 | Planning | - |
| 8. User Profiles & Block/Unblock | 2/2 | Complete   | 2026-03-13 | - |
| 9. Contacts CRUD | v1.1 | 0/2 | Planning | - |
| 10. Polls | 1/2 | In Progress|  | - |
| 11. TOON Output Format | v1.1 | 0/0 | Not started | - |
