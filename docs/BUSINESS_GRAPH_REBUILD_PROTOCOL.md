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

## Deterministic hashing (exact algorithm)

`canonicalJSON(value)` → `fnv1a64(string)`:
- **`canonicalJSON`** sorts object keys ASCII-ascending **recursively**, preserves array order (the
  derivation already sorts every collection deterministically), drops `undefined`, and refuses
  non-finite numbers. It **excludes** `createdAt`, `activatedAt`, `buildState`, `validationState` from
  hashed content.
- **`fnv1a64`** — FNV-1a over the canonical string: offset basis `0xcbf29ce484222325`, prime
  `0x100000001b3`, modulo 2⁶⁴ (BigInt), rendered as 16-char hex. **No `Date`, no `Math.random`.**
- **`checksum`** covers the FULL graph content (nodes + edges + issues + unmappable + versions + org +
  source version) — the integrity / partial-write / corruption detector.
- **`sourceHash`** covers only source-derived nodes + edges + registry + source-snapshot version — the
  **staleness** detector (differs when the underlying canonical data changed).
- **`snapshotId = idx-{sanitizedOrg}-{checksum}`** — deterministic, no uuid, no timestamp.

**Guarantee:** identical canonical input ⇒ identical graph content, identical `sourceHash`, identical
`checksum`, identical `snapshotId`.
