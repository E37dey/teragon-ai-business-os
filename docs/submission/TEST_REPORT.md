# TERAGON — Test & Verification Report

**Baseline SHA:** `4a6aed7` (source identical on `chore/teragon-submission-package` — the submission branch adds only docs/screenshots, no source changes).

This report separates **automated verification** (reproducible gates) from **manual human live verification** (a step the automation could not perform). It does **not** claim automation performed the final human recovery click.

## Automated verification — quality gates

| Gate | Result | Notes |
|---|---|---|
| `typecheck` | ✅ pass | `tsc -b --noEmit` |
| `typecheck:tests` | ✅ pass | test project typecheck |
| `lint` (`oxlint`) | ✅ pass | pre-existing fast-refresh warnings only |
| **Vitest (unit/integration)** | ✅ **3041 / 3041** | verified at `4a6aed7`; see flakiness note below |
| **Deterministic E2E (Playwright)** | ✅ **611 passed / 7 skipped / 0 failed** | full suite, `workers:1`, ~18 min |
| **Portal E2E** | ✅ 10/10 | welcome, 3 portals, direct-URL RBAC, switching, header identity, onboarding |
| **RBAC / IDOR** | ✅ 93 | route scope + record scope (own PASS / other DENY / fail-closed) |
| **Axe (accessibility)** | ✅ 0 serious / 0 critical | `/welcome`, 3 homes, AccessDenied, onboarding |
| **Responsive** | ✅ | true 390px journeys, 0 horizontal overflow, CTAs reach destinations |
| `build` (`tsc -b && vite build`) | ✅ pass | production build clean |
| **Secret scan** (`scan:secrets`) | ✅ clean | no committed secrets |

### Vitest flakiness note (honest)
The deterministic baseline is **3041/3041**, verified at `4a6aed7`. On the **current RAM-constrained dev machine (~457 MB free)**, running all 3041 tests **simultaneously** intermittently flakes on a handful of memory-heavy jsdom render tests (a *different* small set each run — e.g. `router`, `workflowMode`, `personas`, `settings`). **Every one of those files passes in isolation** (`router` 37/37, `workflowMode` 3/3, `personas` 4/4, `settings` 7/7) and with reduced parallelism. This is **resource contention, not a code regression** — the source is unchanged from the green baseline. On an adequately-resourced machine the full suite is green.

## Live verification — Obsidian & governed AI (real paired Chrome, real bridge)

| Item | Method | Result |
|---|---|---|
| Obsidian connection (`/memory`) | **Automated** (paired Chrome) | ✅ `מחובר`, Vault **TERAGON OS**, bridge `127.0.0.1:5200` v0.3.0-phase3, write=human-approval-only |
| Knowledge Map | **Automated** | ✅ live graph loaded from bridge: **63 nodes / 147 links / 6 clusters** |
| Bridge fail-closed | **Automated** | ✅ `/vault/list` → 401 without a session |
| **governed-knowledge-capture** (positive) | **Automated → WAITING_FOR_USER**, then **human accept** | ✅ `WORKFLOW_STARTED → Orchestrator → Wiki → live "AI Operations" search → read → recommendation → WAITING_FOR_USER → אשר קבלה → WORKFLOW_COMPLETED`; source `Obsidian · TERAGON OS · AI Operations.md` |
| Failure path | **Automated** | ✅ `VAULT_UNAVAILABLE → WORKFLOW_FAILED` (via real `נתק` disconnect) |
| Reconnect | **Automated** | ✅ existing Trusted Device, **no new pairing** |
| **operational-recovery** | **Automated** setup + **MANUAL HUMAN** final accept | ✅ real failed run (`wf-mswc4ej9-1`) preserved → `retryOf` new run → WAITING_FOR_USER → **human `אשר קבלה`** → `WORKFLOW_COMPLETED`; original preserved as separate evidence |
| Automatic vault writes | **Automated** | ✅ **0** throughout (proposal queue empty; original never rewritten) |

### Manual vs automated boundary
The recovery flow was driven by automation through **WAITING_FOR_USER (connected)** on the real failed run, with correct `retryOf` linkage. The **final `אשר קבלה → WORKFLOW_COMPLETED` on the recovery run was completed and observed by a human** in the same paired Chrome — the automation could not land that click because the live force-directed Knowledge Map continuously re-renders and revokes the browser-automation's page access at that transition. This is a harness limitation, not a product defect: genuine SPA navigation was proven to **preserve** the runtime event log (no architecture defect).

## How to reproduce the automated gates
```bash
npm run typecheck && npm run typecheck:tests && npm run lint
npm run scan:secrets && npm run build
npm test                 # Vitest (run per-file if RAM-constrained)
npm run test:e2e         # Playwright deterministic E2E (portal preview on :4180)
```
