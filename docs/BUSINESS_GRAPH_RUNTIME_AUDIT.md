# TERAGON Business Graph — Runtime Audit (Phase 10)

How runtime facade executions are audited, and the failure policy. Source: `src/graph/runtime/audit.ts`
(`RuntimeBusinessGraphAuditAdapter`).

## Why a bounded internal adapter (not yet canonical)

The canonical `AuditEvent` repository redacts raw content and is not shaped to carry the facade/query/
traversal **execution correlation** a graph query produces. Rather than distort it, Phase 10 uses a
**bounded internal buffer** (default capacity 512) and records this state honestly. This is the documented,
temporary state until a canonical audit sink that supports safe graph records exists.

## What is recorded (safe whitelist only)

`authenticated actor` · `organization` · `operation` · the three execution-correlation ids
(facade / query / traversal) · `readiness` · `health` · `resultCount` · `safe resultCode`.

**Never recorded:** protected bodies, raw search text, customer notes, hidden entity ids, permission
internals, session tokens.

## Per-execution audit state

- `OK` — the durable writer succeeded.
- `DEGRADED` — no canonical durable writer is wired (the honest current default).
- `FAILED` — the writer threw. `record()` itself **never throws**.

## Failure policy

- **Fail-CLOSED for sensitive graph queries** — for a data-bearing query, if the durable audit write
  `FAILED`, the result is **suppressed** (`view → null`, code `INTERNAL_FAILURE`, `released: false`). No
  data is returned when it could not be audited. (`resolveQueryOutcome`.)
- **Fail-SAFE degraded for low-risk status calls** — `getStatus`/capability/readiness calls are always
  released, marked with an explicit `degraded` audit state rather than blocked. (`resolveStatusOutcome`.)

Audit failure therefore never leaks data and never silently grants access to a sensitive query; it only
degrades low-risk status reporting.

See [RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md) ·
[FACADE_SECURITY](BUSINESS_GRAPH_FACADE_SECURITY.md).
