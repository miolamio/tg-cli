---
phase: 1
slug: foundation-auth
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-10
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.0.18 |
| **Config file** | none — Wave 0 installs |
| **Quick run command** | `npx vitest run --reporter=verbose` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run --reporter=verbose`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 01-01-01 | 01 | 0 | INFRA-01 | integration | `npx vitest run tests/integration/cli-entry.test.ts -t "binary"` | ❌ W0 | ⬜ pending |
| 01-01-02 | 01 | 0 | INFRA-02 | unit | `npx vitest run tests/unit/rate-limit.test.ts` | ❌ W0 | ⬜ pending |
| 01-01-03 | 01 | 0 | INFRA-03 | unit | `npx vitest run tests/unit/session-store.test.ts -t "lock"` | ❌ W0 | ⬜ pending |
| 01-01-04 | 01 | 0 | INFRA-04 | unit | `npx vitest run tests/unit/config.test.ts -t "credentials"` | ❌ W0 | ⬜ pending |
| 01-01-05 | 01 | 0 | INFRA-05 | unit | `npx vitest run tests/unit/client.test.ts -t "lifecycle"` | ❌ W0 | ⬜ pending |
| 01-01-06 | 01 | 0 | INFRA-06 | unit | `npx vitest run tests/unit/config.test.ts -t "config file"` | ❌ W0 | ⬜ pending |
| 01-02-01 | 02 | 1 | AUTH-01 | unit | `npx vitest run tests/unit/auth.test.ts -t "login"` | ❌ W0 | ⬜ pending |
| 01-02-02 | 02 | 1 | AUTH-02 | unit | `npx vitest run tests/unit/auth.test.ts -t "2FA"` | ❌ W0 | ⬜ pending |
| 01-02-03 | 02 | 1 | AUTH-03 | unit | `npx vitest run tests/unit/session-store.test.ts -t "persist"` | ❌ W0 | ⬜ pending |
| 01-02-04 | 02 | 1 | AUTH-04 | unit | `npx vitest run tests/unit/session.test.ts -t "export"` | ❌ W0 | ⬜ pending |
| 01-02-05 | 02 | 1 | AUTH-05 | unit | `npx vitest run tests/unit/session.test.ts -t "import"` | ❌ W0 | ⬜ pending |
| 01-02-06 | 02 | 1 | AUTH-06 | unit | `npx vitest run tests/unit/auth.test.ts -t "status"` | ❌ W0 | ⬜ pending |
| 01-02-07 | 02 | 1 | AUTH-07 | unit | `npx vitest run tests/unit/auth.test.ts -t "logout"` | ❌ W0 | ⬜ pending |
| 01-03-01 | 03 | 1 | OUT-01 | unit | `npx vitest run tests/unit/output.test.ts -t "json"` | ❌ W0 | ⬜ pending |
| 01-03-02 | 03 | 1 | OUT-02 | unit | `npx vitest run tests/unit/output.test.ts -t "envelope"` | ❌ W0 | ⬜ pending |
| 01-03-03 | 03 | 1 | OUT-06 | unit | `npx vitest run tests/unit/output.test.ts -t "stderr"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `vitest.config.ts` — vitest configuration file
- [ ] `tests/unit/output.test.ts` — stubs for OUT-01, OUT-02, OUT-06
- [ ] `tests/unit/config.test.ts` — stubs for INFRA-04, INFRA-06
- [ ] `tests/unit/session-store.test.ts` — stubs for INFRA-03, AUTH-03
- [ ] `tests/unit/client.test.ts` — stubs for INFRA-05
- [ ] `tests/unit/rate-limit.test.ts` — stubs for INFRA-02
- [ ] `tests/unit/auth.test.ts` — stubs for AUTH-01, AUTH-02, AUTH-06, AUTH-07
- [ ] `tests/unit/session.test.ts` — stubs for AUTH-04, AUTH-05
- [ ] `tests/integration/cli-entry.test.ts` — stubs for INFRA-01
- [ ] Framework install: `npm install -D vitest` — no test infrastructure exists yet

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Interactive phone/code/2FA prompt flow | AUTH-01, AUTH-02 | Requires real Telegram server interaction and user input | Run `tg auth login`, enter real phone, code, and 2FA password |
| Session persistence across terminal restart | AUTH-03 | Requires process lifecycle (close + reopen terminal) | Login, close terminal, reopen, run `tg auth status` |
| Session portability across machines | AUTH-04, AUTH-05 | Requires second machine or environment | Export session on machine A, import on machine B, verify auth |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
