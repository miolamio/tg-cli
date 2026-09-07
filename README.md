# @miolamio/tg-cli

```text
      .------.
     /  o  o  \
    |   \__/   |
    |          |
    |  /\  /\  |
     \/  \/  \/

  tg / Telegram, from your terminal.
```

Agent-first Telegram CLI client built on MTProto via gramjs. Designed for Claude Code agents and power users who need structured, scriptable access to Telegram.

## Install

```bash
npm install -g @miolamio/tg-cli
# or run directly
npx @miolamio/tg-cli
```

Requires Node.js >= 20.

## Setup

The fastest way to get started — use a built-in client preset (no API credentials needed):

```bash
tg auth login --client desktop
```

The phone prompt appears before connecting to Telegram. You can also provide
the number explicitly; the verification code and optional 2FA password are
still requested interactively:

```bash
tg --transport wss auth login --client desktop --phone "+15551234567"
```

SDK diagnostics pause while you enter the verification code or password, even
with `--verbose`, so the prompt stays visible.

Or bring your own credentials from [my.telegram.org](https://my.telegram.org):

```bash
export TG_API_ID=your_api_id
export TG_API_HASH=your_api_hash
tg auth login
```

Available presets: `desktop`, `android`, `ios`, `macos`, `web-z`, `web-k`.

The little daemon greets you during interactive login and appears in compact form
in `tg --help`. Use `--quiet` to hide it or `NO_COLOR=1` for plain text.

### Troubleshooting login

Run `tg --verbose auth login --client desktop` in a terminal to see connection
stages. Starting with 0.4.0, transport failures include a safe category on stderr,
such as `CONNECTION_CLOSED`, `ECONNRESET`, `INVALID_CHECKSUM`, or
`INVALID_BUFFER (code=429)`. These diagnostics do not print error objects,
session strings, or raw protocol payloads; `--quiet` suppresses them.

If TCP connects but the first authorization-key exchange fails, an open port
alone does not establish that MTProto traffic can pass. Check access from the
same machine and network. The SDK's `WebSocket connection failed` message can
also describe a TCP failure. After unsuccessful connection retries, the CLI
returns `CONNECTION_FAILED` instead of continuing into authorization on a
disconnected client. This improves diagnosis; it does not bypass network
restrictions. Login still requires an interactive terminal.

Since 0.5.0, if raw TCP is blocked but HTTPS/WebSocket works, select WSS:

```bash
tg --transport wss auth login --client desktop
tg auth status
tg daemon start --idle-timeout 0
tg daemon status
tg --daemon chat list --limit 5
```

A successful login saves the transport in the selected profile. Direct commands
and subsequent daemon starts reuse it. WSS uses TLS on port 443, the official
Telegram DC hostnames, and obfuscated MTProto framing, including when login
migrates to another DC or media needs a separate connection. Certificate
verification remains enabled.

Existing profiles default to `tcp`. `--transport tcp` or `--transport wss`
overrides the profile for one invocation; login and session import save the
chosen transport after success. For an existing session, start a WSS daemon
with `tg --transport wss daemon start --idle-timeout 0` after stopping any
running daemon. Its `status` includes `transport`. Commands using `--daemon`
and `message watch` use that daemon's transport; choose it at daemon startup.
There is no automatic fallback to TCP. WSS does not use `HTTP_PROXY` or
`HTTPS_PROXY` environment variables.

See [CHANGELOG.md](CHANGELOG.md) for release notes. When updating an installation
with a running daemon, stop it before the update and restart it afterwards so
the process uses the new code:

```bash
tg daemon stop
npm install -g @miolamio/tg-cli@latest
tg daemon start --idle-timeout 0
tg daemon status
```

## Commands

### Auth & Session

```bash
tg auth login                    # Interactive login (phone + code + 2FA)
tg auth login --client desktop   # Login with official client preset
tg auth status                   # Check auth status
tg auth logout                   # Log out and destroy session
tg session export                # Export session string for portability
tg session import <string>       # Import session string
```

### Chats

```bash
tg chat list [--limit N] [--type group|channel|user]
tg chat info <chat>
tg chat join <username-or-invite-link>
tg chat leave <chat>
tg chat resolve <username-or-id>
tg chat invite-info <link>
tg chat members <chat> [--limit N] [--offset N] [--search NAME]
tg chat topics <chat> [--limit N]
tg chat search <query> [--limit N]                           # Search public channels/groups
tg chat create <title> [--type supergroup|group|channel]     # Create a new chat
tg chat edit <chat> [--title TEXT] [--description TEXT]       # Edit chat title/description
tg chat kick <chat> <user>                                   # Kick a user from a chat
```

### Messages

```bash
# Read
tg message history <chat> [--limit N] [--since DATE] [--until DATE] [--topic ID]
tg message search [--chat CHAT] [--query TEXT] [--filter photos|videos|...]
tg message search --public --query hashtag [--limit N] [--offset RATE] [--peer PEER] [--after ID]
tg message get <chat> <id1,id2,...>
tg message pinned <chat>
tg message replies <channel> <msg-ids>

# Write
tg message send <chat> <text> [--reply-to ID] [--topic ID] [--schedule ISO]
tg message edit <chat> <msg-id> <text>
tg message delete <chat> <ids> --revoke|--for-me
tg message forward <from-chat> <msg-ids> <to-chat>
tg message react <chat> <msg-id> <emoji> [--remove]
tg message pin <chat> <msg-id> [--notify]
tg message unpin <chat> <msg-id>
tg message poll <chat> --question <q> --option <o1> --option <o2> [--quiz --correct N]

# Watch (requires daemon)
tg message watch <chat> [--topic ID]     # Stream new messages in real-time
```

### Scheduled messages

`--schedule` stores the message on Telegram for later delivery; the CLI and
computer can be offline when it is delivered. Use a full ISO timestamp with an
explicit timezone, at least 10 seconds in the future:

```bash
tg message send me "Reminder" --schedule "2030-01-01T09:00:00+03:00"
echo "Reminder" | tg --daemon message send me - --schedule "2030-01-01T09:00:00+03:00"
```

The response retains the normal message fields and adds `scheduledAt` (UTC).
An invalid or expired timestamp fails without sending immediately. Scheduling
also works with `--reply-to` and `--topic` under their normal validation rules.
Telegram may reject scheduling for unsupported peers or dates; those errors are
returned normally. After a timeout, verify the scheduled queue in Telegram before
retrying, as the first request may have succeeded.

### Media

```bash
tg media download <chat> <msg-ids> [--output DIR]
tg media send <chat> <files...> [--caption TEXT] [--album] [--voice]
```

### Users

```bash
tg user profile <users>      # Bio, photos, last seen, common chats
tg user download-photo <user> --output avatar.jpg [--force]
tg user block <user>
tg user unblock <user>
tg user blocked [--limit N]  # List blocked users
```

### Contacts

```bash
tg contact list [--limit N]
tg contact add <username-or-phone> [--first-name NAME] [--last-name NAME]
tg contact delete <user>
tg contact set-photo <user> photo.jpg    # Personal photo, visible only to you
tg contact search <query> [--limit N] [--global]
```

Contact search matches saved names and usernames without case sensitivity. Use `@username` to search usernames only. `--global` fills remaining result slots with remote username matches; the limit applies before profile enrichment.

### Contact and profile photos

`contact set-photo` uploads a JPEG or PNG as a personal contact photo, visible
only to the current account. It does **not** suggest a photo to the other person
or change their public profile. Telegram requires the target to be a contact.

`user download-photo` downloads the user's current visible profile photo. It
returns `NO_PROFILE_PHOTO` without creating a file if no photo is available.
Existing destination files are preserved unless `--force` is supplied.
The destination's parent directory must already exist. The visible photo may be
a personal override set by your account; this command does not enumerate historical photos.

Both commands support `--daemon`, `--fields`, JSON, JSONL, TOON and human output.
For direct `DaemonClient.execute` calls, pass an absolute `cwd` for these file
operations; relative file arguments are resolved against it, never the daemon's
startup directory. Normal CLI calls supply `cwd` automatically.

```bash
tg --daemon contact set-photo some_contact ./photo.png
tg --daemon user download-photo some_contact --output ./avatar.jpg --fields userId,path,size
```

### Daemon

Keep one Telegram connection open for commands and live subscriptions:

```bash
tg daemon start                  # Start background daemon (5 min idle timeout)
tg daemon start --idle-timeout 0  # Keep running until explicitly stopped
tg daemon start --idle-timeout 600  # Custom idle timeout in seconds
tg daemon start --foreground     # Run in foreground (don't fork)
tg daemon stop                   # Stop the running daemon
tg daemon status                 # Check daemon status (running, pid, uptime)
```

Start the daemon once, then use `--daemon` for chat, message, media, user and contact commands. Each command uses the existing MTProto connection and entity cache. `message watch` uses the same connection. Commands keep their normal validation, JSON/JSONL/TOON/human output and `--fields` behavior.

```bash
tg daemon start --idle-timeout 0
tg --daemon chat list --limit 10
tg --daemon message history me --limit 5
tg --daemon message send me "Saved through the daemon"
echo "Reply from stdin" | tg --daemon message send me -
tg message watch me
```

`--daemon` requires a running daemon and never falls back to opening another session. Auth and session-management commands still need a direct connection: stop the daemon before using them. Library callbacks passed to `withAuth` cannot be serialized; use `DaemonClient.execute` for the command API.

### Daemon API

The local API is JSON-RPC 2.0 over the profile's Unix socket (mode `0600`), one JSON message per line. The socket path is returned by `daemon start`. Existing methods `ping`, `status`, `subscribe` and `shutdown` remain supported; `status` reports `apiVersion: 1`, `capabilities`, `connected` and `activeRequests`.

`execute` accepts normal command arguments as an array, without global auth/output flags. It returns the usual envelope in `output` and an `exitCode`, including partial failures. No shell is invoked.

```json
{"jsonrpc":"2.0","id":1,"method":"execute","params":{"argv":["message","history","me","--limit","5"]}}
```

```js
import { dirname } from 'node:path';
import { createConfig, DaemonPaths, DaemonClient } from '@miolamio/tg-cli';

const paths = new DaemonPaths(dirname(createConfig().path), 'default');
const daemon = new DaemonClient(paths.socketPath);
try {
  const result = await daemon.execute(['message', 'history', 'me', '--limit', '5']);
  console.log(result.output);
  // Sending uses the same Telegram connection:
  // await daemon.execute(['message', 'send', 'me', 'Hello']);
} finally {
  daemon.close(); // Closes this API client's sockets; the daemon keeps running.
}
```

For piped message text, pass `stdin` alongside argv containing `-`. Media operations require an absolute `cwd`; CLI routing supplies the caller's directory automatically. API formatting remains raw JSON; CLI formatting is applied after the result arrives.

Commands have a default deadline of 120 seconds, configurable with API `timeoutMs` from 1 to 120000. At most 16 commands can remain in flight. Closing an API socket cancels further work for its requests without destroying the shared connection. Already submitted Telegram operations cannot be undone; after a timeout/disconnect, check the result before repeating a send. The command API does not automatically replay failed requests. Idle shutdown waits for outstanding work, and session ownership is retained until teardown finishes. Each request/response frame is limited to 1 MiB; use smaller pages for large histories.

### Shell Completion

```bash
tg completion bash               # Generate bash completion script
tg completion zsh                # Generate zsh completion script
tg completion fish               # Generate fish completion script

# Install (add to your shell rc file):
eval "$(tg completion bash)"     # bash
eval "$(tg completion zsh)"      # zsh
tg completion fish | source      # fish
```

## Output Modes

Every command supports structured output:

```bash
tg chat list                    # JSON (default)
tg chat list --human            # Human-readable table
tg chat list --jsonl            # One JSON object per line (streaming)
tg chat list --toon             # TOON format (30-40% fewer tokens for LLMs)
tg chat list --fields id,title  # Select specific fields
```

JSON envelope format:

```json
{
  "ok": true,
  "data": { ... }
}
```

Batch commands retain successful items and report failures in `data.errors`,
each with `input`, `error`, and `code`. Any failure sets `data.partial: true` and
exit status 1, including when every input failed. `--fields` preserves this error
metadata. JSONL emits successful items followed by `{ "status": "failed", ... }`
records without an envelope; `--quiet` suppresses diagnostics on stderr.
An unavailable profile photo count is `null`. An album item whose message ID is
missing from the response is reported as unknown; retrying may duplicate a send.

## Agent Usage

Designed for non-interactive automation. Export a session once, then reuse:

```bash
# Initial setup (interactive)
tg auth login --client desktop
SESSION=$(tg session export)

# Reuse in scripts / agents
echo "$SESSION" | tg session import
tg message search --query "meeting notes" --limit 10
tg message search --public --query bitcoin --limit 20
tg chat list --fields id,title,unreadCount --jsonl
```

Pipe message text via stdin:

```bash
echo "Hello from the CLI" | tg message send mychat -
```

Use the daemon for repeated commands and a persistent live message subscription:

```bash
tg daemon start --idle-timeout 0
tg --daemon message history @channel --limit 10
tg message watch @channel
tg daemon stop
```

The daemon owns the selected profile until shutdown. Use `--daemon` on ordinary
commands while it is running. Stop it before direct auth/session operations.

## Development

```bash
git clone https://github.com/miolamio/tg-cli.git
cd tg-cli
npm ci
npm run build
npm run typecheck
npm test
```

CI checks Node 20, 22 and 24. Dependency overrides keep Vite on its patched 6.x line
for earlier Node 20 releases and use patched esbuild 0.28.x in the build tools.

## License

MIT
