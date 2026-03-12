---
status: diagnosed
trigger: "In global message search results, DM chats show chatTitle: '777000' (the user ID) instead of the contact's display name"
created: 2026-03-11T00:00:00Z
updated: 2026-03-11T00:00:00Z
---

## Current Focus

hypothesis: CONFIRMED - msg.chat?.title is undefined for User entities (DMs), causing fallback to chatId string
test: Code reading and gramjs type analysis
expecting: User entities have firstName/lastName but no title property
next_action: Report diagnosis

## Symptoms

expected: DM search results show contact display name (e.g., "Telegram") as chatTitle
actual: DM search results show numeric user ID (e.g., "777000") as chatTitle
errors: None (logic bug, not runtime error)
reproduction: Run global message search that returns DM results
started: Since initial implementation

## Eliminated

(none needed - hypothesis confirmed on first pass)

## Evidence

- timestamp: 2026-03-11T00:01:00Z
  checked: src/commands/message/search.ts lines 82-83
  found: chatTitle is computed as `msg.chat?.title || (msg as any)._chat?.title || chatId`
  implication: Only checks `.title` property, never checks `.firstName`/`.lastName`

- timestamp: 2026-03-11T00:02:00Z
  checked: gramjs Api.User type definition (node_modules/telegram/tl/api.d.ts)
  found: Api.User has `firstName?: string` and `lastName?: string` but NOT `title`. Api.Chat and Api.Channel have `title`.
  implication: For DM messages, msg.chat is an Api.User instance, which has no `.title` property, so it's undefined.

- timestamp: 2026-03-11T00:03:00Z
  checked: gramjs chatGetter.js (ChatGetter class)
  found: `get chat()` returns `this._chat`, which is populated via `_getEntityPair(this.chatId.toString(), entities, cache)`. For DMs, this resolves to an Api.User entity.
  implication: msg.chat for DM messages IS a User object, confirming .title is undefined.

- timestamp: 2026-03-11T00:04:00Z
  checked: src/lib/serialize.ts senderName() function (line 94-100)
  found: Already has correct logic: `entity.firstName ?? entity.title ?? ''` with lastName handling
  implication: A helper that handles both User and Chat/Channel entities already exists in the codebase.

- timestamp: 2026-03-11T00:05:00Z
  checked: src/lib/serialize.ts serializeDialog() function (line 43-51)
  found: Uses `dialog.title ?? dialog.name ?? ''` - gramjs Dialog wraps entity and provides unified .title/.name
  implication: Dialog objects abstract away the User vs Chat difference, but raw Message.chat does not.

## Resolution

root_cause: |
  In src/commands/message/search.ts line 82-83, the chatTitle for global search results is computed as:
    `msg.chat?.title || (msg as any)._chat?.title || chatId`

  For DM (user-to-user) chats, `msg.chat` is an `Api.User` instance. The `Api.User` type has
  `firstName` and `lastName` properties but does NOT have a `title` property. The `title` property
  only exists on `Api.Chat` and `Api.Channel` types (groups and channels).

  Since `msg.chat.title` is `undefined` for User entities, the expression falls through to the
  `chatId` fallback, which is the raw numeric user ID (e.g., "777000").

fix: (not applied - diagnosis only)
verification: (not applied - diagnosis only)
files_changed: []
