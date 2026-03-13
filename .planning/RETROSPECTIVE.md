# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.0 — MVP

**Shipped:** 2026-03-12
**Phases:** 5 | **Plans:** 15

### What Was Built
- Full Telegram CLI with auth, chat management, messaging, media, forum topics
- 4 output modes: JSON, human-readable, JSONL, field selection
- 41 requirements implemented covering auth, chat, read, write, output, infra

### What Worked
- Vertical slice approach: each phase delivered end-to-end functionality
- TDD with Wave 0 test stubs before implementation
- Consistent serialization pipeline (serializeMessage → formatData → output)

### What Was Inefficient
- Phase 2 needed a UAT gap closure plan (02-04) for edge cases found late

### Patterns Established
- withClient wrapper for all networked commands
- resolveEntity for peer resolution
- outputSuccess/outputError envelope pattern
- formatData dispatch for human-readable output

### Key Lessons
1. Ship vertical slices, not horizontal layers — each phase delivers usable features
2. serialization + format + output pipeline is the backbone — invest early

---

## Milestone: v1.1 — Новые дополнения

**Shipped:** 2026-03-13
**Phases:** 6 | **Plans:** 10

### What Was Built
- Message management: get by ID, pinned, edit, delete, pin/unpin
- User profiles with privacy indicators, block/unblock, blocked list
- Contacts CRUD with dual-route add (username vs phone)
- Poll creation with quiz mode, multiple choice, auto-close
- TOON output format with 31-40% token savings benchmark gate
- translateTelegramError covering 20+ RPC error codes

### What Worked
- Reuse of v1.0 pipeline: new features slot into existing serialize → format → output flow
- Research phase per domain area identified API patterns upfront (e.g., Buffer.equals for polls)
- TOON benchmark gate caught that nested objects break tabular optimization early
- Parallel phase execution where dependencies allowed (8, 9, 10 independent of each other)

### What Was Inefficient
- message/get.ts and message/pinned.ts shipped with formatError instead of translateTelegramError (OBS-1)
- Some ROADMAP.md phase entries had inconsistent formatting (missing milestone column)

### Patterns Established
- translateTelegramError with duck-typing for RPCError detection
- Safety-first defaults (delete requires explicit --revoke/--for-me, pin defaults to silent)
- Dual-route commands with input auto-detection (isPhoneInput regex)
- className-based entity validation for testability

### Key Lessons
1. Safety-first API design prevents foot-guns — explicit flags > implicit defaults for destructive ops
2. Benchmark gates add confidence — TOON 20% threshold caught real optimization limitations
3. Vertical slices continue to scale — 6 phases in v1.1 each self-contained

### Cost Observations
- Model mix: 100% opus (quality profile)
- Sessions: ~6 (one per phase)
- Notable: 10 plans completed in 1.83 hours total (v1.0 + v1.1), avg 5min/plan

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 5 | 15 | Established pipeline: serialize → format → output |
| v1.1 | 6 | 10 | Added error translation, safety-first defaults, TOON output |

### Cumulative Quality

| Milestone | Tests | Total LOC | New Commands |
|-----------|-------|-----------|-------------|
| v1.0 | ~400 | 12,000 | 20+ |
| v1.1 | 619 | 19,242 | 12 (get, pinned, edit, delete, pin, unpin, profile, block, unblock, blocked, contact ×4, poll) |

### Top Lessons (Verified Across Milestones)

1. Vertical slices > horizontal layers — proven across both milestones
2. Invest in shared infrastructure (serialize, format, output) — pays compound dividends
3. Research phases prevent wasted implementation time — gramjs API quirks found early
