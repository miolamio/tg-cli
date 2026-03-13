---
phase: 7
slug: message-write-operations
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/message-edit.test.ts tests/unit/message-delete.test.ts tests/unit/message-pin.test.ts tests/unit/message-unpin.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/message-edit.test.ts tests/unit/message-delete.test.ts tests/unit/message-pin.test.ts tests/unit/message-unpin.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 0 | WRITE-09 | unit | `npx vitest run tests/unit/message-edit.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 0 | WRITE-10 | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 0 | WRITE-11 | unit | `npx vitest run tests/unit/message-pin.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 0 | WRITE-12 | unit | `npx vitest run tests/unit/message-unpin.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | WRITE-09 | unit | `npx vitest run tests/unit/message-edit.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-06 | 01 | 1 | WRITE-10 | unit | `npx vitest run tests/unit/message-delete.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-07 | 01 | 1 | WRITE-11 | unit | `npx vitest run tests/unit/message-pin.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-01-08 | 01 | 1 | WRITE-12 | unit | `npx vitest run tests/unit/message-unpin.test.ts -x` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | ALL | unit | `npx vitest run tests/unit/format.test.ts -x` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/message-edit.test.ts` — stubs for WRITE-09 (edit action, stdin pipe, error translation)
- [ ] `tests/unit/message-delete.test.ts` — stubs for WRITE-10 (delete with revoke/for-me, batch IDs, split result)
- [ ] `tests/unit/message-pin.test.ts` — stubs for WRITE-11 (pin with silent default, notify opt-in)
- [ ] `tests/unit/message-unpin.test.ts` — stubs for WRITE-12 (unpin by ID, synthesized confirmation)
- [ ] `tests/unit/format.test.ts` — extend with formatDeleteResult, formatPinResult tests

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Channel delete always revokes for everyone | WRITE-10 | Requires real Telegram channel admin permissions | 1. Send message to channel 2. Run `tg message delete <channel> <id> --for-me` 3. Verify message deleted for everyone (channel behavior) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
