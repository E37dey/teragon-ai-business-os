# S14.3 — Obsidian Phase 2 · Governed Import into memoryRecords (evidence)

Lets a user take a note from the connected **read-only** Obsidian Vault and import it into TERAGON's
**governed** knowledge (`memoryRecords`) through the existing proposal → **explicit human approval** pipeline.

> **This is governed manual import, NOT synchronization.** No automatic writes, no agent writes, no Vault
> mutation, no live auto-updating link. Each import is a one-time, human-approved action.

> **VERDICT: OBSIDIAN PHASE 2 — GOVERNED IMPORT VALIDATED** against the actual installed Obsidian Desktop
> 1.13.4 + synthetic vault `TERAGON OS`, from the real TERAGON browser.

## Architecture (reuses the existing governed pipeline — no new engine)

```
Obsidian note (read-only bridge, Phase 1)
   → user reads it → "ייבא לידע" → Import preview (source=Obsidian, dest=ידע מנוהל, NOT-sync warning)
   → "צור הצעת ייבוא"
       → ObsidianVaultAdapter.importVault([{path,content}])  (src/memory/import/vaultAdapter.ts)
         → prepareImport → commitImport  → memoryImportJobs + memorySources + memoryProposals("ממתין לאישור")
         → NOTHING written to memoryRecords
   → existing ProposalQueue → named human "אשר לזיכרון" (workflow.approve) → memoryRecords (+ immutable memoryVersions + audit)
                            → or "דחה" (workflow.reject, reason required) → no mutation
```

New code is thin: `src/integration/obsidian/obsidianImport.ts` (reuses `getMemoryEngine()` + `ObsidianVaultAdapter`;
adds read-only new/changed/unchanged classification) and the import UI in
`src/modules/memory/obsidian/ObsidianVaultPanel.tsx`. The governed pipeline, ProposalQueue, approval engine,
`memoryRecords`, audit/versioning are **unchanged** and reused as-is.

## Exact import flow (UI)

1. Connect (Phase 1) → search → read a note → **NoteViewer** shows "ייבא לידע" (only after a real note is read).
2. Click → **Import preview** shows: title, Vault-relative path, `מקור = Obsidian · TERAGON OS`,
   `יעד = ידע מנוהל (memoryRecords)`, a **not-sync** warning, the new/changed/unchanged status, frontmatter,
   and a bounded Markdown preview. Actions: **צור הצעת ייבוא** / **ביטול**. Nothing is imported yet.
3. "צור הצעת ייבוא" creates a governed **proposal** (`ממתין לאישור`) + a secured `memorySource`. No `memoryRecords` write.
4. A named human approves in the existing **ProposalQueue** (`אשר לזיכרון`) → the record is created; or **דחה**
   (mandatory reason) → no mutation.

## Real Obsidian runtime proof (sanitized, browser + IndexedDB counts)

| Step | Evidence |
|------|----------|
| read note | live bridge `TERAGON OS` note read into the preview (real Markdown) |
| preview | `יעד = ידע מנוהל (memoryRecords)`, status **חדש**, not-sync warning shown |
| **proposal (no mutation)** | before `{records:5, proposals:0, sources:0}` → after **`{records:5, proposals:1, sources:1}`** — records **unchanged**, one pending proposal + one secured source |
| **approve** | ProposalQueue `אשר לזיכרון` → **records 5 → 6** (governed record created), proposal status **מאושר** |
| **duplicate (unchanged)** | re-import same note → status **"כבר יובא ללא שינוי"**, "צור הצעת ייבוא" **disabled** (reason shown) — no silent duplicate |
| **reject** | import Beta → proposal created (records 6 → 6) → `דחה` requires a reason → **records 6 → 6 unchanged**, proposal status **נדחה** |

Proposal statuses after the run: `[מאושר, נדחה]`. Source metadata preserved on the secured `memorySource`
(`kind:"external"`, `refId:"imported-markdown:<path>"`, `excerpt` = the full original note). Correlation/audit
preserved: `memory.import.submit` audit event with a correlation id (defaults to the proposal runId).

## Proposal-before-mutation proof (deterministic tests)

`tests/obsidian-import/governedImport.test.ts` (reuses `freshWorkflow`): creating the proposal leaves
`memoryRecords` count unchanged and produces one `ממתין לאישור` proposal + a secured source whose `excerpt`
equals the original; a named human `approve` then creates **exactly one** record (`approvalState:"מאושר"`,
`approvedBy:"צחי זוסטייהם"`, `version:1`, immutable version v1); a second `approve` is **blocked**; `reject`
creates **no** record. Classification: `new` before import, `unchanged`/`changed` after.

## Duplicate / changed behavior

Read-only classification (`classifyObsidianNote`) keys on the connected vault (`TERAGON OS`) + Vault-relative
path via the governed source `refId`, comparing stored `excerpt` to current content:
`new` (no source) · `unchanged` (identical) · `changed` (differs). Unchanged **disables** a second proposal
(no silent duplicate). A changed note requires an explicit new proposal → new approval (no auto-update, no
background diff sync).

## Source / destination separation

`memoryRecords` = governed TERAGON knowledge (destination). `memoryEntries` = separate local CRUD memory —
**not touched** by import. Obsidian Vault = external **read-only** source. Importing does not modify the note,
create sync, create an auto-updating link, copy into `memoryEntries`, or expose the Vault to agents.

## Read-only Vault + security proof

The Phase-1 read-only guarantee is unchanged and re-verified: bridge `POST/PUT/PATCH/DELETE` → **405**; the
Obsidian notes on disk are **unmodified** after the full import/approve/reject run (still 3 synthetic notes,
byte-identical); import reads content only through the existing authenticated read-only bridge; path
validation / `.obsidian` rejection / size bounds / sanitized errors / fail-closed remain in force; no token in
logs/docs/errors.

## Agents

No live Vault access for agents. No Wiki/Nexa/Mentor/Orchestrator wiring. Agents may only ever see content
**after** it has been approved into the governed knowledge system, per existing permissions. No new agent
capability was added.

## Responsive / accessibility

- **Axe (wcag2a+wcag2aa)** on `/memory` with the import preview open: **0 violations** (0 critical/serious).
- **Horizontal overflow: 0px** at **1440 / 1024 / 768 / 390**. RTL (`dir="rtl"`), dark mode (design tokens).
- Keyboard-operable dialog (focus-trapped Modal; 7 focusables), accessible Hebrew labels, disabled controls
  carry honest reasons. Approve (`אשר לזיכרון`, success) vs reject (`דחה`, danger, reason-gated) are clearly
  distinguished in the queue. **No uncaught JS console errors** during the flow.

## Automated gate

`tests/obsidian-import/*` (8 tests) green; full `vitest` **2660 passing** (12 `tests/platform/*` files fail to
*load* locally on Node v25 vite/rolldown shebang — pre-existing, unrelated; CI runs Node 22). `typecheck`,
`typecheck:tests`, `oxlint`, `scan:secrets` all pass/CLEAN. Diff = **4 files** (service + import UI + 2 tests);
the governed pipeline, `memoryRecords`, Supabase, migrations, agents, CI, and the plugin/bridge are untouched.

## Limitations (honest)

1. Duplicate/change identity uses (connected vault name `TERAGON OS`) + Vault-relative path via the source
   `refId`; within a single connected vault this is exact. Multi-vault identity would require encoding the
   vault name into the source key (future).
2. Approval/reject occur in the existing governed **ProposalQueue** (the single approval mechanism) — the
   import flow routes to it rather than duplicating approval controls.
3. `HTTPS_TO_LOOPBACK = UNVALIDATED` (unchanged) — no HTTPS-hosted TERAGON compatibility is claimed.
4. This is **governed manual import, not synchronization** — no live link, no auto-update, no background diff.
