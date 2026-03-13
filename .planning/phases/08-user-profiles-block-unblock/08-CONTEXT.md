# Phase 8: User Profiles & Block/Unblock - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

New `user` command group with four commands: detailed user profile lookup (single or batch), block a user, unblock a user, and list blocked users with pagination. No contact management (Phase 9), no profile photo download (deferred), no account self-management.

</domain>

<decisions>
## Implementation Decisions

### Profile data shape
- Extended field set: id, firstName, lastName, username, phone, bio, photoCount, lastSeen, isBot, blocked, commonChatsCount, premium, verified, mutualContact, langCode
- When isBot is true, include bot-specific fields: botInlinePlaceholder, supportsInline
- Privacy-restricted fields use labeled indicator: `"bio": "[restricted]"` in JSON, `Bio [restricted]` in human output — agents can distinguish "no bio set" (null) from "bio hidden" (`[restricted]`)
- Multi-user support: `tg user profile @alice,@bob` with comma-separated usernames/IDs
- Always returns `{ profiles: [...], notFound: [...] }` wrapper regardless of 1 or N users — consistent shape, same principle as `tg message get`
- Partial success: ok: true if any profiles resolve, notFound array lists failed inputs

### Last seen & online status
- Unified string field `lastSeen`: ISO timestamp when available ("2026-03-13T10:30:00Z"), approximate string when privacy-restricted ("recently", "within_week", "within_month", "long_time_ago"), "online" when currently online, null for bots/unknown
- Human-readable: "online" highlighted in green (pc.green), approximate statuses in dim (pc.dim), exact timestamps in plain text
- Consistent with key-value pair format from formatChatInfo

### Block/unblock commands
- Single user only: `tg user block <user>`, `tg user unblock <user>`
- Response includes user details: `{ userId, username, firstName, action: "blocked"|"unblocked" }`
- Idempotent: blocking already-blocked user returns success silently (no error, no warning)
- Error translations added to translateTelegramError map:
  - PEER_ID_INVALID -> "User not found"
  - USER_BOT_INVALID -> "Cannot block this bot"
  - INPUT_USER_DEACTIVATED -> "User account deleted"

### Blocked list command
- `tg user blocked` with --limit (default 50) / --offset (default 0) pagination — consistent with other list commands
- Returns `{ users: [...], total: N }` with user summary per entry: id, firstName, lastName, username, isBot
- Human-readable: reuse formatMembers pattern (name, username, bot tag per line)
- Empty state: `{ users: [], total: 0 }`, human output "No blocked users."

### Claude's Discretion
- gramjs API call strategy (GetFullUser, contacts.Block, contacts.Unblock, contacts.GetBlocked)
- Exact privacy detection logic (how gramjs represents restricted fields)
- Human-readable profile format layout and field ordering
- Additional Telegram error codes discovered during implementation
- How to batch GetFullUser calls efficiently (sequential vs concurrent)

</decisions>

<specifics>
## Specific Ideas

- Profile command mirrors the `tg message get` pattern: comma-separated input, `{ profiles: [], notFound: [] }` output, partial success
- Block/unblock response includes user details (userId + username + firstName) so agents don't need a separate profile call to confirm who was blocked
- Blocked list reuses MemberItem-compatible shape and formatMembers formatter — no new display patterns needed
- Bot detection enriches profile with inline placeholder and supports-inline flag, useful for agents inspecting bot capabilities

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveEntity()` (`src/lib/peer.ts`): Handles username, numeric ID, phone resolution — reuse for all user commands
- `formatChatInfo()` (`src/lib/format.ts`): Key-value pair format — adapt for profile human output
- `formatMembers()` (`src/lib/format.ts`): Name + username + bot tag — reuse directly for blocked list
- `translateTelegramError()` (`src/lib/errors.ts`): Error translation map — extend with user-specific errors
- `outputSuccess()` / `outputError()` (`src/lib/output.ts`): Standard output pipeline
- Comma-separated ID parsing pattern (`src/commands/message/get.ts`): Adapt for comma-separated user inputs

### Established Patterns
- Command group registration: `src/commands/{group}/index.ts` with subcommands (see message/, chat/)
- `optsWithGlobals()` for merging local and global options
- `withClient()` / `SessionStore` / `createConfig()`: Standard command boilerplate
- `formatData()` auto-dispatch: Add profile and blocked list shape detection
- `{ items: [], notFound: [] }` partial success pattern (from message get)
- Simple confirmation response `{ id, action }` pattern (from pin/unpin/react)

### Integration Points
- New `src/commands/user/index.ts`: Register profile, block, unblock, blocked subcommands
- `src/lib/format.ts`: Add formatUserProfile (key-value pairs) and formatBlockedList (delegates to formatMembers)
- `src/lib/format.ts` formatData(): Add UserProfile and BlockedList shape detection
- `src/lib/types.ts`: Add UserProfile, BlockResult, BlockedListItem types
- `src/lib/errors.ts`: Extend TELEGRAM_ERROR_MAP with PEER_ID_INVALID, USER_BOT_INVALID, INPUT_USER_DEACTIVATED
- `src/tg.ts`: Register `user` command group

</code_context>

<deferred>
## Deferred Ideas

- Profile photo download — use existing media download infrastructure (ADV-07 in v2)
- Batch block/unblock — if needed, add comma-separated user support later
- User search (beyond contacts) — separate capability
- Common chats list command — could extend profile with `--common-chats` flag

</deferred>

---

*Phase: 08-user-profiles-block-unblock*
*Context gathered: 2026-03-13*
