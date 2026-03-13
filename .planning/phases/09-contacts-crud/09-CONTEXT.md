# Phase 9: Contacts CRUD - Context

**Gathered:** 2026-03-13
**Status:** Ready for planning

<domain>
## Phase Boundary

New `contact` command group with four commands: list all contacts, add a contact (by username/ID or phone number), delete a contact, and search contacts (local + global). No group/channel management, no bulk import, no contact sync.

</domain>

<decisions>
## Implementation Decisions

### Contact data shape
- Rich profile per contact: id, firstName, lastName, username, phone, status, bio, photoCount, lastSeen, premium, verified, isBot, mutualContact, langCode
- ContactItem extends UserProfile from Phase 8 — same type, phone already present, no duplication
- Always fetch full profiles (GetFullUser per contact) even on list — user accepts the N+1 cost for rich data
- For global search results, add `isContact: boolean` flag to indicate whether the user is already a contact
- List envelope: `{ contacts: ContactItem[], total: N }` consistent with blocked list shape

### Add command input design
- Auto-detect routing: input starting with `+` or all digits → importContacts (phone), otherwise → addContact (username/ID)
- Phone-based add requires `--first-name` flag (mandatory), optional `--last-name`
- Username/ID-based add needs no name flags (Telegram resolves the user)
- Returns full ContactItem profile on success (not just action confirmation)
- Idempotent: adding an existing contact returns success silently with the contact profile

### Search scope & results
- Default: search your contacts only (contacts.Search API)
- `--global` flag: search all Telegram users (broader contacts.Search scope)
- Same ContactItem shape for all results, plus `isContact: boolean` on global results
- Default --limit 20 for global search, contact-only search returns all matches
- Envelope: `{ results: ContactItem[], total: N }`

### List & delete behavior
- List supports `--limit` (default 50) / `--offset` (default 0) consistent with all other list commands
- Contacts sorted alphabetically by firstName + lastName
- Delete is single user only: `tg contact delete <user>` — no batch (safety-first, consistent with block)
- Delete response: `{ userId, username, firstName, action: "deleted" }`
- Idempotent: deleting a non-contact returns success silently

### Claude's Discretion
- gramjs API call strategy for contacts.GetContacts, contacts.Search, addContact, importContacts, contacts.DeleteContacts
- GetFullUser batching/concurrency strategy for list enrichment
- Human-readable format layout for contact list and search results
- Error code translations specific to contact operations
- How to handle contacts.Search with --global (API parameter differences)

</decisions>

<specifics>
## Specific Ideas

- ContactItem extends UserProfile directly — agents get the same shape from `tg contact list` and `tg user profile`, phone is already on UserProfile
- Add command auto-detects phone vs username without flags — `+` prefix or all-digits triggers importContacts API route
- Global search with `--global` flag expands the phase beyond basic contacts CRUD but stays within "contacts" domain — useful for agents discovering users to add
- All CRUD operations are idempotent (add existing, delete non-contact) matching Phase 8's block/unblock pattern

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `UserProfile` type (`src/lib/types.ts`): ContactItem extends this directly — phone field already present
- `resolveEntity()` (`src/lib/peer.ts`): Handles username, numeric ID, phone resolution — reuse for all contact commands
- `formatUserProfile()` (`src/lib/format.ts`): Key-value pair format — reuse for contact display
- `formatMembers()` (`src/lib/format.ts`): Name + username + bot tag — can be used for compact list view
- `translateTelegramError()` (`src/lib/errors.ts`): Extend with contact-specific errors
- `outputSuccess()` / `outputError()` (`src/lib/output.ts`): Standard output pipeline
- `formatData()` auto-dispatch (`src/lib/format.ts`): Add contact list and search shape detection

### Established Patterns
- Command group registration: `src/commands/{group}/index.ts` with subcommands (user/, message/, chat/)
- `optsWithGlobals()` for merging local and global options
- `withClient()` / `SessionStore` / `createConfig()`: Standard command boilerplate
- `{ items: [], total: N }` envelope pattern (from blocked list)
- `{ userId, username, firstName, action }` confirmation pattern (from block/unblock)
- Idempotent operations returning success silently (from block)
- className-based entity validation instead of instanceof (from Phase 8)

### Integration Points
- New `src/commands/contact/index.ts`: Register list, add, delete, search subcommands
- `src/lib/types.ts`: Add ContactItem (extends UserProfile), ContactListResult, ContactSearchResult, ContactDeleteResult
- `src/lib/format.ts`: Add formatContactList and formatContactSearch, extend formatData dispatch
- `src/lib/errors.ts`: Extend TELEGRAM_ERROR_MAP with contact-specific errors
- `src/tg.ts`: Register `contact` command group

</code_context>

<deferred>
## Deferred Ideas

- Contact bulk import by phone number — ADV-08 in v2 requirements
- Contact sync / auto-update — different capability
- Batch delete contacts — could add later if agents need it

</deferred>

---

*Phase: 09-contacts-crud*
*Context gathered: 2026-03-13*
