# TERAGON Business Graph — Self-Audit Report

Independent verification of the full Business Graph implementation at its checkpoint. Prior phase reports
were **not** assumed correct; the code, config, tests, flags, and runtime gate were inspected directly.

## 1. Audited target

- **Branch:** `feature/teragon-business-graph`
- **HEAD:** `3c78640` — *feat(graph): add headless trusted internal-operator authentication*
- **Starting state:** the working tree carried **uncommitted Phase-11.1 work** (server-auth WIP). Per the
  audit scope it was **stashed** (`stash@{0}`, preserved, not committed, not discarded) to audit the clean
  committed checkpoint. Post-stash tree = clean at `3c78640`.

## 2. Commands executed

`git stash --include-untracked` · `npx oxlint src tests` · `npm run typecheck` · `npm run typecheck:tests`
· `npx vitest run` · `npm run build` · `node scripts/scan-bundle-secrets.mjs` · `npx playwright test` (the
non-live suite in six memory-safe chunks; `e2e/live` excluded by design) · targeted `grep`/read audits of
flags, security invariants, integrity, business queries, and docs.

## 3. Quality gate results (at 3c78640)

| Check | Result |
|-------|--------|
| oxlint (`src tests`) | **0** errors / 0 warnings |
| tsc strict (`typecheck`) | **0** errors |
| `typecheck:tests` | **0** errors |
| Vitest (full) | **2176 passed / 0 failed / 0 skipped** (236 files) |
| production build | **pass** |
| secret scanner | **CLEAN — 0 findings** |
| Playwright non-live (6 chunks) | **~469 passed**, **1 flaky-under-load** (see §11) — routes, a11y, Light/Dark theme, visual, golden-path, resilience, deep-flows all green |

No test was skipped, quarantined, or had its timeout inflated.

## 4. Feature-flag verification (§2) — all OFF by default, read from source

| Flag | Source | Default |
|------|--------|---------|
| `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED` | `src/graph/indexing/flag.ts:14` | `false as const` |
| `BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED` | `src/graph/application/flag.ts:17` | `false as const` |
| `BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED` | `src/graph/runtime/rollout.ts:15` | `false as const` |
| `BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED` | `src/graph/auth/flag.ts:18` | `false as const` |

With all OFF (proven by the passing `flagMatrix`/`composition`/`coordinator` suites + source inspection):
no repository subscription starts, no startup reconciliation runs, no IndexedDB graph store is opened, no
trusted session is produced (`UnavailableTrustedSessionSource` → `IDENTITY_UNAVAILABLE`), no graph query is
reachable, and **the graph module is not imported by any app runtime/UI code** (verified: no non-`src/graph`
import of `graph/application|query|runtime|auth`) — the existing application runtime is unchanged (build
byte-stable; 469 E2E across every route green).

## 5. Security findings (§3) — no bypass found

- **Organization isolation** enforced at storage (`indexeddbStore` keys prefixed by org+snapshot),
  indexing, traversal (`isNodeAccessible`/`isEdgeAccessible` require org agreement), query, and facade
  (`ORGANIZATION_MISMATCH`) layers.
- **Per-hop permission** enforced at every node **and** edge; a visible node pair never auto-authorizes its
  edge (`isEdgeAccessible`); unauthorized start node is byte-identical to absent; hidden nodes/edges do not
  leak via counts/paths/errors (test-proven).
- **Stale access** requires explicit authorization (`allowStale` + HUMAN/SYSTEM actor + `canUseStaleGraph`);
  an AGENT is refused even with the flag.
- **AGENT/SYSTEM cannot approve as HUMAN** — `assertHumanApprover` denies any non-HUMAN kind (kind from the
  discriminant, never an id prefix).
- **Caller cannot override** identity/org/role/permissions — the facade resolves the viewer; the runtime
  resolver takes org/role only from the trusted session.
- **No protected bodies / prompts / notes / credentials / tokens** enter graph envelopes, audits, or logs
  (envelope-only nodes; `bodyOpened: false`; audits record safe metadata + search-text hash/class only).
- **No secrets committed** — bundle secret scanner CLEAN.
- **localStorage demo role and `u-tzachi` are never trusted** — the production runtime yields
  `IDENTITY_UNAVAILABLE`.
- **Commit `3c78640` is a LOCAL authentication prototype, not a trusted server boundary** — corrected in
  the Phase-11 docs during this audit (see §10).

## 6. Data-integrity findings (§4) — consistent

Deterministic node/edge ids (`teragon://…`, no timestamp/uuid); deterministic `canonicalJSON` +
**SHA-256** checksum & sourceHash (no FNV/MD5/SHA-1 remnants — FNV fully removed); identical input →
identical snapshot id/checksum; corrupt/partial snapshots → `CORRUPT`, invalid → non-activatable; failed
rebuild preserves the previous ACTIVE snapshot; one served snapshot per org (atomic activation); legacy
`graph-index-v1` / registry `core-v1` → **`REBUILD_REQUIRED`** (schema `graph-index-v2`, registry
`core-v2`); traversal/queries never mutate the active snapshot (byte-identical after all ops); event
replay/dedup/ordering/checkpoint consistent; versionless events do not collide (durable
`gidxevt:{org}:{ingestSequence}`); startup reconciliation detects missed events via canonical sourceHash
compare. All confirmed by source + the passing `store`/`indexing`/`derivation` suites.

## 7. Business-query results (§5) — all nine present, tested, honest

All 9 methods exist in `src/graph/query/service.ts` and are proven against **canonical-derived** fixtures.
Structural readiness (post Phase-9): all nine **SUPPORTED**; instance-level `INSUFFICIENT_GRAPH_DATA`
returned honestly when records lack required facts; **SUPPORTED + []** distinguished from incomplete-data;
totals derived only from permission-filtered findings (hidden entities excluded — recurring count 3→2 with
a hidden ticket); deterministic evidence paths carrying provenance/authority/approval labels; no fabricated
conclusions; no protected-body access. (`findCustomersNeedingFollowUp`, `findUnansweredQuotations`,
`findRecurringServiceIssues`, `findDelayedEnrollments`, `assessPrinterModelSupportImpact`,
`findSupersededEvidence`, `findRecommendationConflicts`, `findTasksFromApprovedRecommendations`,
`buildFullEvidencePath`.)

## 8. Defect scan (§1)

No `Date.now()`/`new Date()` in graph **domain/derivation** logic (only injectable `options.now` store
seams whose timestamps are non-hashed metadata excluded from checksums, plus the `createSystemClock`
boundary adapter) · no module-level mutable singletons · no `TODO`/`FIXME`/`HACK` · no `window`/global
graph exposure · no dead/broken exports or circular imports (tsc + build clean) · no duplicated source of
truth (registries are the single source; readiness evaluates against them).

## 9. Documentation consistency (§8)

Verified accurate: the four flag defaults, schema version `graph-index-v2`, registry `core-v2`, the Phase-9
readiness table, and the Phase-11 full-suite count (2176). **One inconsistency found and corrected:** the
Phase-11 auth docs described `3c78640` as a "real authentication foundation" / "honest replacement" for the
unavailable resolver. Per the accepted review, that over-claims — it is a **local/client-side prototype**,
not a trusted server-side boundary. Corrected in `BUSINESS_GRAPH_OPERATOR_AUTH.md`,
`BUSINESS_GRAPH_PHASE11_TEST_REPORT.md`, and the Phase-11 note in `BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md`.

## 10. Defects discovered & fixes

| # | Finding | Severity | Action |
|---|---------|----------|--------|
| D1 | Phase-11 auth docs over-claim `3c78640` as a *trusted* authentication boundary | LOW (doc) | **Corrected** (docs-only) to "local/client-side prototype; server boundary = pending Phase 11.1" |
| D2 | `e2e/submission/w7g-submission.spec.ts` "click-through navigates" fails under chunk/load, passes in isolation | LOW (pre-existing test race) | **Not changed** — see §11 |

No product-code or graph-code defect was found; no code was modified.

## 11. Remaining known limitations

- **D2 — pre-existing E2E test race (LOW):** the readiness/chip assertion reads once *after* the
  count-agreement `.toPass` retry, so under chunk/load a brief count-updated-but-chip-not-yet window can
  fail `toContain("לא מוכן להגשה")`. It **passes deterministically in isolation**, is a **Wave-7 submission
  test** that predates and is **unaffected by** the Business Graph (which is not wired into runtime and is
  not imported by that page), and is **not a product defect**. Left unchanged during a graph audit per the
  "don't modify unrelated behavior" scope rule; the smallest safe fix (wrap the final readiness assertion
  in the same retry) is recommended as a separate, clearly-named test-robustness commit if desired.
- **Operator auth (`3c78640`) is a client-side prototype**, not a trusted boundary (now documented). The
  server-side correction (Phase 11.1) exists as WIP in `stash@{0}`, unreviewed/uncommitted.
- Playwright evidence covers the non-live suite in memory-safe chunks; a single all-57-spec run is
  infeasible on this RAM-starved preview host (connection-refused is infra, not code).

## 12. Verdict

**PASS — internally consistent and safe while flags remain OFF.**

All four feature guards are `false as const`; the graph subsystem is fully isolated from the app runtime
(not imported, build byte-stable, 469 E2E across every route green); the full unit gate is green (2176/0);
integrity, org-isolation, per-hop permission, and no-leak invariants hold; all nine business queries are
honest and evidence-backed. The only findings are one LOW documentation over-claim (**corrected**) and one
LOW pre-existing, graph-unrelated E2E test race that reproduces only under load.

**Safe to leave at this checkpoint (`3c78640`)** with flags OFF. The operator-auth prototype must not be
treated as a trusted authentication boundary until the server-side Phase-11.1 correction is reviewed and
accepted.
