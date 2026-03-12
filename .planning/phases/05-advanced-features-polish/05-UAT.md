---
status: complete
phase: 05-advanced-features-polish
source: [05-01-SUMMARY.md, 05-02-SUMMARY.md, 05-03-SUMMARY.md]
started: 2026-03-12T14:21:00Z
updated: 2026-03-12T14:28:00Z
---

## Current Test

[testing complete]

## Tests

### 1. TypeScript Compilation
expected: Project compiles with zero errors using `tsc --noEmit`
result: pass

### 2. Full Test Suite
expected: All tests pass with no regressions (379 tests across 29 files)
result: pass

### 3. CLI: `tg chat topics` subcommand registered
expected: `tg chat --help` shows `topics` subcommand; `tg chat topics --help` shows `<chat>`, `--limit`, `--offset`
result: pass

### 4. TopicItem type definition
expected: TopicItem interface has id, title, iconEmoji, creationDate, creatorId, messageCount, isClosed, isPinned
result: pass

### 5. serializeTopic handles edge cases
expected: BigInt peer extraction, null/undefined iconEmojiId, missing fromId, channelId/chatId variants — all tested (6 tests)
result: pass

### 6. formatTopics with indicators
expected: Human-readable output includes [pinned] and [closed] indicators, empty array returns ""
result: pass

### 7. formatData topics dispatch
expected: `formatData({topics: [...], total: N})` dispatches to formatTopics, empty array returns "No topics."
result: pass

### 8. Forum guard in chatTopicsAction
expected: Non-Channel entity or Channel with forum=false rejected with NOT_A_FORUM error
result: pass

### 9. ForumTopicDeleted filtering
expected: Deleted topic items filtered by className check before serialization
result: pass

### 10. Client-side offset slicing
expected: Topics list sliced at offset index for pagination
result: pass

### 11. CLI: `--fields` global option registered
expected: `tg --help` shows `--fields <fields>` with description
result: pass

### 12. CLI: `--jsonl` global option registered
expected: `tg --help` shows `--jsonl` with description
result: pass

### 13. pickFields flat and dot-notation
expected: `pickFields({id:1, media:{filename:"a.jpg"}}, ["id","media.filename"])` returns nested structure correctly
result: pass

### 14. pickFields missing path handling
expected: Nonexistent fields, null intermediate paths, empty fields array all return empty object without crash
result: pass

### 15. applyFieldSelection metadata preservation
expected: Array items filtered but total/count metadata fields preserved alongside
result: pass

### 16. extractListItems detection
expected: Detects messages[], chats[], members[], topics[], files[] arrays; returns null for non-list data
result: pass

### 17. JSONL mode: one object per line
expected: List data outputs bare JSON objects per line without envelope; falls through for non-list data
result: pass

### 18. JSONL + fields compose
expected: `--jsonl --fields id` on list data outputs `{"id":1}\n{"id":2}\n`
result: pass

### 19. --jsonl and --human mutual exclusion
expected: preAction hook rejects with INVALID_OPTIONS error and process.exit(1)
result: pass

### 20. JSONL error handling
expected: Errors go to stderr as plain text with optional [CODE] suffix, not to stdout
result: pass

### 21. --fields ignored in human mode
expected: Human-readable output renders full data even when --fields is set
result: pass

### 22. CLI: `--topic` on message history
expected: `tg message history --help` shows `--topic <topicId>` option
result: pass

### 23. CLI: `--topic` on message send
expected: `tg message send --help` shows `--topic <topicId>` option
result: pass

### 24. CLI: `--topic` on message search
expected: `tg message search --help` shows `--topic <topicId>` option
result: pass

### 25. CLI: `--topic` on media send
expected: `tg media send --help` shows `--topic <topicId>` option
result: pass

### 26. --topic passes replyTo to history getMessages
expected: topicId parsed as integer and passed as replyTo parameter after assertForum guard
result: pass

### 27. --topic overrides --reply-to on send
expected: When both --topic and --reply-to provided, topicId takes precedence as effectiveReplyTo
result: pass

### 28. assertForum centralized in peer.ts
expected: assertForum function exported from peer.ts, imported by history, send, search, media send
result: pass

### 29. Multi-chat search via comma-separated --chat
expected: `--chat @a,@b` splits values, resolves each entity, searches sequentially, merges results
result: pass

### 30. Multi-chat results sorted and truncated
expected: Results sorted newest-first by date, truncated to --limit total
result: pass

### 31. Per-chat error isolation
expected: Failed chat logs warning to stderr via logStatus, remaining chats proceed normally
result: pass

### 32. --topic + multi-chat rejected
expected: Combining --topic with comma-separated --chat returns INVALID_OPTIONS error
result: pass

### 33. Invalid topic ID validation
expected: Non-numeric --topic value returns INVALID_TOPIC_ID error without API call
result: pass

## Summary

total: 33
passed: 33
issues: 0
pending: 0
skipped: 0

## Gaps

[none]
