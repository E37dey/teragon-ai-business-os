# TERAGON AI BUSINESS OS — Release Scope (Gate 0)

Defines exactly what the staged release includes. Nothing here deploys; this is the scope contract for
Gates 1–10. **The Business Graph and the authentication prototype remain internal and DISABLED.**

## Release lineage

- **Branch:** `feature/teragon-business-graph`
- **Release HEAD:** `0a22f10` (self-audit docs) on top of `3c78640` (approved Business Graph checkpoint)
- **Fork point / base:** `38cfbaa` = current `main` (the green baseline). `git merge-base main HEAD == 38cfbaa`,
  so the branch is a clean linear descendant of `main` — no divergence to reconcile.
- **Rollback commit:** **`38cfbaa`** (current `main`, the last released-equivalent green baseline).

## Included commits (`38cfbaa..0a22f10`, 18 commits)

| Commit | Summary | User-facing? |
|--------|---------|--------------|
| `0a22f10` | docs(graph): self-audit report + correct Phase 11 auth prototype framing | No (docs) |
| `3c78640` | feat(graph): headless internal-operator authentication **(prototype)** | No (internal, flag OFF) |
| `650dc48` | feat(graph): trusted runtime identity and authorization | No (internal, flag OFF) |
| `d375fc4` | feat(graph): enrich canonical facts for complete business queries | No (internal) |
| `6470719` | feat(graph): secure internal application facade | No (internal, flag OFF) |
| `5984fe3` | feat(graph): evidence-backed business query pack | No (internal) |
| `a96fc4a` | **fix(implementation): make milestone status time-deterministic** | **Yes — the only product-behavior change** |
| `03c601f` | fix(graph): harden edge traversal and query auditing | No (internal) |
| `f36151a` | feat(graph): secure read-only graph traversal | No (internal) |
| `13af662` | fix(graph): harden event identity and startup reconciliation | No (internal) |
| `135ee6f` | feat(graph): coordinate event-driven validated graph rebuilds | No (internal, flag OFF) |
| `7eb67a4` | fix(graph): correct source FK derivation + snapshot integrity | No (internal) |
| `431346c` | feat(graph): persist validated derived graph snapshots | No (internal) |
| `5b26a0c` | test(graph): separate valid/adversarial derivation fixtures | No (tests) |
| `3926b4b` | feat(graph): derive graph contracts from canonical records | No (internal) |
| `a5053a7` | fix(graph): harden authority and actor identity contracts | No (internal) |
| `9e0e725` | feat(graph): define secure business graph contracts | No (internal) |
| `bbb3f4b` | docs(business-graph): Phase 1 Discovery | No (docs) |

**Net user-facing effect of this release vs. the `38cfbaa` baseline:** exactly **one** product change —
`a96fc4a`, which de-couples the `/implementation` overdue-milestone rail from the wall clock (injects an
`asOf`, real-clock default at the component boundary; fixes a date-time-bomb). All other commits are the
internal Business Graph subsystem (dormant) plus tests and documentation.

**Bundle impact:** the Business Graph (`src/graph/**`) is **not imported by any application runtime/UI
code** (verified: no non-`src/graph` import of `graph/{application,query,runtime,auth}`), so it is
tree-shaken out of the shipped client bundle. The release ships graph *source in the repo* but adds no
dormant graph code to `dist/`. Secret scan of the built bundle is CLEAN.

## Excluded from the release

- **`stash@{0}` — Phase 11.1 server-side auth WIP** (Netlify Functions + scrypt + cookies + durable session
  store). Uncommitted, unreviewed. **Not included, not restored.**
- **Any Business Graph runtime enablement.** No flag is flipped.
- The local operator-auth prototype is **not** presented or wired as production authentication.

## Disabled experimental features (verified `= false as const` in source)

| Flag | Source | State |
|------|--------|-------|
| `BUSINESS_GRAPH_EVENT_INDEXING_ENABLED` | `src/graph/indexing/flag.ts` | **false** |
| `BUSINESS_GRAPH_APPLICATION_FACADE_ENABLED` | `src/graph/application/flag.ts` | **false** |
| `BUSINESS_GRAPH_RUNTIME_ROLLOUT_APPROVED` | `src/graph/runtime/rollout.ts` | **false** |
| `BUSINESS_GRAPH_OPERATOR_AUTH_ENABLED` | `src/graph/auth/flag.ts` | **false** |

With all OFF: no graph subscription, no reconciliation, no IndexedDB graph access, no trusted session, no
graph query surface, no graph UI — the app behaves as the `38cfbaa` baseline plus the `a96fc4a` fix.

## Known limitations carried into the release

1. **No production authentication.** The app has an authorization *simulation* (localStorage demo role,
   hardcoded `u-tzachi` persona) and **no login**. Commit `3c78640` is a **client-side auth prototype only**,
   not a trusted boundary; it is disabled. This is a **demo / internal** classification, not
   authenticated-production.
2. **Business Graph is internal and unreleased-for-use** — present as reviewed, tested, disabled code.
3. **Local-demo data model** — browser-local IndexedDB, synthetic seed, `AI_REMOTE_ENABLED=false` (Mode A).
4. **Pre-existing LOW E2E flake** in `e2e/submission/w7g-submission.spec.ts` — **resolved** in Gate 2
   (`48fe1ee`, test-only stabilization).
5. **Supported viewport: 1024px and above (desktop + tablet).** This is a desktop/tablet **internal
   enterprise** interface. **390px mobile layouts currently overflow horizontally on every route** — a
   documented **known limitation**; a mobile redesign is **deferred** (no broad mobile work in this
   release). The app is **not** described as fully mobile-responsive. Verified: zero horizontal overflow at
   ≥1024px across all routes in Light and Dark.

## Build configuration (from the repo's actual `netlify.toml` — not invented)

- **Build command:** `npm run build` · **Publish dir:** `dist` · **Functions dir:** `netlify/functions`
- **Node:** `NODE_VERSION = 22` · Server env (`AI_*`) set in the Netlify UI at Functions scope (never in repo)

## Gate 0 verdict

Scope is defined and minimal: one product fix + a dormant, disabled, tree-shaken internal subsystem + docs,
on a clean linear descendant of `main`. Rollback target is `38cfbaa`. **Awaiting human approval to proceed
to Gate 1 (pre-deploy QA & security audit).**
