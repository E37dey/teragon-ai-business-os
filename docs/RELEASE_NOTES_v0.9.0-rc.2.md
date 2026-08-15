# TERAGON AI BUSINESS OS — v0.9.0-rc.2

**Release candidate.** Not a GA / production-readiness declaration.

- **Source SHA:** `68e229e`
- **Release branch:** `release/v0.9.0-rc.2`
- **Tag:** `v0.9.0-rc.2` (annotated)
- **Base:** `feat/analytics-visual-polish` → `b743ec5` (one commit past `v0.9.0-rc.1`)

## Delta from RC1 (`v0.9.0-rc.1`)

### Product fixes
- **Coordination Room rail restored** — the conflict-resolution actions and the canonical ApprovalPanel on `/agents/collaboration` are reachable again (governance controls must never be hidden behind progressive disclosure).
- **Learning governance controls restored** — approve / reject / rollback on `/learning` are published again.

### Quality / test infrastructure
- **Platform test suite now actually collects and runs.** 12 `tests/platform/*` files previously failed during Vite/Vitest collection (a `#!` shebang in the real Node ESM CLIs was displaced by the jsdom SSR transform → `Invalid Character '!'`) and executed **zero** tests. Split into two Vitest projects (jsdom `app` + node `platform`, `scripts/platform/*.mjs` externalized). Result: **330 files / 2977 tests** collect and pass (was 318 files / 2845 tests with 12 files never loading).
- **Deterministic local E2E gate separated from the live external suite.** `e2e/live/**` (public Netlify deploy over the network) is discovered only by `e2e/live.config.ts` (`npm run test:e2e:live`), so a transient internet hiccup can no longer make the local release gate red. Nothing is mocked.
- **Accessibility survey harness stabilized** — the whole-product surveys (all 31 routes in one test) were given route-proportional timeouts; the `0 serious / 0 critical` contract is unchanged.
- 27 additional stale-test / harness corrections (nav-label renames, S13.1 rail reductions, governance disclosure state, deterministic analytics drilldown fixtures).

### Visual
- **Analytics executive-BI trend chart refinement** — composition only (real y-axis gutter + readable scale, framed L-axis, distributed date labels, restrained area-depth gradient, always-visible "now" anchor). **Data, scale, `null` semantics, filters and drilldowns unchanged** (`null` still breaks the line; no interpolation).
- Measured-vs-unmeasured metric hierarchy preserved (measured primary; unmeasured a compact secondary strip; `null` ≠ `0`).
- **Agent Coordination directional-flow arrowheads** — subtle, derived from the real run edges, non-overlapping. Topology unchanged.
- **Calmer, more compact empty states** app-wide (no giant blank cards).

### Integration (validated against the real `TERAGON OS` Obsidian vault)
- Real Obsidian Desktop plugin bridge on `127.0.0.1:5200` (not a mock).
- Existing **Trusted Device** reconnect — **no new pairing code**.
- Governed **positive / failure / recovery** workflows; every governed write stays human-approval-gated; **zero automatic Vault writes**.

## Verified gates at `68e229e`
- Vitest: **330/330 files, 2977/2977 pass**
- Deterministic E2E: **587 passed, 7 documented skips, 0 failed**
- Live external suite: transient network flakes on first run, **all pass on clean rerun** (reported separately by design)
- Axe: **0 serious / 0 critical** (`/analytics` + 31-route survey)
- Responsive: 1440 & 390 verified, **0 horizontal overflow**
- typecheck / typecheck:tests / lint / build: **PASS**; secret scan: **CLEAN**
- Obsidian smoke: Trusted Device → `TERAGON OS` → governed `AI Operations.md` read → `WORKFLOW_COMPLETED`, no new pairing, no auto-write

## Evidence
Durable screenshots: [`docs/screenshots/rc2/`](screenshots/rc2/) (see the README there for the connected-state proof).
