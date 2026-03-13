---
phase: 10
slug: polls
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/message-poll.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/message-poll.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 10-01-01 | 01 | 1 | WRITE-13a | unit | `npx vitest run tests/unit/message-poll.test.ts -t "sends basic poll"` | No -- Wave 0 | ⬜ pending |
| 10-01-02 | 01 | 1 | WRITE-13b | unit | `npx vitest run tests/unit/message-poll.test.ts -t "quiz"` | No -- Wave 0 | ⬜ pending |
| 10-01-03 | 01 | 1 | WRITE-13c | unit | `npx vitest run tests/unit/message-poll.test.ts -t "flags"` | No -- Wave 0 | ⬜ pending |
| 10-01-04 | 01 | 1 | WRITE-13d | unit | `npx vitest run tests/unit/message-poll.test.ts -t "validation"` | No -- Wave 0 | ⬜ pending |
| 10-01-05 | 01 | 1 | WRITE-13e | unit | `npx vitest run tests/unit/serialize.test.ts -t "poll"` | No -- Wave 0 | ⬜ pending |
| 10-01-06 | 01 | 1 | WRITE-13f | unit | `npx vitest run tests/unit/format.test.ts -t "poll"` | No -- Wave 0 | ⬜ pending |
| 10-01-07 | 01 | 1 | WRITE-13g | unit | `npx vitest run tests/unit/format.test.ts -t "formatData.*poll"` | No -- Wave 0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/message-poll.test.ts` -- stubs for WRITE-13a through WRITE-13d (poll command action + validation)
- [ ] Poll serialization tests in `tests/unit/serialize.test.ts` -- covers WRITE-13e
- [ ] Poll format tests in `tests/unit/format.test.ts` -- covers WRITE-13f, WRITE-13g

*Existing infrastructure covers framework install -- vitest already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Poll renders in Telegram app | WRITE-13 | Requires real Telegram client | Send poll via CLI, verify in Telegram app |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
