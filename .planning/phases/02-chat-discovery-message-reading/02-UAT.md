---
status: complete
phase: 02-chat-discovery-message-reading
source: [02-01-SUMMARY.md, 02-02-SUMMARY.md, 02-03-SUMMARY.md]
started: 2026-03-11T13:00:00Z
updated: 2026-03-11T22:10:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Chat List
expected: Running `npx tg chat list` shows your Telegram dialogs as JSON output. Each entry includes id, title, type (user/group/channel/supergroup), and unreadCount.
result: issue
reported: "Returns chats:[] with total:83. ignoreMigrated:true in getDialogs causes gramjs to return empty array despite 83 dialogs existing. Without the flag, all 83 are returned correctly."
severity: blocker

### 2. Chat List Type Filter
expected: Running `npx tg chat list --type channel` shows only channels. Running with `--type group` shows only groups. The type filter restricts output to matching dialog types.
result: issue
reported: "Same empty result as Test 1 — nothing to filter because ignoreMigrated bug returns zero dialogs. Filter logic itself is correct but untestable due to empty input."
severity: blocker

### 3. Chat List Pagination
expected: Running `npx tg chat list --limit 3` returns at most 3 results. Running `npx tg chat list --limit 3 --offset 3` returns the next 3 results (different from first batch).
result: issue
reported: "Same root cause as Test 1 — zero dialogs returned, pagination cannot be verified. Pagination logic (slice offset, offset+limit) is correct in code."
severity: blocker

### 4. Chat Info
expected: Running `npx tg chat info <username-or-id>` shows detailed info: id, title, type, about/bio, member count, photo URL, or similar detail fields.
result: pass

### 5. Chat Resolve
expected: Running `npx tg chat resolve <username>` returns the resolved peer info with id and type. Also works with numeric ID or @username format.
result: pass

### 6. Chat Members
expected: Running `npx tg chat members <group-or-channel>` lists members with user id, name, and status/role. Supports `--limit` for pagination.
result: pass

### 7. Chat Invite Info
expected: Running `npx tg chat invite-info <invite-link>` shows preview info: chat title, member count, whether you're already a member.
result: skipped
reason: No valid unexpired invite link available. Error handling verified for expired (INVITE_HASH_EXPIRED) and invalid links (INVALID_INVITE).

### 8. Message History
expected: Running `npx tg message history <chat>` shows recent messages with id, date, senderId, and text with Markdown formatting preserved.
result: pass

### 9. Message History Date Filter
expected: Running `npx tg message history <chat> --until 2026-03-01` returns only messages before March 1st. Running with `--since 2026-03-10` returns only messages from March 10th onward.
result: pass

### 10. Message Search Per-Chat
expected: Running `npx tg message search --chat <chat> -q "keyword"` searches for messages containing that keyword within the specified chat.
result: issue
reported: "-q shorthand fails with 'required option -q, --query not specified' because -q conflicts with global --quiet flag. Using --query works correctly."
severity: major

### 11. Message Search Global
expected: Running `npx tg message search -q "keyword"` searches across ALL chats. Each result includes chatId and chatTitle.
result: issue
reported: "Same -q shorthand conflict as Test 10. With --query flag, global search works. Minor: chatTitle falls back to chatId string for DM chats instead of resolved contact name."
severity: major

### 12. CLI Help
expected: Running `npx tg --help` shows all 4 command groups: Auth, Session, Chat, Message. `npx tg chat --help` shows 7 subcommands. `npx tg message --help` shows 2 subcommands.
result: pass

## Summary

total: 12
passed: 5
issues: 5
pending: 0
skipped: 2

## Gaps

- truth: "Chat list returns dialogs with id, title, type, unreadCount"
  status: failed
  reason: "ignoreMigrated:true in chatListAction causes gramjs getDialogs to return empty array. Without flag, all 83 dialogs return correctly."
  severity: blocker
  test: 1
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Chat list type filter restricts output to matching dialog types"
  status: failed
  reason: "Same root cause as gap 1 — ignoreMigrated empties input before filter runs"
  severity: blocker
  test: 2
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Chat list pagination returns subset via --limit and --offset"
  status: failed
  reason: "Same root cause as gap 1 — zero dialogs means pagination has nothing to paginate"
  severity: blocker
  test: 3
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Message search -q shorthand works for specifying search query"
  status: failed
  reason: "-q conflicts with global --quiet flag. Commander resolves -q to --quiet, leaving --query unspecified. --query long form works correctly."
  severity: major
  test: 10
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""

- truth: "Global message search chatTitle shows resolved chat name for all chat types"
  status: failed
  reason: "chatTitle falls back to chatId string for DM chats where msg.chat?.title is undefined, instead of resolving to contact name"
  severity: minor
  test: 11
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
