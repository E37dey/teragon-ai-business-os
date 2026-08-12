# S14 — Real Obsidian App Connection · Architecture (design-only, NOT implemented)

Design for a **safe, minimal, real** connection between TERAGON, the **official Obsidian desktop app**, and
one **user-selected Obsidian Vault**, using **official Obsidian plugin/Vault APIs only**. This document is
the checkpoint deliverable — **no code is written here**; implementation waits for review.

**Naming:** this is **"חיבור מקומי ל-Obsidian" / "Obsidian Vault Connection"** — a **CONNECTED LOCAL VAULT
BRIDGE without automatic synchronization**. It is **not** "Obsidian Sync" (a separate official Obsidian
paid service) and must never be labelled as such.

---

## 0. Product V2 freeze relationship (important)

The **Product V2 academic submission remains FROZEN at `b4937822413c0a603071b6c424402ca8adc66512`**. This
live Obsidian Vault Connection is **POST-FREEZE / POST-SUBMISSION** product work — a *future* phased effort,
**not** part of the accepted Tested-MVP. The capability included in the frozen submission is the **manual
Obsidian-compatible import/export bridge only**; this document must not be read as changing that. The
already-accepted **Tested-MVP** classification (and its "no automatic Obsidian/cloud sync" statement) stays
as-is — live Vault connectivity is explicitly *not* claimed to have been part of Product V2.

---

## 1. Current state (what exists today — reuse, don't duplicate)

| Capability | Where | Reuse |
|-----------|-------|-------|
| Manual Markdown/ZIP **import** (frontmatter + wikilinks) | `src/memory/import/{pipeline,vaultAdapter}.ts`, `ImportPanel` | Feed live-read files into the **same** `ObsidianVaultAdapter.importVault(files[])` → governed pipeline |
| Manual **export** (audited + checksummed) | `src/memory/export/{exporter}.ts`, `ExportPanel` | Reuse `runExport` to serialize approved knowledge → Markdown for a live write |
| Governed **proposal → approval → version** | `src/memory/core/proposalWorkflow.ts` (+ ApprovalEngine) | Reuse for **every** Obsidian→memory import and every memory→Obsidian write |
| `memoryRecords` governed knowledge (IndexedDB) | `src/memory/repositories/memoryStores.ts` | Import destination / write source |
| `memoryEntries` local CRUD (IndexedDB) | `src/memory/entries/memoryEntryRepository.ts` | **Unchanged** — no Obsidian bridge |
| `/memory` UI | `src/modules/memory/MemoryPage.tsx` | Add ONE compact "Obsidian" section (no new dashboard) |
| Agent memory read seam | `src/agents/wiki/wikiAgent.ts` (`MemorySearchPort` / `noopMemorySearchPort`) | Wire a **read-only** Obsidian adapter here |
| Current "Obsidian" status | `src/memory/export/status.ts` | Replace the two static lines with real connection status |

**No live Obsidian API exists yet** (grep: 0 hits for `obsidian://`, `app.vault`, `getMarkdownFiles`). The
existing "Obsidian" is a **manual import/export bridge only**.

---

## 2. Recommended connection architecture

```
TERAGON (browser SPA, React)
    │  typed HTTP calls to 127.0.0.1 (loopback only) + bearer pairing token
    ▼
TERAGON Vault Bridge  ── a small OFFICIAL Obsidian community-style plugin, running INSIDE Obsidian desktop
    │  narrow capability API (no raw FS, no shell)
    ▼
Obsidian app.vault API  (getMarkdownFiles / cachedRead / create / process / metadataCache)
    ▼
the ONE currently-open, user-selected Vault
```

**Why a plugin + local bridge (and NOT browser File System Access alone):** TERAGON runs in a browser; it
cannot reach the *Obsidian application*, its Vault API, its metadata cache (wikilinks/frontmatter), or an
approval-mediating process from `showDirectoryPicker` — and File System Access is permission-fragile and
limited on Windows. A real connection to the **Obsidian app** requires code running **inside** Obsidian.
Obsidian plugins run in Electron with the Vault API and (via Node) can host a **loopback HTTP server** — the
proven pattern used by real integrations (e.g. the community "Local REST API" plugin). **A plugin IS
required/recommended** for a genuine Obsidian-app connection.

`obsidian://` URI is used **only** for the "פתח ב-Obsidian" navigation action — never for data transfer, and
never described as synchronization.

---

## 3. Responsibilities & trust boundary

**Loopback security contract (binding for every phase):**
- **Bind `127.0.0.1` only** — never `0.0.0.0`; **no LAN, no public exposure**; a user-set port.
- **Strong random pairing token** (generated in plugin settings): sent **only** in the `Authorization: Bearer`
  header — **never** in a query string / URL. **Rotatable and revocable** from plugin settings. Stored only
  where required (TERAGON: session memory), **never committed, never logged**.
- **Explicit Origin allowlist** (no `Access-Control-Allow-Origin: *`); reject unexpected Origin, unauthenticated
  requests, and malformed requests; validate the Host header (anti-CSRF / anti-DNS-rebind).
- **Bounded request/body sizes**; **no CSRF-style write path through GET** (and Phase 1 exposes no writes at all).
- Expose ONLY the narrow capability API (§4). **No** raw filesystem, **no** shell/command/plugin-command
  execution, **no** `.obsidian/` config access, **no** delete/rename.
- Confine every path to the Vault root (and optionally a user-set subfolder): normalize, reject `..`, absolute
  paths, `.obsidian/`, and symlink/path escape. Use `app.vault` APIs for all access; **never** `fs` directly.

**TERAGON (browser)** — orchestration/presentation + approval:
- Store the bridge URL + token in **sessionStorage/in-memory** (not logs, not IndexedDB by default).
- Typed `bridgeClient`; org-scope every read/reference; never auto-write.
- Run the **existing** governed proposal→approval flow for imports and writes.
- Never send Vault contents to a remote AI (`AI_REMOTE_ENABLED=false`).

**Hard boundary:** browser ⇄ plugin is the only channel; the plugin is least-privilege; all mutations are
human-approved; the bridge fails closed.

---

## 4. Plugin capability interface (narrow, conceptual)

```
getConnectionInfo()      → { vaultName, connectionType:"local-bridge", noteCount, lastReadAt, lastWriteAt }
listNotes(opts?)         → [{ path, mtime, size }]                       // markdown files only
readNote(path)           → { path, mtime, frontmatter, content, links }  // cachedRead + metadataCache
searchNotes(query)       → [{ path, mtime, snippet, score }]             // lexical over titles/content/tags
proposeWrite(op,path,content) → { proposalId, op, path, previewDiff }    // NO write — returns a preview
applyApprovedWrite(proposalId) → { ok, path, mtime }                     // create/update/append ONLY, post-approval
```
No `deleteNote`, no `writeArbitrary`, no `runCommand`, no `readConfig`. `op ∈ {create, update, append}`.

---

## 5. Connection sequence (Vault selection)

1. User installs the **TERAGON Vault Bridge** plugin and **opens the desired Vault** in Obsidian (this IS the vault selection — the plugin serves the one open vault; `app.vault.getName()`).
2. Plugin settings: user enables the bridge → it generates a **pairing token** + shows the loopback URL.
3. In TERAGON `/memory` → "חבר Obsidian": user pastes URL + token.
4. TERAGON calls `getConnectionInfo()`; on success stores the session token and shows **"מחובר ל-Vault: <name>"**. On failure → **"לא מחובר"** (no fabricated connectivity).

---

## 6. Read flow (user/org-scoped, never stored silently)

```
/memory → "חפש ב-Vault" or "ייבא לידע"
  → bridgeClient.searchNotes(q) / listNotes() / readNote(path)   (read-only, token-authenticated)
  → TERAGON displays results (reference only; ephemeral)
  → optional "ייבא לידע": build files[] = readNote(path) → ObsidianVaultAdapter.importVault(files)  [REUSE]
       → governed pipeline → PROPOSAL → human approval → memoryRecords
```
Reads are attributed to the active org; nothing is written to memory without approval.

## 7. Approved-write flow (human-controlled; no autonomous delete)

```
TERAGON approved knowledge → "הצע שמירה ב-Obsidian"
  → bridgeClient.proposeWrite(op, path, content)  → returns previewDiff (NO write yet)
  → TERAGON shows preview + op + target path       → explicit human approval
  → bridgeClient.applyApprovedWrite(proposalId)     → plugin validates path/op → app.vault.create()/process()
  → returns { ok, path, mtime } → TERAGON records lastWrite + writes an audit event (correlationId)
```
Only create/update/append. **No deletes. No writes without an explicit human approval click.**

---

## 8. Agent permissions

After the user connects a Vault, agents may **READ** only through a bounded capability adapter
(`obsidianReadForAgents` → `bridgeClient.searchNotes/readNote`, org-scoped, capped) wired into the existing
`MemorySearchPort` (Wiki search; Nexa/Mentor reference retrieved material). Agents must **NOT** modify or
delete Vault files, change Obsidian config, access `.obsidian` internals, or write without approval. All
writes stay user-controlled via §7.

---

## 9. Memory relationship (explicit — never silently merged)

- **`memoryEntries`** = TERAGON local IndexedDB CRUD. **No Obsidian bridge.**
- **`memoryRecords`** = governed TERAGON knowledge (proposals/versions).
- **Obsidian Vault** = external local knowledge source/destination.

Explicit flows only: *Obsidian note → read/reference* (ephemeral) **or** *Obsidian note → governed import
proposal → human approval → `memoryRecords`*; and *approved `memoryRecords` knowledge → write proposal →
human approval → Obsidian Vault note*. The three stores stay distinct.

---

## 10. Failure behavior (fail closed)

Bridge unreachable / token invalid / Origin mismatch / path rejected / write not approved → the operation
**fails closed** with a safe Hebrew message; status shows **"לא מחובר"**; no fake connectivity, no partial
write, no silent retry that mutates. Every call carries a correlationId; logs are sanitized (no vault
contents, no token).

---

## 11. Windows compatibility

Primary env is **Windows**. Obsidian desktop on Windows is Electron with Node — a plugin **can** host a
loopback HTTP server and use `app.vault`. TERAGON (browser) reaches `http://127.0.0.1:<port>`. **Caveat:** if
TERAGON is served over **HTTPS**, browsers block calling plain `http://127.0.0.1` (mixed content); mitigations
(pick at implementation): (a) run the demo TERAGON on `http://localhost`; (b) have the plugin serve **HTTPS**
with a locally-trusted cert; (c) document the loopback-http exception. Browser File System Access alone is
**not** sufficient (§2). **Verdict: Windows-compatible via the plugin/loopback approach.**

---

## 12. Implementation phases (refined — smallest first; PROPOSED, not implemented)

- **Phase 0 — TRANSPORT / SECURITY SPIKE ONLY (the required first step).** Prove the browser↔loopback
  transport and its security before any product feature. The spike tests **only**: (1) the plugin starts a
  local **read-only** bridge; (2) `GET /health` from TERAGON; (3) authenticated `GET /connection`;
  (4) authenticated `GET /notes`; (5) it works in the **actual target browser on Windows**; (6) the
  Origin/CORS policy is enforced (rejects unexpected Origin); (7) **no mixed-content / private-network
  browser block**; (8) plugin shutdown **closes the port**; (9) an unavailable bridge **fails closed**.
  **No** memory import, **no** agent integration, **no** writes, **no** product UI beyond a temporary
  diagnostic state. **If HTTPS→local-HTTP is blocked in the target browser/deployment, do NOT work around
  browser security** — document alternative transports (plugin HTTPS with a locally-trusted cert;
  `http://localhost` demo build; or a different channel) and re-review **before** Phase 1.
- **Phase 1 — read-only Vault connection:** connection status · vault name · list/search/read note · open in
  Obsidian · disconnect. Still **no writes, no import**.
- **Phase 2 — governed import into `memoryRecords`:** "ייבא לידע" feeds read notes into the **existing**
  `ObsidianVaultAdapter.importVault()` → proposal → human approval → `memoryRecords`.
- **Phase 3 — approved write proposals:** `proposeWrite`/`applyApprovedWrite` (create/update/append) with
  preview + explicit human approval; audit + lastWrite.
- **Phase 4 — optional, bounded agent READ access:** wire `MemorySearchPort` → a read-only Obsidian adapter.
- **Never:** automatic synchronization / continuous sync.

Each phase is a separate reviewed PR. Phase 0 must pass before Phase 1 is scoped.

## 13. Exact files/modules that would be added (Phase 1)

**New Obsidian plugin (separate mini-project):** `obsidian-plugin/teragon-vault-bridge/` — `manifest.json`,
`main.ts` (plugin lifecycle + settings/token), `server.ts` (loopback HTTP + auth/Origin guard), `capabilities.ts`
(list/read/search handlers over `app.vault`), `pathGuard.ts` (vault-root confinement).
**TERAGON (browser):** `src/integration/obsidian/bridgeClient.ts` (typed client), `src/integration/obsidian/connection.ts`
(connection state + token), `src/integration/obsidian/types.ts`, `src/modules/memory/ObsidianConnectionPanel.tsx`
(the §14 UX), plus tests `tests/obsidian/{bridgeClient,pathGuard,connection}.test.ts` and an a11y pilot entry.
Phase 2 adds `proposeWrite`/`applyApprovedWrite` in plugin + client + a write-approval UI; Phase 3 adds
`src/integration/obsidian/agentReadAdapter.ts`.

**Estimated source scope:** Phase 1 ≈ plugin ~350–550 LOC + TERAGON ~450–650 LOC (client/panel/tests).
Moderate; no changes to `memoryEntries`, Supabase, migrations, or the agent action engine.

---

## 14. Connection UX (one small section in `/memory` — no new dashboard)

```
Obsidian
Status: לא מחובר            [ חבר Obsidian ]     ← dialog: paste bridge URL + pairing token
—— after connection ——
מחובר ל-Vault: <vault name> · חיבור מקומי · נקרא לאחרונה <time>
[ בדוק חיבור ] [ פתח ב-Obsidian ] [ חפש ב-Vault ] [ ייבא לידע ] [ הצע שמירה ב-Obsidian ] [ נתק ]
```
Honest status only; every write goes through preview + approval; keyboard-operable, accessible names.

---

## 15. Security risks & mitigations

| Risk | Mitigation |
|------|-----------|
| Any localhost page calling the bridge (CSRF/DNS-rebind) | Bearer pairing token + Origin allowlist + Host-header check; 127.0.0.1 bind only |
| Path traversal / config exposure | Vault-root confinement, reject `..`/absolute/`.obsidian`; markdown-only |
| Accidental/overwriting writes | proposeWrite preview + explicit approval; create/update/append only; **no delete API** |
| Token/vault-content leakage | Token in session memory, never logged; sanitized logs; no vault content to remote AI |
| Mixed-content (HTTPS→http loopback) | Documented; plugin HTTPS or localhost-http demo (§11) |
| Agent overreach | Read-only bounded adapter; no agent write/delete/config API |

## 16. Test plan

Plugin: pathGuard rejects traversal/absolute/`.obsidian`; `readNote` returns frontmatter+content+links;
`applyApprovedWrite` does create/update/append and **not** delete (no such route); auth required; Origin
enforced. TERAGON: `bridgeClient` fails closed when unreachable/invalid token → status "לא מחובר"; reads
org-scoped; `ObsidianConnectionPanel` — connect flow, no fake connectivity, approval-before-write,
keyboard/a11y (added to the required a11y Pilot). Integration: proposeWrite→approve→applyApprovedWrite writes
exactly once; import→proposal→approval→`memoryRecords`. Security: no write without approval; no delete route;
token/Origin enforcement.

---

## Verdict

**REAL OBSIDIAN VAULT CONNECTION — ARCHITECTURE READY FOR REVIEW.** Recommended: an **official Obsidian
plugin ("TERAGON Vault Bridge") exposing a loopback, token-authenticated capability API over `app.vault`**,
called by a typed TERAGON `bridgeClient`; `obsidian://` for navigation only. Windows-compatible; least-
privilege; all writes human-approved; agents read-only; the three memory stores stay distinct; no automatic
sync, no remote AI. **Smallest first step = Phase 0 — a transport/security SPIKE only** (health + auth +
Origin + Windows browser + fail-closed), gating everything after it; no product feature until the spike
passes. This is **post-freeze** work; Product V2 stays frozen at `b4937822`. Do **not** implement until this
architecture is reviewed.

**OBSIDIAN LIVE CONNECTION — ARCHITECTURE APPROVED. IMPLEMENTATION — PHASE 0 TRANSPORT SPIKE ONLY.**
