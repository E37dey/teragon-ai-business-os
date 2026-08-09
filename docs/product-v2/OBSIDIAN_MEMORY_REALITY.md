# Obsidian Memory — Reality Investigation (S13.0, **verdict corrected S13.7**)

> **CORRECTION (S13.7):** the original S13.0 verdict "OBSIDIAN MEMORY NOT CONNECTED" was **imprecise**.
> A **functional Obsidian import/export bridge does exist** and is wired into `/memory`. The accurate
> classification is **`MANUAL_IMPORT + MANUAL_EXPORT` (Obsidian-compatible, governed)** — see below.
> What remains true from S13.0 is the *narrower* fact: there is **no live vault sync** and **no direct
> local-folder access**. The detailed file-level evidence below (no File System Access API, IndexedDB
> storage, noop agent search port) is unchanged and still correct; only the top-line label is corrected.

**Corrected verdict: `OBSIDIAN — MANUAL IMPORT/EXPORT BRIDGE (functional, governed) · NOT a live vault sync`.**

TERAGON **is** connected to Obsidian **through a manual, Obsidian-compatible Markdown/ZIP import and
export** (`src/memory/import/*`, `src/memory/export/*`, `ObsidianVaultAdapter` in
`src/memory/import/vaultAdapter.ts`), surfaced on `/memory` via `ImportPanel` + `ExportPanel`. It parses
Obsidian frontmatter + wikilinks, imports through a secure staged pipeline that creates **proposals only**
(writes to memory require explicit human approval), and exports an audited + checksummed download the user
can place into their own vault. The app's own status line is honest and dual:
`"ייבוא וייצוא Obsidian פעיל"` **and** `"גישה מקומית ישירה אינה פעילה"` (`src/memory/export/status.ts`).

It is **not** a live two-way vault sync: it never opens an `.obsidian` folder handle (no File System Access
API — grep 0 hits), never auto-syncs, and has no direct local-folder access. It is **user-triggered** (file
picker in, browser download out), functional (real markdown/frontmatter/wikilink/ZIP engines + governed
pipeline — not a mock), and browser-local. The underlying storage is **IndexedDB** (governed `memoryRecords`);
Obsidian is the **file-format transport bridge**, architecturally distinct from IndexedDB storage. The
separate `memoryEntries` local CRUD (PR D) has **no** Obsidian bridge — it is IndexedDB-only.

---

*(Original S13.0 investigation text retained below for the record.)*

The S13.0 classification was **LOCAL_ONLY** — more than a mockup (real IndexedDB persistence,
real markdown parse/serialize, real zip encode, governed proposal→approval flow), but
**not** a live external *vault-sync* integration. The "Obsidian" branding refers to Obsidian-*compatible*
markdown/frontmatter format plus the manual import/export bridge, not a live vault link. The app's own UI states this honestly:
`"גישה מקומית ישירה אינה פעילה"` (direct local access is not active) — `src/memory/export/status.ts:5-6`.

## Traced data flow (end-to-end)

```
UI (MemoryPage / ImportPanel / ExportPanel)
  → getMemoryEngine()               src/memory/core/engine.ts:22
  → IndexedDBMemoryAdapter          src/memory/adapters/MemoryRepository.ts:56
  → memoryStores()                  src/memory/repositories/memoryStores.ts:79
  → getRepository("memoryRecords")  src/repositories/factory.ts:46
  → IndexedDBRepository (browser IndexedDB) — DEFAULT provider LOCAL_INDEXEDDB
```

- **Import in** = HTML `<input type="file" accept=".md,.markdown,.zip">` — the user manually
  picks files (`src/memory/import/ui/ImportPanel.tsx:110-118`, `:42-44`). No `showDirectoryPicker`,
  no File System Access API anywhere in `src` (grep: zero hits).
- **Export out** = `Blob` + `<a download>` browser download (`src/memory/export/exporter.ts:162-173`).
  Lands in the browser Downloads folder; TERAGON cannot choose the destination and cannot write into a vault.

## The 10 questions (evidence-cited)

| # | Question | Answer | Evidence |
|---|----------|--------|----------|
| 1 | Real Obsidian integration (reads/writes a `.obsidian` vault)? | **NO** | `MarkdownVaultAdapter — INTERFACE ONLY … ships no markdown/zip engine` — `MemoryRepository.ts:7-8`; `ObsidianVaultAdapter` takes an in-memory array, never opens a folder — `import/vaultAdapter.ts:24` |
| 2 | Reads a real/local Obsidian vault? | **NO** | Files enter only via file picker; no FS Access API (grep 0 hits); only `navigator.storage.estimate` used — `system-health/checks.ts:116` |
| 3 | Writes markdown notes to disk? | **NO** | Export = browser download only — `exporter.ts:162-173` |
| 4 | Configured vault path? | **None exists** | Import folder label is a literal string `"ייבוא Obsidian"` — `import/pipeline.ts:287`; no vault setting anywhere |
| 5 | Any agent retrieves memories from it? | **Effectively NO** | Wiki agent defines `MemorySearchPort.searchApprovedMemory` but defaults to `noopMemorySearchPort` returning `[]` — `agents/wiki/wikiAgent.ts:48-56, 206`; no code wires a real port; the 14-action engine has **zero** memory references |
| 6 | Retrieval semantic / lexical / metadata / fake? | **Metadata + lexical, deterministic** (agent-side is noop) | Customer memory = frontmatter/​wikilink metadata match — `integration/customer360Memory.ts:33-50`; knowledge search = deterministic token overlap, disclosed `"חיפוש טקסטואלי דטרמיניסטי"` — `ai-copilot/memoryOps.ts:295`; **no** embedding/vector search anywhere |
| 7 | Persists after reload? | **YES — but via IndexedDB (per-browser), not Obsidian** | Default provider `LOCAL_INDEXEDDB` — `persistence/provider.ts:15,34`; `memoryRecords/Proposals/Versions` are IndexedDB collections — `repositories/collections.ts:37-46`. Supabase mapping exists (`persistence/supabase/domains/knowledgeMemory.ts:40`) but is opt-in only, off by default |
| 8 | Memory event/run history? | **YES** | `memoryImportJobs`/`memoryExportJobs` written in `commitImport` (`pipeline.ts:383`) and `runExport` (`exporter.ts:302`), each with an AuditEvent (`pipeline.ts:454`); versions are append-only — all in IndexedDB |
| 9 | Screen classification | **LOCAL_ONLY** | Real IndexedDB + markdown + zip + governed proposals, but no live vault/filesystem link — `export/status.ts:5-6` |
| 10 | What would make it genuinely useful | see below | — |

## What genuine usefulness requires

1. **Real vault sync** — implement the empty `MarkdownVaultAdapter` seam (`MemoryRepository.ts:42-47`)
   against a real `FileSystemDirectoryHandle` (File System Access API `showDirectoryPicker`, with
   persisted permission), **or** ship a desktop/companion shell (Electron/Tauri) or an Obsidian plugin
   so TERAGON can read/write an actual vault folder.
2. **A configured, persisted vault path/handle** in settings (none today).
3. **Wire real memory retrieval into agents** — replace `noopMemorySearchPort` (`wikiAgent.ts:54`) with
   an implementation over `memoryRecords`; ideally add semantic/embedding search rather than lexical-only.
4. **Optional durable/shared persistence** — flip to the existing Supabase provider so memory isn't
   trapped in one browser's IndexedDB.

## Honesty note (in TERAGON's favour)

The codebase is unusually candid: comments say `"מצב הדגמה"` (demo mode); the cloud adapter is an
*honest stub* that fails with `"לא זמין במצב הדגמה המקומי"` (`MemoryRepository.ts:92-101`); imports
create **proposals only** requiring human approval (`pipeline.ts:11-12`). **No fabricated Obsidian
connection is claimed by the code itself.** The problem is a **navigation/labelling promise**
(`"זיכרון ארגוני · Obsidian"`) that the product does not visibly keep — the fix is honest re-labelling
plus (later) a real adapter, not deletion.

## Product decision

- **Rename** the nav item away from a live-integration promise (e.g. `"זיכרון ארגוני (מקומי)"`) until a
  real adapter exists. — PR D.
- **Keep** the local engine (it is real and honest).
- **Defer** real Obsidian/File-System-Access integration to a scoped later PR; do **not** claim it now.
- A safe synthetic write→reload→retrieve proof is possible against **IndexedDB** (the real store), but
  **not** against Obsidian — because no Obsidian connection exists to prove. We will not fabricate one.
