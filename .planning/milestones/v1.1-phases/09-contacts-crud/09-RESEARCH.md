# Phase 9: Contacts CRUD - Research

**Researched:** 2026-03-13
**Domain:** Telegram Contacts API (gramjs), CLI command patterns
**Confidence:** HIGH

## Summary

Phase 9 implements a `contact` command group with four subcommands: list, add, delete, and search. The gramjs library provides all necessary API methods (`contacts.GetContacts`, `contacts.AddContact`, `contacts.ImportContacts`, `contacts.DeleteContacts`, `contacts.Search`) with well-defined TypeScript types already in the project's `node_modules/telegram/tl/api.d.ts`.

The existing codebase from Phase 8 (user profiles, block/unblock) provides a near-identical pattern to follow: command group registration in `src/commands/contact/index.ts`, action handlers per subcommand, types in `src/lib/types.ts`, formatters in `src/lib/format.ts`, and error translations in `src/lib/errors.ts`. The `UserProfile` type already contains all fields needed for `ContactItem` -- the CONTEXT.md decision to extend UserProfile directly is well-supported by the codebase.

The main technical nuance is the `contacts.Search` API: it returns `contacts.Found` with two peer arrays -- `myResults` (contacts matching the query) and `results` (global/non-contact matches), plus separate `users` and `chats` arrays that must be cross-referenced by ID to hydrate results. The add command has dual routing: username/ID-based input uses `contacts.AddContact` (requires resolving the user first), while phone-based input uses `contacts.ImportContacts` with `InputPhoneContact`.

**Primary recommendation:** Follow Phase 8's block/unblock pattern exactly. ContactItem IS UserProfile (no new type needed -- just use UserProfile with an optional `isContact` field for search results). Use the same withClient/SessionStore/outputSuccess pipeline, same test mock structure, same formatData dispatch extension.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Rich profile per contact: id, firstName, lastName, username, phone, status, bio, photoCount, lastSeen, premium, verified, isBot, mutualContact, langCode
- ContactItem extends UserProfile from Phase 8 -- same type, phone already present, no duplication
- Always fetch full profiles (GetFullUser per contact) even on list -- user accepts the N+1 cost for rich data
- For global search results, add `isContact: boolean` flag to indicate whether the user is already a contact
- List envelope: `{ contacts: ContactItem[], total: N }` consistent with blocked list shape
- Auto-detect routing: input starting with `+` or all digits -> importContacts (phone), otherwise -> addContact (username/ID)
- Phone-based add requires `--first-name` flag (mandatory), optional `--last-name`
- Username/ID-based add needs no name flags (Telegram resolves the user)
- Returns full ContactItem profile on success (not just action confirmation)
- Idempotent: adding an existing contact returns success silently with the contact profile
- Default: search your contacts only (contacts.Search API)
- `--global` flag: search all Telegram users (broader contacts.Search scope)
- Same ContactItem shape for all results, plus `isContact: boolean` on global results
- Default --limit 20 for global search, contact-only search returns all matches
- Envelope: `{ results: ContactItem[], total: N }`
- List supports `--limit` (default 50) / `--offset` (default 0)
- Contacts sorted alphabetically by firstName + lastName
- Delete is single user only: `tg contact delete <user>` -- no batch
- Delete response: `{ userId, username, firstName, action: "deleted" }`
- Idempotent: deleting a non-contact returns success silently

### Claude's Discretion
- gramjs API call strategy for contacts.GetContacts, contacts.Search, addContact, importContacts, contacts.DeleteContacts
- GetFullUser batching/concurrency strategy for list enrichment
- Human-readable format layout for contact list and search results
- Error code translations specific to contact operations
- How to handle contacts.Search with --global (API parameter differences)

### Deferred Ideas (OUT OF SCOPE)
- Contact bulk import by phone number -- ADV-08 in v2 requirements
- Contact sync / auto-update -- different capability
- Batch delete contacts -- could add later if agents need it
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| CONT-01 | User can list all contacts (`tg contact list`) with phone, username, status | contacts.GetContacts API returns Contact[] + User[], then GetFullUser per user for enrichment. Pagination via --limit/--offset on the serialized array (client-side). |
| CONT-02 | User can add a contact by username/ID or phone number (`tg contact add`) with dual API routing | contacts.AddContact (username/ID path) and contacts.ImportContacts with InputPhoneContact (phone path). Auto-detect via `+`/all-digits regex. |
| CONT-03 | User can delete a contact (`tg contact delete <user>`) | contacts.DeleteContacts accepts id: TypeEntityLike[] (pass single-element array). Returns Updates. |
| CONT-04 | User can search contacts by name (`tg contact search <query>`) | contacts.Search returns Found with myResults (contacts) and results (global). Use myResults for default, both for --global. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gramjs (telegram) | In project | MTProto API calls for contacts | Already used for all Telegram operations |
| commander | ^14.0.3 | CLI command group and option parsing | Already the project's CLI framework |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| picocolors | In project | Terminal coloring for human output | formatContactList, formatContactSearch |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| GetFullUser per contact (N+1) | Use basic User data from GetContacts | User explicitly chose rich data, accepts perf cost |
| Custom ContactItem type | Reuse UserProfile directly | UserProfile already has all needed fields |

**Installation:**
No new dependencies needed. All required packages are already in the project.

## Architecture Patterns

### Recommended Project Structure
```
src/commands/contact/
  index.ts       # createContactCommand() -- register list, add, delete, search
  list.ts        # contactListAction
  add.ts         # contactAddAction (dual routing)
  delete.ts      # contactDeleteAction
  search.ts      # contactSearchAction
src/lib/
  types.ts       # ContactListResult, ContactSearchResult, ContactDeleteResult (+ isContact on UserProfile)
  format.ts      # formatContactList, formatContactSearch, extend formatData dispatch
  errors.ts      # Extend TELEGRAM_ERROR_MAP with contact-specific errors
src/bin/
  tg.ts          # Register contact command group
tests/unit/
  contact-list.test.ts
  contact-add.test.ts
  contact-delete.test.ts
  contact-search.test.ts
```

### Pattern 1: Command Action Handler (established in Phase 8)
**What:** Each subcommand has its own file with an exported action function bound to `this: Command`.
**When to use:** Every contact subcommand.
**Example:**
```typescript
// Source: src/commands/user/block.ts (established pattern)
export async function contactDeleteAction(this: Command, userInput: string): Promise<void> {
  const opts = this.optsWithGlobals() as GlobalOptions;
  const { profile } = opts;
  const config = createConfig(opts.config);
  const store = new SessionStore(config.path.replace(/[/\\][^/\\]+$/, ''));

  try {
    await store.withLock(profile, async (sessionString) => {
      if (!sessionString) {
        outputError('Not logged in. Run: tg auth login', 'NOT_AUTHENTICATED');
        return;
      }
      const { apiId, apiHash } = getCredentialsOrThrow(config);
      await withClient({ apiId, apiHash, sessionString }, async (client) => {
        // ... API calls ...
        outputSuccess(result);
      });
    });
  } catch (err: unknown) {
    const { message, code } = translateTelegramError(err);
    outputError(message, code);
  }
}
```

### Pattern 2: contacts.GetContacts Response Processing
**What:** GetContacts returns `contacts.Contacts` with separate `contacts[]` (userId + mutual) and `users[]` arrays. Must build a userMap to cross-reference.
**When to use:** List command.
**Example:**
```typescript
// Source: gramjs api.d.ts types + blocked list pattern from src/commands/user/blocked.ts
const result = await client.invoke(
  new Api.contacts.GetContacts({ hash: BigInt(0) })
);

// Handle ContactsNotModified (unlikely with hash=0, but handle)
if (result.className === 'contacts.ContactsNotModified') {
  outputSuccess({ contacts: [], total: 0 });
  return;
}

// Build userMap from result.users keyed by stringified user ID
const userMap = new Map<string, any>();
for (const user of result.users ?? []) {
  userMap.set(bigIntToString(user.id), user);
}

// Iterate result.contacts to get userId list, then enrich with GetFullUser
for (const contact of result.contacts ?? []) {
  const userId = bigIntToString(contact.userId);
  const user = userMap.get(userId);
  // ... enrich with GetFullUser, build UserProfile ...
}
```

### Pattern 3: contacts.Search Response Processing
**What:** Search returns `contacts.Found` with `myResults[]` (Peer objects for your contacts) and `results[]` (Peer objects for global matches), plus `users[]` and `chats[]` arrays for hydration.
**When to use:** Search command, especially --global flag.
**Example:**
```typescript
// Source: gramjs api.d.ts - contacts.Found structure
const found = await client.invoke(
  new Api.contacts.Search({ q: query, limit })
);

// Build user lookup from found.users
const userMap = new Map<string, any>();
for (const u of found.users ?? []) {
  userMap.set(bigIntToString(u.id), u);
}

// myResults = contacts matching query
const myContactIds = new Set<string>();
for (const peer of found.myResults ?? []) {
  const id = bigIntToString((peer as any).userId);
  myContactIds.add(id);
}

// For default (contacts-only): use myResults peers
// For --global: use both myResults + results peers
// Mark isContact based on myContactIds membership
```

### Pattern 4: Dual-Route Add Command
**What:** Auto-detect input type and route to correct API.
**When to use:** Add command only.
**Example:**
```typescript
// Phone detection: starts with '+' or all digits
function isPhoneInput(input: string): boolean {
  return /^\+?\d+$/.test(input);
}

if (isPhoneInput(input)) {
  // Phone route: importContacts
  // Requires --first-name flag
  if (!firstName) {
    outputError('--first-name is required when adding by phone number', 'MISSING_FIRST_NAME');
    return;
  }
  const result = await client.invoke(
    new Api.contacts.ImportContacts({
      contacts: [new Api.InputPhoneContact({
        clientId: BigInt(Math.floor(Math.random() * 2**32)),
        phone: input.startsWith('+') ? input : `+${input}`,
        firstName,
        lastName: lastName ?? '',
      })],
    })
  );
  // result.users[0] is the imported user (if found on Telegram)
} else {
  // Username/ID route: resolveEntity then addContact
  const entity = await resolveEntity(client, input);
  // Validate it's a User
  if (!(entity instanceof Api.User)) {
    outputError('Not a user', 'NOT_A_USER');
    return;
  }
  await client.invoke(
    new Api.contacts.AddContact({
      id: entity,
      firstName: entity.firstName ?? '',
      lastName: entity.lastName ?? '',
      phone: '',
    })
  );
}
```

### Pattern 5: Entity Validation (className-based, from Phase 8)
**What:** Use `instanceof Api.User` for entity type checks in command actions (established in block/profile commands).
**When to use:** Validating resolveEntity results.
**Example:**
```typescript
// Source: src/commands/user/block.ts
if (!(entity instanceof Api.User)) {
  outputError('Not a user: this is a group/channel', 'NOT_A_USER');
  return;
}
```

### Anti-Patterns to Avoid
- **Building a separate ContactItem type:** UserProfile already has every needed field. Just use UserProfile. For search results needing `isContact`, create a `ContactSearchItem` that extends UserProfile with the one extra field.
- **Paginating GetContacts at API level:** GetContacts returns ALL contacts in one call (no offset/limit params). Pagination is client-side on the serialized array.
- **Skipping the user/contact cross-reference:** GetContacts returns `contacts[]` (just userId + mutual) and `users[]` separately. Must build a Map to join them.
- **Blocking on GetFullUser sequentially:** With N+1 enrichment, use Promise.allSettled with concurrency limit (e.g., 5 at a time) to avoid FloodWait while still being faster than sequential.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| User profile enrichment | Custom user data fetcher | Reuse the exact GetFullUser + mapUserStatus pattern from profile.ts | Already handles all edge cases (bot fields, photo count, status mapping) |
| Entity resolution | Custom username/phone resolver | `resolveEntity()` from `src/lib/peer.ts` | Already handles username, numeric ID, phone, invite links |
| Error translation | Custom error message mapping | `translateTelegramError()` + extend TELEGRAM_ERROR_MAP | Consistent error handling across all commands |
| Output formatting | Custom JSON/human formatting | `outputSuccess()`/`outputError()` from `src/lib/output.ts` | Handles JSON/human/JSONL/field selection automatically |
| BigInt serialization | `String(bigint)` | `bigIntToString()` from `src/lib/serialize.ts` | Handles gramjs big-integer library edge cases |

**Key insight:** Phase 9 is architecturally identical to Phase 8. The only new complexity is the dual-route add command and the Search API's two-array response structure. Everything else follows established patterns exactly.

## Common Pitfalls

### Pitfall 1: GetContacts Hash Parameter
**What goes wrong:** Passing `0` as a number instead of `BigInt(0)` for the hash parameter.
**Why it happens:** gramjs expects `long` type which maps to BigInt.
**How to avoid:** Always pass `BigInt(0)` as the hash. Using 0 skips the cache check and always returns full results, which is what we want for a fresh list.
**Warning signs:** TypeScript error about number vs bigint.

### Pitfall 2: contacts.Search myResults vs results
**What goes wrong:** Treating `myResults` and `results` as User objects directly. They are Peer objects (PeerUser, PeerChannel, PeerChat) that only contain IDs.
**Why it happens:** The name "results" suggests hydrated user data.
**How to avoid:** Use `found.users` array as the lookup source. Build a Map from `found.users`, then iterate `myResults`/`results` to extract userId from each Peer and look up in the Map.
**Warning signs:** Getting undefined when accessing `.firstName` on result items.

### Pitfall 3: ImportContacts clientId
**What goes wrong:** Not providing a unique `clientId` for InputPhoneContact.
**Why it happens:** The field seems optional but is required for the API to work correctly.
**How to avoid:** Generate a random BigInt: `BigInt(Math.floor(Math.random() * 2**32))`.
**Warning signs:** Silent failure or unexpected behavior from ImportContacts.

### Pitfall 4: ImportContacts Returns Empty Users
**What goes wrong:** When importing a phone number not registered on Telegram, `result.users` is empty. The contact is "invited" but not added.
**Why it happens:** Telegram only returns a User object if the phone number belongs to a registered account.
**How to avoid:** Check `result.users.length`. If 0 and `result.retryContacts` has entries, the phone is not on Telegram. Report to user: "Phone number not registered on Telegram" or "Contact invited but not on Telegram".
**Warning signs:** Empty users array in ImportedContacts response.

### Pitfall 5: ContactsNotModified Response
**What goes wrong:** Treating `GetContacts` response as always having `.contacts` and `.users` properties.
**Why it happens:** When hash matches, gramjs returns `contacts.ContactsNotModified` which has no data fields.
**How to avoid:** Check `result.className === 'contacts.ContactsNotModified'`. Since we always pass `BigInt(0)`, this should not happen, but handle defensively.
**Warning signs:** Cannot read property 'contacts' of undefined.

### Pitfall 6: Client-Side Pagination Off-By-One
**What goes wrong:** Applying --offset and --limit to the full contact list incorrectly.
**Why it happens:** GetContacts has no server-side pagination. Must slice the array after fetching.
**How to avoid:** Fetch all, sort, then `array.slice(offset, offset + limit)`. Total count is `result.contacts.length` (before slicing).
**Warning signs:** Missing contacts at boundaries, incorrect total count.

### Pitfall 7: N+1 GetFullUser Rate Limiting
**What goes wrong:** Calling GetFullUser sequentially for 500+ contacts causes FloodWait errors.
**Why it happens:** Telegram rate limits individual API calls.
**How to avoid:** Use a concurrency limiter (e.g., batch of 5 concurrent requests with Promise.allSettled). The existing rate-limit wrapper (INFRA-02) handles FloodWait retry, but batching reduces the chance.
**Warning signs:** FloodWaitError after ~30 rapid GetFullUser calls.

## Code Examples

### GetContacts + GetFullUser Enrichment Pattern
```typescript
// Source: gramjs api.d.ts types, blocked list pattern from user/blocked.ts
const result = await client.invoke(
  new Api.contacts.GetContacts({ hash: BigInt(0) })
);

if (result.className === 'contacts.ContactsNotModified') {
  outputSuccess({ contacts: [], total: 0 });
  return;
}

const userMap = new Map<string, any>();
for (const user of (result as any).users ?? []) {
  userMap.set(bigIntToString(user.id), user);
}

// Get user IDs from contacts, sort alphabetically, apply pagination
const contactUserIds: string[] = [];
for (const c of (result as any).contacts ?? []) {
  contactUserIds.push(bigIntToString(c.userId));
}

// Sort by name using userMap
contactUserIds.sort((a, b) => {
  const ua = userMap.get(a);
  const ub = userMap.get(b);
  const nameA = [ua?.firstName, ua?.lastName].filter(Boolean).join(' ').toLowerCase();
  const nameB = [ub?.firstName, ub?.lastName].filter(Boolean).join(' ').toLowerCase();
  return nameA.localeCompare(nameB);
});

const total = contactUserIds.length;
const page = contactUserIds.slice(offset, offset + limit);

// Enrich each contact with GetFullUser (concurrent batches)
const profiles: UserProfile[] = [];
const BATCH_SIZE = 5;
for (let i = 0; i < page.length; i += BATCH_SIZE) {
  const batch = page.slice(i, i + BATCH_SIZE);
  const results = await Promise.allSettled(
    batch.map(async (userId) => {
      const user = userMap.get(userId);
      if (!user) return null;
      const fullResult = await client.invoke(
        new Api.users.GetFullUser({ id: user })
      );
      // ... build UserProfile using same pattern as profile.ts ...
      return profileData;
    })
  );
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) profiles.push(r.value);
  }
}
```

### contacts.DeleteContacts
```typescript
// Source: gramjs api.d.ts - DeleteContacts accepts id: TypeEntityLike[]
const entity = await resolveEntity(client, userInput);
if (!(entity instanceof Api.User)) {
  outputError('Not a user: this is a group/channel', 'NOT_A_USER');
  return;
}

await client.invoke(
  new Api.contacts.DeleteContacts({ id: [entity] })
);

const result: ContactDeleteResult = {
  userId: bigIntToString(entity.id),
  username: entity.username ?? null,
  firstName: entity.firstName ?? null,
  action: 'deleted',
};
outputSuccess(result);
```

### contacts.AddContact (username/ID path)
```typescript
// Source: gramjs api.d.ts - AddContact with resolved entity
const entity = await resolveEntity(client, input);
if (!(entity instanceof Api.User)) {
  outputError('Not a user: this is a group/channel', 'NOT_A_USER');
  return;
}

await client.invoke(
  new Api.contacts.AddContact({
    id: entity,
    firstName: entity.firstName ?? '',
    lastName: entity.lastName ?? '',
    phone: '',
  })
);

// Then fetch full profile for the response
const fullResult = await client.invoke(
  new Api.users.GetFullUser({ id: entity })
);
// ... build UserProfile ...
```

### contacts.ImportContacts (phone path)
```typescript
// Source: gramjs api.d.ts - ImportContacts with InputPhoneContact
const importResult = await client.invoke(
  new Api.contacts.ImportContacts({
    contacts: [
      new Api.InputPhoneContact({
        clientId: BigInt(Math.floor(Math.random() * 2 ** 32)),
        phone: phoneNumber,
        firstName: firstName,
        lastName: lastName ?? '',
      }),
    ],
  })
);

if (importResult.users.length === 0) {
  // Phone not registered on Telegram
  outputError('Phone number not found on Telegram', 'PHONE_NOT_FOUND');
  return;
}

const importedUser = importResult.users[0] as Api.User;
// Then fetch full profile for rich response
```

### contacts.Search with myResults/results separation
```typescript
// Source: gramjs api.d.ts - contacts.Found structure
const found = await client.invoke(
  new Api.contacts.Search({ q: query, limit: globalMode ? limit : 100 })
);

const userMap = new Map<string, any>();
for (const u of found.users ?? []) {
  userMap.set(bigIntToString(u.id), u);
}

// myResults contains Peer objects for contacts matching query
const myContactIds = new Set<string>();
for (const peer of found.myResults ?? []) {
  const userId = bigIntToString((peer as any).userId);
  if (userId) myContactIds.add(userId);
}

// Build result list
const targetPeers = globalMode
  ? [...(found.myResults ?? []), ...(found.results ?? [])]
  : (found.myResults ?? []);

for (const peer of targetPeers) {
  const userId = bigIntToString((peer as any).userId);
  if (!userId) continue; // Skip non-user peers (chats/channels)
  const user = userMap.get(userId);
  if (!user) continue;
  // Enrich with GetFullUser, add isContact: myContactIds.has(userId)
}
```

### Command Group Registration
```typescript
// Source: src/commands/user/index.ts pattern
import { Command } from 'commander';
import { contactListAction } from './list.js';
import { contactAddAction } from './add.js';
import { contactDeleteAction } from './delete.js';
import { contactSearchAction } from './search.js';

export function createContactCommand(): Command {
  const contact = new Command('contact')
    .description('Contact management');

  contact.command('list')
    .description('List all contacts')
    .option('--limit <n>', 'Max results', '50')
    .option('--offset <n>', 'Skip results', '0')
    .action(contactListAction);

  contact.command('add')
    .argument('<user>', 'Username, user ID, or phone number (with + prefix)')
    .description('Add a contact')
    .option('--first-name <name>', 'First name (required for phone-based add)')
    .option('--last-name <name>', 'Last name')
    .action(contactAddAction);

  contact.command('delete')
    .argument('<user>', 'Username or user ID')
    .description('Delete a contact')
    .action(contactDeleteAction);

  contact.command('search')
    .argument('<query>', 'Search query')
    .description('Search contacts by name')
    .option('--global', 'Search all Telegram users')
    .option('--limit <n>', 'Max results (global only)', '20')
    .action(contactSearchAction);

  return contact;
}
```

### formatData Dispatch Extension
```typescript
// Add to formatData in src/lib/format.ts -- detection order matters
// Place BEFORE BlockedListResult check to avoid false matches

// ContactListResult shape (contacts[] + total number)
if (Array.isArray(obj.contacts) && typeof obj.total === 'number') {
  return formatContactList(obj.contacts as UserProfile[]);
}

// ContactSearchResult shape (results[] + total number)
if (Array.isArray(obj.results) && typeof obj.total === 'number') {
  return formatContactSearch(obj.results);
}

// ContactDeleteResult shape (userId + action: 'deleted')
if ('userId' in obj && 'action' in obj && obj.action === 'deleted') {
  const name = obj.firstName || obj.username || obj.userId;
  return `Deleted contact ${name}`;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| className-based validation | instanceof Api.User | Phase 8 uses instanceof directly | Both work; test mocks use class-based approach |
| Sequential API calls | Concurrent batching with Promise.allSettled | Established pattern | Needed for N+1 GetFullUser enrichment perf |

**Deprecated/outdated:**
- None relevant to contacts API. The contacts.GetContacts, contacts.Search, contacts.AddContact, contacts.ImportContacts, contacts.DeleteContacts APIs are stable Telegram MTProto methods.

## Open Questions

1. **GetFullUser concurrency limit for large contact lists**
   - What we know: User accepted N+1 cost. FloodWait is auto-handled by INFRA-02.
   - What's unclear: Optimal batch size for concurrent GetFullUser calls before triggering rate limits.
   - Recommendation: Start with batch size of 5 concurrent requests. Can tune based on real-world testing.

2. **contacts.Search with empty query for contact-only search**
   - What we know: contacts.Search requires `q` (search query string). The API searches by username substring.
   - What's unclear: Whether empty string returns all contacts or errors.
   - Recommendation: For contact-only search, pass the user's query to `contacts.Search({ q, limit: 100 })`. The myResults array gives matching contacts. If q is too short (< 1 char for some versions), the API may reject.

3. **AddContact response hydration**
   - What we know: AddContact returns `Api.TypeUpdates` (not a User directly).
   - What's unclear: Whether the Updates object contains the added user's info or requires a separate GetFullUser call.
   - Recommendation: After AddContact, always do a fresh GetFullUser on the resolved entity to guarantee a complete UserProfile response. This is consistent and predictable.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest (in project) |
| Config file | vitest.config.ts |
| Quick run command | `npx vitest run tests/unit/contact-list.test.ts` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CONT-01 | List contacts with phone, username, status | unit | `npx vitest run tests/unit/contact-list.test.ts -x` | -- Wave 0 |
| CONT-02 | Add contact by username/ID or phone (dual routing) | unit | `npx vitest run tests/unit/contact-add.test.ts -x` | -- Wave 0 |
| CONT-03 | Delete a contact | unit | `npx vitest run tests/unit/contact-delete.test.ts -x` | -- Wave 0 |
| CONT-04 | Search contacts by name, --global flag | unit | `npx vitest run tests/unit/contact-search.test.ts -x` | -- Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run tests/unit/contact-*.test.ts`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/unit/contact-list.test.ts` -- covers CONT-01
- [ ] `tests/unit/contact-add.test.ts` -- covers CONT-02
- [ ] `tests/unit/contact-delete.test.ts` -- covers CONT-03
- [ ] `tests/unit/contact-search.test.ts` -- covers CONT-04

No framework install needed (vitest already configured).

## Contact-Specific Error Codes

Errors to add to `TELEGRAM_ERROR_MAP` in `src/lib/errors.ts`:

| Error Code | Human Message | When It Occurs |
|-----------|---------------|----------------|
| CONTACT_ID_INVALID | Contact not found | Delete/add with invalid user |
| CONTACT_NAME_EMPTY | First name is required | AddContact with empty firstName |
| CONTACT_REQ_MISSING | Contact request required | Adding user who requires permission |
| PHONE_NOT_OCCUPIED | Phone number not registered on Telegram | ImportContacts for unregistered number |
| SEARCH_QUERY_EMPTY | Search query cannot be empty | contacts.Search with empty q |

## Sources

### Primary (HIGH confidence)
- gramjs TypeScript type definitions: `node_modules/telegram/tl/api.d.ts` -- verified exact API signatures for GetContacts, ImportContacts, DeleteContacts, Search, AddContact
- Existing codebase: `src/commands/user/block.ts`, `src/commands/user/blocked.ts`, `src/commands/user/profile.ts` -- established command patterns

### Secondary (MEDIUM confidence)
- [contacts.AddContact docs](https://gram.js.org/tl/contacts/AddContact) -- confirmed parameters: id, firstName, lastName, phone, addPhonePrivacyException
- [contacts.GetContacts docs](https://gram.js.org/tl/contacts/GetContacts) -- confirmed hash parameter and Contacts/ContactsNotModified return types
- [contacts.deleteContacts Telegram core docs](https://core.telegram.org/method/contacts.deleteContacts) -- confirmed id: Vector<InputUser> parameter
- [contacts.search Telegram core docs](https://core.telegram.org/method/contacts.search) -- confirmed myResults vs results separation in Found response
- [contacts.ImportContacts docs](https://gram.js.org/tl/contacts/ImportContacts) -- confirmed InputPhoneContact structure with clientId, phone, firstName, lastName

### Tertiary (LOW confidence)
- Error codes for contacts: inferred from Telegram API patterns, not all verified against gramjs. May need to discover actual error strings during testing.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in project, gramjs types verified in node_modules
- Architecture: HIGH - follows Phase 8 patterns exactly, command group structure confirmed
- Pitfalls: HIGH - gramjs API types verified, response structures confirmed from type definitions
- Error codes: LOW - contact-specific error codes inferred, not all verified

**Research date:** 2026-03-13
**Valid until:** 2026-04-13 (stable APIs, no breaking changes expected)
