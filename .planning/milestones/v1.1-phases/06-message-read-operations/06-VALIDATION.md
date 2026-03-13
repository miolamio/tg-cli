---
phase: 6
slug: message-read-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (installed, configured) |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/message-get.test.ts tests/unit/message-pinned.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/message-get.test.ts tests/unit/message-pinned.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "returns messages for valid IDs"` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "populates notFound"` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "rejects invalid IDs"` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "rejects over 100 IDs"` | ❌ W0 | ⬜ pending |
| 06-01-05 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "preserves order"` | ❌ W0 | ⬜ pending |
| 06-01-06 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/message-get.test.ts -t "all not found"` | ❌ W0 | ⬜ pending |
| 06-01-07 | 01 | 1 | READ-09 | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "returns pinned messages"` | ❌ W0 | ⬜ pending |
| 06-01-08 | 01 | 1 | READ-09 | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "empty chat"` | ❌ W0 | ⬜ pending |
| 06-01-09 | 01 | 1 | READ-09 | unit | `npx vitest run tests/unit/message-pinned.test.ts -t "pagination"` | ❌ W0 | ⬜ pending |
| 06-01-10 | 01 | 1 | READ-08 | unit | `npx vitest run tests/unit/format.test.ts -t "notFound"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/message-get.test.ts` — stubs for READ-08 (get by ID with found/notFound/validation/order)
- [ ] `tests/unit/message-pinned.test.ts` — stubs for READ-09 (pinned messages with pagination, empty state)
- [ ] Add test cases to existing `tests/unit/format.test.ts` for notFound footer formatting

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| E2E get messages from real Telegram chat | READ-08 | Requires live Telegram session | `tg message get @test_chat 1,2,3 --json` — verify output shape |
| E2E pinned messages from real chat | READ-09 | Requires live Telegram session | `tg message pinned @test_chat --json` — verify output shape |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
