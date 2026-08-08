# PR D — Real Local Memory (S13.4)

Turns `/memory` into a genuinely persistent, searchable, editable, **org-scoped** local-memory
capability, reusing the existing IndexedDB repository infrastructure. **Obsidian is not connected** — the
honest label "זיכרון מקומי" is kept and the page states plainly that data is local-only.

**Scope honesty:** no remote LLM, no MCP, no vector DB, no Obsidian API, no Supabase migration, no external
storage, no autonomous agent memory writes. `AI_REMOTE_ENABLED` unchanged. No Customers/Contacts
persistence, Production, or main changes.

## Before architecture

`/memory` was a **governed knowledge-memory** system: `memoryRecords` (+ proposals/versions/links/usage/
import-export) written **only** through a proposal→human-approval→immutable-version workflow. It is
already IndexedDB-persistent, but it is not a plain, directly-usable notes CRUD — every write is
approval-gated, and its tests assert nothing is written except via approval.

## After architecture

A **new, separate `memoryEntries` collection** provides an ungoverned, directly-usable CRUD memory,
reusing the same repository infrastructure (not a second persistence system). The governed system is
untouched and remains available under "זיכרון ממשל וקבלה (מתקדם)" below the new CRUD.

```
MemoryEntriesWorkspace (UI, /memory)         MemoryEntryRepository (org-scoped boundary)
  useCollection("memoryEntries")  ─────────►   list/get/create/update/archive/restore/search
  create/update/archive/restore   ─────────►   requireOrg(orgId) → FAIL-CLOSED if blank
        │                                        │  getRepository("memoryEntries")   [reused infra]
        ▼                                        ▼  IndexedDBRepository (browser, IDB v7)
  invalidateCollections(["memoryEntries"])       InMemory / fake-indexeddb (tests)
  activeMemoryForAgents(orgId, q)  ── READ-ONLY ► agents (Wiki/Nexa/Mentor) — never write
```

## Persistence location & honesty

- **Where:** browser **IndexedDB**, database `teragon-os`, object store `memoryEntries` (added at
  `IDB_VERSION = 7`). One record per `MemoryEntry`.
- **Survives reload:** **yes** — proven live (create → full page reload → entry still present) and in unit
  tests via `fake-indexeddb` (create → drop the repo connection/singletons = simulated reload → re-read).
- **Clearing browser/site data removes it.** It is **not synced between devices**, **not backed up
  remotely**, and **not production-grade organizational storage**. No fake sync icon/status. On-page notice:
  "נשמר מקומית במכשיר זה (IndexedDB) — אינו מחובר לכספת Obsidian או לשירות ענן."

## Reload proof (live)

Created "הוכחת התמדה — PR D" on `/memory` (row count 2 seed → 3), navigated to `/memory` again (full
reload) → the entry was **still present** (row count 3, `createdPersisted: true`). 0 console errors, 0
overflow.

## Organization-isolation proof

`MemoryEntryRepository` is org-scoped on **every** operation and fail-closed. Tests prove: entries created
under `org-1` and `org-2` are visible only to their own org (`list`/`search` return exactly the owner's
ids); a cross-org `get` returns `undefined`; a cross-org `update`/`archive` throws `MemoryNotFoundError`
and mutates nothing; a blank org id throws `MemoryOrgScopeError` (no global/unscoped query ever runs). The
LOCAL UI operates in one org context (`identity.organizationId` or a stable demo org); the isolation
mechanism is enforced in the boundary regardless.

## CRUD / search / filter results

Create (validated, explicit save) · Read (list + open) · Edit (title/content/tags/category; `updatedAt`
changes) · Archive/Restore (no hard delete; archived hidden by default, shown via the archived filter) ·
Search (title + content + tags) · Filter (category + active/archived). All persist across reload.
Invalid input fails closed — an error is shown and **no record is created** (no false success).

## AI read integration

`activeMemoryForAgents(orgId, query)` is the **one bounded, read-only** adapter for agents (Wiki search /
Nexa navigation context / Mentor learning reference) — active entries only, capped. **Agents may READ;
they may never create/update/archive** (proven by test: the module exposes no agent write path). Wiring
this adapter into the frozen deterministic action engine (replacing the wiki agent's `noopMemorySearchPort`)
and an agent "הצע שמירה בזיכרון" **proposal** path (user-confirmed write) are **deferred** — they would
materially expand this PR and touch the frozen agent engine.

## Responsive / a11y

0 document overflow and 0 console errors at 1440/1024/768/390; single column at 390; inline editor stacks.
Search/category/archived/new/save/edit/archive/restore are real buttons/inputs with accessible names;
keyboard-operable; honest loading/empty/error states; 0 NO_OP controls.

## Accessibility gate (`/memory` added to the REQUIRED CI a11y Pilot)

`/memory` is now in `e2e/pilot/a11y.pilot.ts` (the CI Accessibility job), scanned by Axe at **1440 + 390**
with **zero critical/serious** violations, **no exclusions, no disabled rules**. A dedicated memory test
verifies keyboard access + accessible names for search / category filter / archived toggle / "זיכרון חדש" /
title / content / tags / category / save / edit / archive / restore; visible focus; an **announced**
(`role="alert"`) error state; a labelled empty state; and **archived status conveyed by text** ("בארכיון"
+ a "שחזור" action) — never colour alone. Verified locally: **4/4** memory a11y tests pass (both viewports).

## IndexedDB v6 → v7 upgrade safety (real client-side migration)

Adding the store bumps `IDB_VERSION` 6→7 — a real client migration. Regression tests prove the upgrade
**preserves every existing store and its data** (e.g. `memoryRecords`, `customers` survive intact),
**adds only `memoryEntries`**, never wipes/clears existing IndexedDB data, and `seedIfEmpty` **never
overwrites user-created `memoryEntries`** (seeds only when the store is empty). The store-creation logic is
additive (`if (!contains) createObjectStore`), so existing users upgrade non-destructively.

## Tests

- **Repository (9, fake-indexeddb):** create/edit/archive/restore persist across a simulated reload;
  search title/content/tags; category + archived filters; org isolation; cross-org write fail-closed;
  missing-org fail-closed; invalid input writes nothing; agent read-only adapter.
- **UI (4):** honest notice + accessible controls; create persists & appears with **no network/Obsidian
  call**; archive hides + search filters; invalid input errors with no record.
- **IDB upgrade (3):** v6→v7 preserves stores + data / adds only memoryEntries; seed never overwrites user
  entries; seed populates only when empty.
- **/memory a11y Pilot (4, Chromium × 1440/390):** axe zero critical/serious + labelled/keyboard/archived-
  text/announced-error.
- build ✅ · typecheck ✅ · typecheck:tests ✅ · memory + repository + router/nav + rbac suites 307/307 ✅ ·
  full `vitest` **2597/2597** (16 new) — only the 12 known `tests/platform/*` Rolldown file-load failures
  remain (pre-existing, CI-authoritative). oxlint ✅. No `test.skip`/`test.fail`/weakened assertions.

## Limitations

- Local single-device only (IndexedDB); no sync/backup; cleared with site data.
- LOCAL identity has no real org (`""`), so the UI uses a stable demo org; isolation is enforced in the
  repository (proven), not by a live multi-tenant session.
- Governed memory remains a separate, still-rendered "advanced" surface (kept to preserve its tests);
  fully relocating it behind a tab is deferred (needs its e2e updated).
- Agent-engine memory retrieval + agent save-proposal path are deferred (see AI read integration).

## Explicit statement

**Obsidian is not connected.** This is local IndexedDB memory on one device — no Obsidian vault, no cloud,
no remote model.

## Source files

- New: `src/domain/memory/entry.ts`, `src/memory/entries/memoryEntryRepository.ts`,
  `src/modules/memory/MemoryEntriesWorkspace.tsx`, `tests/memory-entries/repository.test.ts`,
  `tests/memory-entries/workspace.test.tsx`, this file.
- Edited: `src/repositories/collections.ts` (+`memoryEntries`), `src/repositories/IndexedDBRepository.ts`
  (`IDB_VERSION` 6→7), `src/repositories/seed/index.ts` (+seed), `src/modules/memory/MemoryPage.tsx`
  (render the CRUD primary; governed system demoted to "advanced").
