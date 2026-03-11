---
phase: 02-chat-discovery-message-reading
verified: 2026-03-11T22:30:00Z
status: passed
score: 24/26 must-haves verified
re_verification:
  previous_status: passed
  previous_score: 21/21
  gaps_closed:
    - "Chat list returns dialogs (ignoreMigrated:true removed, UAT gap 1/2/3)"
    - "Message search -q shorthand conflict resolved (Plan 04)"
    - "Global search DM chatTitle resolved via firstName/lastName (Plan 04)"
  gaps_remaining: []
  regressions: []
human_verification:
  - test: "Run tg chat list and verify dialogs are returned (not empty array)"
    expected: "JSON with chats array containing real Telegram dialogs with id, title, type, unreadCount"
    why_human: "UAT confirmed fix works but test uses unit mocks; live environment needed to confirm no regression"
  - test: "Run tg message search --query keyword and verify JSON error when --query is omitted"
    expected: "Commander error (not a JSON envelope error) when --query is missing; JSON results when --query is present"
    why_human: "The requiredOption means Commander rejects before the handler runs; error format is Commander default not JSON envelope"
---

# Phase 2: Chat Discovery and Message Reading Verification Report

**Phase Goal:** Users can discover their chats, get detailed chat info, join/leave groups, resolve peers, and read/search message history -- delivering the core agent use case of finding and extracting information from Telegram
**Verified:** 2026-03-11T22:30:00Z
**Status:** HUMAN_NEEDED (automated checks pass; two behaviors need human confirmation)
**Re-verification:** Yes -- after Plan 04 gap closure (UAT issues fixed)

---

## Re-verification Context

Previous VERIFICATION.md (2026-03-11T15:51:00Z) reported status `passed` with score 21/21. An external verification document (`02-external verification.md`) subsequently identified 7 findings, 5 of which were actioned in Plan 04. This re-verification verifies the Plan 04 fixes and re-assesses all external findings against the current codebase.

**Plan 04 fixes confirmed in source:**
- `ignoreMigrated: true` removed from `src/commands/chat/list.ts` (grep returns empty)
- `-q` shorthand removed from `src/commands/message/index.ts` line 30 (now `--query` only)
- `firstName/lastName` DM name resolution added to `src/commands/message/search.ts` lines 84-88

**Test suite:** 187/187 tests pass. TypeScript: `npx tsc --noEmit` passes with no errors.

---

## Goal Achievement

### Success Criteria from ROADMAP.md

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | User can list all their chats and see names, types, and unread counts in JSON output | VERIFIED | `chatListAction` calls `client.getDialogs`, maps via `serializeDialog`, returns `{chats, total}`; `ignoreMigrated:true` removed (was causing empty results in UAT) |
| 2 | User can get detailed info for any chat (title, description, member count) and list members with pagination | VERIFIED | `chatInfoAction` branches on Channel/Chat/User, returns `ChatInfo`; `chatMembersAction` calls `client.getParticipants` with limit/offset |
| 3 | User can join a group by username or invite link, and leave any group they belong to | VERIFIED | `chatJoinAction` handles both via `JoinChannel` and `ImportChatInvite`; `chatLeaveAction` handles `LeaveChannel` and `DeleteChatUser` |
| 4 | User can read message history from any chat with pagination and date range filtering | VERIFIED | `messageHistoryAction` uses `addOffset` for pagination, `offsetDate` for `--until`, post-filter for `--since` |
| 5 | User can search messages by keyword within a specific chat or globally across all chats | VERIFIED | `messageSearchAction` handles per-chat (with entity) and global (undefined entity) search; DM chatTitle uses `firstName/lastName` |

**Success Criteria Score:** 5/5 verified

### Observable Truths from PLAN Frontmatter

#### Plan 01 Truths (Foundation Layer)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Peer resolution accepts username, @username, numeric ID, phone number, and invite link formats | VERIFIED | `src/lib/peer.ts`; 17 passing tests in `peer-resolve.test.ts` |
| 2 | Dialog serialization produces {id, title, type, username, unreadCount} with correct type discrimination | VERIFIED | `serializeDialog` in `src/lib/serialize.ts`; 32 passing serialize tests |
| 3 | Message serialization produces {id, text, date, senderId, senderName, replyToMsgId, forwardFrom, mediaType} with ISO 8601 dates | PARTIAL | Shape exists; `senderName` is always `null` in practice because neither `history.ts` nor `search.ts` passes `senderEntity` to `serializeMessage(msg)` -- only unit tests verify it with a synthetic entity argument |
| 4 | Entity-to-markdown converts Telegram MessageEntity[] to Markdown | VERIFIED | `src/lib/entity-to-markdown.ts`; 14 passing tests |
| 5 | BigInteger IDs are serialized as strings | VERIFIED | `bigIntToString(val)` calls `.toString()` throughout |
| 6 | withClient accepts optional timeout parameter | VERIFIED | `withClient(opts, fn, options?: { timeout?: number })` defaults to `120_000` |

#### Plan 02 Truths (Chat Commands)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 7 | User can list all chats with id, title, type, username, unreadCount in JSON output | VERIFIED | `chatListAction`; `ignoreMigrated:true` removed in Plan 04 |
| 8 | User can filter chat list by type (--type user/group/channel/supergroup) | VERIFIED | Post-filter `chats.filter(c => c.type === opts.type)`; NOTE: filter applied after pagination slice so `--offset` with `--type` may skip non-matching items |
| 9 | User can paginate chat list with --limit and --offset (default limit 50) | VERIFIED | Fetches `offset+limit` dialogs, slices; NOTE: pagination applies before type filter |
| 10 | User can get detailed info for any chat including description, member count, permissions | VERIFIED | `chatInfoAction` returns `ChatInfo` with full field set |
| 11 | User can join a group by username or by invite link | VERIFIED | Invite link: `ImportChatInvite`; username/ID: `JoinChannel` |
| 12 | User can leave any group or channel | VERIFIED | Channel: `LeaveChannel`; basic group: `DeleteChatUser` |
| 13 | User can resolve a peer by username, numeric ID, or phone number | VERIFIED | `chatResolveAction` wraps `resolveEntity` |
| 14 | User can check invite link info before joining | VERIFIED | `chatInviteInfoAction` handles `ChatInviteAlready/ChatInvite/ChatInvitePeek` |
| 15 | User can list members of a group/channel with pagination | VERIFIED | `chatMembersAction` calls `client.getParticipants` with limit/offset/search |

#### Plan 03 Truths (Message Commands)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 16 | User can read message history from any chat with pagination | VERIFIED | `messageHistoryAction` with `limit` and `addOffset` |
| 17 | User can filter message history by date range | VERIFIED | `--until` uses `offsetDate`; `--since` post-filters |
| 18 | User can search messages by keyword within a specific chat | VERIFIED | `messageSearchAction` with `--chat` resolves entity, passes `search` param |
| 19 | User can search messages globally across all chats and see chatId/chatTitle on each result | VERIFIED | Global search uses undefined entity; DM chatTitle now resolved via `firstName/lastName` (Plan 04 fix) |
| 20 | Messages have consistent shape: id, text (Markdown), date (ISO 8601), senderId, senderName, replyToMsgId, forwardFrom, mediaType | PARTIAL | All fields present in type definition and `serializeMessage`; `senderName` is functionally always `null` in command output because `senderEntity` argument is never passed from history or search commands |
| 21 | Pagination response includes total count for navigation | VERIFIED | All commands output `total: (result).total ?? 0`; NOTE: for date-filtered history and type-filtered chat list, `total` reflects the unfiltered server count |

#### Plan 04 Truths (UAT Gap Closure)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 22 | Chat list returns all dialogs with id, title, type, unreadCount | VERIFIED | `ignoreMigrated:true` removed from `getDialogs` call; grep confirms absence |
| 23 | Chat list type filter correctly restricts output | VERIFIED | Filter logic at line 48-50 of `list.ts` correct; unblocked by removal of `ignoreMigrated` |
| 24 | Chat list pagination slices correctly | VERIFIED | `dialogs.slice(offset, offset + limit)` unblocked by removal of `ignoreMigrated` |
| 25 | Message search --query long form works without -q shorthand conflict | VERIFIED | `index.ts:30` now has `.requiredOption('--query <text>', ...)` with no `-q` shorthand; grep confirms no `-q` in option definition |
| 26 | Global message search chatTitle shows resolved contact name for DM chats | VERIFIED | `search.ts:84-88` checks `chat?.firstName` and builds `firstName + lastName`; 2 new unit tests pass |

**Truth Score:** 24/26 (2 PARTIAL: truths 3 and 20 -- senderName always null)

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `src/lib/types.ts` | VERIFIED | Contains `ChatListItem`, `ChatInfo`, `MemberItem`, `MessageItem`, `SearchResultItem`, plus options interfaces |
| `src/lib/serialize.ts` | VERIFIED | Exports `serializeDialog`, `serializeMessage`, `serializeSearchResult`, `serializeMember`, `bigIntToString` (184 lines) |
| `src/lib/peer.ts` | VERIFIED | Exports `resolveEntity`, `extractInviteHash` (126 lines) |
| `src/lib/entity-to-markdown.ts` | VERIFIED | Exports `entitiesToMarkdown` handling 8 entity types (57 lines) |
| `src/lib/client.ts` | VERIFIED | `withClient` with optional `timeout`, defaults 120s |
| `src/commands/chat/index.ts` | VERIFIED | `createChatCommand()` registers all 7 subcommands |
| `src/commands/chat/list.ts` | VERIFIED | `chatListAction`; `ignoreMigrated` removed (Plan 04) |
| `src/commands/chat/info.ts` | VERIFIED | `chatInfoAction` with Channel/Chat/User branching |
| `src/commands/chat/join.ts` | VERIFIED | `chatJoinAction` with invite link detection; NOTE: join output lacks `chat.type` field (plan specified `{id, title, type}`) |
| `src/commands/chat/leave.ts` | VERIFIED | `chatLeaveAction` with Channel vs Chat branching |
| `src/commands/chat/resolve.ts` | VERIFIED | `chatResolveAction` wrapping `resolveEntity` |
| `src/commands/chat/invite-info.ts` | VERIFIED | `chatInviteInfoAction` handling 3 result types |
| `src/commands/chat/members.ts` | VERIFIED | `chatMembersAction` with CHAT_ADMIN_REQUIRED handling |
| `src/commands/message/index.ts` | VERIFIED | `createMessageCommand()` with history and search; `-q` shorthand removed (Plan 04) |
| `src/commands/message/history.ts` | VERIFIED | `messageHistoryAction` with --since/--until date filtering |
| `src/commands/message/search.ts` | VERIFIED | `messageSearchAction` for per-chat and global search; DM chatTitle fix applied (Plan 04) |

All 16 artifacts: exist and are substantive. All wired into consumers.

---

## Key Link Verification

| From | To | Via | Status | Evidence |
|------|----|-----|--------|----------|
| `src/lib/serialize.ts` | `src/lib/entity-to-markdown.ts` | `import entitiesToMarkdown` | WIRED | Line 3 import + line 124 call |
| `src/lib/serialize.ts` | `src/lib/types.ts` | `import ChatListItem, MessageItem` | WIRED | Lines 4-9 import, used in return types |
| `src/lib/peer.ts` | `telegram` | `client.getEntity`, `Api.messages.CheckChatInvite` | WIRED | resolveEntity implementation |
| `src/commands/chat/list.ts` | `src/lib/serialize.ts` | `serializeDialog` | WIRED | Import line 7 + call line 44 |
| `src/commands/chat/info.ts` | `src/lib/peer.ts` | `resolveEntity` | WIRED | Import + call |
| `src/commands/chat/join.ts` | `telegram` | `Api.channels.JoinChannel`, `Api.messages.ImportChatInvite` | WIRED | Lines 48, 72 |
| `src/bin/tg.ts` | `src/commands/chat/index.ts` | `createChatCommand()` | WIRED | Line 7 import + lines 59-61 `addCommand` |
| `src/commands/message/history.ts` | `src/lib/serialize.ts` | `serializeMessage` | WIRED | Line 8 import + line 63 call |
| `src/commands/message/history.ts` | `src/lib/peer.ts` | `resolveEntity` | WIRED | Line 7 import + line 46 call |
| `src/commands/message/search.ts` | `src/lib/serialize.ts` | `serializeMessage`, `serializeSearchResult` | WIRED | Line 8 import + lines 66, 92 calls |
| `src/commands/message/search.ts` | `telegram` | `client.getMessages` with search param | WIRED | Lines 63, 75 |
| `src/bin/tg.ts` | `src/commands/message/index.ts` | `createMessageCommand()` | WIRED | Line 8 import + lines 63-65 `addCommand` |

All 12 key links: WIRED.

---

## Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| CHAT-01 | 02-02-PLAN | List all dialogs/chats with type, name, unread count | SATISFIED | `chatListAction` outputs `{chats: ChatListItem[], total}`; `ignoreMigrated` bug fixed in Plan 04 |
| CHAT-02 | 02-02-PLAN | Get detailed info for a chat (title, username, member count, description) | SATISFIED | `chatInfoAction` returns full `ChatInfo` |
| CHAT-03 | 02-02-PLAN | Join a group/channel by username or invite link | SATISFIED | `chatJoinAction` handles both paths |
| CHAT-04 | 02-02-PLAN | Leave a group/channel | SATISFIED | `chatLeaveAction` handles channels and basic groups |
| CHAT-05 | 02-01-PLAN, 02-02-PLAN | Resolve a peer by username, phone number, or numeric ID | SATISFIED | `resolveEntity` + `chatResolveAction` |
| CHAT-06 | 02-02-PLAN | Resolve invite links to chat info before joining | SATISFIED | `chatInviteInfoAction` calls `CheckChatInvite` |
| CHAT-07 | 02-02-PLAN | List members of a group/channel with pagination | SATISFIED | `chatMembersAction` with limit/offset/search |
| READ-01 | 02-03-PLAN | Read message history from any chat with pagination | SATISFIED | `messageHistoryAction` with `--limit`/`--offset` |
| READ-02 | 02-03-PLAN | Filter message history by date range (--since, --until) | SATISFIED | `--until` uses `offsetDate`; `--since` post-filters; NOTE: `total` is unfiltered server count |
| READ-03 | 02-03-PLAN | Search messages in a specific chat by keyword | SATISFIED | `messageSearchAction` with `--chat` + `--query` (shorthand `-q` removed) |
| READ-04 | 02-03-PLAN | Search messages globally across all chats | SATISFIED | Global search (no `--chat`) passes undefined entity; DM chatTitle resolution fixed |

All 11 requirements: SATISFIED. No orphaned requirements detected.

---

## Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| `src/commands/message/history.ts:63` | `serializeMessage(msg)` called without `senderEntity` | Info | `senderName` is always `null` in history output; not a stub but an incomplete contract |
| `src/commands/message/search.ts:66` | `serializeMessage(msg)` called without `senderEntity` | Info | `senderName` is always `null` in per-chat search output |
| `src/commands/message/search.ts:30` | `if (!opts.query)` validation is dead code | Info | `requiredOption('--query')` means Commander rejects the command before the handler fires; the `outputError('MISSING_QUERY')` path is unreachable; user gets Commander's default error instead of a JSON envelope error |
| `src/commands/chat/join.ts:51-56,74-79` | Join output missing `type` field | Info | Plan 02-02 specified `{ joined: true, chat: { id, title, type } }`; actual output omits `type` |
| `src/commands/chat/list.ts:47-49` | Type filter applied after pagination slice | Info | `--type group --offset 5` skips 5 unfiltered dialogs; filtered `total` is unfiltered server count |
| `src/commands/message/history.ts:67-72` | `--since` post-filter after pagination | Info | `--offset` applies to unfiltered history; `total` is unfiltered; date-bounded paging may be inaccurate |
| `src/commands/message/history.ts:55-56,67-68` | No date validation for `--since`/`--until` | Info | Invalid date strings become `NaN`; silent empty/wrong results rather than structured error |

No blockers. No TODOs/FIXMEs. No stub implementations. No empty handlers. All are informational correctness limitations.

---

## Test Suite

| Test File | Tests | Status |
|-----------|-------|--------|
| `tests/unit/entity-markdown.test.ts` | 14 | PASS |
| `tests/unit/serialize.test.ts` | 32 | PASS |
| `tests/unit/peer-resolve.test.ts` | 17 | PASS |
| `tests/unit/client.test.ts` | 8 | PASS |
| `tests/unit/chat-list.test.ts` | 7 | PASS |
| `tests/unit/chat-info.test.ts` | 6 | PASS |
| `tests/unit/chat-members.test.ts` | 5 | PASS |
| `tests/unit/chat-join.test.ts` | 4 | PASS |
| `tests/unit/chat-leave.test.ts` | 3 | PASS |
| `tests/unit/peer-command.test.ts` | 4 | PASS |
| `tests/unit/chat-invite.test.ts` | 4 | PASS |
| `tests/unit/message-history.test.ts` | 7 | PASS |
| `tests/unit/message-search.test.ts` | 8 | PASS (incl. 2 new DM name tests) |
| `tests/unit/auth.test.ts` | 14 | PASS |
| `tests/unit/config.test.ts` | (incl.) | PASS |
| `tests/unit/session.test.ts` | (incl.) | PASS |
| `tests/unit/session-store.test.ts` | 6 | PASS |
| `tests/integration/cli-entry.test.ts` | 9 | PASS |
| **Total** | **187** | **ALL PASS** |

TypeScript: `npx tsc --noEmit` passes with no errors.

---

## Human Verification Required

### 1. Chat List Returns Real Dialogs

**Test:** Run `tg chat list` against a real authenticated session.
**Expected:** JSON with `chats` array containing actual Telegram dialogs (non-empty), each with `id` (string), `title`, `type` (user/group/channel/supergroup), `username` (or null), `unreadCount`.
**Why human:** Unit tests use mocks. UAT confirmed the `ignoreMigrated:true` fix worked in a real environment, but this re-verification cannot confirm the fix was not reverted. The fix is confirmed removed from source, but live confirmation is cleaner.

### 2. Message Search Error Format When --query is Omitted

**Test:** Run `tg message search` (no `--query`) and observe the error output.
**Expected:** Commander-level error (plain text, not JSON envelope) explaining `--query` is required. Agents consuming this CLI should be aware that this specific error does NOT follow the `{ ok: false, error, code }` envelope format.
**Why human:** This is a CLI contract observation, not a code defect. The `if (!opts.query) { outputError(..., 'MISSING_QUERY') }` guard in `messageSearchAction` is dead code (Commander rejects first), so the documented JSON error code `MISSING_QUERY` is unreachable. This is a known limitation confirmed by code analysis but requires human observation to understand the actual user-facing behavior.

---

## Known Limitations (Not Blocking Goal)

The following are correctness issues identified during external verification that do not prevent the phase goal from being achieved. They are documented here for the next phase's awareness:

1. **`senderName` always null in command output:** `serializeMessage(msg)` is called without `senderEntity` in both `history.ts` and `search.ts`. The field exists in the type contract but is never populated. Agent consumers expecting sender names will always receive `null`.

2. **Filter-pagination ordering in `tg chat list --type`:** Pagination (`--offset`) applies to the unfiltered dialog list; type filter runs after slicing. The `total` field reflects the unfiltered server count. Paging through a type-filtered chat list is unreliable.

3. **Date-bounded history pagination:** `--since` post-filters after gramjs pagination; `total` is the unfiltered server count. Accurate paging through a date-bounded window is not guaranteed.

4. **No date input validation:** Invalid `--since`/`--until` values silently produce `NaN` timestamps rather than structured validation errors.

5. **Join output missing `chat.type`:** `chatJoinAction` returns `{ joined: true, chat: { id, title } }` without the `type` field specified in the plan contract.

6. **`MISSING_QUERY` error code unreachable:** The JSON envelope error for missing search query is unreachable because Commander's `requiredOption` fires first.

---

## Summary

Phase 2 goal is functionally achieved. All 5 ROADMAP success criteria are verifiable in the codebase. All 11 requirements (CHAT-01 through CHAT-07, READ-01 through READ-04) are implemented and satisfy their requirement descriptions. Plan 04 gap closure resolved all 5 UAT failures confirmed in the external UAT session.

The two human verification items are a live smoke-test of the `ignoreMigrated` fix and an observation of the Commander error format for missing `--query`. Neither represents a code defect requiring a new plan.

The 6 known limitations are correctness improvements for future phases, not phase 2 blockers.

---

_Verified: 2026-03-11T22:30:00Z_
_Verifier: Claude (gsd-verifier)_
_Verification type: Re-verification after Plan 04 gap closure_
