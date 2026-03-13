---
phase: 4
slug: media-files
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-12
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 04-01-T1 | 01 | 1 | READ-05, ALL | unit | `npx vitest run tests/unit/media-utils.test.ts tests/unit/serialize.test.ts -x` | ❌ TDD | ⬜ pending |
| 04-01-T2 | 01 | 1 | READ-05 | unit | `npx vitest run tests/unit/message-search.test.ts tests/unit/format.test.ts -x` | ✅ extend | ⬜ pending |
| 04-02-T1 | 02 | 2 | READ-07 | unit | `npx vitest run tests/unit/media-download.test.ts tests/integration/cli-entry.test.ts -x` | ❌ TDD | ⬜ pending |
| 04-02-T2 | 02 | 2 | WRITE-04 | unit | `npx vitest run tests/unit/media-send.test.ts -x` | ❌ TDD | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

*No separate Wave 0 — all plans use TDD (tdd="true"). Test files are created as the first step of each task, then implementation follows. Existing infrastructure (vitest, test fixtures) is sufficient.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Album send returns single Message | WRITE-04 | gramjs runtime behavior | Send 3+ files as album, verify all appear in chat |
| Progress callback display | READ-07, WRITE-04 | stderr output formatting | Download large file, verify progress updates on stderr |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
