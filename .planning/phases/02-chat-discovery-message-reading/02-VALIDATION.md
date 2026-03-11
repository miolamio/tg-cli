---
phase: 2
slug: chat-discovery-message-reading
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 3.2.4 |
| **Config file** | vitest.config.ts |
| **Quick run command** | `npx vitest run tests/unit/ -x` |
| **Full suite command** | `npx vitest run` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npx vitest run tests/unit/ -x`
- **After every plan wave:** Run `npx vitest run`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 02-01-01 | 01 | 0 | CHAT-01 | unit | `npx vitest run tests/unit/chat-list.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-02 | 01 | 0 | CHAT-02 | unit | `npx vitest run tests/unit/chat-info.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-03 | 01 | 0 | CHAT-03 | unit | `npx vitest run tests/unit/chat-join.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-04 | 01 | 0 | CHAT-04 | unit | `npx vitest run tests/unit/chat-leave.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-05 | 01 | 0 | CHAT-05 | unit | `npx vitest run tests/unit/peer-resolve.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-06 | 01 | 0 | CHAT-06 | unit | `npx vitest run tests/unit/chat-invite.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-01-07 | 01 | 0 | CHAT-07 | unit | `npx vitest run tests/unit/chat-members.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-01 | 02 | 0 | READ-01 | unit | `npx vitest run tests/unit/message-history.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-02 | 02 | 0 | READ-02 | unit | `npx vitest run tests/unit/message-history.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-03 | 02 | 0 | READ-03 | unit | `npx vitest run tests/unit/message-search.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-02-04 | 02 | 0 | READ-04 | unit | `npx vitest run tests/unit/message-search.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-xx-xx | shared | 0 | all | unit | `npx vitest run tests/unit/serialize.test.ts -x` | ❌ W0 | ⬜ pending |
| 02-xx-xx | shared | 0 | READ-* | unit | `npx vitest run tests/unit/entity-markdown.test.ts -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/unit/chat-list.test.ts` — covers CHAT-01 (dialog listing, type filtering, pagination)
- [ ] `tests/unit/chat-info.test.ts` — covers CHAT-02 (full chat info for channel, supergroup, basic chat)
- [ ] `tests/unit/chat-join.test.ts` — covers CHAT-03 (join by username, join by invite link)
- [ ] `tests/unit/chat-leave.test.ts` — covers CHAT-04 (leave channel/supergroup)
- [ ] `tests/unit/peer-resolve.test.ts` — covers CHAT-05 (resolve by username, by ID, by phone, error cases)
- [ ] `tests/unit/chat-invite.test.ts` — covers CHAT-06 (check invite: already member, preview, invalid)
- [ ] `tests/unit/chat-members.test.ts` — covers CHAT-07 (member list, pagination, permission errors)
- [ ] `tests/unit/message-history.test.ts` — covers READ-01, READ-02 (history, pagination, date range)
- [ ] `tests/unit/message-search.test.ts` — covers READ-03, READ-04 (per-chat and global search)
- [ ] `tests/unit/serialize.test.ts` — covers shared serialization (Dialog->ChatListItem, Message->MessageItem)
- [ ] `tests/unit/entity-markdown.test.ts` — covers entity-to-markdown conversion

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Join via invite link (real) | CHAT-03 | Requires actual Telegram invite link | Use E2E test with real session |
| Date range filtering accuracy | READ-02 | Empty search string behavior needs runtime validation | Run against real chat with known date boundaries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending