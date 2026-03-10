# Phase 1: Foundation & Auth - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Project scaffolding, npm package setup (`@miolamio/tg-cli`), Telegram authentication flow (phone + code + 2FA), session persistence and management, JSON output infrastructure with consistent envelope, rate limiting wrapper, and connection lifecycle management. This phase delivers the binary `tg` with auth and session commands — no messaging features yet.

</domain>

<decisions>
## Implementation Decisions

### Command Naming & Structure
- Binary name: `tg`
- npm package: `@miolamio/tg-cli` (scoped under @miolamio)
- Subcommand style: Grouped by noun — `tg auth login`, `tg chat list`, `tg message send`, `tg media download`
- Command groups: `auth`, `chat`, `message`, `media`, `session`
- Short + long flag aliases: `-c/--chat`, `-l/--limit`, `-q/--query`, `-f/--filter`, `-o/--output`, etc.
- Command aliases for frequent operations: `tg s` = `tg message search`, `tg ls` = `tg chat list`
- Help output: `tg --help` groups commands by category (Auth, Chat, Message, Media) with descriptions
- Version: `tg --version` shows package version + gramjs version (no `tg version` subcommand)
- Peer targeting: Explicit flags — `--username @foo`, `--id 12345`, `--phone +7xxx`
- Error output: Match output mode — JSON errors in JSON mode, human-readable in human mode
- Global flags on every command:
  - `--json` / `--human` — output mode toggle (JSON is default)
  - `--verbose` / `-v` — show extra info (connection status, timing, API calls)
  - `--config` / `--profile` — specify config file or named profile
  - `--quiet` / `-q` — suppress all stderr output

### API Credentials
- Priority chain: env vars (`TG_API_ID`, `TG_API_HASH`) > config file > interactive prompt on first run
- No bundled default credentials — user must obtain from my.telegram.org
- Clear error message if credentials missing: link to my.telegram.org with instructions

### Session Management
- Multiple accounts supported via named profiles: `tg --profile work auth login`
- Default profile name: `default`
- Session export: plain StringSession string to stdout by default; `--json` wraps with metadata `{ session, phone, created }`
- Session import: `tg session import <string>` or pipe from stdin

### Connection Model
- Connect-per-command (stateless): each `tg` invocation connects, executes, disconnects
- Measure real latency in practice — daemon mode considered for future if startup overhead is a problem
- No background process or IPC in v1

### Claude's Discretion
- Config file location (XDG `~/.config/tg-cli/` recommended)
- Session storage format and file structure on disk
- Connection cleanup strategy (research flagged gramjs zombie process bugs — Claude should implement safest approach with timeout)
- Exact rate limiting strategy and backoff algorithm
- Session file locking mechanism

</decisions>

<specifics>
## Specific Ideas

- Agent-first design: JSON is the default output, not an opt-in flag. Humans opt into `--human` mode.
- The CLI will be consumed primarily by Claude Code skills — fast, structured, pipe-friendly
- Aliases should make power users happy but not confuse agents (agents use full command paths)

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes all patterns

### Integration Points
- gramjs (`telegram` ^2.26.22) — MTProto client library
- Commander.js (^14.0.3) — CLI framework
- tsup — bundler for CJS/ESM compatibility
- zod — input validation
- conf — config file management
- picocolors — terminal colors

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-auth*
*Context gathered: 2026-03-10*
