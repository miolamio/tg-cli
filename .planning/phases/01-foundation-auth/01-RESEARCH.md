# Phase 1: Foundation & Auth - Research

**Researched:** 2026-03-10
**Domain:** TypeScript CLI scaffolding, Telegram MTProto authentication, session management, JSON output infrastructure
**Confidence:** HIGH

## Summary

Phase 1 is a greenfield build: no code, no package.json, no tests exist yet. The phase establishes the entire project skeleton -- npm package configuration, TypeScript build pipeline, CLI command framework, Telegram authentication (phone + code + 2FA), session persistence/portability, JSON output envelope, rate limiting wrapper, and connection lifecycle management.

The core libraries are well-established: gramjs (`telegram` ^2.26.22) provides MTProto client capabilities with StringSession for portable auth, Commander.js (^14.0.3) handles CLI command routing with nested subcommand support, and tsup bundles TypeScript to executable CLI output. The main technical risks are gramjs's documented connection cleanup bugs (zombie processes after `disconnect()`) and the need for session file locking to prevent `AUTH_KEY_DUPLICATED` errors from concurrent CLI invocations.

**Primary recommendation:** Build as ESM TypeScript project (`"type": "module"` in package.json) since `conf` (config management) is ESM-only. Use `client.destroy()` instead of `client.disconnect()` for connection cleanup. Implement session file locking with `proper-lockfile` from day one. Use Node.js built-in `readline/promises` for interactive auth prompts -- no need for the `input` package from gramjs examples.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Binary name: `tg`
- npm package: `@miolamio/tg-cli` (scoped under @miolamio)
- Subcommand style: Grouped by noun -- `tg auth login`, `tg chat list`, `tg message send`, `tg media download`
- Command groups: `auth`, `chat`, `message`, `media`, `session`
- Short + long flag aliases: `-c/--chat`, `-l/--limit`, `-q/--query`, `-f/--filter`, `-o/--output`, etc.
- Command aliases for frequent operations: `tg s` = `tg message search`, `tg ls` = `tg chat list`
- Help output: `tg --help` groups commands by category (Auth, Chat, Message, Media) with descriptions
- Version: `tg --version` shows package version + gramjs version (no `tg version` subcommand)
- Peer targeting: Explicit flags -- `--username @foo`, `--id 12345`, `--phone +7xxx`
- Error output: Match output mode -- JSON errors in JSON mode, human-readable in human mode
- Global flags on every command: `--json` / `--human`, `--verbose` / `-v`, `--config` / `--profile`, `--quiet` / `-q`
- API credentials priority: env vars (`TG_API_ID`, `TG_API_HASH`) > config file > interactive prompt on first run
- No bundled default credentials -- user must obtain from my.telegram.org
- Multiple accounts via named profiles: `tg --profile work auth login`
- Default profile name: `default`
- Session export: plain StringSession string to stdout; `--json` wraps with metadata `{ session, phone, created }`
- Session import: `tg session import <string>` or pipe from stdin
- Connect-per-command model: each invocation connects, executes, disconnects
- No background process or IPC in v1
- Agent-first design: JSON is the default output, not an opt-in flag
- Core libraries: gramjs (`telegram` ^2.26.22), Commander.js (^14.0.3), tsup, zod, conf, picocolors

### Claude's Discretion
- Config file location (XDG `~/.config/tg-cli/` recommended)
- Session storage format and file structure on disk
- Connection cleanup strategy (research flagged gramjs zombie process bugs -- Claude should implement safest approach with timeout)
- Exact rate limiting strategy and backoff algorithm
- Session file locking mechanism

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| INFRA-01 | Package installable via `npm install -g telegram-cli` and runnable via `npx telegram-cli` | tsup bundler config, package.json bin field, shebang handling |
| INFRA-02 | Built-in rate limiting wrapper to handle Telegram FloodWait errors automatically | gramjs floodSleepThreshold (default 60s), custom wrapper for additional protection |
| INFRA-03 | Session file locking to prevent AUTH_KEY_DUPLICATED from concurrent access | proper-lockfile package, mkdir-based atomic locking |
| INFRA-04 | User supplies their own Telegram API credentials via config or env vars | conf package for config, env var reading, zod validation |
| INFRA-05 | Graceful connection lifecycle management (connect, disconnect, error recovery) | gramjs client.destroy() vs disconnect(), timeout wrapper, process signal handling |
| INFRA-06 | Configuration file for persistent settings | conf package with XDG paths, schema validation |
| AUTH-01 | User can log in with phone number and SMS/Telegram code | gramjs client.start() callbacks, readline/promises for interactive input |
| AUTH-02 | User can complete 2FA password prompt during login | gramjs password callback with hint parameter |
| AUTH-03 | User session persists to disk and is reused across CLI invocations | StringSession.save(), file-based persistence via conf or direct file write |
| AUTH-04 | User can export session as portable string (`tg session export`) | StringSession.save() returns base64 string |
| AUTH-05 | User can import session string to restore auth (`tg session import <string>`) | new StringSession(savedString) constructor |
| AUTH-06 | User can check current auth status (`tg auth status`) | client.connect() + client.checkAuthorization() pattern |
| AUTH-07 | User can log out and destroy session (`tg auth logout`) | client.invoke(new Api.auth.LogOut()), delete session file |
| OUT-01 | Every command supports `--json` flag for structured JSON output | Commander.js global option, output formatter utility |
| OUT-02 | JSON output uses consistent envelope: `{ ok: bool, data: {...}, error?: string }` | Custom output formatter with zod schema |
| OUT-06 | stderr for progress/status/errors; stdout for data only | console.error for status, process.stdout.write for data |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `telegram` (gramjs) | ^2.26.22 | MTProto Telegram client | Only mature JS MTProto library; StringSession for portable auth |
| `commander` | ^14.0.3 | CLI command framework | 209KB, zero deps, TypeScript built-in, nested subcommands via addCommand |
| `tsup` | ^8.5.1 | TypeScript bundler | esbuild-based, auto-shebang for CLI bins, ESM+CJS output |
| `zod` | ^4.3.6 | Input/config validation | Zero deps, TypeScript-first, runtime validation with type inference |
| `conf` | ^15.1.0 | Config file management | Atomic writes, XDG paths, schema validation, migrations; ESM-only |
| `picocolors` | ^1.1.1 | Terminal colors | 2.6KB, fastest, zero deps, CJS+ESM |
| `proper-lockfile` | ^4.1.2 | File locking | mkdir-based atomic locks, works on network FS, stale lock detection |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `typescript` | ^5.7 | Type checking | Dev dependency, type checking only (tsup bundles via esbuild) |
| `vitest` | ^4.0.18 | Test framework | Unit and integration tests, TypeScript-native, fast |
| `@types/node` | ^22 | Node.js types | Dev dependency for TypeScript |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `conf` | Direct `fs.writeFileSync` | conf handles atomic writes, XDG paths, schema validation, migrations -- don't hand-roll |
| `proper-lockfile` | `lockfile` npm package | `lockfile` uses O_EXCL which fails on network FS; proper-lockfile uses mkdir (atomic everywhere) |
| `input` (gramjs example) | `node:readline/promises` | Node built-in, no extra dependency, promise-based, TypeScript-typed |
| `tsup` | `esbuild` directly | tsup adds DTS generation, watch mode, multiple entry points with zero config |

**Installation:**
```bash
# Production dependencies
npm install telegram commander zod conf picocolors proper-lockfile

# Dev dependencies
npm install -D typescript tsup vitest @types/node
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  bin/
    tg.ts                    # Entry point with shebang, creates program, parses argv
  commands/
    auth/
      index.ts               # Commander auth command group (login, status, logout)
      login.ts               # Login action handler
      status.ts              # Auth status action handler
      logout.ts              # Logout action handler
    session/
      index.ts               # Commander session command group (export, import)
      export.ts              # Export action handler
      import.ts              # Import action handler
  lib/
    client.ts                # TelegramClient wrapper (connect, destroy, rate limiting)
    config.ts                # conf-based config management (api_id, api_hash, profiles)
    session-store.ts         # Session file read/write with locking
    output.ts                # JSON envelope formatter, stderr logger
    errors.ts                # Error classes and error-to-JSON conversion
    prompt.ts                # readline/promises wrapper for interactive input
    types.ts                 # Shared TypeScript types and zod schemas
  index.ts                   # Library exports (for programmatic use)
tsup.config.ts               # tsup build configuration
vitest.config.ts             # Test configuration
package.json
tsconfig.json
```

### Pattern 1: Command Module Registration
**What:** Each command group (auth, session) is a function that returns a configured Commander Command, registered via `addCommand()` on the root program.
**When to use:** All command groups follow this pattern.
**Example:**
```typescript
// src/commands/auth/index.ts
import { Command } from 'commander';
import { loginAction } from './login.js';
import { statusAction } from './status.js';
import { logoutAction } from './logout.js';

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Authentication commands');

  auth
    .command('login')
    .description('Log in with phone number + code + optional 2FA')
    .action(loginAction);

  auth
    .command('status')
    .description('Check current authentication status')
    .action(statusAction);

  auth
    .command('logout')
    .description('Log out and destroy session')
    .action(logoutAction);

  return auth;
}

// src/bin/tg.ts
#!/usr/bin/env node
import { Command } from 'commander';
import { createAuthCommand } from '../commands/auth/index.js';
import { createSessionCommand } from '../commands/session/index.js';

const program = new Command()
  .name('tg')
  .version(packageVersion)
  .description('Telegram CLI client');

// Global options -- available on all subcommands via optsWithGlobals()
program
  .option('--json', 'Output as JSON (default)', true)
  .option('--human', 'Output in human-readable format')
  .option('-v, --verbose', 'Show extra info')
  .option('-q, --quiet', 'Suppress all stderr output')
  .option('--profile <name>', 'Named profile', 'default')
  .option('--config <path>', 'Config file path');

program.enablePositionalOptions();
program.addCommand(createAuthCommand());
program.addCommand(createSessionCommand());

program.parse();
```

### Pattern 2: Client Lifecycle Wrapper
**What:** A `withClient()` higher-order function that handles connect, execute, and destroy with proper cleanup and timeout.
**When to use:** Every command that needs a Telegram connection.
**Example:**
```typescript
// src/lib/client.ts
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

interface ClientOptions {
  apiId: number;
  apiHash: string;
  sessionString: string;
  profile: string;
}

export async function withClient<T>(
  opts: ClientOptions,
  fn: (client: TelegramClient) => Promise<T>
): Promise<T> {
  const session = new StringSession(opts.sessionString);
  const client = new TelegramClient(session, opts.apiId, opts.apiHash, {
    connectionRetries: 3,
    retryDelay: 1000,
    floodSleepThreshold: 60,
  });

  // Force cleanup after 30 seconds max
  const timeout = setTimeout(() => {
    client.destroy().catch(() => {});
    process.exit(1);
  }, 30_000);

  try {
    await client.connect();
    const result = await fn(client);
    return result;
  } finally {
    clearTimeout(timeout);
    // Use destroy() not disconnect() -- avoids zombie _updateLoop
    await client.destroy().catch(() => {});
  }
}
```

### Pattern 3: JSON Output Envelope
**What:** Consistent `{ ok, data, error? }` wrapper for all stdout output.
**When to use:** Every command response.
**Example:**
```typescript
// src/lib/output.ts
import { type Command } from 'commander';

interface SuccessEnvelope<T> {
  ok: true;
  data: T;
}

interface ErrorEnvelope {
  ok: false;
  error: string;
  code?: string;
}

type Envelope<T> = SuccessEnvelope<T> | ErrorEnvelope;

export function outputSuccess<T>(data: T): void {
  const envelope: SuccessEnvelope<T> = { ok: true, data };
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

export function outputError(error: string, code?: string): void {
  const envelope: ErrorEnvelope = { ok: false, error, ...(code && { code }) };
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

export function logStatus(message: string, quiet: boolean = false): void {
  if (!quiet) {
    process.stderr.write(message + '\n');
  }
}
```

### Pattern 4: Config + Credentials Resolution
**What:** Layered config resolution: env vars > config file > interactive prompt.
**When to use:** On every command that needs API credentials.
**Example:**
```typescript
// src/lib/config.ts
import Conf from 'conf';

interface TgConfig {
  apiId?: number;
  apiHash?: string;
  profiles: Record<string, { session: string; phone?: string; created?: string }>;
}

export function createConfig(configPath?: string): Conf<TgConfig> {
  return new Conf<TgConfig>({
    projectName: 'tg-cli',
    configName: 'config',
    defaults: {
      profiles: {},
    },
    schema: {
      apiId: { type: 'number' },
      apiHash: { type: 'string' },
      profiles: { type: 'object' },
    },
  });
}

export function resolveCredentials(config: Conf<TgConfig>): { apiId: number; apiHash: string } | null {
  // Priority: env vars > config file
  const apiId = process.env.TG_API_ID ? parseInt(process.env.TG_API_ID, 10) : config.get('apiId');
  const apiHash = process.env.TG_API_HASH ?? config.get('apiHash');

  if (apiId && apiHash) {
    return { apiId, apiHash: apiHash as string };
  }
  return null;
}
```

### Pattern 5: Session Storage with File Locking
**What:** Read/write session strings to disk with proper-lockfile to prevent concurrent access.
**When to use:** Every session read/write operation.
**Example:**
```typescript
// src/lib/session-store.ts
import { lock, unlock } from 'proper-lockfile';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export class SessionStore {
  private dir: string;

  constructor(configDir: string) {
    this.dir = join(configDir, 'sessions');
    if (!existsSync(this.dir)) {
      mkdirSync(this.dir, { recursive: true });
    }
  }

  async load(profile: string): Promise<string> {
    const file = this.filePath(profile);
    if (!existsSync(file)) return '';

    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    try {
      return readFileSync(file, 'utf-8').trim();
    } finally {
      await release();
    }
  }

  async save(profile: string, sessionString: string): Promise<void> {
    const file = this.filePath(profile);
    // Create empty file if it doesn't exist (proper-lockfile needs existing file)
    if (!existsSync(file)) {
      writeFileSync(file, '', 'utf-8');
    }
    const release = await lock(file, { retries: { retries: 3, minTimeout: 100 } });
    try {
      writeFileSync(file, sessionString, 'utf-8');
    } finally {
      await release();
    }
  }

  async delete(profile: string): Promise<void> {
    const file = this.filePath(profile);
    if (existsSync(file)) {
      const { unlinkSync } = await import('node:fs');
      unlinkSync(file);
    }
  }

  private filePath(profile: string): string {
    return join(this.dir, `${profile}.session`);
  }
}
```

### Anti-Patterns to Avoid
- **Using `client.disconnect()` instead of `client.destroy()`:** disconnect() does not stop the _updateLoop, leaving zombie timers. Always use `destroy()` for permanent shutdown. (Source: [gramjs issue #615](https://github.com/gram-js/gramjs/issues/615), [issue #289](https://github.com/gram-js/gramjs/issues/289))
- **Not setting a process cleanup timeout:** gramjs can take up to 30 seconds to fully disconnect. Set a hard timeout with `setTimeout` + `process.exit(1)` as a safety net.
- **Mixing stdout and stderr:** Agent consumers parse stdout as JSON. Never write status messages, progress, or errors to stdout. Use stderr exclusively for non-data output.
- **Using the `input` npm package:** gramjs examples use it, but it's unnecessary. Use Node.js built-in `readline/promises` instead.
- **Using `require()` with conf:** conf v15 is ESM-only. The project must use `"type": "module"` in package.json.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Config file management | Custom JSON read/write with fs | `conf` package | Atomic writes prevent corruption, handles XDG paths, schema validation, migrations |
| File locking | Custom lockfile implementation | `proper-lockfile` | mkdir-based atomic locking, works on network FS, handles stale locks, retries |
| CLI argument parsing | Custom argv parsing | Commander.js | Global options, subcommand nesting, auto-help, version display, TypeScript types |
| Input validation | Manual type checks | zod | Runtime validation with TypeScript type inference, detailed error messages |
| TypeScript bundling | Manual tsc + chmod | tsup | Auto-shebang, multiple entry points, DTS generation, watch mode, esbuild speed |
| Terminal colors | ANSI escape codes | picocolors | Auto-detects color support, handles NO_COLOR env var, 2.6KB |
| MTProto protocol | Custom Telegram API calls | gramjs (`telegram`) | Handles encryption, auth key exchange, layer negotiation, update loop |

**Key insight:** The connect-per-command model means every CLI invocation pays connection setup cost. Don't optimize this prematurely -- measure real latency first. If startup is too slow (>2s), the user mentioned daemon mode as a future consideration, but it is out of scope for v1.

## Common Pitfalls

### Pitfall 1: gramjs Zombie Processes
**What goes wrong:** After calling `client.disconnect()`, the internal `_updateLoop` continues running, background timers prevent Node.js from exiting, and the process hangs.
**Why it happens:** `disconnect()` is designed for temporary disconnection before reconnect. It does not stop background loops or cancel pending promises.
**How to avoid:** Always use `client.destroy()` for permanent shutdown. Add a hard timeout (e.g., 30s) with `setTimeout(() => process.exit(1))` as a safety net. Wrap all client operations in a `withClient()` function that guarantees cleanup in a `finally` block.
**Warning signs:** CLI hangs after command completes, high CPU after disconnect, TIMEOUT errors in console.

### Pitfall 2: AUTH_KEY_DUPLICATED Error
**What goes wrong:** Two concurrent `tg` invocations read the same session file simultaneously, both connect with the same auth key, and Telegram invalidates both sessions with error 406.
**Why it happens:** Telegram's server detects duplicate auth key usage and terminates both connections. This is a server-side anti-abuse mechanism.
**How to avoid:** Use `proper-lockfile` to acquire an exclusive lock on the session file before reading/writing. Use short lock timeouts (3 retries, 100ms min) to fail fast for CLI responsiveness.
**Warning signs:** "AUTH_KEY_DUPLICATED" RPC error, sessions mysteriously becoming invalid, needing to re-login frequently.

### Pitfall 3: ESM/CJS Module Interop
**What goes wrong:** `conf` v15 is ESM-only (`"type": "module"`), but `telegram` (gramjs) uses CJS. Mixing import styles causes runtime errors.
**Why it happens:** The Node.js ecosystem is mid-migration from CJS to ESM. Some packages are ESM-only while others remain CJS.
**How to avoid:** Set `"type": "module"` in package.json. ESM can import CJS packages (Node.js handles this automatically). Use `.js` extensions in all import paths. Configure tsup to output ESM format.
**Warning signs:** "require is not defined in ES module scope", "Cannot use import statement outside a module", ERR_REQUIRE_ESM errors.

### Pitfall 4: FloodWait Not Handled Above Threshold
**What goes wrong:** gramjs auto-sleeps for FloodWait errors under 60 seconds (configurable via `floodSleepThreshold`), but throws `FloodWaitError` for waits above the threshold. Unhandled FloodWaitError crashes the CLI.
**Why it happens:** gramjs treats long flood waits as exceptional -- the caller should decide whether to wait.
**How to avoid:** Wrap API calls in a rate-limiting layer that catches `FloodWaitError`, logs the wait time to stderr, and either waits or errors gracefully. Set `floodSleepThreshold` to a reasonable value (60s default is fine for CLI use). For waits > threshold, output a JSON error with the retry-after seconds.
**Warning signs:** Unhandled promise rejections with FloodWaitError, CLI crashing mid-operation.

### Pitfall 5: Missing API Credentials at Runtime
**What goes wrong:** User runs `tg auth login` without setting `TG_API_ID` and `TG_API_HASH`, gets a cryptic error from gramjs.
**Why it happens:** gramjs requires valid api_id and api_hash but gives poor error messages when they're missing or invalid.
**How to avoid:** Validate credentials before creating TelegramClient. Show a clear error message with instructions: "API credentials required. Get them at https://my.telegram.org/apps. Set TG_API_ID and TG_API_HASH environment variables, or run with --config to set them in config file."
**Warning signs:** vague "Invalid API hash" errors, users confused about where to get credentials.

### Pitfall 6: Mixing Data and Status on stdout
**What goes wrong:** Agents (Claude Code) try to JSON.parse stdout and fail because progress messages or warnings were mixed in.
**Why it happens:** Default `console.log` writes to stdout. Easy to accidentally log status messages there.
**How to avoid:** Create a strict `logStatus()` function that writes to stderr. Use `process.stdout.write()` exclusively for JSON data output. Never use `console.log()` in command actions -- use the output helper functions.
**Warning signs:** JSON parse errors in agent consumers, unexpected text before/after JSON in stdout.

## Code Examples

Verified patterns from official sources:

### gramjs Authentication Flow
```typescript
// Source: https://gram.js.org/getting-started/authorization
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { createInterface } from 'node:readline/promises';

const rl = createInterface({ input: process.stdin, output: process.stderr });

async function login(apiId: number, apiHash: string): Promise<string> {
  const client = new TelegramClient(
    new StringSession(''),
    apiId,
    apiHash,
    { connectionRetries: 3, retryDelay: 1000, floodSleepThreshold: 60 }
  );

  await client.start({
    phoneNumber: async () => rl.question('Phone number: '),
    phoneCode: async (isCodeViaApp) => {
      const via = isCodeViaApp ? 'Telegram app' : 'SMS';
      return rl.question(`Code (sent via ${via}): `);
    },
    password: async (hint) => {
      const msg = hint ? `2FA password (hint: ${hint}): ` : '2FA password: ';
      return rl.question(msg);
    },
    onError: (err) => {
      process.stderr.write(`Auth error: ${err.message}\n`);
    },
  });

  const sessionString = client.session.save() as unknown as string;
  await client.destroy();
  rl.close();
  return sessionString;
}
```

### gramjs Connect with Existing Session
```typescript
// Source: https://gram.js.org/beta/classes/TelegramClient.html
import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';

async function connectWithSession(
  apiId: number,
  apiHash: string,
  sessionString: string
): Promise<{ client: TelegramClient; authorized: boolean }> {
  const client = new TelegramClient(
    new StringSession(sessionString),
    apiId,
    apiHash,
    { connectionRetries: 3 }
  );

  await client.connect();
  const authorized = await client.checkAuthorization();
  return { client, authorized };
}
```

### tsup Configuration for CLI
```typescript
// tsup.config.ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    'bin/tg': 'src/bin/tg.ts',
  },
  format: ['esm'],
  target: 'node20',
  clean: true,
  sourcemap: true,
  dts: false,        // No type declarations needed for CLI binary
  shims: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
});
```

### package.json Configuration
```json
{
  "name": "@miolamio/tg-cli",
  "version": "0.1.0",
  "type": "module",
  "bin": {
    "tg": "./dist/bin/tg.js",
    "telegram-cli": "./dist/bin/tg.js"
  },
  "engines": {
    "node": ">=20"
  },
  "scripts": {
    "build": "tsup",
    "dev": "tsup --watch",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

### Commander.js Global Options with optsWithGlobals
```typescript
// Source: https://www.jsdocs.io/package/commander
import { Command } from 'commander';

const program = new Command();
program.enablePositionalOptions();

// Global options defined on root program
program
  .option('--json', 'JSON output (default)', true)
  .option('--human', 'Human-readable output')
  .option('--profile <name>', 'Named profile', 'default')
  .option('-v, --verbose', 'Verbose output')
  .option('-q, --quiet', 'Suppress stderr');

// In any subcommand action:
async function someAction(this: Command) {
  const globalOpts = this.optsWithGlobals();
  // globalOpts.json, globalOpts.human, globalOpts.profile, etc.
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `client.disconnect()` for cleanup | `client.destroy()` for permanent shutdown | gramjs ~2.19+ | Prevents zombie _updateLoop, clean process exit |
| `require('readline')` callbacks | `import { createInterface } from 'node:readline/promises'` | Node.js 17+ | Native async/await prompts, no external deps |
| CJS `require()` for all packages | ESM `import` with `"type": "module"` | 2024-2025 ecosystem shift | Required by conf v15; ESM can still import CJS packages |
| Custom file locking with O_EXCL | `proper-lockfile` with mkdir strategy | Stable pattern | Works on network FS, handles stale locks |
| `input` npm package for prompts | `node:readline/promises` | Always available in Node.js 17+ | No extra dependency, TypeScript-typed |

**Deprecated/outdated:**
- `client.disconnect()`: Use `client.destroy()` for permanent shutdown
- `StoreSession` (gramjs): Uses `store2` internally; StringSession with manual file persistence gives more control
- `configstore` npm package: Replaced by `conf` from same author (sindresorhus), more features
- `lockfile` npm package: Uses O_EXCL which fails on network FS; use `proper-lockfile` instead

## Open Questions

1. **conf ESM-only impact on tsup bundling**
   - What we know: conf v15 is ESM-only. tsup can output ESM. gramjs is CJS but importable from ESM.
   - What's unclear: Whether tsup's ESM output bundling of conf works smoothly or needs special configuration.
   - Recommendation: Set `format: ['esm']` in tsup config and test the build early in Wave 0. If issues arise, consider bundling as CJS with dynamic `import()` for conf only.

2. **gramjs TypeScript types quality**
   - What we know: gramjs ships `index.d.ts` and has TypeScript source. The `session.save()` return type is not well-typed (returns `string` but typed loosely).
   - What's unclear: How complete and accurate the types are for the APIs we'll use.
   - Recommendation: Test type inference during implementation; add `as` casts where needed but document why.

3. **Session string portability across gramjs versions**
   - What we know: StringSession is base64-encoded auth key + server info. Works within same major version.
   - What's unclear: Whether session strings from v2.26 will work with future gramjs versions.
   - Recommendation: Include gramjs version in exported session metadata (`--json` mode). Warn on import if versions differ significantly.

4. **connect-per-command latency**
   - What we know: Each CLI invocation must connect to Telegram servers (TCP + MTProto handshake). This adds 0.5-2s overhead.
   - What's unclear: Real-world latency from different network conditions.
   - Recommendation: Measure and log connection time in `--verbose` mode. If consistently >2s, the user has already noted daemon mode as a future consideration.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.0.18 |
| Config file | none -- see Wave 0 |
| Quick run command | `npx vitest run --reporter=verbose` |
| Full suite command | `npx vitest run` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| INFRA-01 | Package bin entry runs correctly | integration | `npx vitest run tests/integration/cli-entry.test.ts -t "binary"` | Wave 0 |
| INFRA-02 | FloodWait errors handled with retry/backoff | unit | `npx vitest run tests/unit/rate-limit.test.ts` | Wave 0 |
| INFRA-03 | Session file locking prevents concurrent access | unit | `npx vitest run tests/unit/session-store.test.ts -t "lock"` | Wave 0 |
| INFRA-04 | API credentials resolved from env > config > prompt | unit | `npx vitest run tests/unit/config.test.ts -t "credentials"` | Wave 0 |
| INFRA-05 | Client lifecycle connect/destroy/timeout works | unit | `npx vitest run tests/unit/client.test.ts -t "lifecycle"` | Wave 0 |
| INFRA-06 | Config file created and read at XDG path | unit | `npx vitest run tests/unit/config.test.ts -t "config file"` | Wave 0 |
| AUTH-01 | Login flow calls gramjs start with phone+code callbacks | unit | `npx vitest run tests/unit/auth.test.ts -t "login"` | Wave 0 |
| AUTH-02 | 2FA password callback invoked with hint | unit | `npx vitest run tests/unit/auth.test.ts -t "2FA"` | Wave 0 |
| AUTH-03 | Session string persisted to disk and reloaded | unit | `npx vitest run tests/unit/session-store.test.ts -t "persist"` | Wave 0 |
| AUTH-04 | Session export outputs StringSession string | unit | `npx vitest run tests/unit/session.test.ts -t "export"` | Wave 0 |
| AUTH-05 | Session import restores auth from string | unit | `npx vitest run tests/unit/session.test.ts -t "import"` | Wave 0 |
| AUTH-06 | Auth status checks authorization state | unit | `npx vitest run tests/unit/auth.test.ts -t "status"` | Wave 0 |
| AUTH-07 | Logout destroys session and deletes file | unit | `npx vitest run tests/unit/auth.test.ts -t "logout"` | Wave 0 |
| OUT-01 | JSON output flag produces JSON envelope | unit | `npx vitest run tests/unit/output.test.ts -t "json"` | Wave 0 |
| OUT-02 | Output envelope has ok/data/error structure | unit | `npx vitest run tests/unit/output.test.ts -t "envelope"` | Wave 0 |
| OUT-06 | Status messages go to stderr, data to stdout | unit | `npx vitest run tests/unit/output.test.ts -t "stderr"` | Wave 0 |

### Sampling Rate
- **Per task commit:** `npx vitest run --reporter=verbose`
- **Per wave merge:** `npx vitest run`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `vitest.config.ts` -- vitest configuration file
- [ ] `tests/unit/output.test.ts` -- covers OUT-01, OUT-02, OUT-06
- [ ] `tests/unit/config.test.ts` -- covers INFRA-04, INFRA-06
- [ ] `tests/unit/session-store.test.ts` -- covers INFRA-03, AUTH-03
- [ ] `tests/unit/client.test.ts` -- covers INFRA-05
- [ ] `tests/unit/rate-limit.test.ts` -- covers INFRA-02
- [ ] `tests/unit/auth.test.ts` -- covers AUTH-01, AUTH-02, AUTH-06, AUTH-07
- [ ] `tests/unit/session.test.ts` -- covers AUTH-04, AUTH-05
- [ ] `tests/integration/cli-entry.test.ts` -- covers INFRA-01
- [ ] Framework install: `npm install -D vitest` -- no test infrastructure exists yet

## Sources

### Primary (HIGH confidence)
- [gramjs official docs - Authorization](https://gram.js.org/getting-started/authorization) - auth flow, StringSession, client.start() callbacks
- [gramjs official docs - Quick Start](https://gram.js.org/) - client creation, session management
- [gramjs TelegramClientParams API](https://gram.js.org/beta/interfaces/client.telegramBaseClient.TelegramClientParams.html) - all client configuration options
- [gramjs FloodWaitError docs](https://gram.js.org/beta/classes/errors.FloodWaitError.html) - rate limiting behavior
- [Commander.js v14.0.3 API](https://www.jsdocs.io/package/commander) - addCommand, optsWithGlobals, enablePositionalOptions
- [conf GitHub README](https://github.com/sindresorhus/conf) - full API, ESM-only status, constructor options
- [tsup official docs](https://tsup.egoist.dev/) - shebang/banner support, entry configuration
- [proper-lockfile npm](https://www.npmjs.com/package/proper-lockfile) - mkdir-based locking, stale detection
- npm registry version checks (2026-03-10) - verified current versions of all packages

### Secondary (MEDIUM confidence)
- [gramjs GitHub issue #615](https://github.com/gram-js/gramjs/issues/615) - _updateLoop not uninstalled after disconnect, resolved with destroy()
- [gramjs GitHub issue #289](https://github.com/gram-js/gramjs/issues/289) - disconnect/destroy not working, 30s cleanup delay
- [gramjs GitHub issue #616](https://github.com/gram-js/gramjs/issues/616) - AUTH_KEY_DUPLICATED from concurrent session use
- [Node.js readline/promises docs](https://nodejs.org/api/readline.html) - promise-based readline API
- [How to Test CLI Output in Vitest](https://www.lekoarts.de/how-to-test-cli-output-in-jest-vitest/) - execa-based CLI testing pattern

### Tertiary (LOW confidence)
- gramjs v2.26.22 release notes -- could not access detailed changelog from GitHub releases page (page errors)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all versions verified via npm registry, APIs verified via official docs
- Architecture: HIGH - patterns derived from official Commander.js, gramjs, and tsup documentation
- Pitfalls: HIGH - gramjs disconnect bugs confirmed via multiple GitHub issues with workaround consensus
- Session management: HIGH - StringSession API well-documented, AUTH_KEY_DUPLICATED root cause confirmed
- ESM/CJS interop: MEDIUM - conf is confirmed ESM-only, but tsup bundling of mixed ESM/CJS not yet tested in this project
- Rate limiting: MEDIUM - gramjs floodSleepThreshold documented, but custom wrapper design is discretionary

**Research date:** 2026-03-10
**Valid until:** 2026-04-10 (stable ecosystem, 30-day validity)
