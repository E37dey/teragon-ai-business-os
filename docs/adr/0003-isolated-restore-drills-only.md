# ADR 0003 — Restore drills run only in an isolated, disposable project

**Status:** Accepted · **Context:** S10.1 (operational hardening)

## Context

`OPERATIONS_READINESS.md` records backup/recovery as **Untested**: platform-level PITR exists,
but no restore has ever been rehearsed. A backup that has never been restored is an assumption.

The obvious way to test recovery is to restore into an existing project. That is exactly the
thing that must not happen. A restore **overwrites** — there is no "restore alongside".
Restoring into Production is catastrophic; restoring into active staging would destroy the
bootstrapped administrator and the live-acceptance evidence that the LIVE_VALIDATED claims for
customers and contacts rest on.

## Decision

**Every restore drill targets a NEW, disposable Supabase project, created for that drill and
deleted afterwards.** Production and active staging are never restore targets, under any
approval path.

Additional constraints:
- The drill is **read-only** against the restored copy — it proves recoverability, not writes.
- The drill uses the **drill project's own** credentials; no staging or Production key is reused.
- A drill requires **no schema change**. Migration `015` remains prohibited; a drill that appears
  to need one has hit a stop condition, not earned an exception.
- Cleanup runs even when the drill fails.
- **RTO and RPO are measured and recorded**, never estimated.

See `docs/operations/RESTORE_DRILL_RUNBOOK.md` for the procedure and evidence checklist.

## Consequences

**Positive** — recovery becomes a rehearsed capability with real numbers, and a failed drill
costs one disposable project rather than an outage. Isolation checks can be verified on the
restored copy without risking the live one.

**Negative** — each drill needs project-creation rights and incurs setup cost, so drills are
deliberate events rather than continuous checks. Accepted.

**Rejected** — restoring into staging "because it is not Production", and treating platform
PITR as proof of recoverability without rehearsal.
