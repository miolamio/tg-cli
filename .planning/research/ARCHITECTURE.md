# Architecture Research

**Domain:** Telegram CLI Client (MTProto user client via gramjs)
**Researched:** 2026-03-10
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
+-----------------------------------------------------------------------+
|                          CLI Layer                                     |
|  +----------+  +-----------+  +----------+  +-----------+             |
|  | Command  |  | Command   |  | Command  |  | Command   |             |
|  | auth     |  | chats     |  | messages |  | media     |             |
|  +----+-----+  +-----+-----+  +----+-----+  +-----+-----+            |
|       |               |             |              |                  |
+-------+---------------+-------------+--------------+------------------+
        |               |             |              |
+-------v---------------v-------------v--------------v------------------+
|                       Output Formatter                                |
|  +----------------+  +----------------+                               |
|  | Human (table,  |  | JSON (struct,  |                               |
|  | color, prose)  |  | machine-read)  |                               |
|  +----------------+  +----------------+                               |
+-----------------------------------+-----------------------------------+
                                    |
+-----------------------------------v-----------------------------------+
|                       Service Layer                                   |
|  +-----------+  +-----------+  +-----------+  +-----------+           |
|  | Auth      |  | Chat      |  | Message   |  | Media     |          |
|  | Service   |  | Service   |  | Service   |  | Service   |          |
|  +-----------+  +-----------+  +-----------+  +-----------+           |
|                                                                       |
|  +-----------+  +-----------+                                         |
|  | Search    |  | User      |                                         |
|  | Service   |  | Service   |                                         |
|  +-----------+  +-----------+                                         |
+-----------------------------------+-----------------------------------+
                                    |
+-----------------------------------v-----------------------------------+
|                       Client Wrapper                                  |
|  +-----------------+  +------------------+  +------------------+      |
|  | Connection      |  | Error Handler    |  | Entity Cache     |      |
|  | Manager         |  | (FloodWait, DC   |  | (Users, Chats)   |      |
|  | (reconnect,     |  |  migrate, retry) |  |                  |      |
|  |  health check)  |  +------------------+  +------------------+      |
|  +-----------------+                                                  |
+-----------------------------------+-----------------------------------+
                                    |
+-----------------------------------v-----------------------------------+
|                       gramjs (TelegramClient)                         |
|  +-------+  +--------+  +--------+  +---------+  +--------+          |
|  | auth  |  | msgs   |  | dialog |  | uploads  |  | d/loads |         |
|  +-------+  +--------+  +--------+  +---------+  +--------+          |
|  +-------+  +--------+  +--------+  +---------+                      |
|  | 2fa   |  | users  |  | chats  |  | updates |                      |
|  +-------+  +--------+  +--------+  +---------+                      |
+-----------------------------------+-----------------------------------+
                                    |
+-----------------------------------v-----------------------------------+
|                       Session Storage                                 |
|  +------------------+  +------------------+                           |
|  | StringSession    |  | File-based       |                           |
|  | (portable,       |  | Session          |                           |
|  |  export/import)  |  | (~/.telegram-cli)|                           |
|  +------------------+  +------------------+                           |
+-----------------------------------------------------------------------+
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| CLI Layer (Commands) | Parse CLI args, validate input, invoke services, pass results to formatter | Commander.js command definitions, one file per command group |
| Output Formatter | Transform service results into human-readable or JSON output | Dual-mode formatter gated by `--json` flag; human mode uses chalk + tables |
| Service Layer | Business logic: orchestrate gramjs calls, transform Telegram objects into app-domain objects | Pure TypeScript classes, no CLI or formatting concerns |
| Client Wrapper | Manage gramjs TelegramClient lifecycle: connect, reconnect, handle FloodWait/DC migration | Singleton wrapping gramjs TelegramClient with error handling middleware |
| gramjs | MTProto protocol implementation: auth, messages, dialogs, uploads, downloads | npm `telegram` package, used as-is |
| Session Storage | Persist authentication state so users do not re-authenticate every invocation | StringSession for portability, file-based for default persistence |

## Recommended Project Structure

```
src/
├── cli/                    # CLI layer: command definitions
│   ├── index.ts            # Entry point, program setup, global options
│   ├── auth.ts             # login, logout, session, whoami
│   ├── chats.ts            # list, info, join, leave, members
│   ├── messages.ts         # send, read, history, search
│   ├── media.ts            # download, upload, send-media
│   └── utils.ts            # shared CLI utilities (option builders)
├── services/               # Business logic layer
│   ├── auth.service.ts     # Authentication flow orchestration
│   ├── chat.service.ts     # Chat/dialog operations
│   ├── message.service.ts  # Message CRUD and search
│   ├── media.service.ts    # File upload/download orchestration
│   ├── search.service.ts   # Cross-chat search aggregation
│   └── user.service.ts     # User/contact operations
├── client/                 # gramjs wrapper layer
│   ├── telegram.ts         # TelegramClient wrapper (singleton, lifecycle)
│   ├── session.ts          # Session management (load, save, export, import)
│   ├── errors.ts           # Error classification and handling
│   └── entity-cache.ts     # Cache for resolved users/chats/channels
├── formatters/             # Output formatting layer
│   ├── index.ts            # Formatter factory (picks human vs JSON)
│   ├── json.ts             # JSON output formatter
│   ├── human.ts            # Human-readable formatter (tables, colors)
│   └── types.ts            # Output shape interfaces
├── types/                  # Shared type definitions
│   ├── domain.ts           # App-domain types (Chat, Message, User, Media)
│   ├── config.ts           # Configuration types
│   └── errors.ts           # Error types
├── config/                 # Configuration management
│   ├── index.ts            # Config loader (env, file, defaults)
│   └── paths.ts            # XDG-compliant path resolution
└── index.ts                # Package entry point (exported API)
```

### Structure Rationale

- **cli/:** One file per command group keeps commands discoverable and each file small. Commander.js commands are defined here but contain zero business logic -- they parse args and call services.
- **services/:** Pure business logic separated from CLI concerns. This layer transforms gramjs's Telegram-native objects (Api.Message, Api.Dialog) into app-domain objects (Message, Chat). Services are independently testable without CLI involvement.
- **client/:** Wraps gramjs in a single place. The entire codebase interacts with Telegram through this layer, never importing `telegram` directly in services. This makes the gramjs dependency swappable and centralizes connection lifecycle, error handling, and session management.
- **formatters/:** Output formatting is a cross-cutting concern. The dual-output pattern (human vs JSON) is implemented here, selected by a global `--json` flag. Commands return domain objects; formatters decide how to render them.
- **types/:** App-domain types that are independent of both gramjs types and CLI concerns. Services return these types, formatters consume them.
- **config/:** Centralized configuration: API credentials, session paths, default behaviors. Uses XDG Base Directory spec for file locations (`~/.config/telegram-cli/`, `~/.local/share/telegram-cli/`).

## Architectural Patterns

### Pattern 1: Dual-Output Formatter

**What:** Every command returns a typed domain object. A formatter layer inspects the global `--json` flag and renders either structured JSON (to stdout) or human-readable colored output.

**When to use:** Every command. This is the core pattern that makes the CLI agent-friendly.

**Trade-offs:** Adds a layer of indirection but ensures every command is machine-readable without per-command effort. The domain types serve as the contract between services and formatters.

**Example:**
```typescript
// formatters/index.ts
interface OutputFormatter {
  message(msg: DomainMessage): void;
  messages(msgs: DomainMessage[], total: number): void;
  chat(chat: DomainChat): void;
  chats(chats: DomainChat[]): void;
  error(err: AppError): void;
  success(msg: string, data?: Record<string, unknown>): void;
}

function createFormatter(json: boolean): OutputFormatter {
  return json ? new JsonFormatter() : new HumanFormatter();
}

// json.ts
class JsonFormatter implements OutputFormatter {
  message(msg: DomainMessage) {
    // stdout for data, stderr for errors -- critical for piping
    process.stdout.write(JSON.stringify(msg) + '\n');
  }
}

// human.ts
class HumanFormatter implements OutputFormatter {
  message(msg: DomainMessage) {
    console.log(chalk.dim(msg.date) + ' ' + chalk.bold(msg.sender) + ': ' + msg.text);
  }
}

// Usage in a command:
const messages = await messageService.getHistory(chatId, { limit });
formatter.messages(messages, messages.total);
```

### Pattern 2: Client Wrapper with Lazy Connection

**What:** A singleton wrapper around gramjs TelegramClient that lazily connects on first use, handles reconnection, and centralizes error handling. Commands never instantiate TelegramClient directly.

**When to use:** Every service method that needs Telegram access.

**Trade-offs:** Singleton means global state, but a CLI process is short-lived and single-user by nature, so this is appropriate. The alternative (dependency injection) adds complexity without benefit in a CLI context.

**Example:**
```typescript
// client/telegram.ts
class TelegramClientWrapper {
  private client: TelegramClient | null = null;
  private config: AppConfig;

  async getClient(): Promise<TelegramClient> {
    if (!this.client) {
      const session = await loadSession(this.config);
      this.client = new TelegramClient(session, this.config.apiId, this.config.apiHash, {
        connectionRetries: 5,
        retryDelay: 1000,
      });
      await this.client.connect();
    }
    return this.client;
  }

  async invoke<T>(request: Api.Request<T>): Promise<T> {
    const client = await this.getClient();
    try {
      return await client.invoke(request);
    } catch (err) {
      if (isFloodWait(err)) {
        await this.handleFloodWait(err);
        return this.invoke(request); // retry after wait
      }
      if (isDcMigration(err)) {
        await this.handleDcMigration(err);
        return this.invoke(request); // retry on new DC
      }
      throw this.classifyError(err);
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
    }
  }
}

export const telegram = new TelegramClientWrapper();
```

### Pattern 3: Command-Service Separation

**What:** CLI command handlers contain only argument parsing, validation, and output formatting calls. All business logic lives in services. Commands never import gramjs types directly.

**When to use:** Every command definition.

**Trade-offs:** More files, but each is simple and testable. Commands test that args parse correctly; services test that business logic works; formatters test that output renders correctly.

**Example:**
```typescript
// cli/messages.ts
program
  .command('messages:search')
  .description('Search messages across chats')
  .argument('<query>', 'search query')
  .option('--chat <chat>', 'limit to specific chat')
  .option('--from <user>', 'filter by sender')
  .option('--limit <n>', 'max results', '20')
  .action(async (query, opts) => {
    const results = await searchService.search({
      query,
      chatId: opts.chat,
      fromUser: opts.from,
      limit: parseInt(opts.limit),
    });
    formatter.messages(results.messages, results.total);
  });

// services/search.service.ts
class SearchService {
  async search(params: SearchParams): Promise<SearchResult> {
    const client = await telegram.getClient();
    // Use client.iterMessages or invoke raw API
    // Transform Api.Message[] into DomainMessage[]
    // Handle pagination internally
  }
}
```

### Pattern 4: XDG-Compliant Configuration

**What:** Store session files, config, and cache in XDG Base Directory locations. Fall back to `~/.telegram-cli/` on non-compliant systems.

**When to use:** All persistent data (sessions, config, downloaded media cache).

**Trade-offs:** Slightly more complex path resolution, but follows platform conventions and prevents dotfile clutter in home directory.

**Paths:**
```
Config:  $XDG_CONFIG_HOME/telegram-cli/config.json  (~/.config/telegram-cli/)
Data:    $XDG_DATA_HOME/telegram-cli/session.dat     (~/.local/share/telegram-cli/)
Cache:   $XDG_CACHE_HOME/telegram-cli/media/          (~/.cache/telegram-cli/)
```

## Data Flow

### Authentication Flow

```
User runs `telegram-cli login`
    |
    v
CLI parses command --> AuthService.login()
    |
    v
Check existing session file --> Found?
    |                             |
    | No                          | Yes
    v                             v
Prompt phone number          Load session, connect, verify
    |                             |
    v                             | Valid?
Telegram sends code              |
    |                          Yes |   | No
    v                             v    v
Prompt code --> Submit       Connected  Clear session,
    |                                   restart flow
    v
2FA enabled? --> Prompt password
    |
    v
Save session to file
    |
    v
formatter.success("Logged in as @username")
```

### Message Retrieval Flow

```
User runs `telegram-cli messages:history <chat> --limit 50`
    |
    v
CLI parses args --> MessageService.getHistory(chatId, { limit: 50 })
    |
    v
ClientWrapper.getClient() --> Connect if needed
    |
    v
Resolve chat entity (username/ID/phone --> InputPeer)
    |
    v
client.getMessages(entity, { limit: 50 })
    |
    v
Transform Api.Message[] --> DomainMessage[]
  (extract text, sender name, date, media info, reply-to, reactions)
    |
    v
Return to CLI command handler
    |
    v
formatter.messages(messages, total)
    |                    |
    v                    v
  --json?             Human mode:
  JSON.stringify      Table with columns:
  to stdout           [Date | Sender | Message | Media]
```

### Media Download Flow

```
User runs `telegram-cli media:download <message-id> --chat <chat> --output ./file.jpg`
    |
    v
CLI parses args --> MediaService.download(chatId, messageId, outputPath)
    |
    v
Fetch message --> Extract media attachment
    |
    v
Determine media type (photo, document, video, voice, sticker)
    |
    v
client.downloadMedia(message, { outputFile: path })
    |
    v
gramjs handles chunked download (offset, limit protocol)
    |
    v
Write to disk (or stdout for piping)
    |
    v
formatter.success("Downloaded 2.3MB to ./file.jpg")
```

### Search Flow (Primary Agent Use Case)

```
Agent runs `telegram-cli messages:search "deployment error" --limit 10 --json`
    |
    v
CLI parses args --> SearchService.search({ query, limit })
    |
    v
If --chat specified: search single chat
If not: iterate recent dialogs, search each (with rate limiting)
    |
    v
For each chat: client.iterMessages(entity, { search: query, limit })
    |
    v
Aggregate results, sort by relevance/date
    |
    v
Transform to DomainMessage[] with chat context
    |
    v
JSON to stdout:
[{ "chat": "DevOps", "sender": "alice", "date": "2026-03-09", "text": "..." }, ...]
```

### Key Data Flows

1. **Command Input Flow:** CLI args --> Validated params --> Service method --> gramjs API call --> Domain object --> Formatter --> stdout/stderr
2. **Session Lifecycle:** First run: interactive auth --> save session. Subsequent runs: load session --> connect --> verify --> use. Session export: load session --> encode as string --> output.
3. **Error Propagation:** gramjs error --> ClientWrapper classifies (FloodWait / DCMigration / Auth / Network / API) --> handled internally or thrown as typed AppError --> CLI catches --> formatter.error() --> stderr (exit code 1)

## Scaling Considerations

This is a single-user CLI tool, not a server. "Scaling" means handling Telegram API rate limits and large data sets gracefully.

| Concern | Approach |
|---------|----------|
| Rate limits (FloodWait) | Auto-sleep on FLOOD_WAIT_X errors < 60s; abort with message for longer waits |
| Large message histories | Stream with iterMessages (generator), paginate internally, respect --limit |
| Large file downloads | gramjs handles chunked transfers; show progress bar in human mode |
| Many chats to search | Sequential with backoff; support --chat filter to narrow scope |
| Session across environments | StringSession export/import for portability between machines |

### Rate Limit Strategy

1. **First priority:** Respect FLOOD_WAIT_X -- sleep for the specified duration automatically
2. **Second priority:** Add voluntary delays between bulk operations (e.g., searching across 50 chats)
3. **Third priority:** Cache entity resolutions to reduce redundant API calls

## Anti-Patterns

### Anti-Pattern 1: Direct gramjs Imports in Commands

**What people do:** Import `TelegramClient` and `Api` directly in CLI command files, mixing protocol concerns with CLI concerns.
**Why it's wrong:** Creates tight coupling. Every command becomes a mini-client. Testing requires mocking gramjs. Changing gramjs usage (e.g., error handling) requires touching every command file.
**Do this instead:** Commands call services. Services call the client wrapper. Only the client wrapper imports gramjs.

### Anti-Pattern 2: Synchronous Session Management

**What people do:** Load and verify the session at CLI startup for every command, even commands like `--help` or `--version`.
**Why it's wrong:** Adds 500ms-2s latency to every invocation. Session verification requires a network round-trip.
**Do this instead:** Lazy connection -- only connect to Telegram when a command actually needs it. Help, version, and config commands should run instantly.

### Anti-Pattern 3: Mixing stdout and stderr

**What people do:** Print status messages, progress, and results all to stdout.
**Why it's wrong:** Breaks piping and `--json` mode. When an agent parses `telegram-cli messages:search "x" --json`, stdout must contain only valid JSON. Progress messages or "Connecting..." text corrupts the JSON stream.
**Do this instead:** Data goes to stdout. Everything else (progress, status, errors, warnings) goes to stderr. In JSON mode, stderr gets structured JSON errors; stdout gets the data payload.

### Anti-Pattern 4: Exposing Telegram Internal Types

**What people do:** Return gramjs `Api.Message` or `Api.Dialog` objects directly from services.
**Why it's wrong:** These types contain protocol-level details (access_hash, pts, flags) that leak implementation. They also serialize poorly to JSON and change between gramjs versions.
**Do this instead:** Define app-domain types (`DomainMessage`, `DomainChat`) and transform gramjs objects in the service layer. Domain types have clean, stable shapes that serialize naturally to JSON.

### Anti-Pattern 5: Storing API Credentials in Config Files

**What people do:** Save `api_id` and `api_hash` in a config file alongside the session.
**Why it's wrong:** These are application-level secrets. If shared (e.g., in a dotfiles repo), they could be used to impersonate the application.
**Do this instead:** Use environment variables (`TELEGRAM_API_ID`, `TELEGRAM_API_HASH`) as primary mechanism, with fallback to a config file that has restrictive permissions (0600). Provide built-in defaults for convenience (many Telegram clients ship with embedded credentials).

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Telegram MTProto (DCs 1-5) | gramjs TelegramClient, persistent TCP connections | gramjs handles DC selection, migration, reconnection internally |
| Telegram CDN (media) | gramjs downloadMedia/uploadFile | Chunked transfer; gramjs manages the protocol. CLI handles file I/O |
| my.telegram.org | Manual one-time setup by user | api_id and api_hash obtained once, stored in env/config |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| CLI <--> Services | Direct function calls, typed params/returns | Commands pass validated options; services return domain objects |
| Services <--> Client Wrapper | Async method calls on singleton | Services never hold TelegramClient references directly |
| Client Wrapper <--> gramjs | gramjs TelegramClient API | Only layer that imports from `telegram` package |
| Commands <--> Formatters | Commands call formatter methods with domain objects | Formatter selected once at startup based on --json flag |
| Config <--> All layers | Imported config object | Read-only after initialization; env vars > config file > defaults |

## Build Order (Dependency Graph)

Components should be built in this order based on dependencies:

```
Phase 1: Foundation
  types/          -- Domain types, no dependencies
  config/         -- Config loading, no dependencies
  client/session  -- Session load/save, depends on config

Phase 2: Connection
  client/telegram -- Client wrapper, depends on session + config
  client/errors   -- Error classification, no external deps

Phase 3: Core Services
  services/auth   -- Depends on client wrapper + session
  services/chat   -- Depends on client wrapper
  services/message -- Depends on client wrapper

Phase 4: CLI Shell
  formatters/     -- Depends on types only
  cli/index       -- Entry point, commander setup, global opts
  cli/auth        -- Depends on auth service + formatter
  cli/chats       -- Depends on chat service + formatter
  cli/messages    -- Depends on message service + formatter

Phase 5: Extended Features
  services/media  -- Depends on client wrapper
  services/search -- Depends on message service
  cli/media       -- Depends on media service + formatter

Phase 6: Polish
  client/entity-cache -- Performance optimization
  Progress indicators, shell completions, session export/import
```

**Rationale:** Types and config have zero dependencies, so they come first. The client wrapper is the critical integration point -- nothing works without it. Auth is next because you cannot test any other feature without being logged in. Core services (chat listing, message reading) validate the architecture end-to-end. Extended features (media, search) build on the proven foundation.

## Sources

- [gramjs GitHub repository](https://github.com/gram-js/gramjs) -- source code structure and module organization
- [gramjs authentication documentation](https://gram.js.org/getting-started/authorization) -- auth flow, session types
- [gramjs quick start](https://gram.js.org/) -- client initialization, basic usage
- [Telegram MTProto protocol](https://core.telegram.org/mtproto) -- protocol architecture
- [Telegram MTProto detailed description](https://core.telegram.org/mtproto/description) -- sessions, connections, auth keys
- [Telegram file upload/download API](https://core.telegram.org/api/files) -- chunking, size limits, parallelism
- [Telegram API error handling](https://core.telegram.org/api/errors) -- error codes, FloodWait, DC migration
- [Telegram chat types](https://core.telegram.org/api/channel) -- groups, supergroups, channels, forums
- [Telegram forums API](https://core.telegram.org/api/forum) -- forum topics
- [Commander.js](https://github.com/tj/commander.js) -- CLI framework
- [chalk](https://github.com/chalk/chalk) -- terminal styling

---
*Architecture research for: Telegram CLI Client (MTProto via gramjs)*
*Researched: 2026-03-10*
