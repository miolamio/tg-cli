# Project Research Summary

**Project:** @miolamio/tg-cli v1.1
**Domain:** Telegram MTProto CLI — v1.1 feature additions
**Researched:** 2026-03-12
**Confidence:** HIGH

## Executive Summary

This v1.1 milestone adds 10 committed features to a validated, production Telegram CLI: message CRUD (get-by-ID, pinned, edit, delete, pin/unpin), user profiles and block/unblock, contacts CRUD, poll creation, and a new TOON output format. The existing architecture is a clean layered pattern (entry -> command groups -> shared lib -> gramjs) that directly accommodates all new features without structural change. Two new command groups (`user`, `contact`) and seven new subcommands under `message` will be added. One new production dependency is required: `@toon-format/toon` for the TOON output mode. Every other feature uses gramjs API methods already available in the currently installed version.

The recommended implementation order is: foundation types and serializers first, then message read operations (get-by-ID, pinned), then message write operations (edit, delete, pin/unpin), then user profile and block/unblock, then contacts CRUD, then polls, and finally TOON output as a cross-cutting concern added last. This order avoids circular dependencies and ensures all output pipeline shapes exist before TOON formatters are built. All features are additive — no existing commands or behaviors change.

The primary risks are: (1) the message edit/delete permission matrix behaves differently across chat types and the gramjs default for `revoke` is `true` (delete for everyone), which is the opposite of what users typically expect — this must be explicitly surfaced; (2) `users.getFullUser` returns empty fields for privacy-restricted data without errors, requiring each field to carry a privacy indicator; (3) TOON token savings depend on uniform array shapes but Telegram messages are heterogeneous — benchmark with real message history before committing to the full encoder; and (4) the pin command defaults to notifying all group members unless `silent: true` is set, which the CLI must enforce as its default.

## Key Findings

### Recommended Stack

The existing stack (gramjs, Commander, Conf, picocolors, Zod, tsup, vitest) ships unchanged. Only one new production dependency is added: `@toon-format/toon@^2.1.0` — zero dependencies, pure ESM, TypeScript declarations included, official reference implementation. Every other v1.1 feature is covered by gramjs API methods already in the installed version. No database, no additional Telegram client library, no markdown renderer, no extra validation library is needed.

**Core technologies:**
- `telegram` (gramjs) v2.26.x: All v1.1 API methods are available — `users.GetFullUser`, `contacts.*`, `client.editMessage`, `client.deleteMessages`, `client.pinMessage`, `Api.InputMediaPoll`, `contacts.Block/Unblock` — all stable MTProto layer methods
- `@toon-format/toon` ^2.1.0: TOON output format — sole new dependency; official SDK, zero deps, ESM, ~40% token reduction on uniform arrays
- Existing `Zod`: handles all new validation needs (poll field constraints, contact input) — no new validation library
- Existing `tsup + vitest`: no toolchain changes needed; Node.js 18+ ESM compatibility confirmed

### Expected Features

**Must have (P1 — table stakes):**
- Get messages by ID — agents need cherry-picking after search; reuses existing `serializeMessage` and `formatMessages`
- Get pinned messages — high-signal content discovery; convenience wrapper over existing search with `InputMessagesFilterPinned`
- Edit sent messages — correct agent-sent messages; 48h window enforced by API; must translate `MESSAGE_EDIT_TIME_EXPIRED` and `MESSAGE_NOT_MODIFIED` gracefully
- Delete messages — cleanup capability; expose `--revoke` explicitly; gramjs defaults to delete-for-everyone (opposite of typical user expectation)
- Pin/unpin messages — admin channel management; default `silent: true` to prevent mass-notifying group members
- User profile — combines `users.GetFullUser` + `User.status` for last seen; new `user` command group
- Block/unblock users — safety operations; accepts any peer type (user, bot, channel), not just users

**Should have (P2 — differentiators):**
- Contacts management (list/add/delete/search) — full CRUD; new `contact` command group; dual API routing (addContact for resolved users, importContacts for phone numbers)
- TOON output (`--toon` flag) — 30-60% token reduction for LLM consumers; fourth output mode alongside JSON/human/JSONL; benchmark required before full implementation
- Send polls — quiz mode, multiple choice, anonymous/public, auto-close (5-600s); most complex gramjs constructor; option identifiers must be `Buffer`, not strings

**Defer to v1.2+:**
- User profile photo download (use existing media download command)
- Contact bulk import by phone number (privacy risk)
- Poll results tracking (persistent connection model required)
- Unpin all messages (edge case; manageable individually)
- User status monitoring (persistent connection model required)

### Architecture Approach

All new features integrate into the established 7-step action handler pattern (options extraction -> session lock -> client lifecycle -> entity resolution -> API call -> serialize -> output). Two new top-level command groups (`src/commands/user/`, `src/commands/contact/`) are added alongside existing groups. Seven new subcommand files extend `src/commands/message/`. Four shared library files are modified: `types.ts` (new interfaces: UserProfile, ContactItem, PollInfo, PollOption; extend MessageItem with optional `poll` field; extend GlobalOptions with `toon`), `serialize.ts` (serializeUserProfile, serializeContact; extend serializeMessage for poll media), `format.ts` (new formatters + detection rules for UserProfile and contacts), `output.ts` (TOON mode flag). One new library file is created: `src/lib/toon.ts` (TOON auto-dispatch formatters mirroring format.ts structure). `fields.ts` gains `'contacts'` in `LIST_KEYS`.

**Major components:**
1. `src/commands/user/` (new) — profile subcommand (GetFullUser + User entity for status) and block/unblock subcommands (contacts.Block/Unblock)
2. `src/commands/contact/` (new) — list/add/delete/search subcommands covering the full `contacts.*` API namespace
3. `src/commands/message/` (extended) — seven new subcommands: get, pinned, edit, delete, pin, unpin, poll
4. `src/lib/toon.ts` (new) — shape-based TOON auto-dispatch formatters; mirrors format.ts; integrates via output.ts
5. `src/lib/output.ts` (modified) — fourth output mode: `_toonMode` flag, `setToonMode()`, TOON branch before existing branches; mutual exclusion with `--human` and `--jsonl`
6. `src/lib/types.ts + serialize.ts + format.ts + fields.ts` (modified) — new interfaces, serializers, formatters, and LIST_KEYS for all new data shapes

### Critical Pitfalls

1. **Edit/delete permission matrix is chat-type-dependent and gramjs defaults are surprising** — `client.deleteMessages` defaults to `revoke: true` (delete for everyone), the opposite of official Telegram clients. Permissions differ across DMs, basic groups, supergroups, and channels. Test each context. Translate all Telegram error codes (`MESSAGE_EDIT_TIME_EXPIRED`, `MESSAGE_AUTHOR_REQUIRED`, `MESSAGE_DELETE_FORBIDDEN`, `MESSAGE_NOT_MODIFIED`) to actionable CLI messages rather than exposing raw errors.

2. **`getFullUser` returns empty fields, not errors, for privacy-restricted data** — `bio`, `phone`, `profile_photo` are null when restricted; `lastSeen` lives on `User.status`, not in `userFull`. Build the profile from BOTH the `User` entity and `userFull.fullUser`. Label restricted fields so agents can distinguish "no value" from "privacy-hidden." Do not show 20 null fields silently.

3. **TOON breaks on non-uniform data shapes** — Telegram messages are heterogeneous (text, media, service, forwards, replies). TOON's token savings require uniform arrays. Benchmark with 100+ real messages BEFORE building the full encoder. Define a fixed minimal TOON schema per data shape; flatten `media` to top-level fields to preserve tabular structure.

4. **Pin command notifies all group members by default** — `messages.updatePinnedMessage` sends notifications unless `silent: true`. The CLI must default to silent and require `--notify` to opt in. A single accidental pin in a large group is a severe UX failure with no undo.

5. **Contacts API has two separate add paths and a caching trap** — `contacts.addContact` requires a resolved InputUser (Telegram-ID-based); `contacts.importContacts` handles phone-number-based add. Route to the correct method based on input format. Always pass `hash: bigInt(0)` to `contacts.getContacts` — hash-based caching is for persistent apps, not stateless CLIs, and a wrong hash returns an empty "not modified" response.

## Implications for Roadmap

Based on research, suggested phase structure:

### Phase 1: Foundation Types and Serializers
**Rationale:** All new commands depend on new TypeScript interfaces and serializers. This phase creates the shared foundation so subsequent phases can be built without type conflicts. Pure TypeScript work — no API calls, no Commander wiring, no risk.
**Delivers:** `UserProfile`, `ContactItem`, `PollInfo`, `PollOption` interfaces in `types.ts`; `serializeUserProfile`, `serializeContact` in `serialize.ts`; optional `poll` field on `MessageItem`; `'contacts'` added to `LIST_KEYS` in `fields.ts`
**Addresses:** Prerequisite for all v1.1 features
**Avoids:** Type drift where each command phase independently defines conflicting interfaces

### Phase 2: Message Management — Read Operations
**Rationale:** Lowest-complexity new features with highest immediate agent value. Reuses existing `MessageItem`, `serializeMessage`, and `formatMessages` — no new formatters needed. Validates the new subcommand-wiring pattern before tackling write operations with their permission complexity.
**Delivers:** `tg message get <chat> <ids>` and `tg message pinned <chat>`
**Addresses:** P1 table stakes — cherry-picking messages by ID after search, high-signal content discovery
**Avoids:** Must filter `undefined`/`MessageEmpty` from `getMessages` result (gramjs issue #158); report not-found IDs in output as `notFound: [...]` rather than silently omitting them; use `messages.search` with `InputMessagesFilterPinned` for pinned (not manual ID tracking)

### Phase 3: Message Management — Write Operations
**Rationale:** Grouped together because edit, delete, pin, and unpin all share the same permission model complexity across chat types. Building them together enables a unified error-handling approach and coherent cross-chat-type test coverage in one focused phase.
**Delivers:** `tg message edit`, `tg message delete`, `tg message pin`, `tg message unpin`
**Addresses:** P1 table stakes — message correction, cleanup, admin channel management
**Avoids:** Pitfall 1 — test each command across DMs, basic groups, supergroups, and channels; pin must default to `silent: true`; delete must expose `--revoke`/`--for-me`; translate all Telegram error codes; `--confirm` required when deleting more than 10 messages

### Phase 4: User Profiles and Block/Unblock
**Rationale:** New `user` command group. Block status appears in the user profile output (`userFull.blocked`), so these are logically grouped. Medium complexity due to combining two API sources (GetFullUser + User entity) and requiring new types and formatters.
**Delivers:** `tg user profile <user>`, `tg user block <user>`, `tg user unblock <user>`, `tg user blocked`
**Addresses:** P1 table stakes — understanding interaction targets, safety operations
**Avoids:** Pitfall 2 — build profile from both `User` and `userFull`; label privacy-restricted fields; include only non-null fields in output, with a `privacyRestricted: [...]` array listing hidden fields; block must accept any peer type, not just users

### Phase 5: Contacts CRUD
**Rationale:** Self-contained new command group with no dependencies on other v1.1 phases. Placed after user profile because the contacts mental model reinforces user relationship operations that appear there. The dual API path (addContact vs importContacts) requires upfront design but is well-understood.
**Delivers:** `tg contact list`, `tg contact add`, `tg contact delete`, `tg contact search`
**Addresses:** P2 differentiator — user relationship management; no competing CLI has full contacts CRUD
**Avoids:** Pitfall 5 — route `add` by input type (username/ID -> addContact; phone number -> importContacts); always pass `hash: bigInt(0)` to getContacts; handle `addPhonePrivacyException` explicitly (default false, opt-in flag to share phone)

### Phase 6: Polls
**Rationale:** Most complex gramjs constructor. Placed after simpler phases because it extends `MessageItem` (from Phase 1) and uses `messages.SendMedia` — an unfamiliar pattern. Quiz mode requires careful client-side validation before API call. No dependency on other v1.1 features.
**Delivers:** `tg message poll <chat> --question <q> --option <o1> --option <o2> [--quiz --correct 0 --solution <text>] [--multiple] [--public] [--close-in <seconds>]`
**Addresses:** P2 differentiator — no competing Telegram CLI supports poll creation
**Avoids:** Pitfall 8 — auto-generate `Buffer.from([idx])` identifiers, never use option text as identifier; validate all constraints client-side (2-10 options, 255 char question, 100 char option, 200 char solution with max 2 newlines); quiz mode requires exactly one `--correct` index; document that polls are immutable after creation (only closing is possible)

### Phase 7: TOON Output Format
**Rationale:** Cross-cutting concern — must come last so all data shapes exist for testing and formatting. Has an explicit benchmark gate: measure token savings with 100+ real messages before full implementation. If savings are under 20% for real Telegram data, simplify to abbreviated JSON keys instead.
**Delivers:** `--toon` global flag; `src/lib/toon.ts`; TOON mode in `output.ts`; mutual exclusion with `--human`/`--jsonl` in `tg.ts`; `--fields` compatibility (field selection applied before TOON encoding)
**Addresses:** P2 differentiator — token efficiency for agent contexts; genuine innovation, no competing CLI has this
**Avoids:** Pitfall 4 — define fixed TOON schema per data shape; flatten `media` fields to top-level; benchmark before full implementation; test special character escaping (commas, newlines, backslashes in message text)

### Phase Ordering Rationale

- Phase 1 is a hard prerequisite: all other phases import from `types.ts` and `serialize.ts`
- Phases 2-3 before 4-6 because message commands reuse existing infrastructure (zero new formatters), validating the wiring pattern at minimum cost
- Phase 3 (write) groups all permission-matrix-sensitive operations for coherent testing
- Phase 4 (user) before Phase 5 (contacts) because block status in profiles reinforces the relationship-management mental model
- Phase 6 (polls) last among core features: most novel gramjs constructor, fewest dependencies on other phases
- Phase 7 (TOON) always last: all data shapes must exist for TOON formatters; benchmark gate prevents wasted effort if real-world savings are insufficient

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 3 (write operations):** Complex permission matrix — verify error code behavior per chat type (DM/basic group/supergroup/channel) before implementation; confirm gramjs `revoke` default behavior in current installed version
- **Phase 7 (TOON):** Benchmark token savings with real Telegram message history BEFORE writing the encoder; decision gate: if savings under 20%, simplify to abbreviated JSON keys

Phases with standard, well-documented patterns (can skip research-phase):
- **Phase 1 (foundation):** Pure TypeScript type work, no API calls, no unknowns
- **Phase 2 (read operations):** Uses existing `serializeMessage` and `formatMessages`; pattern well-established in codebase
- **Phase 4 (user/block):** gramjs API methods verified against official docs; flow is direct
- **Phase 5 (contacts):** Dual API path is documented and routing logic is clear

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All gramjs API methods verified against official docs and local `node_modules/telegram/client/*.d.ts`. `@toon-format/toon` verified via npm view. Version compatibility confirmed. No alternative dependencies considered necessary. |
| Features | HIGH | All features map to specific, stable Telegram API methods. Limits (poll constraints, edit window, contact field lengths) verified against official Telegram API docs. Feature scope is committed — no speculation required. |
| Architecture | HIGH | Integration plan verified against existing source files. Build order derived from actual import dependencies. All established patterns (7-step action, output pipeline, LIST_KEYS, shape detection in formatData) confirmed by reading full source. |
| Pitfalls | HIGH | Each pitfall verified against official API docs, gramjs issues, or confirmed codebase behavior. gramjs `revoke: true` default confirmed. Privacy field restriction behavior documented in official Telegram API constructors. TOON non-uniformity risk confirmed by spec. |

**Overall confidence:** HIGH

### Gaps to Address

- **TOON token savings on real Telegram data:** The 30-60% claim applies to uniform arrays. Real Telegram message histories are heterogeneous. Benchmark with 100+ actual messages before committing to the full TOON encoder. Design Phase 7 with an explicit benchmark gate.
- **`contacts.importContacts` response structure for unmatched phones:** The exact response shape when a phone number does not match a Telegram account needs verification during Phase 5 implementation. Likely returns an empty `importedContacts` array, but confirm before building the error path.
- **gramjs issue #158 (getMessages undefined entries):** `client.getMessages` may return `undefined` slots for missing IDs rather than `MessageEmpty` objects. The filter-and-report approach is designed, but test with deleted message IDs before implementing Phase 2 to confirm exact behavior.
- **Pin/unpin in forum topics:** Requires passing `replyTo` with the topic ID. Supported by the API but not a primary target for v1.1. Flag as a known limitation in Phase 3 documentation.

## Sources

### Primary (HIGH confidence)
- gramjs TelegramClient source (local: `node_modules/telegram/client/`) — editMessage, deleteMessages, pinMessage, unpinMessage, getMessages signatures verified locally
- [Telegram API docs](https://core.telegram.org/method/) — messages.editMessage, messages.deleteMessages, messages.updatePinnedMessage, users.getFullUser, contacts.*, messages.sendMedia, Poll constructor, userFull constructor
- [gramjs API reference](https://gram.js.org/) — GetFullUser, UserFull class, contacts namespace, InputMediaPoll class
- [gramjs guides](https://painor.gitbook.io/gramjs/) — editMessage, deleteMessages, getMessages, contacts, updatePinnedMessage patterns
- [@toon-format/toon npm](https://www.npmjs.com/package/@toon-format/toon) — v2.1.0, verified via npm view; zero deps, ESM, TypeScript declarations
- [TOON Format Spec](https://github.com/toon-format/spec) — SPEC v3.0, ABNF grammar, 358+ test fixtures
- Existing codebase — all source files read; all patterns and LIST_KEYS confirmed against implementation

### Secondary (MEDIUM confidence)
- [InfoQ TOON article](https://www.infoq.com/news/2025/11/toon-reduce-llm-cost-tokens/) — 40% token reduction, 99.4% LLM parsing accuracy benchmarks
- [TOON Token Savings Analysis](https://blog.logrocket.com/reduce-tokens-with-toon/) — 30-60% savings on uniform arrays, diminishing on heterogeneous data
- [gramjs Issue #158](https://github.com/gram-js/gramjs/issues/158) — getMessages undefined entry inconsistency for missing IDs
- Community sources on 48-hour edit window — consistent with `MESSAGE_EDIT_TIME_EXPIRED` error code behavior in official docs

### Tertiary (LOW confidence)
- TOON encoding performance at scale (1000+ messages) — inferred from spec behavior with heterogeneous data, not benchmarked against real Telegram data at volume

---
*Research completed: 2026-03-12*
*Ready for roadmap: yes*
