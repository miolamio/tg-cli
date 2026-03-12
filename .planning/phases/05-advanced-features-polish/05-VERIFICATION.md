---
phase: 05-advanced-features-polish
verified: 2026-03-12T11:10:59Z
status: passed
score: 18/18 must-haves verified
re_verification: false
---

# Phase 5: Advanced Features & Polish Verification Report

**Phase Goal:** Advanced Features & Polish — forum topic listing, output enhancements (field selection, JSONL streaming), topic-scoped messaging, multi-chat search
**Verified:** 2026-03-12T11:10:59Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #   | Truth                                                                                                  | Status     | Evidence                                                                    |
|-----|--------------------------------------------------------------------------------------------------------|------------|-----------------------------------------------------------------------------|
| 1   | User can run `tg chat topics <chat>` and see list of forum topics with all required fields             | VERIFIED   | `chatTopicsAction` in topics.ts calls `GetForumTopics`, serializes via `serializeTopic` |
| 2   | Topic listing supports --limit and --offset pagination with default limit 50                           | VERIFIED   | topics.ts: `parseInt(opts.limit, 10) || 50`, slice at offset; registered in chat/index.ts |
| 3   | Running topics on a non-forum chat returns error with code NOT_A_FORUM                                 | VERIFIED   | forum guard: `className !== 'Channel'` or `forum === false` throws TgError NOT_A_FORUM |
| 4   | Human-readable output shows topics in a formatted list                                                 | VERIFIED   | `formatTopics` in format.ts renders aligned list with `[pinned]`/`[closed]` indicators |
| 5   | User can pass --fields to any command and get only those fields in data output                         | VERIFIED   | `pickFields`, `applyFieldSelection` in fields.ts; integrated into `outputSuccess` in output.ts |
| 6   | Dot notation works: --fields id,media.filename returns nested paths correctly                          | VERIFIED   | `pickFields` splits on `.`, walks object path, reconstructs nested result |
| 7   | Field selection preserves metadata fields (total, count) alongside filtered array items                | VERIFIED   | `applyFieldSelection` preserves non-array entries; 28 output tests confirm |
| 8   | Field selection only affects JSON mode; --human mode silently ignores --fields                         | VERIFIED   | output.ts priority chain: JSONL > human > JSON; human mode bypasses field filter |
| 9   | User can pass --jsonl on list commands to get one JSON object per line without envelope                | VERIFIED   | `_jsonlMode` path in `outputSuccess` extracts list via `extractListItems`, writes bare JSON per line |
| 10  | --jsonl and --human are mutually exclusive with INVALID_OPTIONS error                                  | VERIFIED   | tg.ts preAction hook: if `opts.jsonl && isHuman` calls `outputError` with INVALID_OPTIONS and exits |
| 11  | --jsonl with --json is fine (no conflict)                                                              | VERIFIED   | No mutual exclusion check for --jsonl + --json; falls through correctly |
| 12  | User can read messages from a specific topic via `tg message history <chat> --topic <topicId>`        | VERIFIED   | history.ts: parses topicId, calls `assertForum`, passes `replyTo: topicId` to `getMessages` |
| 13  | User can send messages to a specific topic via `tg message send <chat> <text> --topic <topicId>`      | VERIFIED   | send.ts: `effectiveReplyTo = topicId !== undefined ? topicId : replyTo`; passed to `sendMessage` |
| 14  | User can search within a topic via `tg message search --chat <chat> --topic <topicId> --query <text>` | VERIFIED   | search.ts: single-chat branch applies `assertForum` and `searchParams.replyTo = topicId` |
| 15  | User can send media to a topic via `tg media send <chat> <file> --topic <topicId>`                    | VERIFIED   | media/send.ts: `effectiveReplyTo` with topicId passed to `sendFile` |
| 16  | Using --topic on a non-forum chat returns NOT_A_FORUM error                                            | VERIFIED   | `assertForum` in peer.ts imported and called in history, send, search, media/send |
| 17  | User can search across multiple chats via `tg message search --chat @a,@b,@c --query <text>`          | VERIFIED   | search.ts: `opts.chat.split(',')` multi-chat branch; iterates per-chat with error isolation |
| 18  | Multi-chat search results are flat list with chatId+chatTitle, sorted newest first, total = --limit    | VERIFIED   | `allResults.sort((a,b) => new Date(b.date) - new Date(a.date))`, then `slice(0, limit)` |

**Score:** 18/18 truths verified

### Required Artifacts

#### Plan 01 Artifacts

| Artifact                              | Expected                                        | Status    | Details                                                  |
|---------------------------------------|-------------------------------------------------|-----------|----------------------------------------------------------|
| `src/commands/chat/topics.ts`         | chatTopicsAction handler                        | VERIFIED  | 83 lines, full implementation, exports `chatTopicsAction` |
| `src/lib/types.ts`                    | TopicItem interface and TopicListOptions        | VERIFIED  | `interface TopicItem` at line 225 with `messageCount` field |
| `src/lib/serialize.ts`                | serializeTopic function                         | VERIFIED  | `serializeTopic` at line 284, maps all required fields |
| `src/lib/format.ts`                   | formatTopics formatter and formatData dispatch  | VERIFIED  | `formatTopics` at line 221, dispatch at line 317 |
| `src/commands/chat/index.ts`          | topics subcommand registration                  | VERIFIED  | `.command('topics')` at line 76 with `chatTopicsAction` |
| `tests/unit/chat-topics.test.ts`      | Unit tests covering all behaviors               | VERIFIED  | 424 lines, 15 tests (10 serialization/format + 5 handler) |

#### Plan 02 Artifacts

| Artifact                       | Expected                                                     | Status    | Details                                                         |
|--------------------------------|--------------------------------------------------------------|-----------|-----------------------------------------------------------------|
| `src/lib/fields.ts`            | pickFields, applyFieldSelection, extractListItems            | VERIFIED  | 107 lines, all three functions exported and substantive |
| `src/lib/output.ts`            | JSONL mode and field filtering in outputSuccess              | VERIFIED  | `setJsonlMode`, `setFieldSelection` exported; JSONL path at line 57 |
| `src/lib/types.ts`             | GlobalOptions with fields and jsonl properties               | VERIFIED  | `fields?: string` and `jsonl?: boolean` at lines 11-12 |
| `src/bin/tg.ts`                | --fields and --jsonl global options with preAction validation | VERIFIED  | Options at lines 50-51; preAction calls at lines 63-68 |
| `tests/unit/fields.test.ts`    | Unit tests for pickFields, applyFieldSelection, extractListItems | VERIFIED | 146 lines, 23 tests, all passing |
| `tests/unit/output.test.ts`    | Extended tests for JSONL mode and field selection            | VERIFIED  | 411 lines, 28 tests, all passing |

#### Plan 03 Artifacts

| Artifact                            | Expected                                            | Status    | Details                                                           |
|-------------------------------------|-----------------------------------------------------|-----------|-------------------------------------------------------------------|
| `src/commands/message/history.ts`   | Topic-scoped message history via --topic flag       | VERIFIED  | `replyTo: topicId` passed when topicId set (line 67) |
| `src/commands/message/send.ts`      | Topic-scoped message sending via --topic flag       | VERIFIED  | `effectiveReplyTo` uses topicId override (line 85-90) |
| `src/commands/message/search.ts`    | Topic-scoped search and multi-chat search           | VERIFIED  | Three-way logic: single+topic, multi-chat, global; split(',') at line 87 |
| `src/commands/media/send.ts`        | Topic-scoped media sending via --topic flag         | VERIFIED  | `effectiveReplyTo` passed to `sendFile` (line 95) |
| `src/commands/message/index.ts`     | --topic option registered on history, send, search  | VERIFIED  | `.option('--topic <topicId>', 'Forum topic ID')` at lines 30, 41, 51 |
| `src/commands/media/index.ts`       | --topic option registered on media send             | VERIFIED  | `.option('--topic <topicId>', 'Forum topic ID')` at line 31 |

### Key Link Verification

#### Plan 01 Key Links

| From                              | To                          | Via                          | Status    | Details                                                  |
|-----------------------------------|-----------------------------|------------------------------|-----------|----------------------------------------------------------|
| `src/commands/chat/topics.ts`     | `Api.channels.GetForumTopics` | `client.invoke`             | WIRED     | Line 52-59: `new Api.channels.GetForumTopics({...})` |
| `src/commands/chat/topics.ts`     | `src/lib/serialize.ts`        | `import serializeTopic`     | WIRED     | Line 9: `import { serializeTopic } from '../../lib/serialize.js'` |
| `src/lib/format.ts`               | `formatTopics`                | `formatData dispatch`       | WIRED     | Lines 317-318: dispatch on `title` + `isClosed` shape |

#### Plan 02 Key Links

| From                 | To                  | Via                                       | Status    | Details                                                            |
|----------------------|---------------------|-------------------------------------------|-----------|--------------------------------------------------------------------|
| `src/lib/output.ts`  | `src/lib/fields.ts` | `import pickFields, applyFieldSelection, extractListItems` | WIRED | Line 4: full import confirmed |
| `src/bin/tg.ts`      | `src/lib/output.ts` | `setJsonlMode/setFieldSelection` in preAction hook | WIRED | Lines 67-68: both setters called in preAction |

#### Plan 03 Key Links

| From                                 | To                         | Via                                     | Status    | Details                                                     |
|--------------------------------------|----------------------------|-----------------------------------------|-----------|-------------------------------------------------------------|
| `src/commands/message/history.ts`    | `gramjs client.getMessages` | `replyTo` param for topic scoping      | WIRED     | Line 67: `params.replyTo = topicId` when topicId set |
| `src/commands/message/send.ts`       | `gramjs client.sendMessage` | `replyTo` param for topic targeting    | WIRED     | Line 90: `replyTo: effectiveReplyTo` (topicId takes precedence) |
| `src/commands/message/search.ts`     | `resolveEntity`             | loop over comma-separated chat identifiers | WIRED  | Line 87: `split(',')`, line 91/119: `resolveEntity` called per chat |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                    | Status    | Evidence                                              |
|-------------|-------------|--------------------------------------------------------------------------------|-----------|-------------------------------------------------------|
| WRITE-06    | 05-01       | User can list forum topics in a supergroup                                     | SATISFIED | `tg chat topics <chat>` fully implemented and tested |
| WRITE-07    | 05-03       | User can read messages from a specific forum topic                             | SATISFIED | `--topic` flag on `message history` passes `replyTo` |
| WRITE-08    | 05-03       | User can send messages to a specific forum topic                               | SATISFIED | `--topic` flag on `message send` and `media send` with `replyTo` override |
| READ-06     | 05-03       | User can search across multiple specific chats in one command                  | SATISFIED | Comma-separated `--chat` in `message search` with merged sorted results |
| OUT-04      | 05-02       | User can select specific output fields with `--fields id,text,date,sender`     | SATISFIED | `--fields` global option, `pickFields` with dot-notation support |
| OUT-05      | 05-02       | Commands returning lists support `--jsonl` for streaming one JSON object per line | SATISFIED | `--jsonl` global option, bare object streaming in `outputSuccess` |

No orphaned requirements — all 6 requirement IDs declared across plans are accounted for.

### Anti-Patterns Found

None detected. Scan of all 8 phase-modified source files found no TODO/FIXME/placeholder comments, no empty implementations, no stub return values in production code. The two `return null` instances in `fields.ts` are legitimate early exits for null-input guards.

### Human Verification Required

The following behaviors are best verified end-to-end but are backed by thorough unit tests:

#### 1. `tg chat topics <chat>` against a real forum supergroup

**Test:** Run `tg chat topics @some_forum_group` against a live Telegram forum supergroup.
**Expected:** JSON output with `{ ok: true, data: { topics: [...], total: N } }` where each topic has id, title, iconEmoji, creationDate, creatorId, messageCount, isClosed, isPinned.
**Why human:** Unit tests mock gramjs; real API call needed to confirm `GetForumTopics` field mapping matches live data.

#### 2. `--jsonl --fields id,text` compose in a real pipeline

**Test:** Run `tg message search --chat @some_chat --query "hello" --jsonl --fields id,text | jq .text`
**Expected:** Each line is a bare JSON object `{"id":N,"text":"..."}` and jq successfully extracts text values.
**Why human:** E2E pipeline behavior depends on stdout/stdin byte semantics that unit mocks cannot fully replicate.

#### 3. `tg chat topics <non-forum-chat>` returns correct error

**Test:** Run `tg chat topics @some_regular_group` (a non-forum group).
**Expected:** `{ ok: false, error: { message: "Chat is not a forum-enabled supergroup", code: "NOT_A_FORUM" } }`
**Why human:** The `entity.forum === undefined` case (API-level rejection) is not covered by unit tests since it "proceeds to let the API call fail naturally" per the forum guard decision.

### Test Suite Results

All 379 tests pass. TypeScript compiles cleanly with zero errors.

```
Test Files  29 passed (29)
     Tests  379 passed (379)
```

Phase-specific test breakdown:
- `tests/unit/chat-topics.test.ts` — 15 tests (serialization, format, handler)
- `tests/unit/fields.test.ts` — 23 tests (pickFields, applyFieldSelection, extractListItems)
- `tests/unit/output.test.ts` — 28 tests (JSONL, field selection, mutual exclusion)
- `tests/unit/message-history.test.ts` — 11 tests (includes topic replyTo, NOT_A_FORUM, invalid ID)
- `tests/unit/message-send.test.ts` — 11 tests (includes topic override, forum guard)
- `tests/unit/message-search.test.ts` — 19 tests (includes multi-chat merge, truncation, failure handling, topic scoping)

---

_Verified: 2026-03-12T11:10:59Z_
_Verifier: Claude (gsd-verifier)_
