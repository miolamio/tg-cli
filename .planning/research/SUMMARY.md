# Research Summary: Telegram CLI

**Domain:** Telegram CLI client (MTProto user client, agent-first)
**Researched:** 2026-03-10
**Overall confidence:** HIGH

## Executive Summary

Building a full-featured Telegram CLI client in TypeScript/Node.js is feasible and well-supported by the ecosystem. The `telegram` (gramjs) npm package is the only viable high-level MTProto library for JavaScript -- it is actively maintained (last published Feb 2025, 80K+ weekly downloads), based on the battle-tested Python Telethon library, and provides all the building blocks: authentication with 2FA, session management via StringSession, message reading/searching/sending, media upload/download, and full MTProto API access. No serious alternative exists at this abstraction level.

The CLI framework decision is straightforward: Commander.js v14 provides zero-dependency, zero-config subcommand support with the fastest startup time (18ms) of any major option. This matters for an agent-consumed tool that will be invoked repeatedly. The `--json` output requirement is the core architectural decision -- every command must return structured data in a consistent envelope, with human-readable output as the opt-in alternative. This inverts the typical CLI design where JSON is the afterthought.

The most significant technical risk is the module system split: gramjs is CommonJS while modern supporting libraries (ora, conf, @inquirer/prompts) are ESM-only. The solution is to build as ESM and bundle with tsup, which handles CJS-to-ESM conversion via esbuild. The second major risk is Telegram's undocumented rate limiting -- FloodWait errors can ban operations for up to 24 hours, and agent usage patterns (rapid sequential searches across multiple chats) are particularly prone to triggering them. Rate limiting infrastructure must be built into the core client wrapper from day one, not retrofitted.

Session management requires careful design: Telegram invalidates sessions when two processes use the same auth key simultaneously (AUTH_KEY_DUPLICATED), and gramjs has documented issues with connection lifecycle cleanup. The connect-per-invocation pattern (vs. a daemon) is simpler for v1 but requires session file locking and aggressive process exit handling. The Telegram ToS clause about AI usage is a business risk that should be mitigated by requiring users to supply their own API credentials.

## Key Findings

**Stack:** TypeScript + gramjs (`telegram` ^2.26.22) + Commander.js (^14.0.3) + zod + conf + picocolors, built with tsup, targeting Node.js 20+.
**Architecture:** Four-layer design (CLI commands -> Services -> Client wrapper -> gramjs) with a dual-output formatter (JSON/human) that cross-cuts all commands. Lazy client initialization to keep non-Telegram commands fast.
**Critical pitfall:** FloodWait avalanche from agent-style rapid sequential API calls. Must build rate limiting into the client wrapper before exposing any commands.

## Implications for Roadmap

Based on research, suggested phase structure:

1. **Foundation & Auth** - Project setup, build pipeline, config management, authentication flow with 2FA, session persistence and locking
   - Addresses: Login, session persistence, `--json` output envelope, config management
   - Avoids: FloodWait (rate limiter built here), AUTH_KEY_DUPLICATED (session locking built here), connection lifecycle issues (client wrapper built here)

2. **Core Read Operations** - List chats, read message history, search messages (single-chat and global), chat info, peer resolution
   - Addresses: The primary agent use case from PROJECT.md ("search across Telegram groups")
   - Avoids: Rate limit issues during search (uses Phase 1 infrastructure)

3. **Core Write Operations** - Send messages, reply, forward, join/leave groups, reactions
   - Addresses: Agent interaction capabilities (sending findings, asking follow-ups)
   - Avoids: Message entity corruption (UTF-16 handling built here)

4. **Media & Files** - Download media/files, upload files, file type filtering in search
   - Addresses: Document/image extraction from chats
   - Avoids: DC migration failures (high-level gramjs methods), file reference expiration (auto-refresh)

5. **Advanced Features & Polish** - Forum/topic support, batch multi-chat search, JSONL streaming, session export/import, configurable output fields, member list extraction
   - Addresses: Power user and completeness features
   - Avoids: Scope creep in earlier phases

**Phase ordering rationale:**
- Auth must come first because every other feature depends on it, and the client wrapper with rate limiting must be proven before any API calls are made.
- Read operations before write operations because the core value proposition is "search and extract information" -- sending is secondary.
- Media after messaging because media adds DC migration complexity and file I/O concerns that are orthogonal to the message pipeline.
- Advanced features last because they build on proven patterns from earlier phases and are not required for initial validation.

**Research flags for phases:**
- Phase 1: Needs careful implementation research on gramjs connection lifecycle bugs (disconnect not cleaning up, zombie processes). Review gramjs issues #615, #303, #243.
- Phase 2: May need deeper research on pagination edge cases (`messages.getHistory` with concurrent activity) and `messages.searchGlobal` behavior across different chat types.
- Phase 4: Likely needs research on large file streaming (>100MB) since gramjs high-level methods buffer in memory. May need low-level `upload.getFile` with chunking for large downloads.
- Phase 5: Forum topic API is relatively new. May need to verify gramjs support level for forum-related methods.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All versions verified via npm registry on 2026-03-10. gramjs is the clear choice -- no viable alternative at this abstraction level. Commander.js is the obvious CLI framework for this use case. |
| Features | HIGH | Feature landscape mapped against 5 competitor tools. Table stakes, differentiators, and anti-features clearly delineated. MVP scope aligned with PROJECT.md core value proposition. |
| Architecture | HIGH | Four-layer pattern is standard for CLI tools with external API dependencies. Dual-output formatter is well-documented in "12 Factor CLI Apps" and similar resources. Build order derived from dependency analysis. |
| Pitfalls | HIGH | Critical pitfalls verified against gramjs GitHub issues, Telegram official API docs, and Telethon/MadelineProto documentation. FloodWait and session management risks are well-documented across the ecosystem. |
| Module system | HIGH | CJS/ESM split verified via `npm view` for all packages. tsup bundling solution is standard practice for mixed-module projects. |
| Telegram ToS risk | MEDIUM | The AI usage clause exists in official ToS but enforcement scope is unclear. Mitigated by requiring user-supplied credentials. |

## Gaps to Address

- **gramjs disconnect behavior**: Need to test the specific disconnect/cleanup issue in the version we ship (^2.26.22) before finalizing the connection lifecycle strategy. The referenced GitHub issues may be resolved in recent versions.
- **npx cold-start performance**: Need to measure actual cold-start time for `npx telegram-cli` with all dependencies. If too slow, may need to explore single-file bundling despite the size tradeoff.
- **Session locking implementation**: Need to evaluate file-locking libraries (`proper-lockfile`, `lockfile`) vs. pid-file approach vs. named pipes/sockets for preventing concurrent session use.
- **Telegram test account setup**: Need to document and test the Telegram test DC flow (test phone numbers +99966XYYYY on test DCs) for CI/CD testing without real accounts.
- **gramjs forum topic support**: Verify that gramjs exposes the necessary methods for forum topic operations (`channels.getForumTopics`, etc.) before committing to forum support in Phase 5.
