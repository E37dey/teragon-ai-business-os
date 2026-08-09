# S14.4 — Obsidian Phase 3 · Human-Approved Write-Back (evidence)

Lets TERAGON write approved Markdown changes back to the connected real Obsidian Vault.

> **This is human-approved write-back, NOT synchronization.** Every Vault mutation follows: user intent →
> write proposal → exact preview/diff → explicit human approval → ONE bounded write → post-write verification.
> No approval = no mutation. No agent-direct writes, no automatic writes, no delete/rename/move, no background sync.

> **VERDICT: OBSIDIAN PHASE 3 — APPROVAL BOUNDARY SECURE + HUMAN-APPROVED WRITE BACK VALIDATED** against the
> actual installed Obsidian Desktop 1.13.4 + synthetic vault `TERAGON OS`, from the real TERAGON browser.
> **HTTPS_TO_LOOPBACK = UNVALIDATED.**

> **APPROVAL-BOUNDARY SECURITY FIX (pre-merge review).** An initial design authorized writes on the **pairing
> Bearer token alone** — a live raw `POST /write/create` with only the pairing token + allowed Origin created a
> file (approval bypass). **Fixed:** the pairing token now grants only connection/list/search/read/prepare; every
> mutation additionally requires a **single-use HMAC write capability** keyed by a **SEPARATE `writeKey`** and
> **bound to exactly one op / path / mutationId / contentHash / expiry**. A holder of only the pairing token
> cannot mint one. **Proven live after the fix:** token-only write → **403 write_unauthorized** (file not
> created); a valid capability → applied **once**; replay of the same capability → **idempotent** (no second
> write); reuse of a capability for another path/op/content → **403**; an expired or wrong-key capability → **403**.

## Allowed operations

`CREATE_NOTE` · `UPDATE_NOTE` · `APPEND_TO_NOTE` — Markdown only. **Not** implemented: DELETE / RENAME / MOVE /
folder deletion / attachment writes / `.obsidian` modification / plugin-config changes.

## Architecture

```
/memory · WriteProposeModal (compose → preview/diff → approve)
   → obsidianWrite service (proposal model + state machine; NO bridge write on propose)
   → vaultBridgeClient (POST /write/{create,update,append}; bearer, timeout, bounded, fail-closed)
   → TERAGON Vault Bridge (Phase 3) inside Obsidian
       → applyWrite via OFFICIAL Vault APIs: app.vault.create / app.vault.process (never raw fs)
       → conflict guard (re-read + SHA-256 compare) · idempotency (mutationId ledger, per session)
   → post-write read-back through the Phase-1 read-only capability → verify hash → "נכתב ל-Obsidian"
```

## Write proposal model (TERAGON-side; no bridge call on creation)

`WriteProposal { proposalId, operation, vaultName, path, baseContent, baseHash (expectedHash), proposedContent |
appendBlock, proposedHash, createdAt, requesterId/Name, correlationId, mutationId, state, approvedById/Name,
approvedAt, resultHash, failureCode }`. States: `PROPOSED → APPROVED → WRITTEN | CONFLICT | FAILED`, or
`PROPOSED → REJECTED`. Creating a proposal performs **no** bridge write.

## Write authorization (bridge-side) — the non-forgeable boundary

- **Connection auth** = the pairing Bearer token. Grants **only** connection / list / search / read / request
  preparation. It does **not** independently authorize any mutation.
- **Write authorization** = a per-write **HMAC-SHA256 capability** keyed by a **SEPARATE `writeKey`** (a distinct
  per-load secret, revealed via its own Obsidian command *"Copy TERAGON write key (once)"*, paired into TERAGON
  `sessionStorage` under `teragon.obsidian.writeKey`, cleared on disconnect). The capability signs the canonical
  message `op\npath\nmutationId\ncontentHash\nexp`, so it is **single-use** (mutationId ledger), **short-lived**
  (`exp`, ≤10 min bound), **replay-rejected**, and **cannot** authorize a different op / path / content. The
  plugin verifies it (constant-time) **before** touching `app.vault`. The bridge does **not** trust any
  client-supplied `approved`/`approvedBy`/`proposalId` field — only the cryptographic capability.
- A bridge started without a `writeKey` exposes **no** write capability at all (`/write/*` → 404,
  `/connection.writeEnabled = false`).

## Approval boundary + identity (TERAGON-side)

Explicit **"אשר כתיבה ל-Obsidian"** transitions `PROPOSED → APPROVED` and permits **exactly one** write attempt
(service state guard: only an `APPROVED`, not-yet-written proposal executes; a `WRITTEN` proposal cannot execute
again — plus the plugin's `mutationId` idempotency). **"דחה"** performs no bridge write. Records
`approvedBy/approvedAt/proposalId/correlationId`. Approver/requester identity is the existing product-wide
governance identity (`CEO_USER_ID`/`CEO_NAME_HE` = `u-tzachi`/`צחי זוסטייהם`) — an **existing demo fixture**, not
a new Phase-3 hardcoded approver; the write UI does not impersonate independently of the workflow identity, and
this identity has **no** bearing on bridge authorization (which is the cryptographic capability above).

**Honest scope of the guarantee:** the capability proves *knowledge of the separate write secret* — i.e. it makes
**possession of the pairing token alone insufficient to mutate the Vault** (the required property). The per-write
*human* approval remains a TERAGON-side gate (the `writeKey` holder). A separate in-Obsidian human confirmation
per write was not added; the bridge-side guarantee is "a second, write-specific secret is required."

## Preview / diff

Preview shows Vault name, path, operation, and the warning **"השינוי יתבצע בקובץ המקומי ב-Obsidian"**. CREATE →
full new document; UPDATE → LCS line diff (before → after); APPEND → the exact block. No hidden changes.

## Real Obsidian runtime proof (sanitized; browser + on-disk verification)

| Scenario | Evidence |
|----------|----------|
| **CREATE** | target absent → proposal (file still **absent**) → approve → file **created once** (count 3→4), content exact, read-back **verified** ("נכתב ל-Obsidian ואומת בקריאה חוזרת") |
| **UPDATE** | load current (diff shows the added line) → approve → note updated **once**, count unchanged |
| **APPEND** | load current → approve → block appended **once** |
| **Idempotency** | live plugin: two `POST /write/append` with the **same mutationId** → first `applied`, second `idempotent:true`; marker appears **once** on disk |
| **REJECT** | proposal → `דחה` → target **absent**, count unchanged (no write) |
| **CONFLICT** | stage update (baseHash captured) → note changed by a real intervening write → approve → **409 CONFLICT**, UI shows "הקובץ השתנה מאז התצוגה המקדימה. יש לרענן ולבדוק מחדש." + "התחל מחדש"; the **external change is preserved** (no overwrite; no force-write button) |

## Idempotency

Every approved write carries a `mutationId`; the bridge keeps a per-session ledger and returns the prior result
(`idempotent:true`) on replay without re-applying — proven at the bridge, service, and live-runtime layers (an
appended block never duplicates).

## Conflict protection (mandatory)

For UPDATE/APPEND the preview captures the current content hash; at write time the plugin re-reads the real note
(`app.vault.read`) and compares SHA-256 to the expected hash. Mismatch → **409 CONFLICT**, no overwrite. There is
**no force-write** path in Phase 3; the user must create a fresh preview/proposal.

## Post-write verification

After a successful write, TERAGON reads the note back through the read-only capability and compares SHA-256 to
the plugin's returned hash (for APPEND, also asserts the block is present). Only on match does it show
**"נכתב ל-Obsidian"**; otherwise a safe failure state (no false success).

## Security tests (bridge unit + live plugin)

**Approval boundary:** pairing token + valid Origin + valid payload but **no capability → 403 write_unauthorized,
Vault unchanged** (create/update/append); wrong-key capability → 403; expired capability → 403; capability reused
for another path/op/content → 403; a `writeKey`-less bridge → writes 404.
`missing token → 401` · `wrong token → 401` · `disallowed Origin → 403` (no wildcard CORS) · `GET/PUT/PATCH/DELETE`
on a write endpoint `→ 405` · `../` / absolute / `.obsidian` / non-Markdown path `→ 400` · malformed JSON /
missing `mutationId` / missing op fields `→ 400` · oversized body `→ 413` · duplicate `mutationId` **blocked** ·
stale expected hash `→ 409 conflict` · reads remain **GET-only** (`POST /notes`, `DELETE /note/x` → 405) · bridge
unavailable → fail closed. No raw stack traces; no token/writeKey in logs/docs/errors.

## Memory relationship + agents

`memoryEntries` (local IndexedDB CRUD) and `memoryRecords` (governed knowledge) are untouched by write-back.
Write-back creates **no** synchronization in either direction — each remains an explicit user action. **No agent**
(Wiki/Nexa/Mentor/Fixer/Orchestrator) has any Vault write capability; `src/agents/*` references no write path.

## Responsive / accessibility

- **Axe (wcag2a+wcag2aa)** on `/memory` with the write preview + diff open: **0 violations** (0 critical/serious).
- **Horizontal overflow 0px** at 390 (and 768/1024/1440); the diff remains readable at 390. RTL (`dir="rtl"`),
  dark mode (design tokens). Keyboard-operable focus-trapped dialog; current/proposed/diff and approve/reject are
  clearly distinguished. **No uncaught JS errors** (the only console entry is a Chromium resource log for the
  deliberate 409 conflict — inherent to a fail-closed `fetch`).

## Automated tests

`tests/obsidian-bridge/bridgeWrite.test.ts` (write security/conflict/idempotency, reads stay GET-only),
`tests/obsidian-write/writeProposal.test.ts` (propose=no mutation, reject=no mutation, approve=one write +
verification, conflict blocks overwrite, execution guard), `tests/obsidian-write/writeModal.test.tsx` (UI: no
write before approval, reject, conflict). Full `vitest` **2685 passing** (12 `tests/platform/*` files fail to
*load* locally on Node v25 vite/rolldown shebang — pre-existing, unrelated; CI runs Node 22). `typecheck`,
`typecheck:tests`, `oxlint`, `scan:secrets` all pass/CLEAN.

## Limitations (honest)

1. Conflict detection reads the current note via `app.vault.read`; the runtime conflict was proven via a real
   intervening bridge write (deterministic). External-editor changes are detected once Obsidian's watcher syncs.
2. Idempotency ledger is per plugin load (session) — the specified runtime/session boundary.
3. Write proposals are in-memory single-flow (not persisted across reloads); durable write-proposal history is out
   of scope for Phase 3.
4. `HTTPS_TO_LOOPBACK = UNVALIDATED` — no HTTPS-hosted TERAGON compatibility is claimed.
5. **This is human-approved write-back, not synchronization.**
