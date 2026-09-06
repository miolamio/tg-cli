# AGENTS.md

`@miolamio/tg-cli` — user-account Telegram CLI (MTProto / gramjs). Binary: `tg`. JSON-first, agent-scriptable. Node >= 20, ESM only.

## Stack

- TypeScript 5.9, strict, `module`/`moduleResolution`: Node16
- Commander 14, `telegram` (gramjs), `conf`, `proper-lockfile`, `zod`, `@toon-format/toon`, `picocolors`
- tsup (ESM, Node 20 target), vitest (globals)
- No ESLint / Prettier

## Commands

```bash
npm run build                                 # dist/bin/tg.js + dist/lib/daemon/entry.js + dist/index.js
npm run dev                                   # tsup --watch
npm test                                      # vitest run (tests/**/*.test.ts)
npx vitest run tests/unit/<file>.test.ts      # one file
npm run test:coverage
npm run typecheck                             # tsc --noEmit
```

`tests/integration/` rebuilds the binary before asserting `--help` / `--version`.

## Layout

| Path | Role |
|---|---|
| `src/bin/tg.ts` | CLI entry, global flags, `preAction`, command groups |
| `src/commands/<domain>/` | `index.ts` (Commander group) + one file per subcommand action |
| `src/lib/` | client, session, output, serialize, peer, errors, daemon |
| `src/lib/types.ts` | all output DTOs |
| `src/index.ts` | library re-exports |
| `tests/unit/` | one test file per command/lib; mocks gramjs, never live Telegram |

Domains: `auth`, `session`, `chat`, `message`, `media`, `user`, `contact`, `daemon`, `completion`.

## New command

1. `export async function fooAction(this: Command, ...args): Promise<void>`
2. `const opts = this.optsWithGlobals() as GlobalOptions & { ... }`
3. Authenticated work: `withAuth(opts, async (client) => { ... })` — except `auth/*` and `session/*` (custom flows)
4. Peers via `resolveEntity`; gramjs objects via `serialize*` / `bigIntToString`
5. Result: `outputSuccess(dto)` or `outputError(message, ErrorCode.X)`
6. Register in domain `index.ts`; a new group also in `src/bin/tg.ts` + `helpGroup(...)`
7. DTO in `types.ts`; human renderer in `format.ts` if the shape is new; code in `error-codes.ts`
8. Unit test using the existing mock set: `telegram`, `output`, `SessionStore`, `withClient`/`withAuth`, `peer`

ESM imports keep `.js` extensions. Match neighboring JSDoc.

## Conventions

- **stdout is data.** `outputSuccess` / `outputError` only. Status goes to stderr via `logStatus`.
- **JSON default:** `{ ok: true, data }` / `{ ok: false, error, code }`. `--jsonl` = one object per line, no envelope (lists). `--toon` wraps the envelope. `--fields` is dot-notation. `--toon`/`--jsonl`/`--human` are mutually exclusive (enforced in `preAction`).
- **IDs are strings** (`bigIntToString` — gramjs BigInteger JSON-serializes to `{}`). Dates are ISO 8601.
- **Client lifecycle:** `withClient` / `withAuth`. Cleanup is `client.destroy()`, never `disconnect()` (zombie `_updateLoop`). Default timeout 120s.
- **Session:** `SessionStore.withLock(profile, ...)` for the whole operation. Files: `<configDir>/sessions/<profile>.session`.
- **Credentials:** `TG_API_ID` + `TG_API_HASH` beat config. Presets: `tg auth login --client desktop` (see `presets.ts`). Profile names: `[a-zA-Z0-9_-]{1,64}` (`validateProfile`).
- **tsup:** entries `src/bin/tg.ts`, `src/lib/daemon/entry.ts`, `src/index.ts`. `telegram` is `external`. Shebang banner only on `dist/bin/tg.js`.
- **Daemon:** NDJSON JSON-RPC 2.0 over a Unix socket. `--daemon` routes known chat/message/media/user/contact commands through `execute` on the existing client; no auto-start or direct fallback. `message watch` uses `subscribe`. Auth/session and arbitrary library callbacks cannot be proxied. `--idle-timeout 0` keeps the daemon running until stopped. API command output/client/stdin/cwd are isolated with `execution-context.ts`; never mutate process output modes, exitCode or cwd for a daemon request. Cancellation blocks further SDK work; never destroy the shared client per request or release its lease before outstanding work/teardown settle.
- Tests mock `TelegramClient` / `Api` / session / output. Copy `tests/unit/message-send.test.ts` rather than inventing a new harness.

## Do not change

These are load-bearing for agents, sessions, and process lifetime:

- stdout envelope / JSONL-without-envelope / TOON wrapping / `ok`+`code` error shape
- `destroy()` vs `disconnect()`, `withLock` around session I/O, tsup `external: ['telegram']`
- wrapping `auth/{login,logout,status}` or `session/{export,import}` in `withAuth`
- binary names `tg` / `telegram-cli`, Node 20 floor, ESM-only
- daemon wire format (JSON-RPC 2.0, newline-delimited) without a compatible bump
- logging or printing session strings; committing `.env`, credentials, or `*.session`
- rewriting the client onto Bot API
- editing `dist/`, `coverage/`, or generated artifacts
