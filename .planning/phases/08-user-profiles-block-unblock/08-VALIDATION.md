---
phase: 8
slug: user-profiles-block-unblock
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/user-profile.test.ts tests/unit/user-block.test.ts tests/unit/user-unblock.test.ts tests/unit/user-blocked.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/user-*.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 0 | USER-01 | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 0 | USER-02 | unit | `npx vitest run tests/unit/user-block.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-01-03 | 01 | 0 | USER-03 | unit | `npx vitest run tests/unit/user-unblock.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-01-04 | 01 | 0 | USER-04 | unit | `npx vitest run tests/unit/user-blocked.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-01-05 | 01 | 0 | ALL | unit | `npx vitest run tests/unit/format.test.ts -x` | ✅ extend | ⬜ pending |
| 08-01-06 | 01 | 0 | ALL | unit | `npx vitest run tests/unit/output.test.ts -x` | ✅ extend | ⬜ pending |
| 08-01-07 | 01 | 0 | ALL | integration | `npx vitest run tests/integration/cli-entry.test.ts -x` | ✅ extend | ⬜ pending |
| 08-02-01 | 01 | 1 | USER-01 | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-02-02 | 01 | 1 | USER-01 | unit | `npx vitest run tests/unit/user-profile.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-03-01 | 01 | 1 | USER-02 | unit | `npx vitest run tests/unit/user-block.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-03-02 | 01 | 1 | USER-03 | unit | `npx vitest run tests/unit/user-unblock.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-04-01 | 01 | 1 | USER-04 | unit | `npx vitest run tests/unit/user-blocked.test.ts -x` | ❌ W0 | ⬜ pending |
| 08-05-01 | 01 | 2 | ALL | unit | `npx vitest run tests/unit/format.test.ts tests/unit/output.test.ts -x` | ✅ extend | ⬜ pending |
| 08-06-01 | 01 | 2 | ALL | integration | `npx vitest run tests/integration/cli-entry.test.ts -x` | ✅ extend | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/user-profile.test.ts` — stubs for USER-01 (profile fetching, privacy, multi-user, bot fields, lastSeen)
- [ ] `tests/unit/user-block.test.ts` — stubs for USER-02 (block calls, error on non-user)
- [ ] `tests/unit/user-unblock.test.ts` — stubs for USER-03 (unblock calls)
- [ ] `tests/unit/user-blocked.test.ts` — stubs for USER-04 (blocked list, pagination, empty list)
- [ ] Extend `tests/unit/format.test.ts` — covers formatUserProfile, formatBlockedList, formatData dispatch
- [ ] Extend `tests/unit/output.test.ts` — covers JSONL for profiles/users list keys
- [ ] Extend `tests/integration/cli-entry.test.ts` — covers user --help

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Bio privacy vs "not set" | USER-01 | Cannot distinguish at API level | Run `tg user profile <user-with-hidden-bio>` and verify null handling |
| Photo count for privacy-restricted users | USER-01 | Requires real Telegram account with privacy settings | Run `tg user profile <restricted-user>` and verify photoCount fallback |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
