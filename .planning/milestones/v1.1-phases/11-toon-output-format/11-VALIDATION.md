---
phase: 11
slug: toon-output-format
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-13
---

# Phase 11 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | `vitest.config.ts` |
| **Quick run command** | `npx vitest run tests/unit/toon.test.ts tests/unit/output-toon.test.ts tests/unit/toon-benchmark.test.ts` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/toon.test.ts tests/unit/output-toon.test.ts tests/unit/toon-benchmark.test.ts`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 11-01-01 | 01 | 0 | OUT-07g | unit | `npx vitest run tests/unit/toon.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-02 | 01 | 0 | OUT-07a,b | unit | `npx vitest run tests/unit/output-toon.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-03 | 01 | 0 | OUT-07f | unit | `npx vitest run tests/unit/toon-benchmark.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-04 | 01 | 0 | OUT-07f | fixture | N/A (data files) | ❌ W0 | ⬜ pending |
| 11-01-05 | 01 | 1 | OUT-07g | unit | `npx vitest run tests/unit/toon.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-06 | 01 | 1 | OUT-07a,b,c,d,e | unit | `npx vitest run tests/unit/output-toon.test.ts` | ❌ W0 | ⬜ pending |
| 11-01-07 | 01 | 1 | OUT-07h | integration | `npx vitest run tests/integration/cli-entry.test.ts` | ✅ | ⬜ pending |
| 11-01-08 | 01 | 1 | OUT-07f | unit | `npx vitest run tests/unit/toon-benchmark.test.ts` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/toon.test.ts` — stubs for OUT-07g (encodeToon wrapper)
- [ ] `tests/unit/output-toon.test.ts` — stubs for OUT-07a through OUT-07e (output mode integration)
- [ ] `tests/unit/toon-benchmark.test.ts` — stubs for OUT-07f (benchmark gate)
- [ ] `tests/fixtures/toon-benchmark/` — synthetic JSON fixtures directory
- [ ] `tests/fixtures/toon-benchmark/messages-100.json` — 100+ message items
- [ ] `tests/fixtures/toon-benchmark/chat-list-50.json` — 50+ chat list items
- [ ] `tests/fixtures/toon-benchmark/user-profiles-10.json` — 10 user profiles
- [ ] `tests/fixtures/toon-benchmark/search-results-30.json` — 30 search result items
- [ ] `tests/fixtures/toon-benchmark/mixed-shapes.json` — mixed data shapes
- [ ] Integration test extension in `cli-entry.test.ts` for `--toon` flag

*Existing infrastructure covers test framework — vitest is already configured.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|

*All phase behaviors have automated verification.*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
