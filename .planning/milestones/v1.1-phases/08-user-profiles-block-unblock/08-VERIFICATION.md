---
phase: 08-user-profiles-block-unblock
verified: 2026-03-13T12:47:00Z
status: passed
score: 16/16 must-haves verified
re_verification: false
---

# Phase 8: User Profiles & Block/Unblock Verification Report

**Phase Goal:** User profile lookup and block/unblock management
**Verified:** 2026-03-13T12:47:00Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Plan 01)

| #  | Truth                                                                                         | Status     | Evidence                                                                                    |
|----|-----------------------------------------------------------------------------------------------|------------|---------------------------------------------------------------------------------------------|
| 1  | Profile command fetches GetFullUser + GetUserPhotos and returns all required fields           | VERIFIED   | `profile.ts:99-119` calls both APIs; builds complete UserProfile with all 16 fields        |
| 2  | Multi-user comma-separated input returns { profiles: [], notFound: [] } wrapper               | VERIFIED   | `profile.ts:62,173` splits on comma, collects partials, calls `outputSuccess({profiles, notFound})` |
| 3  | Privacy-restricted phone shows '[restricted]', lastSeen maps all 6 status types               | VERIFIED   | `profile.ts:134` phone logic; `profile.ts:27-44` all 6 className cases in mapUserStatus   |
| 4  | Bot-specific fields (botInlinePlaceholder, supportsInline) included when isBot is true        | VERIFIED   | `profile.ts:155-160` conditional block on `isBot`                                          |
| 5  | Block/unblock call contacts.Block/Unblock and return BlockResult with user details            | VERIFIED   | `block.ts:48`, `unblock.ts:48` — invoke calls confirmed; BlockResult built and returned   |
| 6  | Blocking already-blocked user succeeds silently (idempotent)                                 | VERIFIED   | Test `blocks a user successfully` + `handles idempotent blocking` both pass                |
| 7  | Non-user entities (channels, groups) produce a clear error, not a crash                      | VERIFIED   | `block.ts:41-43`, `profile.ts:91-94` className check + `outputError('NOT_A_USER')`        |

### Observable Truths (Plan 02)

| #  | Truth                                                                                              | Status     | Evidence                                                                                           |
|----|-----------------------------------------------------------------------------------------------------|------------|----------------------------------------------------------------------------------------------------|
| 8  | `tg user blocked` with --limit/--offset returns blocked users with total count                     | VERIFIED   | `blocked.ts:24-25` parses opts; `blocked.ts:40-42` calls GetBlocked; returns `{users, total}`    |
| 9  | Empty blocked list returns { users: [], total: 0 } and human output 'No blocked users.'            | VERIFIED   | `blocked.ts` returns empty array; `format.ts:413-414` returns 'No blocked users.' for empty       |
| 10 | Blocked vs BlockedSlice response types both produce correct total                                  | VERIFIED   | `blocked.ts:44`: `(result as any).count ?? (result as any).blocked?.length ?? 0`; 2 tests pass    |
| 11 | formatUserProfile renders key-value pairs with color-coded lastSeen and restricted indicators      | VERIFIED   | `format.ts:303-368`: aligned pairs, `pc.green('online')`, `pc.dim('[restricted]')`               |
| 12 | formatData auto-dispatches UserProfileResult, BlockResult, and BlockedListResult shapes correctly  | VERIFIED   | `format.ts:408-421` three shape checks at top of function; all dispatch tests pass                |
| 13 | BlockedList human output reuses formatMembers pattern                                               | VERIFIED   | `format.ts:376-379` `formatBlockedList` delegates to `formatMembers(users as MemberItem[])`      |
| 14 | 'profiles' and 'users' in LIST_KEYS enables --fields and --jsonl for user commands                 | VERIFIED   | `fields.ts:7` LIST_KEYS includes 'profiles' and 'users'; 2 JSONL tests pass                      |
| 15 | `tg user --help` shows profile, block, unblock, blocked subcommands                                | VERIFIED   | Integration test `user --help shows profile, block, unblock, blocked subcommands` passes          |
| 16 | `tg --help` shows User command group                                                                | VERIFIED   | Integration test `--help shows all 6 command groups: Auth, Session, Chat, Message, Media, User` passes |

**Score:** 16/16 truths verified

---

## Required Artifacts

| Artifact                              | Expected                                        | Status     | Details                                                                         |
|---------------------------------------|-------------------------------------------------|------------|---------------------------------------------------------------------------------|
| `src/lib/types.ts`                    | UserProfile, UserProfileResult, BlockResult, BlockedListItem, BlockedListResult | VERIFIED | Lines 294-346: all 5 interfaces present with all required fields |
| `src/commands/user/profile.ts`        | userProfileAction handler                       | VERIFIED   | 182 lines, exports `userProfileAction`, full implementation                    |
| `src/commands/user/block.ts`          | userBlockAction handler                         | VERIFIED   | 65 lines, exports `userBlockAction`, full implementation                       |
| `src/commands/user/unblock.ts`        | userUnblockAction handler                       | VERIFIED   | 65 lines, exports `userUnblockAction`, full implementation                     |
| `src/commands/user/blocked.ts`        | userBlockedAction handler                       | VERIFIED   | 77 lines, exports `userBlockedAction`, full implementation                     |
| `src/commands/user/index.ts`          | createUserCommand function                      | VERIFIED   | 43 lines, exports `createUserCommand`, wires all 4 subcommands                 |
| `src/lib/format.ts`                   | formatUserProfile, formatBlockedList, updated formatData | VERIFIED | Lines 303-421 contain all 3 formatters plus dispatch                  |
| `src/lib/fields.ts`                   | Updated LIST_KEYS with 'profiles' and 'users'   | VERIFIED   | Line 7 confirmed                                                                |
| `src/bin/tg.ts`                       | User command group registered                   | VERIFIED   | Lines 10, 93-95 — import + create + helpGroup + addCommand                     |
| `tests/unit/user-profile.test.ts`     | Profile command unit tests (min 80 lines)        | VERIFIED   | 466 lines, 19 tests, all pass                                                  |
| `tests/unit/user-block.test.ts`       | Block command unit tests (min 40 lines)          | VERIFIED   | 221 lines, 5 tests, all pass                                                   |
| `tests/unit/user-unblock.test.ts`     | Unblock command unit tests (min 40 lines)        | VERIFIED   | 204 lines, 4 tests, all pass                                                   |
| `tests/unit/user-blocked.test.ts`     | Blocked list command unit tests (min 40 lines)   | VERIFIED   | 210 lines, 5 tests, all pass                                                   |

---

## Key Link Verification

| From                              | To                            | Via           | Status     | Details                                                        |
|-----------------------------------|-------------------------------|---------------|------------|----------------------------------------------------------------|
| `src/commands/user/profile.ts`    | `Api.users.GetFullUser`       | client.invoke | VERIFIED   | Line 99-101: `client.invoke(new Api.users.GetFullUser(...))`   |
| `src/commands/user/profile.ts`    | `Api.photos.GetUserPhotos`    | client.invoke | VERIFIED   | Line 109-115: `client.invoke(new Api.photos.GetUserPhotos(...))` |
| `src/commands/user/block.ts`      | `Api.contacts.Block`          | client.invoke | VERIFIED   | Line 48: `client.invoke(new Api.contacts.Block(...))`          |
| `src/commands/user/unblock.ts`    | `Api.contacts.Unblock`        | client.invoke | VERIFIED   | Line 48: `client.invoke(new Api.contacts.Unblock(...))`        |
| `src/commands/user/blocked.ts`    | `Api.contacts.GetBlocked`     | client.invoke | VERIFIED   | Line 40-42: `client.invoke(new Api.contacts.GetBlocked(...))`  |
| `src/commands/user/index.ts`      | `src/commands/user/profile.ts` | import       | VERIFIED   | Line 2: `import { userProfileAction } from './profile.js'`     |
| `src/bin/tg.ts`                   | `src/commands/user/index.ts`  | import        | VERIFIED   | Line 10: `import { createUserCommand } from '../commands/user/index.js'` |
| `src/lib/format.ts`               | formatUserProfile             | formatData dispatch | VERIFIED | Line 408: `Array.isArray(obj.profiles) && Array.isArray(obj.notFound)` |
| `src/lib/fields.ts`               | extractListItems              | LIST_KEYS     | VERIFIED   | Line 7: `'profiles', 'users'` in LIST_KEYS const array         |

---

## Requirements Coverage

| Requirement | Source Plan | Description                                                                                    | Status    | Evidence                                                           |
|-------------|------------|------------------------------------------------------------------------------------------------|-----------|--------------------------------------------------------------------|
| USER-01     | 08-01, 08-02 | User can get a detailed profile for any user showing bio, photos count, last seen, common chats, blocked status, and privacy-restricted field indicators | SATISFIED | `tg user profile` command fully implemented and wired; all fields present in UserProfile; formatUserProfile renders them |
| USER-02     | 08-01, 08-02 | User can block a user (`tg user block <user>`)                                                 | SATISFIED | `block.ts` calls `Api.contacts.Block`, returns BlockResult; CLI subcommand registered |
| USER-03     | 08-01, 08-02 | User can unblock a user (`tg user unblock <user>`)                                             | SATISFIED | `unblock.ts` calls `Api.contacts.Unblock`, returns BlockResult; CLI subcommand registered |
| USER-04     | 08-02      | User can list blocked users (`tg user blocked`) with pagination                                | SATISFIED | `blocked.ts` calls `Api.contacts.GetBlocked` with offset/limit; handles both Blocked/BlockedSlice response types |

All 4 requirements declared in PLAN frontmatter are accounted for. REQUIREMENTS.md confirms USER-01 through USER-04 are mapped to Phase 8 and marked complete. No orphaned requirements found.

---

## Error Map Coverage

| Error Code               | Value                    | Status   |
|--------------------------|--------------------------|----------|
| `PEER_ID_INVALID`        | `'Peer not found'`       | VERIFIED — updated from 'Chat not found' to serve both chat and user commands |
| `USER_BOT_INVALID`       | `'Cannot block this bot'` | VERIFIED — `errors.ts:75` |
| `INPUT_USER_DEACTIVATED` | `'User account deleted'` | VERIFIED — `errors.ts:76` |

---

## Anti-Patterns Found

None. Scan of all 9 modified/created source files found:
- No TODO/FIXME/HACK/PLACEHOLDER comments
- No stub return patterns (`return null`, `return {}`, `return []`, `=> {}`)
- All handlers make real API calls and return typed results
- No console.log-only implementations

---

## Human Verification Required

The following behaviors cannot be verified programmatically and require a live Telegram session:

### 1. Privacy-Restricted Phone Display (Live Account)

**Test:** Run `tg user profile <username>` against a user who has phone number visibility restricted
**Expected:** Output shows `phone: "[restricted]"` in JSON mode; human mode renders it dim
**Why human:** Requires a real Telegram account with a user who restricts phone visibility

### 2. Photo Count Accuracy

**Test:** Run `tg user profile <username>` against a user with a known number of profile photos
**Expected:** `photoCount` field matches the actual count visible in Telegram
**Why human:** GetUserPhotos API returns total count for authorized access; accuracy depends on actual account state

### 3. `tg user blocked` Pagination (Live Account)

**Test:** Block more than 50 users, then run `tg user blocked --limit 10 --offset 5`
**Expected:** Returns 10 users starting from offset 5; `total` reflects full count
**Why human:** Requires live data to verify BlockedSlice vs Blocked response type selection

### 4. Human-Readable Output Alignment

**Test:** Run `tg user profile <user> --human` against a real account
**Expected:** Key-value pairs are visually aligned; lastSeen is color-coded; restricted phone is dim
**Why human:** Terminal color rendering and visual alignment cannot be verified from source alone

---

## Full Test Suite

525/525 tests pass. TypeScript type-check (`tsc --noEmit`) passes cleanly. No regressions.

---

## Summary

Phase 8 goal is fully achieved. All four user commands (`profile`, `block`, `unblock`, `blocked`) are implemented, tested, and wired into the CLI. The implementation is complete — not stubbed — with real Telegram API calls, typed return values, error handling, human-readable formatters, and --jsonl/--fields support. All 4 requirements (USER-01 through USER-04) are satisfied. The 4 human verification items above are optional quality checks that require a live Telegram session; they do not block the goal.

---

_Verified: 2026-03-13T12:47:00Z_
_Verifier: Claude (gsd-verifier)_
