# Stack Research

**Domain:** Telegram CLI client (MTProto user client, not Bot API)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| TypeScript | ^5.9 | Language | Required by project constraints. gramjs ships TypeScript definitions; commander has built-in types. Type safety is critical for the complex Telegram API surface (hundreds of message types, media variants, etc.). |
| Node.js | >=20 LTS | Runtime | gramjs targets Node.js. Node 20 is current LTS with stable ESM interop, native `crypto`, and `node:fs/promises`. Node 22 LTS also acceptable. |
| `telegram` (gramjs) | ^2.26.22 | MTProto client | The only actively maintained, high-level MTProto library for JS/TS. 80K+ weekly npm downloads. Based on Python's Telethon (battle-tested protocol implementation). Provides StringSession for portable auth, full MTProto API coverage, media upload/download, and 2FA support. Last published Feb 2025 -- active community forks keep it current. |
| Commander.js | ^14.0.3 | CLI framework | Zero dependencies. 500M+ weekly downloads. CJS module type (matches gramjs, avoids ESM interop issues). v14 supports deeply nested subcommands (ideal for `telegram-cli chat list`, `telegram-cli message search` patterns). TypeScript definitions included. Fastest startup (18ms vs 35ms yargs, 85ms oclif). For a CLI that Claude Code agents call thousands of times, startup time matters. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@inquirer/prompts` | ^8.3.0 | Interactive prompts | Auth flow only -- phone number, verification code, 2FA password input. Modern ESM rewrite of inquirer with tree-shakeable individual prompt imports. |
| `zod` | ^4.3.6 | Schema validation | Validate config files, API responses, CLI option shapes. Critical for `--json` output contracts -- define schemas once, use for both validation and TypeScript types. |
| `conf` | ^15.1.0 | Config management | Stores api_id, api_hash, default output format, session file paths. XDG-compliant config directory, atomic writes, schema validation support. |
| `picocolors` | ^1.1.1 | Terminal colors | Human-readable output colorization (errors red, success green, etc.). Zero dependencies, 3x smaller than chalk, works in both CJS and ESM contexts. No ESM-only headaches. |
| `ora` | ^9.3.0 | Loading spinners | Long-running operations (auth flow, media upload/download, large searches). ESM-only but fine since we build with tsup which handles interop. Only used in human-readable mode, never in `--json` mode. |
| `socks` | ^2.8 | SOCKS proxy | Already a gramjs dependency. Exposes proxy support for users behind restrictive networks. No additional install needed. |

### Database / Storage

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| File-based StringSession | (gramjs built-in) | Session persistence | gramjs StringSession.save() returns an encrypted string that can be written to `~/.config/telegram-cli/session`. No database needed. Portable -- can be exported/imported as a single string. |
| Node.js `node:crypto` | (built-in) | Session encryption at rest | Encrypt session strings on disk with AES-256-GCM using a user-provided passphrase or machine-derived key. No native modules needed. |
| `conf` | ^15.1.0 | Config storage | JSON config file at XDG config path. Handles api_id/api_hash, preferences, session metadata. |

### Build & Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `tsup` | ^8.5.1 | Build/bundle | esbuild-based bundler. Outputs CJS for npm distribution with `"bin"` entry. Handles ESM dependencies (ora, conf) by bundling them. Tree-shakes unused code. Single config file. |
| `tsx` | ^4.21.0 | Dev runner | TypeScript execution without compilation for development. Drop-in `node` replacement. |
| `vitest` | ^4.0.18 | Testing | Fast, TypeScript-native test runner. Compatible with tsup build pipeline. Mock support for gramjs client in tests. |
| `eslint` | ^10.0.3 | Linting | Flat config format (eslint.config.ts). With `typescript-eslint` ^8.57 for type-aware rules. |
| `typescript-eslint` | ^8.57.0 | TS lint rules | Type-checked linting catches real bugs (no floating promises, no misused awaits). |

## Installation

```bash
# Core dependencies
npm install telegram commander zod conf picocolors

# Interactive prompts (for auth flow)
npm install @inquirer/prompts

# Spinner for human-readable output
npm install ora

# Dev dependencies
npm install -D typescript tsup tsx vitest eslint @eslint/js typescript-eslint @types/node
```

## Module System Strategy

**This is the single most important architectural decision for this stack.**

gramjs (`telegram` package) is **CommonJS**. Several modern libraries (chalk 5, ora 9, conf 15, @inquirer/prompts 8) are **ESM-only**.

**Solution: Build as ESM, bundle with tsup.**

```jsonc
// package.json
{
  "type": "module",
  "bin": { "telegram-cli": "./dist/cli.js" },
  "exports": { ".": "./dist/index.js" }
}
```

```typescript
// tsup.config.ts
export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  splitting: false,
  clean: true,
  // gramjs CJS gets transpiled to ESM by esbuild
  // ESM-only deps (ora, conf) work natively
});
```

tsup (esbuild under the hood) handles CJS-to-ESM conversion of gramjs seamlessly. This gives us clean ESM output and compatibility with all dependencies regardless of their module format.

**Alternative considered:** Staying CJS and using dynamic `import()` for ESM deps. Rejected because it litters the codebase with async imports and creates confusing code paths.

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| gramjs (`telegram`) | `mtproto-core` | Never for this project. mtproto-core is low-level -- you must construct every API call manually. gramjs provides high-level methods (sendMessage, getMessages, downloadMedia) that save months of work. mtproto-core last published Dec 2023. |
| gramjs (`telegram`) | `mtproto-nodejs-client` | If you need minimal dependencies and are comfortable with low-level MTProto. Published Nov 2025 (v8.0.1), actively maintained, but lacks gramjs's high-level abstractions. You would need to implement message parsing, media handling, and session management yourself. |
| gramjs (`telegram`) | `tgsnake` | If gramjs becomes truly abandoned. tgsnake is a newer MTProto framework but has much smaller community (fewer npm downloads, fewer GitHub stars). Higher risk of encountering undocumented edge cases. |
| Commander.js | Yargs | If you need built-in shell completion and typo suggestions. Yargs has 7 dependencies (vs 0 for Commander) and 2x slower startup. The completion features are unnecessary for agent-consumed CLI tools. |
| Commander.js | Oclif | If building a multi-package CLI framework with plugins. Oclif has ~30 dependencies, 85ms startup, and heavy scaffolding. Extreme overkill for a single-purpose CLI. |
| Commander.js | `clipanion` | If building a Yarn-style tool where commands are class-based. Good TypeScript support but smaller ecosystem and less documentation than Commander. |
| picocolors | chalk 5 | If you need 256-color/truecolor support or tagged template literals. chalk 5 is ESM-only (fine with our tsup setup) but 3x heavier. picocolors covers all the color needs of a CLI tool. |
| picocolors | `ansis` | If you need chalk-like chaining API with CJS+ESM dual support. ansis (v4.2) is a good middle ground but picocolors is more widely adopted. |
| `conf` | `cosmiconfig` | If you need to support multiple config file formats (YAML, TOML, etc.). Unnecessary complexity for this project -- JSON config is sufficient. |
| File-based session | `keytar` (system keychain) | Never. keytar is archived (atom/node-keytar), requires native compilation (fails in many CI/container environments), and makes `npx` usage impossible due to prebuild requirements. |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| `telegram-mtproto` | Last published October 2017. Completely abandoned. Will not work with current Telegram API. | gramjs (`telegram`) |
| `telegram-mt-node` | Ancient, unmaintained, incomplete MTProto implementation. | gramjs (`telegram`) |
| `chalk` 5.x directly | ESM-only, heavyweight for our needs. If bundling anyway, the ESM issue is moot, but picocolors is still smaller and faster. | `picocolors` for basic colors |
| `keytar` | Archived. Requires native compilation. Breaks `npx` zero-install story. Pulls in node-gyp. | File-based encrypted session with `node:crypto` |
| `inquirer` (legacy) | Old callback-based API, monolithic package. | `@inquirer/prompts` (modern, tree-shakeable) |
| `vorpal` | Abandoned CLI framework, last published 2016. | Commander.js |
| `caporal` | Abandoned CLI framework. | Commander.js |
| Telegram Bot API (`node-telegram-bot-api`, `telegraf`, `grammy`) | These are Bot API wrappers. This project is a user client via MTProto. Bot API cannot: search messages across groups as a user, access message history, join channels as a user, etc. Fundamentally different protocol. | gramjs (`telegram`) for MTProto user client |
| `oclif` | 30+ dependencies, 85ms startup, generates massive boilerplate. Designed for enterprise multi-plugin CLIs like Heroku/Salesforce. Absurd overkill for a single-purpose tool. | Commander.js |

## Stack Patterns by Variant

**If targeting `npx` zero-install (primary use case):**
- Bundle everything with tsup into a single output file
- No native dependencies (rules out keytar, better-sqlite3, etc.)
- Session stored as encrypted file, not system keychain
- `#!/usr/bin/env node` shebang in output

**If adding a programmatic API later:**
- Separate entry points: `src/cli.ts` (CLI) and `src/index.ts` (library)
- tsup can output both with `entry: ["src/cli.ts", "src/index.ts"]`
- Library export skips Commander, exposes typed functions directly

**If `--json` output is the primary mode (agent consumption):**
- All commands return typed objects; JSON serialization happens at the output layer only
- Human-readable formatting (colors, tables, spinners) is opt-in, not default
- Errors must also be JSON-structured: `{ "error": true, "code": "AUTH_FAILED", "message": "..." }`
- Exit codes must be meaningful (0 success, 1 general error, 2 auth error, etc.)

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `telegram@^2.26` | Node.js 16+ | Uses `node-localstorage`, `websocket`, `socks`. All pure JS or have prebuilds. |
| `commander@^14` | Node.js 18+ | v14 dropped Node 16 support. |
| `@inquirer/prompts@^8` | Node.js 20+ | ESM-only. Requires modern Node. |
| `conf@^15` | Node.js 20+ | ESM-only. Uses `env-paths` for XDG dirs. |
| `ora@^9` | Node.js 20+ | ESM-only. |
| `tsup@^8` | TypeScript 5.x | esbuild-based. Fast builds. |
| `vitest@^4` | TypeScript 5.x, Node.js 20+ | Requires modern Node for ESM test files. |

**Minimum Node.js version: 20 LTS** -- dictated by ESM-only dependencies (@inquirer/prompts, conf, ora). This is fine; Node 20 LTS is supported until April 2026.

## gramjs-Specific Notes

### Session Types
- **StringSession**: Recommended. Portable string you can save/load. Call `client.session.save()` after auth, store the result, pass it back to `new StringSession(savedString)` on next run.
- **StoreSession**: Alpha quality per gramjs docs. Automatically persists to files via `node-localstorage`. Avoid -- we want explicit control over session file location and encryption.

### Authentication Flow
```typescript
await client.start({
  phoneNumber: async () => /* prompt or read from config */,
  phoneCode: async () => /* prompt for SMS/Telegram code */,
  password: async () => /* prompt for 2FA password */,
  onError: (err) => /* handle gracefully */,
});
```
Each callback is async, allowing interactive prompts during `telegram-cli login`.

### API Credentials
Users must obtain `api_id` and `api_hash` from https://my.telegram.org. These are stored in the config file via `conf`. They are NOT secrets in the traditional sense (Telegram's docs say they are "not secret"), but should still be kept out of version control.

### Known gramjs Quirks
- The npm package name is `telegram`, not `gramjs` -- confusing but correct.
- `StringSession("")` (empty string) starts a fresh session; `StringSession(saved)` restores one.
- gramjs uses `big-integer` for Telegram's large numeric IDs. When serializing to JSON, these must be converted to strings to avoid JavaScript number precision loss.
- Media download returns Buffer objects. For `--json` output, encode as base64 or return file paths.
- gramjs has 284 open issues on GitHub. Most are edge cases. Core functionality (auth, messages, media) is stable.

## Sources

- [gramjs GitHub](https://github.com/gram-js/gramjs) -- stars, issues, last commit, fork activity (HIGH confidence)
- [gramjs npm `telegram`](https://www.npmjs.com/package/telegram) -- version 2.26.22, published Feb 2025, 80K+ weekly downloads (HIGH confidence)
- [gramjs docs](https://gram.js.org/) -- authentication flow, session management, API usage (HIGH confidence)
- [gramjs auth docs](https://gram.js.org/getting-started/authorization) -- StringSession, 2FA callback structure (HIGH confidence)
- [Commander.js GitHub](https://github.com/tj/commander.js) -- v14.0.3, zero deps, CJS, subcommand support (HIGH confidence)
- [npm registry](https://www.npmjs.com/) -- all version numbers verified via `npm view` on 2026-03-10 (HIGH confidence)
- [Chalk ESM migration issue](https://github.com/chalk/chalk/issues/543) -- CJS alternatives discussion (MEDIUM confidence)
- [mtproto-core](https://mtproto-core.js.org/) -- last published Dec 2023, low-level alternative (HIGH confidence)
- [telegram-mtproto npm](https://www.npmjs.com/package/telegram-mtproto) -- last published Oct 2017, confirmed abandoned (HIGH confidence)
- [mtproto-nodejs-client npm](https://www.npmjs.com/package/mtproto-nodejs-client) -- v8.0.1, Nov 2025, active but low-level (MEDIUM confidence)
- [Grizzly Peak CLI comparison](https://www.grizzlypeaksoftware.com/library/cli-framework-comparison-commander-vs-yargs-vs-oclif-utxlf9v9) -- startup benchmarks, dependency counts (MEDIUM confidence)

---
*Stack research for: Telegram CLI client (MTProto, TypeScript/Node.js)*
*Researched: 2026-03-10*
