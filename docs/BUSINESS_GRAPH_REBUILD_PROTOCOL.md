# TERAGON Business Graph — Rebuild Protocol (Phase 4)

Deterministic **full** rebuild. Source: `src/graph/store/rebuild.ts` (`rebuildOrganizationGraph`) +
`src/graph/store/hash.ts`. No incremental/event-driven indexing (that is a later phase).

## Workflow (`rebuildOrganizationGraph(records, context, store)`)

```
canonical repository snapshot (records passed in — never read from a repo here)
  → pure Phase-3 deriveOrganizationGraphSnapshot(records, context)
  → wrap as a STAGED GraphIndexSnapshot (compute sourceHash + checksum + deterministic snapshotId)
  → validateStagedSnapshot  (the full validation gate)
  → checksum verification
  → atomic activation        (previous ACTIVE → SUPERSEDED, new → ACTIVE, one IDB transaction)
  → audit-ready GraphIndexBuildResult
```

**Idempotent:** identical input ⇒ identical `snapshotId` (deterministic hash) ⇒ the rebuild
short-circuits, leaving exactly one active snapshot.

## Failure handling (never expose partial state)

If any step (derivation, validation, checksum, or write) fails:
- the previous **ACTIVE snapshot is left byte-for-byte unchanged and still served**;
- the new snapshot is marked `INVALID` or `FAILED` with diagnostics preserved;
- **no partial graph state is exposed**;
- the active index is **never cleared before a valid replacement exists**.

Proven by the "failed rebuild preserves previous active" test.

## Deterministic hashing (exact algorithm) — SHA-256 (Phase 4.1)

`canonicalJSON(value)` → `sha256Hex(string)`:
- **`canonicalJSON`** (unchanged) sorts object keys ASCII-ascending **recursively**, preserves array
  order (the derivation already sorts every collection deterministically), drops `undefined`, and
  refuses non-finite numbers. It **excludes** `createdAt`, `activatedAt`, `buildState`,
  `validationState` from hashed content.
- **`sha256Hex`** — **SHA-256** over the UTF-8 bytes of the canonical string via **Web Crypto**
  (`globalThis.crypto.subtle.digest("SHA-256", …)`), returned as a fixed 64-char lowercase hex string.
  Standardized, non-keyed, **no external dependency**, byte-identical in the browser (same-origin) and
  in the Node/Vitest runtime (a test asserts the canonical `SHA-256("teragon")` digest). Hashing is
  **async** and threaded through `hash → snapshot → validation → health → recovery → rebuild → store`.
  **No `Date`, no `Math.random`.** (The former FNV-1a hash was removed entirely — it is not used even as
  a non-security hash.)
- **`checksum`** covers the FULL graph content (nodes + edges + issues + unmappable + versions + org +
  source version) — the integrity / partial-write / corruption detector. Binds
  `checksumAlgorithm:"SHA-256"` + `checksumVersion:1` into the digest.
- **`sourceHash`** covers only source-derived nodes + edges + registry + source-snapshot version — the
  **staleness** detector (differs when the underlying canonical data changed).
- **`snapshotId = idx-{organizationId}-{fullSha256}`** — the **full** 64-hex digest (≥128-bit),
  deterministic, no uuid, no timestamp.
- **Version pin:** the graph-index `schemaVersion` was bumped `graph-index-v1 → graph-index-v2`. Any
  legacy FNV snapshot is **unsupported** — validation returns `SCHEMA_VERSION_UNSUPPORTED` and health
  returns `REBUILD_REQUIRED`; it is **never silently accepted**. A rebuild is sufficient because the
  index is derived.

**Guarantee:** identical canonical input ⇒ identical graph content, identical `sourceHash`, identical
`checksum`, identical `snapshotId`; a one-byte content change ⇒ a different `checksum`.
