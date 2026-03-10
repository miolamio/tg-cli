# Pitfalls Research

**Domain:** Telegram CLI Client (MTProto via gramjs)
**Researched:** 2026-03-10
**Confidence:** HIGH (verified against Telegram official docs, gramjs GitHub issues, and Telethon/MadelineProto documentation)

## Critical Pitfalls

### Pitfall 1: FloodWait Avalanche from Naive Request Patterns

**What goes wrong:**
Telegram's FLOOD_WAIT_X error returns a mandatory wait period (up to 86,400 seconds / 24 hours) when you exceed undocumented per-method rate limits. Naive CLI implementations that loop through chats, search messages, or fetch history without throttling will trigger escalating flood waits. The wait times compound -- each subsequent violation within a penalty window increases the required wait. A CLI tool used by an AI agent (which naturally makes rapid sequential calls) is especially prone to this.

**Why it happens:**
Telegram's rate limits are per-method, per-account, and dynamically adjusted -- they are intentionally undocumented and change without notice. Developers test with a single chat and 10 messages, then the agent searches across 50 groups and gets a 6-hour ban. Common high-risk operations:
- `messages.search` across multiple chats in rapid succession
- `messages.getHistory` with tight loops
- `contacts.resolveUsername` for username lookups
- `channels.getParticipants` for member lists
- Fetching dialogs with hundreds of chats

**How to avoid:**
1. Set `client.floodSleepThreshold` to a reasonable value (e.g., 120 seconds). GramJS auto-sleeps when FLOOD_WAIT is below this threshold; above it, the error propagates.
2. Implement application-level rate limiting: minimum 1-second delay between any API calls, 3-5 second delay between search/history calls.
3. Build an exponential backoff wrapper around all `client.invoke()` calls.
4. For bulk operations (searching across many chats), implement a queue with configurable concurrency of 1 and inter-request delays.
5. Surface flood wait times to the CLI user/agent with `--json` output so the agent can decide whether to wait or abort.

**Warning signs:**
- Any FLOOD_WAIT error in testing, even short ones (5-10 seconds), indicates you are near the limit.
- Getting FLOOD_WAIT on `getDialogs` during normal usage means your access pattern is too aggressive.
- Multiple rapid CLI invocations from an agent script without delays between them.

**Phase to address:**
Phase 1 (Core infrastructure). The rate-limiting/retry layer must exist before any API method is exposed as a CLI command. Retrofitting rate limiting after commands are built leads to inconsistent behavior.

---

### Pitfall 2: Session File Mismanagement and AUTH_KEY_DUPLICATED

**What goes wrong:**
Telegram enforces strict session uniqueness. If the same session file (auth key) is used by two processes simultaneously, the server returns `AUTH_KEY_DUPLICATED` (error 406), immediately invalidating the session. The user must re-authenticate from scratch. This is catastrophic for a CLI tool where an agent might spawn multiple `npx telegram-cli` processes, or where a session file is shared across environments without proper locking.

**Why it happens:**
- CLI tools are naturally invoked as separate processes. Each invocation loads the session file, connects to Telegram, and the server detects two concurrent connections with the same auth key.
- Session files copied between machines (the stated "session import/export" feature) can be accidentally used in both locations simultaneously.
- gramjs StringSession is a portable string, making it easy to accidentally use in multiple places.
- No file locking is implemented by default in gramjs session storage.

**How to avoid:**
1. Implement a file-based lock (e.g., lockfile/pid file) that prevents concurrent CLI processes from using the same session.
2. For the "connect, execute command, disconnect" pattern: use short-lived connections with `client.connect()` / `client.disconnect()` per invocation, but ensure only one process connects at a time.
3. Document clearly that session export creates a copy -- the original must not be used while the export is active elsewhere.
4. Consider a session daemon architecture: a long-running process holds the Telegram connection, and CLI invocations communicate with it via IPC/socket rather than each connecting independently.

**Warning signs:**
- Users reporting "I have to re-login constantly."
- `AUTH_KEY_DUPLICATED` in error logs.
- Agent scripts that spawn parallel CLI processes for different chats.

**Phase to address:**
Phase 1 (Authentication and session management). The session architecture decision (per-invocation connect vs. daemon) must be made upfront because it affects every subsequent command's implementation.

---

### Pitfall 3: DC Migration Errors Silently Breaking File Operations

**What goes wrong:**
Telegram distributes data across 5 data centers (DCs). A user's account lives on one DC, but files (photos, documents, profile pictures) may be stored on a different DC. When you try to download a file from a DC other than your connection DC, you get `FILE_MIGRATE_X` (303 error) indicating the file is on DC X. If this is not handled, all file downloads from other DCs fail silently or with cryptic errors. Additionally, `PHONE_MIGRATE_X`, `USER_MIGRATE_X`, and `NETWORK_MIGRATE_X` errors require similar handling during authentication and user lookups.

**Why it happens:**
- Developers test with their own account (one DC) and files they uploaded (same DC). Cross-DC scenarios only appear when accessing other users' content, channel media from channels on different DCs, or when the user's own DC changes.
- Manual DC migration (ExportAuthorization/ImportAuthorization) is complex and error-prone -- the gramjs GitHub has multiple open issues about AUTH_BYTES_INVALID errors when attempting manual migration.
- gramjs high-level methods (downloadMedia, downloadFile, downloadProfilePhoto) handle DC migration automatically, but low-level `upload.getFile` calls do not.

**How to avoid:**
1. Always use gramjs high-level download methods (`client.downloadMedia()`, `client.downloadFile()`, `client.downloadProfilePhoto()`) instead of raw API calls. These handle DC migration internally.
2. If you must use low-level calls, use `const sender = await client.getSender(dcId)` to get a sender for the correct DC before calling `upload.getFile`.
3. Wrap all file operations in error handlers that catch 303 errors and retry with the correct DC.
4. Test file downloads with content from channels/groups that are known to be on different DCs than your test account.

**Warning signs:**
- "Could not create sender for DC X" errors in logs.
- File downloads that work for some chats but fail for others.
- Profile photo downloads failing for users on different DCs.

**Phase to address:**
Phase 2 (File operations). But the DC migration error handling infrastructure should be part of the core client wrapper established in Phase 1.

---

### Pitfall 4: Authentication Flow Fragility in Non-Interactive Environments

**What goes wrong:**
Telegram's auth flow has multiple branching paths (phone code via SMS, via Telegram app, via call; optional 2FA password; QR code login; phone number format validation) and strict timeouts (codes expire in ~2-5 minutes). A CLI tool designed for agent use must handle all these paths, but the non-interactive nature of agent invocations makes the interactive code-entry step extremely awkward. If the code expires before the agent processes it, or if the phone number format is wrong, the entire flow must restart -- and too many restarts trigger FLOOD_WAIT on `auth.sendCode`.

**Why it happens:**
- Phone numbers must include full international country code with `+` prefix (e.g., `+14155551234`). Users pass `4155551234` and get `PHONE_NUMBER_INVALID`.
- Auth codes expire in ~2-5 minutes. In an agent workflow, the human may not see the code prompt quickly enough.
- 2FA password is optional and only prompted after the phone code succeeds. If the code path doesn't handle the 2FA callback, auth silently fails or hangs.
- `auth.sendCode` is heavily rate-limited. More than 2-3 attempts in a short window triggers long flood waits.
- QR code login requires displaying a `tg://login?token=BASE64TOKEN` URL that must be scanned within a timeout window.

**How to avoid:**
1. Normalize phone numbers on input: strip spaces, dashes, parentheses, ensure `+` prefix, validate against E.164 format before calling any API.
2. Implement auth as a multi-step interactive command (`telegram-cli login`) that clearly prompts for each step and shows countdown timers for code expiry.
3. Support all auth paths: phone+code, phone+code+2FA, QR code. Let users choose.
4. For agent/non-interactive use: prioritize session reuse over re-authentication. Once authenticated, the session should persist indefinitely (sessions only expire if revoked by the user in Telegram settings).
5. Implement `auth.resendCode` support with the `timeout` field from the response to know when resending is allowed.
6. Never call `auth.sendCode` more than once without waiting for the previous code to expire.

**Warning signs:**
- `PHONE_NUMBER_INVALID` errors in auth flow.
- `PHONE_CODE_EXPIRED` errors from slow code entry.
- FLOOD_WAIT on `auth.sendCode` -- indicates too many auth attempts.
- Auth working in development but failing when used via agent (timing issues).

**Phase to address:**
Phase 1 (Authentication). This must be rock-solid before any other feature works. Design the auth UX for both interactive human use and session-reuse agent use.

---

### Pitfall 5: File Reference Expiration Breaking Media Access

**What goes wrong:**
Telegram uses "file references" -- opaque byte strings attached to photo/document objects -- as temporary access tokens for downloading media. These references expire (typically within hours to days). When a cached file reference expires, any attempt to download the media fails with `FILE_REFERENCE_EXPIRED` or `FILE_REFERENCE_INVALID`. If the CLI tool caches message objects (including their media) and later tries to download the media, the download fails.

**Why it happens:**
- Developers cache message objects for performance (avoiding re-fetching message history).
- File references are embedded in the photo/document constructors but are not permanent.
- The only way to refresh a file reference is to re-fetch the message/object that contained it from the API.
- This is a Telegram-specific concept with no equivalent in most other APIs, so developers don't anticipate it.

**How to avoid:**
1. Never cache file references for later use. Always re-fetch the containing message/object before downloading media.
2. Implement a file reference refresh mechanism: when `FILE_REFERENCE_EXPIRED` is caught, automatically re-fetch the source message and retry the download with the fresh reference.
3. Track the "origin" of each file reference (which message, which chat) so you know what to re-fetch.
4. For the CLI tool's `--json` output: include message IDs and chat IDs rather than raw file references, so agents can always re-request downloads by message reference.

**Warning signs:**
- Downloads that work immediately after fetching messages but fail hours later.
- `FILE_REFERENCE_EXPIRED` errors appearing after the CLI has been running for a while.
- Batch download operations where some files succeed and others fail.

**Phase to address:**
Phase 2 (File operations / Media download). The retry-with-refresh pattern must be built into the download infrastructure.

---

### Pitfall 6: GramJS Connection Lifecycle and Memory Leaks

**What goes wrong:**
GramJS has documented issues with connection management: `client.disconnect()` does not fully clean up the internal update loop, reconnection attempts can create infinite loops that exhaust memory, and unresolved promises after disconnect cause race conditions. For a CLI tool that connects/disconnects on every invocation, these bugs manifest as zombie processes, memory leaks, and hanging CLI commands that never exit.

**Why it happens:**
- gramjs was designed for long-running applications (bots, web apps), not short-lived CLI invocations that connect and disconnect rapidly.
- The internal update loop continues running after `disconnect()` in some versions (GitHub issue #615).
- Reconnection logic with default settings (5 retries, 1-second delay) can cascade into out-of-memory conditions when the server is rate-limiting connections (GitHub issue #303).
- Promises created before disconnect are never resolved/rejected, causing Node.js to hang waiting for them.

**How to avoid:**
1. After `client.disconnect()`, explicitly destroy the client and force-exit the process if it doesn't terminate within a timeout (e.g., `setTimeout(() => process.exit(0), 3000)`).
2. Set `connectionRetries` to a low number (2-3) and increase `retryDelay` (to 3000ms+) to prevent reconnection storms.
3. Disable the update loop if not needed for the current command (`autoReconnect: false` for short-lived read-only operations).
4. Consider the daemon architecture (Pitfall 2) to avoid the connect/disconnect overhead entirely.
5. Monitor for the specific issue pattern: if the process hangs after a command completes, it is likely an unresolved promise or a running update loop.

**Warning signs:**
- CLI commands that complete their output but the process doesn't exit.
- Node.js memory usage climbing over time with repeated invocations.
- "Cannot send requests while disconnected" errors appearing in logs.
- Infinite reconnection attempts visible in debug output.

**Phase to address:**
Phase 1 (Core client wrapper). The connection lifecycle must be bulletproof before exposing any commands. Wrap gramjs in a managed connection layer that handles these edge cases.

---

### Pitfall 7: UTF-16 Entity Offset Miscalculation in Message Formatting

**What goes wrong:**
Telegram's message entities (bold, italic, links, mentions, code blocks) use UTF-16 code unit offsets and lengths, not byte offsets or Unicode code point counts. Emoji and other supplementary plane characters (above U+FFFF) count as 2 UTF-16 code units (surrogate pairs). If your CLI tool formats messages or parses incoming entities using byte-length or code-point-length calculations, all entity positions will be wrong for any message containing emoji -- which is most Telegram messages.

**Why it happens:**
- JavaScript strings are internally UTF-16, which helps, but `String.length` counts UTF-16 code units correctly while spread/iterators count code points. Developers often mix these up.
- When building `--json` output that includes entity information, converting between representations can corrupt offsets.
- Markdown/HTML parsing libraries typically work in code points, not UTF-16 code units.

**How to avoid:**
1. Use JavaScript's `String.length` (which counts UTF-16 code units) for entity offset calculations, not `[...str].length` (which counts code points).
2. When parsing incoming entities for `--json` output, preserve the original UTF-16 offsets and document this in the CLI's output schema.
3. When sending messages with formatting, use gramjs's built-in parse mode support rather than manually constructing entity arrays.
4. Test with emoji-heavy messages: a single emoji like a flag emoji is 2 UTF-16 code units (4 bytes in UTF-8), and this mismatch breaks naive offset calculations.
5. The entity length must not include trailing newlines or whitespace, but subsequent entity offsets must account for that whitespace.

**Warning signs:**
- Formatted text appearing with wrong bold/italic boundaries in messages containing emoji.
- `--json` output where entity offsets don't match the visible text.
- Messages with links where the link covers the wrong text span.

**Phase to address:**
Phase 2 (Message sending with formatting). But the entity handling utilities should be established early since message reading also needs correct entity parsing for `--json` output.

---

### Pitfall 8: Telegram ToS Violation Leading to API Credential or Account Ban

**What goes wrong:**
Telegram's API Terms of Service explicitly prohibit using the API to "train, fine-tune or otherwise engage in the development of artificial intelligence." This project's stated purpose is enabling Claude Code agents to search and extract information from Telegram. If Telegram enforces this clause, the project's `api_id`/`api_hash` could be revoked or user accounts could be banned. Additionally, using Telegram's sample/test API credentials in production triggers `API_ID_PUBLISHED_FLOOD` errors.

**Why it happens:**
- The ToS clause about AI is relatively new and its enforcement scope is unclear -- it may target large-scale scraping rather than individual user tooling.
- Developers use test/example API credentials during development and forget to switch to production credentials.
- Automated access patterns (rapid sequential searches, bulk message retrieval) can trigger anti-abuse systems regardless of ToS compliance.

**How to avoid:**
1. Require users to provide their own `api_id` and `api_hash` (obtained from https://my.telegram.org) rather than shipping credentials with the package. This distributes risk and is the standard practice for MTProto client libraries.
2. Document the ToS restriction clearly so users make informed decisions about their usage.
3. Never include API credentials in the npm package, git repository, or documentation.
4. Implement usage patterns that mimic normal human use (reasonable delays, not scraping entire channels at once).
5. Support the `recover@telegram.org` appeal path in documentation for users who get banned.

**Warning signs:**
- `API_ID_PUBLISHED_FLOOD` errors (using published/test credentials).
- `USER_DEACTIVATED` error on previously working sessions.
- Account access restricted to read-only or limited functionality.

**Phase to address:**
Phase 0 (Project setup / configuration). The credential management approach must be decided before any code is written. Users must supply their own API credentials.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Connect/disconnect per CLI invocation instead of daemon | Simpler architecture, stateless commands | 2-3 second overhead per command, connection lifecycle bugs, session locking complexity | Acceptable for v1 MVP if commands are infrequent; must migrate to daemon for heavy agent use |
| Storing session as StringSession in environment variable | Easy to pass between environments | String contains auth key in base64 -- if env is logged/leaked, full account access is compromised | Only during development. Production should use encrypted file storage |
| Skipping file reference tracking | Faster initial implementation of downloads | Downloads break for cached/old messages, requiring user to re-fetch | Never -- file reference refresh is table stakes for reliable downloads |
| Hardcoding rate limit delays instead of adaptive throttling | Simple to implement | Too slow for normal use, too fast for heavy use; doesn't adapt to Telegram's dynamic limits | Acceptable for v1 with conservative defaults; must become adaptive in v2 |
| Using gramjs high-level methods exclusively | Simpler code, auto-handles DC migration | Less control over pagination, streaming, progress reporting | Acceptable for v1. Low-level calls needed later for streaming large files and progress bars |
| No message cache / re-fetch everything | Always-fresh data, no stale file references | Slower performance, more API calls, more flood wait risk | Acceptable for v1 since CLI commands are discrete operations, not real-time |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| gramjs StringSession | Treating the session string as an opaque token and logging it for debugging | The session string contains the full auth key. Never log, print, or include in error reports. Treat like a password |
| gramjs `client.start()` | Calling `start()` which bundles connect+auth into one call, making it hard to separate the "already authenticated" path from "needs login" | Use `client.connect()` first, check `await client.isUserAuthorized()`, then only run auth flow if needed |
| Telegram test DCs | Using test phone numbers (+99966XYYYY) on production DCs or production numbers on test DCs | Test numbers only work on test DCs (specific IPs). Must call `client.session.setDC()` with test DC addresses. Confirmation codes are the DC number repeated 5-6 times |
| `messages.getHistory` pagination | Using `offset_id` alone for pagination, missing messages when chat has concurrent activity | Use `offset_id` + `offset_date` + `add_offset` for reliable pagination. Always paginate until you get an empty result, not until a count matches |
| `channels.getParticipants` | Expecting to get all members in one call | Limited to 200 per call. Must use search filters (a-z) to enumerate all members in large groups. Even then, Telegram may hide some members |
| Phone number input | Accepting whatever the user types and passing directly to `auth.sendCode` | Normalize: strip all non-digit characters except leading `+`, ensure international format, validate length before API call |
| Message entity parsing | Using a Markdown parser to convert entities, losing Telegram-specific entity types (spoilers, custom emoji, expandable blockquotes) | Preserve original entities in `--json` output. For display, map each entity type explicitly. Do not round-trip through Markdown as it is lossy |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Fetching full dialog list on every invocation | 5-30 second startup time, FLOOD_WAIT on getDialogs | Cache dialog list locally with TTL. Only fetch incrementally (using `offset_date` of last known dialog) | With 100+ dialogs, this becomes the dominant latency source |
| Downloading large files without streaming | Memory exhaustion, timeout on 2GB+ files | Use gramjs streaming download with chunk callbacks. Write chunks to disk as they arrive instead of buffering in memory | Files over ~100MB on typical Node.js heap limits |
| Fetching message history without limits | Single search across a channel with 100K+ messages returns enormous result sets | Always set reasonable `limit` parameters (100-200 messages per call). Implement pagination with clear stop conditions | Any channel with more than a few hundred messages |
| Not reusing the TelegramClient across commands in daemon mode | Creating a new client, connecting, authenticating for every command | If using daemon architecture, keep a single connected client instance and dispatch commands to it | Immediate -- each connection takes 2-3 seconds and counts toward connection rate limits |
| Resolving usernames via API for every mention | FLOOD_WAIT on `contacts.resolveUsername` | Cache username-to-ID mappings locally. Usernames rarely change; a 1-hour TTL cache eliminates most repeat lookups | After ~50 username resolutions in an hour |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Storing session file with world-readable permissions | Any local process/user can steal the session and impersonate the Telegram account | Create session files with 0600 permissions. Warn if file permissions are too open (like SSH does for key files) |
| Including `api_hash` in CLI help output or error messages | API hash is secret and cannot be revoked. Leaked hash + api_id allows anyone to impersonate the application | Never log or display `api_hash`. Mask it in debug output. Store in config file, not command-line arguments (which appear in `ps` output) |
| Passing 2FA password as a command-line argument | Password visible in `ps aux`, shell history, and process accounting | Accept 2FA password via stdin, environment variable, or interactive prompt -- never as a CLI argument |
| Session string in environment variable logged by CI/CD | Full account takeover | Document that CI/CD systems must mask the session env var. Recommend encrypted file storage over env vars for production |
| Not validating SSL/TLS to Telegram servers | Man-in-the-middle attacks on MTProto connection | gramjs handles this, but ensure you never disable certificate validation or set `useWSS: false` in production |
| Shipping `api_id`/`api_hash` in the npm package | All users share one application identity. One user's abuse gets everyone banned | Require users to supply their own credentials. Provide clear setup instructions for https://my.telegram.org |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Auth flow that doesn't explain what's happening | User/agent doesn't know if it's waiting for SMS, app notification, or phone call | Show auth state machine progress: "Code sent via Telegram app. Enter code within 2 minutes. Type 'resend' for SMS." |
| FLOOD_WAIT with no actionable information | Agent gets an error and doesn't know when to retry | Return structured `--json` output: `{"error": "flood_wait", "retry_after_seconds": 300, "method": "messages.search"}` |
| File downloads that silently fail | Agent thinks download succeeded but file is empty or missing | Always verify downloaded file size against expected size. Return explicit success/failure with file path and byte count in `--json` output |
| Message search returning no results without explanation | Agent can't distinguish "no messages match" from "access denied" or "rate limited" | Return result count plus any access/permission context: `{"results": [], "total_count": 0, "access": "ok"}` vs `{"error": "channel_private"}` |
| Peer resolution failures with unhelpful errors | User types a chat name but CLI can't find it | Support multiple resolution strategies: exact username, chat ID, phone number, display name fuzzy match. Show what was tried and what failed |
| Silent truncation of long messages | Agent sends a long message, Telegram truncates at 4096 chars, no warning | Check message length before sending. If over 4096 chars, split into multiple messages or return error with guidance |

## "Looks Done But Isn't" Checklist

- [ ] **Authentication:** Often missing 2FA handling -- verify that login works with accounts that have two-factor authentication enabled
- [ ] **Authentication:** Often missing QR code path -- verify QR code auth works as an alternative to phone+code
- [ ] **Session persistence:** Often missing session validity check on startup -- verify that a saved session reconnects without re-auth after restart
- [ ] **Message history:** Often missing pagination -- verify that fetching history from a channel with 10K+ messages returns all results, not just the first page
- [ ] **File downloads:** Often missing DC migration -- verify that downloading media from channels on different DCs works
- [ ] **File downloads:** Often missing large file support -- verify that a 500MB+ file downloads successfully without memory exhaustion
- [ ] **Message sending:** Often missing entity preservation -- verify that bold/italic/code formatting round-trips correctly through send and receive, especially with emoji in the message
- [ ] **Search:** Often missing cross-chat search -- verify that searching across multiple chats doesn't immediately trigger FLOOD_WAIT
- [ ] **JSON output:** Often missing error cases -- verify that every error condition returns valid JSON, not a stack trace or unstructured text
- [ ] **Graceful shutdown:** Often missing cleanup -- verify that the CLI process exits cleanly within 5 seconds of command completion, with no zombie processes
- [ ] **Chat resolution:** Often missing support for all chat types -- verify that the CLI works with private chats, groups, supergroups, channels, and forum topics

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| FLOOD_WAIT triggered | LOW | Wait the specified seconds (returned in error). No permanent damage. Implement delays to prevent recurrence |
| AUTH_KEY_DUPLICATED | MEDIUM | Session is permanently invalidated. Must delete session file and re-authenticate. Prevent by implementing session locking |
| Account banned for ToS violation | HIGH | Email recover@telegram.org with explanation. May take days/weeks. May not be reversed. Use own api_id to limit blast radius |
| File reference expired | LOW | Re-fetch the source message/object and retry download. Automatic if refresh mechanism is implemented |
| Session file leaked/stolen | HIGH | Immediately terminate all sessions via Telegram app settings. Generate new session. Rotate 2FA password. Cannot revoke api_hash -- monitor for abuse |
| Memory leak from connection issues | LOW | Restart the CLI process. Implement process monitoring and automatic restart. Fix the underlying gramjs lifecycle issue |
| Message entities corrupted | MEDIUM | Must fix the UTF-16 offset calculation code and re-test all formatting. Data already sent with wrong formatting cannot be corrected (only edited) |
| DC migration failure | LOW | Retry using gramjs high-level methods instead of low-level calls. If persistent, check that the client is properly exporting/importing authorization to the target DC |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| ToS / API credential management | Phase 0 (Setup) | Verify: no api_id/api_hash in source code or npm package. Users prompted to provide their own |
| FloodWait avalanche | Phase 1 (Core infrastructure) | Verify: rate limiter wraps all API calls. Test with 20+ rapid sequential search commands -- should throttle, not flood |
| Session mismanagement / AUTH_KEY_DUPLICATED | Phase 1 (Auth/Session) | Verify: two simultaneous CLI processes produce a clear error, not a corrupted session. Session survives process restart |
| Auth flow fragility | Phase 1 (Auth) | Verify: login works with phone+code, phone+code+2FA, and QR code. Phone number normalization handles common formats. Code expiry is handled gracefully |
| GramJS connection lifecycle | Phase 1 (Core client wrapper) | Verify: CLI process exits within 5 seconds of command completion. No memory growth over 50 sequential invocations |
| DC migration in file operations | Phase 2 (Files/Media) | Verify: download media from a channel on a different DC than the user's home DC. Should work transparently |
| File reference expiration | Phase 2 (Files/Media) | Verify: fetch a message, wait 24+ hours, attempt to download its media. Should auto-refresh and succeed |
| UTF-16 entity offsets | Phase 2 (Messages) | Verify: send and receive a message with bold text followed by emoji. Entities in --json output should have correct offsets |

## Sources

- [Telegram API Error Handling](https://core.telegram.org/api/errors) -- official error codes including FLOOD_WAIT, DC migration, auth errors
- [Telegram API File Operations](https://core.telegram.org/api/files) -- upload/download constraints, part sizes, alignment rules
- [Telegram API File References](https://core.telegram.org/api/file-references) -- file reference expiration and refresh mechanism
- [Telegram API Terms of Service](https://core.telegram.org/api/terms) -- AI usage restrictions, api_id requirements
- [Telegram Message Entities](https://core.telegram.org/api/entities) -- UTF-16 offset calculation rules
- [Telegram Security Guidelines](https://core.telegram.org/mtproto/security_guidelines) -- auth key storage best practices
- [GramJS Error Handling](https://painor.gitbook.io/gramjs/getting-started/handling-errors) -- FloodWaitError, floodSleepThreshold
- [GramJS GitHub Issue #356](https://github.com/gram-js/gramjs/issues/356) -- DC migration file download failures
- [GramJS GitHub Issue #303](https://github.com/gram-js/gramjs/issues/303) -- disconnect/reconnect infinite loops
- [GramJS GitHub Issue #615](https://github.com/gram-js/gramjs/issues/615) -- update loop not cleaned up after disconnect
- [GramJS GitHub Issue #243](https://github.com/gram-js/gramjs/issues/243) -- unresolved promises after disconnect
- [GramJS GitHub Issue #665](https://github.com/gram-js/gramjs/issues/665) -- StringSession reconnection failures
- [GramJS GitHub Issue #509](https://github.com/gram-js/gramjs/issues/509) -- StringSession cross-library compatibility
- [MadelineProto FLOOD_WAIT docs](https://docs.madelineproto.xyz/docs/FLOOD_WAIT.html) -- flood wait prevention strategies
- [vysheng/tg Issue #1725](https://github.com/vysheng/tg/issues/1725) -- original telegram-cli abandoned due to MTProto version deprecation
- [vysheng/tg Issue #1189](https://github.com/vysheng/tg/issues/1189) -- maintainer went silent, project stalled
- [Telethon DC Migration Fix](https://github.com/LonamiWebs/Telethon/commit/21ffa2f26b1d0ffe9533431aeee93b7a06b03320) -- DC migration and sequence number handling

---
*Pitfalls research for: Telegram CLI Client (MTProto via gramjs)*
*Researched: 2026-03-10*
