---
phase: 9
slug: contacts-crud
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 9 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (in project) |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/contact-*.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/contact-*.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 09-01-01 | 01 | 1 | CONT-01 | unit | `npx vitest run tests/unit/contact-list.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-02 | 01 | 1 | CONT-02 | unit | `npx vitest run tests/unit/contact-add.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-03 | 01 | 1 | CONT-03 | unit | `npx vitest run tests/unit/contact-delete.test.ts -x` | ❌ W0 | ⬜ pending |
| 09-01-04 | 01 | 1 | CONT-04 | unit | `npx vitest run tests/unit/contact-search.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/contact-list.test.ts` — stubs for CONT-01
- [ ] `tests/unit/contact-add.test.ts` — stubs for CONT-02
- [ ] `tests/unit/contact-delete.test.ts` — stubs for CONT-03
- [ ] `tests/unit/contact-search.test.ts` — stubs for CONT-04

*Existing infrastructure covers framework install (vitest already configured).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| N+1 GetFullUser rate limiting | CONT-01 | Requires real Telegram API with large contact list | Run `tg contact list` on account with 100+ contacts, check for FloodWait errors |
| Phone import with unregistered number | CONT-02 | Requires real phone number interaction | Run `tg contact add +1234567890 --first-name Test` with unregistered number |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
