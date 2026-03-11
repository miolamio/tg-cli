---
phase: 3
slug: messaging-interaction
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/message-send.test.ts tests/unit/message-forward.test.ts tests/unit/message-react.test.ts tests/unit/format.test.ts -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/message-send.test.ts tests/unit/message-forward.test.ts tests/unit/message-react.test.ts tests/unit/format.test.ts -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 0 | WRITE-01 | unit | `npx vitest run tests/unit/message-send.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-02 | 01 | 0 | WRITE-02 | unit | `npx vitest run tests/unit/message-send.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-03 | 01 | 0 | WRITE-03 | unit | `npx vitest run tests/unit/message-forward.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-04 | 01 | 0 | WRITE-05 | unit | `npx vitest run tests/unit/message-react.test.ts -x` | ❌ W0 | ⬜ pending |
| 03-01-05 | 01 | 0 | OUT-03 | unit | `npx vitest run tests/unit/format.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/message-send.test.ts` — stubs for WRITE-01, WRITE-02 (send + reply)
- [ ] `tests/unit/message-forward.test.ts` — stubs for WRITE-03 (forward)
- [ ] `tests/unit/message-react.test.ts` — stubs for WRITE-05 (react)
- [ ] `tests/unit/format.test.ts` — stubs for OUT-03 (human-readable formatters)

*Existing test infrastructure (vitest config, mock patterns) fully covers needs. No new framework setup required.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Telegram renders markdown entities correctly | WRITE-01 | Server-side rendering validation | Send `**bold** and __italic__` to test chat, verify in Telegram app |
| Emoji reaction appears on message | WRITE-05 | Telegram server-side state | Run `tg message react <chat> <msgId> 👍`, verify in Telegram app |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
