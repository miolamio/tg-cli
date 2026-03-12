# Pitfalls Research

**Domain:** Telegram CLI v1.1 -- Adding user profiles, contacts, message management, block/unblock, TOON output, and polls to existing CLI
**Researched:** 2026-03-12
**Confidence:** HIGH (verified against Telegram official API docs, gramjs source/issues, TOON spec, and existing codebase patterns)

## Critical Pitfalls

### Pitfall 1: Message Edit/Delete Permission Model is Context-Dependent and Asymmetric

**What goes wrong:**
Developers implement `message edit` and `message delete` as simple wrappers around `client.editMessage()` and `client.deleteMessages()`, testing only in DMs where everything works. In production, the commands fail unpredictably across different chat types because Telegram enforces completely different permission rules for each context:

- **Edit**: Only the message author can edit. In channels, admins with `edit_messages` right can edit others' messages. There is a 48-hour edit window for non-admin users (error: `MESSAGE_EDIT_TIME_EXPIRED`). Sending identical content triggers `MESSAGE_NOT_MODIFIED`.
- **Delete own messages**: Works in all chat types. In DMs and basic groups, the `revoke` flag controls whether deletion is for both parties or just the caller. In channels/supergroups, `revoke` is ignored -- deletion is always for everyone.
- **Delete others' messages**: Requires `delete_messages` admin right in channels/supergroups. In basic groups, only group creators or admins can delete others' messages. In DMs, you can only delete your own messages for both parties (within 48 hours).

The gramjs `deleteMessages` default behavior is `revoke: true` (delete for everyone), which is the **opposite** of official Telegram clients that default to deleting only for the caller. This silent default difference can surprise users who expect "delete" to only remove from their view.

**Why it happens:**
Permission rules are scattered across multiple Telegram API docs (`chatAdminRights`, `messages.editMessage`, `messages.deleteMessages`, `channels.deleteMessages`). No single reference consolidates the per-context rules. Developers test in one context (usually DMs) and assume uniform behavior.

**How to avoid:**
1. Before calling edit/delete, resolve the entity type and check permissions proactively. For channels/supergroups, fetch admin rights via `channels.getParticipant` for the current user.
2. Add a `--revoke` / `--for-everyone` flag on `message delete` that defaults to `true` (matching gramjs behavior) but document this clearly. Consider a `--for-me` flag as well.
3. Catch and translate all Telegram error codes into actionable CLI errors:
   - `MESSAGE_EDIT_TIME_EXPIRED` -> "Cannot edit: message is older than 48 hours"
   - `MESSAGE_AUTHOR_REQUIRED` -> "Cannot edit: you are not the message author"
   - `MESSAGE_DELETE_FORBIDDEN` -> "Cannot delete: insufficient permissions in this chat"
   - `MESSAGE_NOT_MODIFIED` -> "Cannot edit: new content is identical to current content"
   - `CHAT_WRITE_FORBIDDEN` -> "Cannot edit: you are restricted from writing in this chat"
4. Add a `--dry-run` or pre-check that reports whether the operation would succeed, so agents can decide before attempting.

**Warning signs:**
- Edit works in DMs but fails in groups with `MESSAGE_AUTHOR_REQUIRED`
- Delete appears to succeed (no error) but the message is still visible to other users because `revoke` was not set appropriately for the chat type
- Users report "I deleted the message but it's still there" (deleted only for self in basic group)

**Phase to address:**
Message management phase (edit/delete/pin). This must be the most carefully tested phase due to the permission matrix complexity.

---

### Pitfall 2: GetFullUser Privacy Restrictions Return Empty Fields, Not Errors

**What goes wrong:**
`users.getFullUser` succeeds (returns 200) even when the target user's privacy settings hide their information. Instead of returning an error, the API returns a `userFull` object with null/empty fields for restricted data. Developers who check for API errors but not for empty fields will show blank profiles and the CLI will output `{"bio": null, "lastSeen": null, "phone": null}` without explaining that privacy settings are the cause. The agent consuming this JSON output has no way to distinguish "user has no bio" from "user's bio is hidden by privacy settings."

The specific privacy-affected fields:
- **about** (bio): Can be restricted to contacts-only, nobody, or everyone
- **profile_photo**: Has a `fallback_photo` field when the real photo is hidden. The `personal_photo` field is only visible to contacts
- **phone**: Almost always hidden from non-contacts in modern Telegram
- **last seen** (status): Not in `userFull` at all -- it is on the `User` object itself, and shows approximate values ("recently", "within a week", "within a month", "long time ago") when exact time is hidden
- **common_chats_count**: Always available (not privacy-restricted)

**Why it happens:**
Telegram's privacy model returns success with empty data rather than errors for privacy-restricted fields. This is by design (the API call succeeded; you just cannot see certain fields). Developers familiar with REST APIs expect a 403 or explicit "access denied" when data is restricted.

**How to avoid:**
1. For each field in the user profile output, track whether it is privacy-restrictable. Add a `privacy` or `restricted` indicator to the JSON output so agents can distinguish "no data" from "data hidden":
   ```json
   {"bio": null, "bioRestricted": true, "lastSeen": "recently", "lastSeenApproximate": true}
   ```
2. The `User` object (not `userFull`) contains the `status` field for last seen. You need BOTH `users.getFullUser` AND the user entity from `getEntity` to build a complete profile.
3. Check the `User.status` className: `UserStatusOnline`, `UserStatusOffline` (has `wasOnline` timestamp), `UserStatusRecently`, `UserStatusLastWeek`, `UserStatusLastMonth`, `UserStatusEmpty`. Only `UserStatusOffline` has an exact timestamp.
4. For `common_chats`, `users.getFullUser` only returns the count. To get the actual list, call `messages.getCommonChats` separately.

**Warning signs:**
- Profile command returns all-null fields for users who clearly have bios (visible in Telegram app)
- Last seen always showing "unknown" because you are looking for it in `userFull` instead of `User.status`
- Agent reports "user has no bio" when the bio is actually just privacy-restricted

**Phase to address:**
User profiles phase. Must be addressed from the start of profile implementation, not retrofitted.

---

### Pitfall 3: channels.getMessages vs messages.getMessages -- Wrong API for the Entity Type

**What goes wrong:**
When implementing `message get <chat> <msg-ids>` to fetch specific messages by ID, developers use `messages.getMessages` (which takes plain integer IDs) for all chat types. This fails silently for channels and supergroups -- the API returns `MessageEmpty` objects instead of the actual messages. Channels and supergroups require `channels.getMessages` with the channel entity as an additional parameter.

The gramjs high-level `client.getMessages(entity, {ids: [...]})` handles this automatically, BUT there is a known inconsistency (gramjs issue #158): when retrieving by IDs, the returned array may contain `undefined` entries for messages that do not exist or are deleted, rather than `MessageEmpty` objects. The array length matches the input IDs length but some slots are empty.

**Why it happens:**
- The raw Telegram API has two separate methods for the same operation depending on chat type
- Developers using gramjs high-level methods do not realize the library is dispatching to different raw methods behind the scenes
- No error is returned for non-existent message IDs -- you just get empty/undefined entries in the result array

**How to avoid:**
1. Use `client.getMessages(entity, {ids: [...]})` (the high-level method) which handles the channel vs non-channel dispatch automatically.
2. After fetching, filter out `undefined`, `null`, and `MessageEmpty` entries from the result array.
3. Report which IDs were not found in the output: `{"messages": [...], "notFound": [123, 456]}` so the agent knows which IDs were invalid.
4. For pinned messages specifically, use `messages.search` with `InputMessagesFilterPinned` filter rather than trying to find pinned messages by ID -- this is more reliable and handles the case where you do not know the pinned message IDs in advance.

**Warning signs:**
- `message get` returning empty results for valid message IDs in channels
- Result array length not matching input ID count
- Inconsistent behavior between DM chats and group chats

**Phase to address:**
Message management phase (get by ID, get pinned). Must test across all chat types.

---

### Pitfall 4: TOON Format Breaks on Non-Uniform Data Shapes

**What goes wrong:**
TOON achieves its token savings (30-60% fewer tokens than JSON) through tabular encoding of uniform arrays -- declaring field names once and listing values in CSV-like rows. But Telegram CLI output is NOT uniformly shaped:

- `MessageItem` has optional fields (`reactions`, `emoji`, `media`, `actionText`, `views`, `forwards`) that are present on some messages and absent on others
- Service messages have `actionText` but no `text`/`senderId`
- Messages with media have a nested `media` object; messages without do not
- Search results extend `MessageItem` with `chatId`/`chatTitle`

When TOON encounters semi-uniform data (some objects have fields that others do not), it falls back to per-object encoding similar to JSON, losing most of its token savings. Worse, if the encoder treats optional fields as always-present (filling with null), the tabular rows become cluttered with nulls that waste tokens -- negating the purpose.

TOON's spec handles nested objects by falling back to indentation-based encoding (like YAML), which for deeply nested structures can actually use MORE tokens than JSON.

**Why it happens:**
TOON was designed for uniform data (employee records, product catalogs) where every object has the same fields. Telegram messages are inherently heterogeneous -- a conversation includes text messages, media messages, service messages, forwards, and replies, each with different field sets.

**How to avoid:**
1. Do NOT blindly encode the full `MessageItem` type to TOON. Instead, define a minimal "TOON-optimized" schema that includes only the common fields (`id`, `text`, `date`, `senderId`, `senderName`) and flatten optional fields into the base representation.
2. Handle the `media` nested object by flattening: instead of `media: {filename, fileSize, ...}`, output `mediaFilename`, `mediaFileSize` as top-level fields (null when no media). This keeps the tabular structure uniform.
3. For mixed message types, separate service messages from regular messages before encoding -- encode each group as its own TOON table.
4. Benchmark actual token savings with real Telegram data before committing to TOON. If savings are under 20% with real message shapes, the implementation complexity may not justify it. Consider a simpler approach: abbreviated JSON keys (`id`, `t`, `d`, `s` instead of `id`, `text`, `date`, `senderId`).
5. The TOON TypeScript SDK (`@toon-format/toon`) handles encoding/decoding, but test edge cases: strings containing commas (field delimiter), strings containing newlines (row delimiter), strings containing backslashes (escape character), null values, boolean values, and empty strings.

**Warning signs:**
- TOON output is LARGER than JSON for typical message history (non-uniform data)
- Agent parsing failures because a TOON row has fewer/more fields than the header declares
- Special characters in message text (commas, newlines, backslashes) corrupting TOON tabular rows

**Phase to address:**
TOON output format phase. Research and benchmark BEFORE implementation -- do not build the full encoder then discover it does not help.

---

### Pitfall 5: Block/Unblock Uses Different API Methods Than Expected

**What goes wrong:**
Developers look for `contacts.Block` and `contacts.Unblock` methods, but the current Telegram API uses `contacts.block` (lowercase, takes a generic `InputPeer` not just users) and `contacts.unblock`. The critical gotcha: blocking works on ANY peer type (users, bots, channels, supergroups), not just users. If the CLI only validates user entities, it will reject valid block operations on channels (which is how you mute/hide channels you cannot leave).

Additionally, `contacts.block` has a `my_stories_from` flag that blocks the peer specifically from viewing your stories (without blocking messages). This is a different operation than full blocking, and the CLI should distinguish them.

The `contacts.getBlocked` method for listing blocked peers uses pagination with `offset`/`limit` but returns a different structure depending on whether the result is a full list or a slice (`contacts.blocked` vs `contacts.blockedSlice`).

**Why it happens:**
- The API method names use generic "peer" terminology but developers think of blocking as a user-to-user operation
- The stories-only blocking flag is new and not widely documented
- The two different return types for the blocked list catch developers who only handle one

**How to avoid:**
1. Accept any peer type (user, channel, supergroup) for block/unblock, not just users. Use `resolveEntity()` from the existing codebase and pass the result as `InputPeer`.
2. Add a `--stories-only` flag for story-specific blocking vs full blocking.
3. Handle both `contacts.Blocked` and `contacts.BlockedSlice` return types in the blocked list command. Check the constructor class name or use `instanceof`.
4. The block status is also available in `userFull.blocked` -- use this for the profile command's output.

**Warning signs:**
- "Block user" works but "block channel" fails with a type error
- Blocked list pagination stopping at the first page because `BlockedSlice` type was not handled
- Users confused about the difference between blocking and muting

**Phase to address:**
Block/unblock phase. Straightforward to implement correctly if aware of these issues upfront.

---

### Pitfall 6: Contacts API Has Phone Number Privacy Landmines

**What goes wrong:**
The `contacts.addContact` method requires providing the target user's `InputUser` (not just their phone number) plus a `firstName`, `lastName`, and `phone` string. But the phone number field is informational only for contacts added by Telegram ID -- the actual association is by `InputUser.userId`. If you add a contact by phone number alone (without knowing their Telegram user ID), you must use `contacts.importContacts` instead, which is a separate API method with different behavior:

- `contacts.importContacts` takes phone numbers and returns which numbers matched Telegram accounts
- `contacts.addContact` takes an already-resolved `InputUser` and adds them to your contact list with a display name
- `contacts.deleteContacts` takes a vector of `InputUser` objects, not phone numbers
- `contacts.search` searches by username/name, not by phone number

The `contacts.getContacts` method requires a `hash` parameter (a content hash for caching). Passing `0` always returns the full list. Passing a previously received hash returns an empty result if nothing changed (optimization). Developers who do not handle the "no change" response type will think their contact list is empty.

**Why it happens:**
- The contacts API was designed for mobile apps that sync phone address books, not CLI tools that add contacts one at a time
- The distinction between `importContacts` (phone-based) and `addContact` (user-based) is not intuitive
- The hash-based caching mechanism is unusual for a CLI tool

**How to avoid:**
1. For `contacts add`, accept both username/ID (use `addContact` with resolved `InputUser`) and phone number (use `importContacts`). Route to the correct API method based on input format.
2. For `contacts list`, always pass `hash: bigInt(0)` to get the full list. Do not attempt to cache the hash between CLI invocations -- the CLI is stateless.
3. For `contacts delete`, resolve the target to an `InputUser` first using `resolveEntity()`, then pass to `deleteContacts`.
4. For `contacts search`, implement as `contacts.search` which searches Telegram's global directory by username/name, returning both contacts and non-contact matches. Distinguish the two in output.
5. Handle the `addPhonePrivacyException` flag on `addContact` -- when set, it allows the added user to see your phone number even if your privacy settings normally hide it. Default this to `false` and let users opt in with a flag.

**Warning signs:**
- `contacts list` returning empty when the user has contacts (hash caching issue)
- `contacts add @username` failing because `importContacts` was used instead of `addContact`
- `contacts add +1555...` failing because `addContact` was used instead of `importContacts`

**Phase to address:**
Contacts management phase. The dual API path (import vs add) must be designed upfront.

---

### Pitfall 7: Pin/Unpin Has a Notification Side Effect That Upsets Group Members

**What goes wrong:**
`messages.updatePinnedMessage` (the underlying API for pin) sends a notification to ALL group members by default. In a group of 10,000 members, pinning a message generates 10,000 notifications. The `silent` flag suppresses this notification, but it is easy to forget. For a CLI tool used by agents, accidentally mass-notifying a large group is a serious UX failure.

Additionally:
- Unpinning all messages is done by calling `client.pinMessage(entity, undefined)` (or `messages.updatePinnedMessage` with `id: 0`), not with a separate "unpin all" method
- In channels without a linked discussion group, only admins with `pin_messages` right can pin
- In supergroups, the `pin_messages` admin right is required
- In DMs, either party can pin without special permissions
- Pinning in a forum topic requires specifying the topic via `replyTo`

**Why it happens:**
- The `silent` flag is optional and defaults to false (notifications enabled)
- Developers test in small groups or DMs where notifications are harmless
- The "unpin all" behavior via `id: 0` or `undefined` is non-obvious

**How to avoid:**
1. Default to `silent: true` for the CLI's pin command. Add a `--notify` flag to opt into notifications. This is the safe default for a tool used by agents.
2. Implement `--all` flag for unpin that calls with `id: 0` to unpin all messages.
3. Pre-check admin permissions before pinning in groups/channels. Call `channels.getParticipant` for the current user and check the `pin_messages` admin right.
4. Add clear output indicating whether the pin notification was sent or suppressed.

**Warning signs:**
- "Why did everyone in the group get a notification?" complaints after pinning
- Unpin command failing because it tries to unpin a specific message instead of using the "unpin all" API
- Pin failing in supergroups without admin rights and the error being generic

**Phase to address:**
Pin/unpin phase. The default-silent behavior decision must be made at design time.

---

### Pitfall 8: Poll Creation Has Strict Limits and Quiz Mode Requires Correct Answer Encoding

**What goes wrong:**
Sending a poll via `messages.sendMedia` with `InputMediaPoll` has multiple validation rules that are enforced server-side with cryptic errors:

- Poll questions: limited length (255 characters for the question text)
- Options: minimum 2, maximum 10. Each option text is limited to 100 characters
- Option identifiers: must be unique byte strings (1-100 bytes). Developers often use the option text as the identifier, but the identifier must be a unique byte buffer, not the display text
- Quiz mode: requires exactly one `correct_answer` option identifier. The identifier must match one of the poll's answer option bytes
- Solution text: 0-200 characters with at most 2 line feeds for quiz explanations
- Close period: 5-600 seconds (for auto-closing polls)
- Anonymous polls cannot be converted to non-anonymous after creation
- Poll type (quiz vs regular) cannot be changed after creation

The option identifier encoding is the most common failure point. In gramjs, `pollAnswer.option` is a `Buffer` (bytes), not a string. Developers pass strings and get type errors or silent failures.

**Why it happens:**
- The identifier bytes vs display text distinction is not intuitive
- Quiz mode validation happens server-side with error messages like `POLL_ANSWER_INVALID` that do not explain which constraint was violated
- Developers test with regular polls and forget to test quiz mode

**How to avoid:**
1. Auto-generate option identifiers as sequential byte buffers (`Buffer.from([0])`, `Buffer.from([1])`, etc.) rather than using option text. This avoids encoding issues and length limits on identifiers.
2. Validate all constraints client-side before sending: option count (2-10), option text length (max 100 chars), question text length (max 255 chars), solution length (max 200 chars, max 2 newlines).
3. For quiz mode, require exactly one `--correct <index>` option. Validate the index is within the options range.
4. Expose poll type as a `--quiz` flag, anonymous as `--public` (non-anonymous), multiple choice as `--multi`.
5. Document that polls cannot be edited after creation (only closed). The `messages.editMessage` method can only set `poll.closed = true` to close the poll, not modify questions or options.

**Warning signs:**
- `POLL_ANSWER_INVALID` errors when creating quiz polls
- Poll options appearing garbled because Buffer encoding was wrong
- "Poll not found" errors when trying to edit poll content (only closing is allowed)

**Phase to address:**
Polls phase. Validate all constraints locally before API calls.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Adding TOON as a third output mode without refactoring output.ts | Keeps existing JSON/human modes untouched | output.ts becomes a 3-way branch on every command, hard to add 4th format | Never -- refactor output.ts to use a strategy pattern before adding TOON |
| Hardcoding permission checks per command instead of a shared permission layer | Each command handles its own error cases | Inconsistent error messages, duplicated permission logic across edit/delete/pin | Acceptable for v1.1 if limited to 3 commands; must centralize if more permission-dependent commands are added |
| Using `any` casts for gramjs API responses (existing pattern) | Faster development, no type definitions needed | Silent runtime errors when API responses change shape between gramjs versions | Already present in codebase. Do NOT add more -- define explicit types for new API responses (UserFull, poll constructors) |
| Implementing contacts add as addContact-only (skip importContacts) | Simpler implementation, only username/ID input | Cannot add contacts by phone number, which is the primary use case for contacts | Acceptable for v1.1 MVP but document the limitation clearly |
| Skipping TOON benchmarking and implementing based on spec claims | Faster shipping | May discover TOON does not save tokens for Telegram data shapes, wasted effort | Never -- benchmark first with real message history data, decide based on measured savings |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| `users.getFullUser` | Calling it and assuming all fields are populated | Check each field for null/undefined. Cross-reference with `User` entity for `status` (last seen). Indicate privacy-restricted fields in output |
| `client.editMessage()` | Not checking if content actually changed before calling | Compare new content with fetched message content. Catch `MESSAGE_NOT_MODIFIED` and return a clear "no changes" response instead of an error |
| `client.deleteMessages()` | Using default `revoke: true` without documenting this | Expose `--for-everyone` / `--for-me` flags. Document the default behavior. Note that revoke has no effect in channels/supergroups |
| `client.pinMessage()` | Forgetting the `silent` parameter | Default to `silent: true`. Provide `--notify` flag for explicit notification opt-in |
| `contacts.getContacts()` | Using a non-zero hash value from a previous call | Always pass `hash: bigInt(0)` in a stateless CLI. Hash-based caching is for persistent apps |
| `contacts.addContact()` | Using it for phone-number-based contact addition | Route to `contacts.importContacts` for phone numbers, `contacts.addContact` for resolved users |
| `InputMediaPoll` | Passing string option identifiers instead of Buffer | Auto-generate Buffer identifiers: `Buffer.from([idx])` for each option. Never use the option text as the identifier |
| `formatData()` auto-detection | Adding new data shapes without updating the detection cascade in format.ts | Every new command's output shape needs a corresponding formatter AND a detection case in `formatData()`. Add to both or human mode will fall through to `formatGeneric` (ugly JSON dump) |
| `extractListItems()` in fields.ts | New list types not added to `LIST_KEYS` array | Add `'contacts'`, `'blocked'`, `'pinned'` (or whatever key names are used) to the `LIST_KEYS` const so `--jsonl` and `--fields` work on new commands |
| TOON encoder | Encoding nested `media` objects directly | Flatten media fields to top-level before encoding. Nested objects force TOON out of tabular mode, losing token savings |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching user profile + common chats in separate API calls for every user in a list | Slow response, flood wait risk | Batch user ID resolution with `users.getUsers` (up to 200 per call). Only call `getFullUser` for the specific requested profile, not lists | When listing profiles for 50+ contacts |
| Loading entire contact list to search for one contact | Slow for users with 1000+ contacts | Use `contacts.search` for name/username lookup instead of fetching all then filtering client-side | Users with 500+ contacts |
| TOON encoding large message histories | CPU spike during encoding, slow CLI response | For lists over 500 items, consider streaming TOON output or falling back to JSON. TOON encoding is more CPU-intensive than JSON.stringify | Message histories with 1000+ messages |
| Calling `messages.search` with `InputMessagesFilterPinned` for every chat to find pinned messages | Multiple API calls, one per chat | Use `messages.search` once per chat. Cache pinned message IDs if multiple operations are needed | When agent queries pinned messages across many chats |
| Not batching message ID lookups | One `getMessages` call per message ID | `client.getMessages(entity, {ids: [id1, id2, ...]})` accepts arrays. Batch all IDs into a single call | Always -- single IDs waste API calls |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Exposing phone numbers in contacts list JSON output without opt-in | Privacy violation -- phone numbers are sensitive PII | Omit phone numbers from default `contacts list` output. Add `--show-phone` flag for explicit opt-in. Document the privacy implication |
| Logging blocked user list in verbose mode | Reveals who the user has blocked, which is private | Never log blocked list contents to stderr, even in verbose mode. Only output via stdout in the structured response |
| Block/unblock operations visible in group admin logs | Admin actions including blocks may be logged in group admin logs | Document that blocking a user in a group context may be visible to other admins |
| Accepting `--phone` flag for addContact without privacy warning | The `addPhonePrivacyException` parameter shares the caller's phone number with the contact | Default `addPhonePrivacyException: false`. If `--share-phone` flag is used, print a warning that this shares your phone number |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Edit command silently succeeds when message was not actually modified | Agent thinks edit worked, but content is unchanged. No `MESSAGE_NOT_MODIFIED` surfaced | Return `{"modified": false, "reason": "content_identical"}` instead of treating it as an error |
| Delete command with no confirmation for bulk deletion | Agent accidentally deletes 100 messages with no undo | Add `--confirm` flag required when deleting >10 messages. Return count of deleted messages in output |
| Profile command returning 20 null fields for privacy-restricted users | Agent wastes tokens parsing useless null fields | Only include non-null fields in output. Add a `"privacyRestricted": ["bio", "phone", "lastSeen"]` array listing hidden fields |
| TOON output mode not working with --fields or --jsonl | Agent tries to combine output modifiers and gets confusing error or incorrect output | Define clear precedence: `--toon` is mutually exclusive with `--jsonl`. `--fields` should work with `--toon` (apply field selection before TOON encoding) |
| Poll creation requiring inline options in a single CLI argument | Awkward to specify 5+ poll options in a single command line | Accept options as repeated `--option "text"` flags or as newline-separated stdin input |
| Pin command not indicating the notification state | Agent does not know if 10,000 users were just notified | Always include `{"pinned": true, "notified": false, "silent": true}` in the response |

## "Looks Done But Isn't" Checklist

- [ ] **Message edit:** Often missing time-expired handling -- verify that editing a 72-hour-old message returns a clear "expired" error, not a generic failure
- [ ] **Message edit:** Often missing identical-content check -- verify that editing with the same text returns `MESSAGE_NOT_MODIFIED` as a non-error status, not a crash
- [ ] **Message delete:** Often missing revoke documentation -- verify that `--for-everyone` and `--for-me` flags work and are documented with per-chat-type behavior notes
- [ ] **Message delete:** Often missing channel permission check -- verify that deleting another user's message in a supergroup without admin rights returns a clear permission error
- [ ] **User profile:** Often missing last-seen status -- verify that `lastSeen` comes from `User.status` not `userFull`, and shows approximate labels when exact time is hidden
- [ ] **User profile:** Often missing common chats -- verify that `commonChatsCount` is populated AND that a separate `--common-chats` flag fetches the actual chat list via `messages.getCommonChats`
- [ ] **Contacts list:** Often missing the hash=0 fix -- verify that `contacts list` returns actual contacts, not an empty "not modified" response
- [ ] **Contacts add:** Often missing the phone-number path -- verify that `contacts add +15551234567` works (via `importContacts`) not just `contacts add @username` (via `addContact`)
- [ ] **Pin message:** Often missing silent default -- verify that pinning does NOT send notifications unless `--notify` is explicitly passed
- [ ] **Pin message:** Often missing unpin-all -- verify that `message unpin <chat> --all` works (calls with id=0)
- [ ] **Get pinned messages:** Often using wrong API -- verify that pinned messages are fetched via `messages.search` with `InputMessagesFilterPinned`, not by manually tracking pinned IDs
- [ ] **Polls:** Often missing Buffer encoding for option IDs -- verify that poll creation does not pass strings as option identifiers
- [ ] **Polls:** Often missing quiz validation -- verify that quiz mode requires exactly one correct answer and rejects zero or multiple
- [ ] **TOON output:** Often missing benchmark -- verify that TOON actually saves tokens for real Telegram data before shipping. Measure with 100-message history
- [ ] **TOON output:** Often missing special character escaping -- verify that messages containing commas, newlines, and backslashes encode/decode correctly in TOON tabular mode
- [ ] **Block/unblock:** Often limited to users only -- verify that blocking a channel works (legitimate use case for hiding unwanted channels)
- [ ] **Format detection:** Often missing new shapes -- verify that `formatData()` in format.ts detects and formats all new output types (profile, contacts, blocked list, poll) in human-readable mode
- [ ] **LIST_KEYS update:** Often missing -- verify that `extractListItems()` in fields.ts handles new list key names so `--jsonl` and `--fields` work on new commands

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Mass notification from pin without silent flag | HIGH (social) | Cannot un-notify. Apologize in the group. Fix the code to default to silent. Consider adding a "pin was silent" indicator to output |
| MESSAGE_EDIT_TIME_EXPIRED | LOW | Cannot edit. Delete and resend if needed. Document the 48-hour window for agents |
| Contacts added with addPhonePrivacyException=true | MEDIUM | Cannot revoke the phone number visibility retroactively. Must remove the contact and re-add without the flag. Document this clearly |
| TOON encoding corrupts data due to unescaped special chars | LOW | Fall back to JSON output. Fix the encoder. Re-run the command with `--json` |
| Wrong API used for getMessages (empty results for channels) | LOW | Switch to high-level `client.getMessages()` and re-test. No data loss |
| Poll created with wrong correct answer in quiz mode | LOW | Cannot edit polls. Must close the poll and create a new one. Document that polls are immutable after creation |
| Delete with revoke=true in DM deleted for both parties unintentionally | MEDIUM | Cannot recover deleted messages. The other party's messages are permanently gone. Document the default behavior prominently |
| Blocked list pagination incomplete (only first page) | LOW | Handle both `contacts.Blocked` and `contacts.BlockedSlice` return types. Re-fetch with proper pagination |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Edit/delete permission matrix | Message management | Test edit/delete in DMs, basic groups, supergroups (admin and non-admin), and channels. Verify each error code is caught and translated |
| GetFullUser privacy restrictions | User profiles | Test with a user whose privacy is set to "contacts only" and "nobody". Verify null fields are flagged as privacy-restricted |
| getMessages channel vs non-channel dispatch | Message get-by-ID | Test `message get` in DMs, groups, and channels. Verify non-existent IDs are reported as "not found" |
| TOON non-uniform data shapes | TOON output format | Benchmark token counts with 100-message real history before implementation. Prototype the encoder with edge cases |
| Block/unblock peer type confusion | Block/unblock | Test blocking a user, a bot, a channel, and a supergroup. Verify all work |
| Contacts dual API path | Contacts management | Test `contacts add @user`, `contacts add 12345`, and `contacts add +1555...`. Verify each routes to the correct API |
| Pin notification side effect | Pin/unpin | Test pin in a group with silent=true (default) and --notify flag. Verify notification state in output |
| Poll option identifier encoding | Polls | Create polls with 2, 5, and 10 options. Create quiz with correct answer. Verify Buffer encoding of option IDs |
| formatData() detection cascade | All new commands | Run every new command with `--human` flag. Verify formatted output, not JSON dump |
| LIST_KEYS for new output types | All new commands | Run every new list command with `--jsonl` and `--fields`. Verify field selection and streaming work |

## Sources

- [Telegram API messages.editMessage](https://core.telegram.org/method/messages.editMessage) -- error codes: MESSAGE_EDIT_TIME_EXPIRED, MESSAGE_AUTHOR_REQUIRED, MESSAGE_NOT_MODIFIED, CHAT_WRITE_FORBIDDEN
- [Telegram API messages.deleteMessages](https://core.telegram.org/method/messages.deleteMessages) -- revoke flag behavior, MESSAGE_DELETE_FORBIDDEN
- [Telegram API channels.deleteMessages](https://core.telegram.org/method/channels.deleteMessages) -- channel-specific deletion
- [Telegram API chatAdminRights](https://core.telegram.org/constructor/chatAdminRights) -- pin_messages, delete_messages, edit_messages flags
- [Telegram API users.getFullUser](https://core.telegram.org/method/users.getFullUser) -- returns UserFull with privacy-restricted fields
- [Telegram API userFull constructor](https://core.telegram.org/constructor/userFull) -- about, profile_photo, fallback_photo, blocked, common_chats_count
- [Telegram API rights](https://core.telegram.org/api/rights) -- admin rights, default banned rights
- [Telegram API Poll](https://core.telegram.org/api/poll) -- poll creation constraints, quiz mode, solution text limits
- [GramJS editMessage docs](https://painor.gitbook.io/gramjs/working-with-messages/messages.editmessage) -- client.editMessage usage
- [GramJS deleteMessages docs](https://painor.gitbook.io/gramjs/working-with-messages/messages.deletemessages) -- revoke default behavior (true = delete for everyone)
- [GramJS Issue #442](https://github.com/gram-js/gramjs/issues/442) -- editMessage/deleteMessage working status
- [GramJS Issue #158](https://github.com/gram-js/gramjs/issues/158) -- getMessages inconsistency with undefined entries
- [GramJS contacts.getContacts docs](https://painor.gitbook.io/gramjs/working-with-contacts-and-top-peers/contacts.getcontacts) -- hash parameter for caching
- [GramJS contacts.addContact docs](https://painor.gitbook.io/gramjs/working-with-contacts-and-top-peers/contacts.addcontact) -- addPhonePrivacyException flag
- [TOON Format Specification](https://github.com/toon-format/toon) -- tabular encoding rules, limitations with non-uniform data
- [TOON Token Savings Analysis](https://blog.logrocket.com/reduce-tokens-with-toon/) -- 30-60% savings on uniform arrays, diminishing on heterogeneous data

---
*Pitfalls research for: Telegram CLI v1.1 features (profiles, contacts, message management, block/unblock, TOON, polls)*
*Researched: 2026-03-12*
