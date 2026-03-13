# Phase 8: User Profiles & Block/Unblock - Research

**Researched:** 2026-03-13
**Domain:** gramjs user management APIs, Telegram MTProto user/blocking layer
**Confidence:** HIGH

## Summary

Phase 8 adds a new `user` command group with four subcommands: `profile` (single or batch user lookup), `block`, `unblock`, and `blocked` (list blocked users). The gramjs library provides all needed APIs directly: `users.GetFullUser` for detailed profiles, `contacts.Block`/`contacts.Unblock` for blocking, and `contacts.GetBlocked` for the blocked list. These are all standard MTProto methods that gramjs exposes cleanly through `client.invoke()`.

The codebase has well-established patterns from Phases 6-7 that transfer directly: comma-separated input parsing from `message get`, key-value formatting from `formatChatInfo`, member formatting from `formatMembers`, and `translateTelegramError` for error handling. The main new complexity is mapping gramjs user status objects to the unified `lastSeen` string and detecting privacy-restricted fields to distinguish "not set" (null) from "restricted" (`[restricted]`).

**Primary recommendation:** Follow the existing command group pattern (as in `message/` and `chat/`), reuse `resolveEntity` for user resolution, and use `client.invoke(new Api.users.GetFullUser(...))` for profile data. Photo count comes from `photos.GetUserPhotos` (with limit=0 to get count only from the `PhotosSlice.count` field or array length from `Photos`). Block/unblock are simple invoke calls returning Bool.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Extended field set: id, firstName, lastName, username, phone, bio, photoCount, lastSeen, isBot, blocked, commonChatsCount, premium, verified, mutualContact, langCode
- When isBot is true, include bot-specific fields: botInlinePlaceholder, supportsInline
- Privacy-restricted fields use labeled indicator: `"bio": "[restricted]"` in JSON, `Bio [restricted]` in human output
- Multi-user support: `tg user profile @alice,@bob` with comma-separated usernames/IDs
- Always returns `{ profiles: [...], notFound: [...] }` wrapper regardless of 1 or N users
- Partial success: ok: true if any profiles resolve, notFound array lists failed inputs
- Unified string field `lastSeen`: ISO timestamp, approximate string, "online", or null
- Human-readable: "online" in green, approximate statuses in dim, exact timestamps in plain
- Single user only for block/unblock: `tg user block <user>`, `tg user unblock <user>`
- Response includes user details: `{ userId, username, firstName, action: "blocked"|"unblocked" }`
- Idempotent: blocking already-blocked user returns success silently
- Error translations: PEER_ID_INVALID, USER_BOT_INVALID, INPUT_USER_DEACTIVATED
- `tg user blocked` with --limit (default 50) / --offset (default 0) pagination
- Returns `{ users: [...], total: N }` with user summary per entry: id, firstName, lastName, username, isBot
- Human-readable blocked list: reuse formatMembers pattern
- Empty state: `{ users: [], total: 0 }`, human output "No blocked users."

### Claude's Discretion
- gramjs API call strategy (GetFullUser, contacts.Block, contacts.Unblock, contacts.GetBlocked)
- Exact privacy detection logic (how gramjs represents restricted fields)
- Human-readable profile format layout and field ordering
- Additional Telegram error codes discovered during implementation
- How to batch GetFullUser calls efficiently (sequential vs concurrent)

### Deferred Ideas (OUT OF SCOPE)
- Profile photo download -- use existing media download infrastructure (ADV-07 in v2)
- Batch block/unblock -- if needed, add comma-separated user support later
- User search (beyond contacts) -- separate capability
- Common chats list command -- could extend profile with --common-chats flag
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| USER-01 | User can get a detailed profile for any user (`tg user profile <user>`) showing bio, photos count, last seen, common chats, blocked status, and privacy-restricted field indicators | `users.GetFullUser` returns UserFull with about, commonChatsCount, blocked; User entity has status, premium, verified, mutualContact, langCode, botInlinePlaceholder; `photos.GetUserPhotos` for photo count; privacy detection via field presence |
| USER-02 | User can block a user (`tg user block <user>`) | `contacts.Block` with `{ id: entity }` returns Bool; idempotent by Telegram API design |
| USER-03 | User can unblock a user (`tg user unblock <user>`) | `contacts.Unblock` with `{ id: entity }` returns Bool; idempotent by Telegram API design |
| USER-04 | User can list blocked users (`tg user blocked`) with pagination | `contacts.GetBlocked` with `{ offset, limit }` returns `Blocked` or `BlockedSlice` (with count); users array contains full User objects |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| telegram (gramjs) | ^2.26.22 | MTProto API calls: GetFullUser, Block, Unblock, GetBlocked, GetUserPhotos | Already in use, provides all needed APIs |
| commander | ^14.0.3 | CLI command group registration and argument parsing | Already in use for all command groups |
| picocolors | ^1.1.1 | Terminal coloring for human-readable output | Already in use for all formatters |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | ^3.2.4 | Unit tests with mock infrastructure | All command action tests |

### Alternatives Considered
None -- all libraries are already in use. No new dependencies needed.

**Installation:**
No new packages required. All dependencies already present.

## Architecture Patterns

### Recommended Project Structure
```
src/
  commands/
    user/
      index.ts          # createUserCommand() - registers profile, block, unblock, blocked
      profile.ts         # userProfileAction - GetFullUser + photos count
      block.ts           # userBlockAction - contacts.Block
      unblock.ts         # userUnblockAction - contacts.Unblock
      blocked.ts         # userBlockedAction - contacts.GetBlocked
  lib/
    types.ts             # Add UserProfile, BlockResult, BlockedListResult types
    format.ts            # Add formatUserProfile, formatBlockedList; update formatData
    errors.ts            # Extend TELEGRAM_ERROR_MAP
    fields.ts            # Add 'profiles' and 'users' to LIST_KEYS for JSONL/field selection
tests/
  unit/
    user-profile.test.ts
    user-block.test.ts
    user-unblock.test.ts
    user-blocked.test.ts
    format.test.ts       # Extend with formatUserProfile, formatBlockedList tests
```

### Pattern 1: Command Group Registration
**What:** New `user` command group following exact pattern of `message/` and `chat/`
**When to use:** Always -- this is the established pattern for all command groups
**Example:**
```typescript
// src/commands/user/index.ts
import { Command } from 'commander';
import { userProfileAction } from './profile.js';
import { userBlockAction } from './block.js';
import { userUnblockAction } from './unblock.js';
import { userBlockedAction } from './blocked.js';

export function createUserCommand(): Command {
  const user = new Command('user')
    .description('User profiles and block management');

  user
    .command('profile')
    .argument('<users>', 'User ID(s) or username(s), comma-separated')
    .description('Get detailed user profile(s)')
    .action(userProfileAction);

  user
    .command('block')
    .argument('<user>', 'User ID or username')
    .description('Block a user')
    .action(userBlockAction);

  user
    .command('unblock')
    .argument('<user>', 'User ID or username')
    .description('Unblock a user')
    .action(userUnblockAction);

  user
    .command('blocked')
    .description('List blocked users')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(userBlockedAction);

  return user;
}
```

### Pattern 2: gramjs GetFullUser API Call
**What:** Fetch detailed user info using MTProto `users.GetFullUser`
**When to use:** For `tg user profile` command
**Example:**
```typescript
// Source: gramjs type definitions (node_modules/telegram/tl/api.d.ts line 22788)
// users.GetFullUser returns users.UserFull which contains:
//   fullUser: UserFull (bio=about, blocked, commonChatsCount, botInfo)
//   users: User[] (firstName, lastName, username, phone, status, premium, verified, mutualContact, langCode, bot, botInlinePlaceholder)

const result = await client.invoke(
  new Api.users.GetFullUser({ id: entity })
);
const fullUser = result.fullUser as any;  // UserFull
const user = result.users[0] as Api.User;  // The resolved User object

// Access fields:
const bio = fullUser.about ?? null;  // string | null (null = not set)
const blocked = !!fullUser.blocked;
const commonChatsCount = fullUser.commonChatsCount ?? 0;
const botInfo = fullUser.botInfo;  // BotInfo | undefined
```

### Pattern 3: User Status to lastSeen String Mapping
**What:** Convert gramjs TypeUserStatus to unified lastSeen string
**When to use:** Profile serialization
**Example:**
```typescript
// Source: gramjs type definitions (node_modules/telegram/tl/api.d.ts lines 919-980)
// TypeUserStatus = UserStatusEmpty | UserStatusOnline | UserStatusOffline
//                | UserStatusRecently | UserStatusLastWeek | UserStatusLastMonth
function mapUserStatus(status: any): string | null {
  if (!status) return null;
  const className = status.className;
  switch (className) {
    case 'UserStatusOnline':
      return 'online';
    case 'UserStatusOffline':
      // wasOnline is Unix timestamp
      return new Date(status.wasOnline * 1000).toISOString();
    case 'UserStatusRecently':
      return 'recently';
    case 'UserStatusLastWeek':
      return 'within_week';
    case 'UserStatusLastMonth':
      return 'within_month';
    case 'UserStatusEmpty':
      return 'long_time_ago';
    default:
      return null;
  }
}
```

### Pattern 4: Privacy Detection for Bio
**What:** Distinguish "no bio set" from "bio hidden by privacy"
**When to use:** Profile serialization of the `about` field
**Key insight:** gramjs/MTProto returns `UserFull.about` as:
- `undefined`/absent when user has no bio set -- map to `null`
- A string value when bio is visible -- map to the string
- Privacy-restricted bio is NOT returned differently at the UserFull level. However, when a user restricts who can see their bio, GetFullUser still returns the `about` field but it may be empty string or `undefined`. The critical privacy indicators come from:
  - `UserFull.readDatesPrivate` -- indicates if last-read dates are hidden
  - `User.status` with `byMe?: boolean` flag on UserStatusRecently/LastWeek/LastMonth -- indicates if the approximate status is privacy-approximated vs actually that recent

**Practical approach:** Since Telegram does not provide a distinct "bio is restricted" flag, treat `about === undefined || about === null` as `null` (no bio set). The bio field is either visible or not returned. For status fields, the `byMe` flag on approximate statuses indicates the real precision was hidden. For other fields like phone, check `User.phone` -- it's only populated if the viewing user has the target in contacts or the target allows phone visibility.

**Recommended approach for `[restricted]`:**
- `phone`: If `user.phone` is undefined/null and user is NOT a bot, mark as `[restricted]` (phone is always present for contacts, missing means privacy-restricted)
- `bio`: If `fullUser.about` is undefined, set to `null` (genuinely not set). There is no way to distinguish "not set" from "hidden" at the API level -- both return no value.
- `lastSeen`: Status classes UserStatusRecently/LastWeek/LastMonth are themselves privacy approximations -- these ARE the restricted indicator. UserStatusEmpty with no other info = "long_time_ago" (restricted or genuinely unknown).

### Pattern 5: Photo Count via GetUserPhotos
**What:** Get profile photo count without downloading photos
**When to use:** Profile command to populate `photoCount`
**Example:**
```typescript
// Source: gramjs type definitions (node_modules/telegram/tl/api.d.ts lines 18712-18738)
// photos.GetUserPhotos returns Photos (all) or PhotosSlice (paginated with count)
const photosResult = await client.invoke(
  new Api.photos.GetUserPhotos({
    userId: entity,
    offset: 0,
    maxId: BigInt(0),
    limit: 1,  // We only need count, not actual photos
  })
);
// PhotosSlice has .count, Photos has .photos.length
const photoCount = (photosResult as any).count ?? (photosResult as any).photos?.length ?? 0;
```

### Pattern 6: Blocked List with Two Response Types
**What:** `contacts.GetBlocked` returns either `Blocked` (all fit) or `BlockedSlice` (paginated)
**When to use:** `tg user blocked` command
**Example:**
```typescript
// Source: gramjs type definitions (node_modules/telegram/tl/api.d.ts lines 17278-17307)
// contacts.Blocked: { blocked: PeerBlocked[], chats: Chat[], users: User[] }
// contacts.BlockedSlice: { count: int, blocked: PeerBlocked[], chats: Chat[], users: User[] }
const result = await client.invoke(
  new Api.contacts.GetBlocked({ offset: 0, limit: 50 })
);
const total = (result as any).count ?? (result as any).blocked?.length ?? 0;
const users = (result as any).users ?? [];
// Build a map of user objects from the users array for serialization
```

### Pattern 7: Comma-Separated Input with Partial Success
**What:** Multi-user profile lookup mirroring `message get` pattern
**When to use:** `tg user profile @alice,@bob,12345`
**Key details:**
- Parse comma-separated inputs
- Resolve each independently via `resolveEntity`
- For each resolved user, call `GetFullUser`
- Collect successes in `profiles[]`, failures in `notFound[]`
- Always return `{ profiles, notFound }` wrapper
- `ok: true` envelope as long as at least one profile resolved

**Batching strategy (Claude's discretion):** Use `Promise.allSettled` for concurrent resolution. GetFullUser is per-user (no batch API), but concurrent calls are safe and faster. Limit concurrency to avoid FloodWait -- use sequential calls for safety (gramjs handles FloodWait internally with `floodSleepThreshold: 60`). Recommend sequential for simplicity since typical batch size is small (< 10 users).

### Anti-Patterns to Avoid
- **Don't use `client.getEntity()` for profile data:** It only returns the basic User object without bio, blocked status, common chats count. Must use `users.GetFullUser` for the full profile.
- **Don't assume `user.phone` presence means non-restricted:** Phone is only populated when the viewer has the target in their contacts or privacy settings allow it.
- **Don't create a separate "user resolver":** Reuse `resolveEntity` from `peer.ts` which already handles all input formats (username, @username, numeric ID, phone).
- **Don't forget to add `'profiles'` and `'users'` to `LIST_KEYS` in `fields.ts`:** Without this, `--fields` and `--jsonl` won't work for user commands.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User input resolution | Custom username/ID parser | `resolveEntity()` from peer.ts | Already handles all formats, error handling included |
| User status mapping | Custom status string builder | Centralized `mapUserStatus()` helper | 6 status types with date conversion and privacy flags |
| Error translation | Per-command error mapping | Extend `TELEGRAM_ERROR_MAP` in errors.ts | Consistent error messages across all commands |
| Member-style formatting | New formatter for blocked list | `formatMembers()` from format.ts | BlockedListItem is MemberItem-compatible |
| Field selection | Custom field picker | Add to `LIST_KEYS` in fields.ts | Existing infrastructure handles --fields and --jsonl |
| Output pipeline | Custom JSON/human switching | `outputSuccess()`/`outputError()` | Handles all output modes automatically |

**Key insight:** This phase requires minimal new infrastructure. Nearly everything can be built by composing existing utilities with new gramjs API calls.

## Common Pitfalls

### Pitfall 1: GetFullUser Requires InputUser, Not Just Entity
**What goes wrong:** Passing a raw entity to `GetFullUser` may fail if it's not properly typed as `InputUser`.
**Why it happens:** gramjs `GetFullUser` expects `TypeEntityLike` for the `id` parameter. The resolved entity from `resolveEntity` returns `Api.User | Api.Chat | Api.Channel`. Passing a `Chat` or `Channel` will fail.
**How to avoid:** Validate that the resolved entity is an `Api.User` instance before calling `GetFullUser`. If not a User, return a descriptive error like "Not a user: this is a group/channel."
**Warning signs:** `PEER_ID_INVALID` error when passing a channel entity to GetFullUser.

### Pitfall 2: Photos Count for Privacy-Restricted Users
**What goes wrong:** `photos.GetUserPhotos` may return empty results or throw if the user has restricted photo visibility.
**Why it happens:** Telegram privacy settings allow users to hide profile photos from non-contacts.
**How to avoid:** Wrap the `GetUserPhotos` call in try/catch. If it throws or returns empty when user visibly has a photo (UserProfilePhoto exists on User object), the count is privacy-restricted. Fall back to checking `user.photo` existence: if UserProfilePhoto is present, at least 1 photo exists.
**Warning signs:** photoCount of 0 for users who clearly have profile photos.

### Pitfall 3: contacts.Blocked vs contacts.BlockedSlice Response Type
**What goes wrong:** Code assumes `.count` exists on all GetBlocked responses.
**Why it happens:** `contacts.Blocked` (all results fit) does NOT have a `.count` field. Only `contacts.BlockedSlice` has `.count`.
**How to avoid:** Use `(result as any).count ?? (result as any).blocked?.length ?? 0` to get total from either type. Check `result.className` to distinguish: `'contacts.Blocked'` vs `'contacts.BlockedSlice'`.
**Warning signs:** `total: undefined` in output when all blocked users fit in single page.

### Pitfall 4: BigInt IDs in User Objects
**What goes wrong:** User IDs serialize as `{}` in JSON instead of string numbers.
**Why it happens:** gramjs uses `big-integer` library for all IDs. `JSON.stringify` doesn't know how to serialize them.
**How to avoid:** Always use `bigIntToString()` from serialize.ts when extracting IDs from gramjs objects.
**Warning signs:** `"id": {}` in JSON output.

### Pitfall 5: Bot Users Have No Meaningful Status
**What goes wrong:** Checking `user.status` on a bot returns null/undefined, but code treats this as "unknown."
**Why it happens:** Bots don't have online/offline status in Telegram.
**How to avoid:** When `user.bot` is true, set `lastSeen` to `null` and skip status processing entirely. Document in output that bots don't have status.
**Warning signs:** `"lastSeen": "long_time_ago"` for bots (misleading).

### Pitfall 6: formatData Shape Detection Conflicts
**What goes wrong:** New profile data shape gets mis-detected as an existing shape in `formatData()`.
**Why it happens:** `formatData` uses duck-typing to detect shapes. If UserProfile has overlapping fields with existing types, wrong formatter fires.
**How to avoid:** Add UserProfile detection BEFORE existing checks in `formatData`, using a distinctive field combination (e.g., `'profiles' in obj && Array.isArray(obj.profiles)`). The `profiles` key is unique to this command. For blocked list, use `'users' in obj && 'total' in obj`.
**Warning signs:** Profile data formatted as generic JSON or wrong formatter applied.

## Code Examples

### Type Definitions
```typescript
// Source: Derived from CONTEXT.md decisions + gramjs API types
// Add to src/lib/types.ts

/** Detailed user profile returned by `tg user profile`. */
export interface UserProfile {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  phone: string | null | '[restricted]';
  bio: string | null;
  photoCount: number;
  lastSeen: string | null;  // ISO timestamp | 'online' | 'recently' | 'within_week' | 'within_month' | 'long_time_ago' | null
  isBot: boolean;
  blocked: boolean;
  commonChatsCount: number;
  premium: boolean;
  verified: boolean;
  mutualContact: boolean;
  langCode: string | null;
  // Bot-specific fields (only when isBot=true)
  botInlinePlaceholder?: string;
  supportsInline?: boolean;
}

/** Result of tg user profile (always array wrapper). */
export interface UserProfileResult {
  profiles: UserProfile[];
  notFound: string[];
}

/** Result of tg user block / tg user unblock. */
export interface BlockResult {
  userId: string;
  username: string | null;
  firstName: string | null;
  action: 'blocked' | 'unblocked';
}

/** Item in blocked users list. */
export interface BlockedListItem {
  id: string;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  isBot: boolean;
}

/** Result of tg user blocked. */
export interface BlockedListResult {
  users: BlockedListItem[];
  total: number;
}
```

### Block Action (follows pin/unpin pattern)
```typescript
// Source: Adapted from src/commands/message/pin.ts pattern + gramjs contacts.Block API
const entity = await resolveEntity(client, userInput);

// Validate entity is a user
if (!(entity instanceof Api.User)) {
  outputError('Not a user', 'NOT_A_USER');
  return;
}

await client.invoke(new Api.contacts.Block({ id: entity }));

const result: BlockResult = {
  userId: bigIntToString((entity as any).id),
  username: (entity as any).username ?? null,
  firstName: (entity as any).firstName ?? null,
  action: 'blocked',
};
outputSuccess(result);
```

### GetBlocked Serialization
```typescript
// Source: gramjs type definitions for contacts.GetBlocked response
const result = await client.invoke(
  new Api.contacts.GetBlocked({ offset, limit })
);

const total = (result as any).count ?? (result as any).blocked?.length ?? 0;
const userMap = new Map<string, any>();
for (const u of (result as any).users ?? []) {
  userMap.set(bigIntToString(u.id), u);
}

const users: BlockedListItem[] = [];
for (const blocked of (result as any).blocked ?? []) {
  const peerId = bigIntToString(blocked.peerId?.userId);
  const user = userMap.get(peerId);
  if (user) {
    users.push({
      id: peerId,
      firstName: user.firstName ?? null,
      lastName: user.lastName ?? null,
      username: user.username ?? null,
      isBot: !!user.bot,
    });
  }
}

outputSuccess({ users, total });
```

### Human-Readable Profile Format
```typescript
// Source: Adapted from formatChatInfo pattern in src/lib/format.ts
export function formatUserProfile(profiles: UserProfile[], notFound: string[]): string {
  const parts: string[] = [];

  for (const p of profiles) {
    const pairs: [string, string][] = [];
    const name = [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Unknown';
    pairs.push(['Name', name]);
    pairs.push(['ID', p.id]);
    if (p.username) pairs.push(['Username', `@${p.username}`]);
    // Phone: null = not shown, '[restricted]' = shown as restricted
    if (p.phone === '[restricted]') {
      pairs.push(['Phone', pc.dim('[restricted]')]);
    } else if (p.phone) {
      pairs.push(['Phone', p.phone]);
    }
    // Bio
    if (p.bio) pairs.push(['Bio', p.bio]);
    // Last seen with color coding
    if (p.lastSeen === 'online') {
      pairs.push(['Last Seen', pc.green('online')]);
    } else if (p.lastSeen && ['recently', 'within_week', 'within_month', 'long_time_ago'].includes(p.lastSeen)) {
      pairs.push(['Last Seen', pc.dim(p.lastSeen.replace(/_/g, ' '))]);
    } else if (p.lastSeen) {
      pairs.push(['Last Seen', p.lastSeen]);
    }
    pairs.push(['Photos', String(p.photoCount)]);
    pairs.push(['Common Chats', String(p.commonChatsCount)]);
    if (p.blocked) pairs.push(['Blocked', pc.red('yes')]);
    if (p.premium) pairs.push(['Premium', pc.yellow('yes')]);
    if (p.verified) pairs.push(['Verified', pc.cyan('yes')]);
    if (p.isBot) {
      pairs.push(['Bot', 'yes']);
      if (p.supportsInline) pairs.push(['Inline', 'yes']);
      if (p.botInlinePlaceholder) pairs.push(['Placeholder', p.botInlinePlaceholder]);
    }

    // Key-value formatting (same as formatChatInfo)
    const maxLabelLen = Math.max(...pairs.map(([label]) => label.length));
    parts.push(pairs.map(([label, value]) => {
      const paddedLabel = label.padEnd(maxLabelLen);
      return `${pc.bold(paddedLabel)}  ${value}`;
    }).join('\n'));
  }

  if (notFound.length > 0) {
    parts.push(pc.dim('Not found: ' + notFound.join(', ')));
  }

  return parts.join('\n\n');  // Separate profiles with blank line
}
```

### formatData Dispatch Updates
```typescript
// Add to formatData in src/lib/format.ts, BEFORE existing checks:

// Check for UserProfileResult shape (profiles[] + notFound[])
if (Array.isArray(obj.profiles) && Array.isArray(obj.notFound)) {
  return formatUserProfile(obj.profiles as UserProfile[], obj.notFound as string[]);
}

// Check for BlockedListResult shape (users[] + total number)
if (Array.isArray(obj.users) && typeof obj.total === 'number') {
  if (obj.users.length === 0) return 'No blocked users.';
  return formatMembers(obj.users as MemberItem[]);
}

// Check for BlockResult shape (userId + action blocked/unblocked)
if ('userId' in obj && 'action' in obj && (obj.action === 'blocked' || obj.action === 'unblocked')) {
  const name = obj.firstName || obj.username || obj.userId;
  return `${obj.action === 'blocked' ? 'Blocked' : 'Unblocked'} ${name}`;
}
```

### fields.ts LIST_KEYS Update
```typescript
// Update LIST_KEYS in src/lib/fields.ts to support --jsonl and --fields for user commands
const LIST_KEYS = ['messages', 'chats', 'members', 'topics', 'files', 'profiles', 'users'] as const;
```

### tg.ts Registration
```typescript
// Add to src/bin/tg.ts:
import { createUserCommand } from '../commands/user/index.js';

const userCmd = createUserCommand();
userCmd.helpGroup('User');
program.addCommand(userCmd);
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `user.status` only had Online/Offline/Empty | Added Recently/LastWeek/LastMonth with `byMe` privacy flag | MTProto Layer 160+ | Privacy-approximated statuses are now distinguishable |
| `contacts.Block` had no flags | Added `myStoriesFrom` flag for story-specific blocking | MTProto Layer 167+ | Must NOT set `myStoriesFrom` for general blocking |
| Single blocked response type | Split into `Blocked` and `BlockedSlice` | MTProto Layer 130+ | Must handle both response types |

**Current gramjs version:** ^2.26.22 (installed) -- supports all needed APIs.

## Open Questions

1. **Photo count accuracy for privacy-restricted users**
   - What we know: `photos.GetUserPhotos` returns photos visible to the caller. If user hides photos from non-contacts, the count may be 0 even if photos exist.
   - What's unclear: Whether `User.photo` (UserProfilePhoto) being present guarantees at least 1 photo is visible via GetUserPhotos.
   - Recommendation: Try GetUserPhotos first. If returns 0 but `user.photo` is present (not UserProfilePhotoEmpty), report `photoCount: 1` as minimum. This handles the most common case. Could also wrap in try/catch and report 0 on error.

2. **Bio privacy detection**
   - What we know: Telegram allows hiding bio from non-contacts. gramjs returns `about: undefined` when bio is not set OR when hidden.
   - What's unclear: Whether there's any signal to distinguish "no bio" from "bio hidden."
   - Recommendation: Since no API distinction exists, treat undefined as `null` (not set). The `[restricted]` indicator should be used for fields where we CAN detect restriction (phone, lastSeen approximate status). Do NOT mark bio as `[restricted]` since we cannot distinguish the cases. This is honest and avoids false indicators.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 3.2.4 |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/unit/user-profile.test.ts tests/unit/user-block.test.ts tests/unit/user-unblock.test.ts tests/unit/user-blocked.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| USER-01 | Profile fetches GetFullUser + photos, serializes all fields | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | No -- Wave 0 |
| USER-01 | Privacy-restricted phone shows [restricted] | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | No -- Wave 0 |
| USER-01 | Multi-user comma-separated with partial success | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | No -- Wave 0 |
| USER-01 | Bot-specific fields included when isBot | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | No -- Wave 0 |
| USER-01 | lastSeen status mapping for all 6 status types | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | No -- Wave 0 |
| USER-02 | Block calls contacts.Block, returns BlockResult | unit | `npx vitest run tests/unit/user-block.test.ts -x` | No -- Wave 0 |
| USER-02 | Block non-user entity returns error | unit | `npx vitest run tests/unit/user-block.test.ts -x` | No -- Wave 0 |
| USER-03 | Unblock calls contacts.Unblock, returns BlockResult | unit | `npx vitest run tests/unit/user-unblock.test.ts -x` | No -- Wave 0 |
| USER-04 | Blocked list returns users with total, handles Blocked vs BlockedSlice | unit | `npx vitest run tests/unit/user-blocked.test.ts -x` | No -- Wave 0 |
| USER-04 | Empty blocked list returns { users: [], total: 0 } | unit | `npx vitest run tests/unit/user-blocked.test.ts -x` | No -- Wave 0 |
| ALL | formatUserProfile produces correct human output | unit | `npx vitest run tests/unit/format.test.ts -x` | Extend existing |
| ALL | formatData dispatches to new formatters correctly | unit | `npx vitest run tests/unit/format.test.ts -x` | Extend existing |
| ALL | CLI --help shows user command group | integration | `npx vitest run tests/integration/cli-entry.test.ts -x` | Extend existing |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/user-*.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/user-profile.test.ts` -- covers USER-01
- [ ] `tests/unit/user-block.test.ts` -- covers USER-02
- [ ] `tests/unit/user-unblock.test.ts` -- covers USER-03
- [ ] `tests/unit/user-blocked.test.ts` -- covers USER-04
- [ ] Extend `tests/unit/format.test.ts` -- covers formatUserProfile, formatBlockedList, formatData dispatch
- [ ] Extend `tests/unit/output.test.ts` -- covers JSONL for profiles/users list keys
- [ ] Extend `tests/integration/cli-entry.test.ts` -- covers user --help

## Sources

### Primary (HIGH confidence)
- gramjs type definitions (`node_modules/telegram/tl/api.d.ts`) -- verified UserFull fields, User fields, contacts.Block/Unblock/GetBlocked signatures, PeerBlocked shape, UserStatus types, photos.GetUserPhotos response types
- Existing codebase (`src/commands/chat/info.ts`) -- verified GetFullUser pattern already used for chat info with channels
- Existing codebase (`src/commands/message/get.ts`) -- verified comma-separated input parsing + partial success pattern
- Existing codebase (`src/lib/format.ts`) -- verified formatChatInfo key-value pattern, formatMembers for blocked list
- Existing codebase (`src/lib/errors.ts`) -- verified TELEGRAM_ERROR_MAP extension pattern
- Existing codebase (`src/lib/serialize.ts`) -- verified bigIntToString, serializeMember patterns
- Existing codebase (`src/lib/fields.ts`) -- verified LIST_KEYS usage for JSONL and field selection

### Secondary (MEDIUM confidence)
- Telegram MTProto documentation on privacy behavior -- privacy-restricted field handling is inferred from API type structure (fields being optional)

### Tertiary (LOW confidence)
- Bio privacy detection -- cannot confirm whether `about: undefined` distinguishes "not set" from "hidden" without live testing

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- all libraries already in use, no new dependencies
- Architecture: HIGH -- follows exact patterns from existing command groups (6 command groups already implemented)
- gramjs API calls: HIGH -- type definitions verified directly from node_modules, same invoke pattern used in chat info
- Privacy handling: MEDIUM -- inferred from API type structure, confirmed UserStatus types have byMe flag
- Pitfalls: HIGH -- derived from actual codebase patterns (BigInt, formatData dispatch, Blocked vs BlockedSlice verified from types)

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable -- gramjs and Telegram API rarely break backward compatibility)
