# Milestones

## v1.0 MVP (Shipped: 2026-03-12)

**Phases:** 1-5 (15 plans)
**Git range:** feat(01-01) → feat(05-03)

**Key accomplishments:**
- Interactive Telegram login with 2FA, session persistence, import/export
- Chat discovery, info, join/leave, member lists, peer resolution
- Full messaging: send, reply, forward, react, history, search
- Media download/upload with 17 MTProto search filters
- Forum topics, multi-chat search, field selection, JSONL streaming
- Structured JSON output on all commands for agent consumption

---

## v1.1 Новые дополнения (Shipped: 2026-03-13)

**Phases:** 6-11 (10 plans)
**Git range:** feat(06-01) → feat(11-02)
**Commits:** 71 | **Files changed:** 104 | **Total LOC:** 19,242 TypeScript
**Timeline:** 2 days (2026-03-12 → 2026-03-13)

**Key accomplishments:**
- Message management: get by ID (batch with notFound), pinned messages, edit (stdin pipe), delete (explicit revoke/for-me), pin/unpin
- User profiles: bio, photo count, last seen, common chats, blocked status, privacy-restricted field indicators
- Block/unblock users with blocked list pagination
- Contacts CRUD: list, add (dual routing: username/phone), delete, search (contact + global results)
- Polls: quiz mode, multiple choice, anonymous/public, auto-close timer, client-side validation
- TOON output format: token-efficient `--toon` mode with 31-40% savings for LLM consumers
- Comprehensive error handling: translateTelegramError covering 20+ RPC error codes

**Tech debt (non-blocking):**
- message/get.ts and message/pinned.ts use formatError instead of translateTelegramError
- cli-entry.test.ts missing get, pinned, replies, poll subcommand checks

---

