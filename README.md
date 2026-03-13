# @miolamio/tg-cli

Agent-first Telegram CLI client built on MTProto. Designed for Claude Code agents and power users who need structured, scriptable access to Telegram.

## Install

```bash
npm install -g @miolamio/tg-cli
# or run directly
npx @miolamio/tg-cli
```

Requires Node.js >= 20.

## Setup

You need Telegram API credentials from [my.telegram.org](https://my.telegram.org):

```bash
export TG_API_ID=your_api_id
export TG_API_HASH=your_api_hash
```

Or save them to `~/.config/telegram-cli/config.json`:

```json
{
  "api_id": "your_api_id",
  "api_hash": "your_api_hash"
}
```

Then log in:

```bash
tg auth login
```

## Commands

### Auth & Session

```bash
tg auth login              # Interactive login (phone + code + 2FA)
tg auth status             # Check auth status
tg auth logout             # Log out and destroy session
tg session export          # Export session string for portability
tg session import <string> # Import session string
```

### Chats

```bash
tg chat list [--limit N] [--type group|channel|user]
tg chat info <chat>
tg chat join <username-or-invite-link>
tg chat leave <chat>
tg chat resolve <username-or-id>
tg chat invite-info <link>
tg chat members <chat> [--limit N] [--offset N]
tg chat topics <chat> [--limit N]
```

### Messages

```bash
# Read
tg message history <chat> [--limit N] [--since DATE] [--until DATE]
tg message search [--chat CHAT] [--query TEXT] [--filter photos|videos|...]
tg message get <chat> <id1,id2,...>
tg message pinned <chat>
tg message replies <channel> <msg-ids>

# Write
tg message send <chat> <text> [--reply-to ID] [--markdown]
tg message edit <chat> <msg-id> <text>
tg message delete <chat> <ids> --revoke|--for-me
tg message forward <from-chat> <msg-ids> <to-chat>
tg message react <chat> <msg-id> <emoji> [--remove]
tg message pin <chat> <msg-id> [--notify]
tg message unpin <chat> <msg-id>
tg message poll <chat> --question <q> --option <o1> --option <o2> [--quiz --correct N]
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
tg contact add <username-or-phone> [--first NAME] [--last NAME]
tg contact delete <user>
tg contact search <query> [--limit N]
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
tg auth login
SESSION=$(tg session export | jq -r '.data.session')

# Reuse in scripts / agents
echo "$SESSION" | tg session import
tg message search --query "meeting notes" --limit 10
tg chat list --fields id,title,unreadCount --jsonl
```

Pipe message text via stdin:

```bash
echo "Hello from the CLI" | tg message send mychat -
```

## Development

```bash
git clone <repo-url>
cd telegram-cli
npm install
npm run build
npm test
```

## License

MIT
