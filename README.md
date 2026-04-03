# @miolamio/tg-cli

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

Or bring your own credentials from [my.telegram.org](https://my.telegram.org):

```bash
export TG_API_ID=your_api_id
export TG_API_HASH=your_api_hash
tg auth login
```

Available presets: `desktop`, `android`, `ios`, `macos`, `web-z`, `web-k`.

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
tg message get <chat> <id1,id2,...>
tg message pinned <chat>
tg message replies <channel> <msg-ids>

# Write
tg message send <chat> <text> [--reply-to ID] [--topic ID]
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

### Media

```bash
tg media download <chat> <msg-ids> [--output DIR]
tg media send <chat> <files...> [--caption TEXT] [--album] [--voice]
```

### Users

```bash
tg user profile <users>      # Bio, photos, last seen, common chats
tg user block <user>
tg user unblock <user>
tg user blocked [--limit N]  # List blocked users
```

### Contacts

```bash
tg contact list [--limit N]
tg contact add <username-or-phone> [--first-name NAME] [--last-name NAME]
tg contact delete <user>
tg contact search <query> [--limit N] [--global]
```

### Daemon

Persistent connection daemon for faster sequential operations and real-time features:

```bash
tg daemon start                  # Start background daemon (5 min idle timeout)
tg daemon start --idle-timeout 600  # Custom idle timeout in seconds
tg daemon start --foreground     # Run in foreground (don't fork)
tg daemon stop                   # Stop the running daemon
tg daemon status                 # Check daemon status (running, pid, uptime)
```

Use `--daemon` on any command to route it through the persistent connection:

```bash
tg chat list --daemon            # Uses daemon (auto-starts if needed)
```

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

## Agent Usage

Designed for non-interactive automation. Export a session once, then reuse:

```bash
# Initial setup (interactive)
tg auth login --client desktop
SESSION=$(tg session export)

# Reuse in scripts / agents
echo "$SESSION" | tg session import
tg message search --query "meeting notes" --limit 10
tg chat list --fields id,title,unreadCount --jsonl
```

Pipe message text via stdin:

```bash
echo "Hello from the CLI" | tg message send mychat -
```

Use daemon mode for faster sequential operations:

```bash
tg daemon start
tg chat list --daemon --toon
tg message history @channel --daemon --limit 50
tg daemon stop
```

## Development

```bash
git clone https://github.com/miolamio/telegram-cli.git
cd telegram-cli
npm install
npm run build
npm test
```

## License

MIT
