# TERAGON Business Graph — Read-Only Traversal (Phase 6)

Internal, **read-only, permission-gated, deterministic** traversal over the currently-served validated
`ACTIVE` snapshot. Source: `src/graph/traversal/**`. **Not wired into app runtime, no UI, no HTTP API,
no agent/Copilot access, no snapshot mutation.** It reads only `GraphIndexStore.getActiveSnapshot` +
`getHealth`; given a snapshot it is a pure, deterministic function.

## Service surface

`BusinessGraphTraversalService` — 8 internal operations, each `(request, ctx) => Promise<GraphTraversalResult<…>>`:

| Operation | Returns |
|-----------|---------|
| `getNode` | a single visible node envelope (or the absent-refusal) |
| `getNeighbors` | `GraphNeighborResult` — permitted 1-hop neighbors + connecting edges |
| `findPath` | `GraphPath[]` — the **shortest** permitted paths (deterministic BFS) |
| `findRelatedEvidence` | `GraphEvidenceResult` — evidence refs + paths, provenance/authority preserved |
| `calculateImpact` | `GraphImpactResult` — bounded affected nodes, **DIRECT vs INDIRECT** |
| `findConflicts` | `GraphConflictResult` — registered `CONTRADICTS`/`SUPERSEDES`/incompatible states only |
| `searchGraph` | ranked node **envelope** matches (deterministic) |
| `getTimeline` | `GraphTimelineResult` — graph-visible lifecycle/relationship events only |

Types (11): `GraphTraversalRequest`, `GraphTraversalResult`, `GraphQueryContext`, `GraphQueryAuditRecord`,
`GraphPath`, `GraphPathStep`, `GraphNeighborResult`, `GraphImpactResult`, `GraphConflictResult`,
`GraphEvidenceResult`, `GraphTimelineResult`. The service depends only on
`Pick<GraphIndexStore, "getActiveSnapshot" | "getHealth">`; RBAC/agent-wall coupling is an injected
`GraphPermissionOracle` (`canReadEntity` + `agentDomainAllowed`) so nothing hard-couples to the product's
permission module.

## Health gating (before EVERY query)

Inspect `getHealth(organizationId)`:

- `CORRUPT` / `MISSING` / `REBUILD_REQUIRED` → **refuse** — the snapshot is never read, `data: null`,
  reason `GRAPH_UNAVAILABLE`.
- `STALE` / `DEGRADED` → **deny by default**; only a caller with `allowStale: true` receives a result
  **marked `stale: true`**.
- `HEALTHY` → normal traversal.

Every `GraphTraversalResult` carries `snapshotId`, `organizationId`, `health`, `stale`, `registryVersion`,
`limitsApplied`, and `truncated`. **A stale result is never returned as current.**

## Security at every hop (deny-by-default)

`isNodeAccessible` is the single node-visibility predicate — every clause must pass, at the **start node
AND every traversed node**: same organization (node, query context, and viewer all agree) · sensitivity
clearance ≥ node sensitivity · viewer entity permission (injected) · agent domain window (injected) · not
archived · not superseded (unless a lineage/timeline/conflict op explicitly allows historical). Edges pass
`isEdgePermitted`: a `REJECTED` edge is **never** a valid hop; the relationship-type allow-list narrows
further; provenance gates apply (below).

**Connection never grants visibility.** An inaccessible node is dropped **before it enters the BFS
frontier** (`expand()`), so it can never surface through path shape, neighbor count, title, error, or
timing. **An unauthorized start node returns the exact same `NODE_NOT_FOUND` refusal as an absent one** —
byte-identical (proven by a `JSON.stringify`-equality test) — so the graph's existence cannot be probed.
Nodes are envelope-only by contract: **no protected payload body is ever returned** (at most a gated
reference).

## Limits — hard internal maxima, caller may only reduce

`TRAVERSAL_HARD_MAXIMA` = depth **12** / nodes **2000** / edges **5000** / paths **200** / **10 s**.
`resolveLimits` clamps every numeric budget **down** to its cap (a larger caller value is reduced, never
honored) and treats an allow-list as a strict narrowing of the internal universe (omitting it keeps
`null` = all). Defaults when the caller narrows nothing: depth 6 / nodes 500 / edges 1000 / paths 50 /
5 s. `truncated.{byDepth,byNodes,byEdges,byPaths}` marks a **limit** cut — never a security cut (a security
skip is invisible by design).

## Determinism

- **Cycle-safe** — a visited-set guarantees termination; no unlimited recursion.
- **Stable ordering everywhere** — one comparator: `relationshipType → sourceId → targetId → edgeId`.
- **`findPath`** — level-synchronous **deterministic BFS** collects all minimum-length paths, then sorts
  by `comparePaths` (length, then canonical step order). Repeated identical queries produce **byte-equal**
  output (test-proven).

## Authority / provenance query modes

Default traversal follows only `edgeIsAuthoritative` edges with `EXPLICIT`/`FOREIGN_KEY_DERIVED`
provenance. `INFERRED` (authoritative-but-inferred) requires `includeInferred`; `UNVERIFIED`/`PROPOSED`
require `includeUnverified`; **`REJECTED` is refused under every flag**. Any included non-default edge
stays **visibly labelled** — every `GraphPathStep`/evidence item carries its `provenance` + `authority`.
`findRelatedEvidence` and `calculateImpact` are **authoritative-only by default**.

## Per-operation behavior

- **`findRelatedEvidence`** — evidence references + paths; provenance + authority preserved; **never
  auto-fetches a protected body.**
- **`calculateImpact`** — bounded affected nodes + relationship paths; **distinguishes DIRECT (distance 1)
  from INDIRECT (distance ≥ 2)**; invents no business consequence.
- **`findConflicts`** — only registered `CONTRADICTS`, `SUPERSEDES`, and incompatible authoritative
  states; **no AI/semantic inference.**
- **`searchGraph`** — searches **safe node-envelope metadata only** (title/status/type/summary); never a
  protected body; deterministic ranking.
- **`getTimeline`** — graph-visible lifecycle + relationship events only; exposes no audit record
  forbidden to the viewer.

## Audit (every traversal)

Emits a `GraphQueryAuditRecord` of **safe metadata only**: deterministic `queryId` (`gq-<sha256>` over the
query identity — **no clock, no random**), `actorRef`, `organizationId`, `operation`, `snapshotId`,
requested + applied limits, filters, result counts, `truncated`, `health`, `safeDenialReason`, coarse
`durationBucket`. **Raw search text is never stored** — only a SHA-256 `searchTextHash` + a length-coarse
`searchTextClass`. No node bodies or sensitive field values appear.

## Example results (valid fixture, org `org-canonical`)

- `getNeighbors(aiRecommendation/rec-1)` default → `approval/ap-1` (`APPROVED_BY`, CANONICAL) +
  `agent/ag-1` (`RECOMMENDED`, DERIVED) + inbound `agentRun/run-1` (`CREATED`); the `INFERRED`
  `SUPPORTED_BY → knowledgeArticle/ka-1` appears only with `includeInferred: true`.
- `findPath(agentRun/run-1 → approval/ap-1)` → one length-2 path
  `run-1 —CREATED→ rec-1 —APPROVED_BY→ ap-1`.
- `calculateImpact(agentRun/run-1)` → DIRECT `{rec-1, t-1}` (distance 1); INDIRECT `{ap-1, ag-1, u-1}`
  (distance 2).

## What traversal never does

Never mutates a snapshot/node/edge · never reads a canonical repository directly · never serves a
non-`HEALTHY` snapshot as current · never traverses through an inaccessible node · never returns a
protected body · never widens a caller-supplied limit · never logs raw search text or entity content ·
never reaches product UI, HTTP, agents, or Copilot.

See: [SECURITY_MODEL](BUSINESS_GRAPH_SECURITY_MODEL.md) · [INDEX_HEALTH](BUSINESS_GRAPH_INDEX_HEALTH.md) ·
[PHASE6_TEST_REPORT](BUSINESS_GRAPH_PHASE6_TEST_REPORT.md).
