---
phase: 5
slug: advanced-features-polish
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | WRITE-06 | unit | `npx vitest run tests/unit/chat-topics.test.ts -x` | Wave 0 | ⬜ pending |
| 05-01-02 | 01 | 1 | WRITE-06 | unit | `npx vitest run tests/unit/chat-topics.test.ts -x && npx tsc --noEmit` | Wave 0 | ⬜ pending |
| 05-02-01 | 02 | 1 | OUT-04 | unit | `npx vitest run tests/unit/fields.test.ts -x` | Wave 0 | ⬜ pending |
| 05-02-02 | 02 | 1 | OUT-05 | unit | `npx vitest run tests/unit/output.test.ts tests/unit/fields.test.ts -x && npx tsc --noEmit` | Extend existing | ⬜ pending |
| 05-03-01 | 03 | 2 | WRITE-07, WRITE-08 | unit | `npx vitest run tests/unit/message-history.test.ts tests/unit/message-send.test.ts -x && npx tsc --noEmit` | Extend existing | ⬜ pending |
| 05-03-02 | 03 | 2 | READ-06 | unit | `npx vitest run tests/unit/message-search.test.ts -x && npx tsc --noEmit` | Extend existing | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat-topics.test.ts` — stubs for WRITE-06 (topic listing, serialization, forum guard)
- [ ] `tests/unit/fields.test.ts` — stubs for OUT-04 (pickFields utility, dot notation, edge cases)
- [ ] Extend `tests/unit/message-history.test.ts` — stubs for WRITE-07 (--topic flag passes replyTo)
- [ ] Extend `tests/unit/message-send.test.ts` — stubs for WRITE-08 (--topic flag passes replyTo)
- [ ] Extend `tests/unit/message-search.test.ts` — stubs for READ-06 (comma-separated --chat)
- [ ] Extend `tests/unit/output.test.ts` — stubs for OUT-05 (JSONL mode, field filtering)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Forum topic interaction in live supergroup | WRITE-06, WRITE-07, WRITE-08 | Requires real Telegram forum-enabled supergroup | 1. Find/create forum supergroup 2. `tg chat topics <chat>` 3. `tg message history <chat> --topic <id>` 4. `tg message send <chat> --topic <id> "test"` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
