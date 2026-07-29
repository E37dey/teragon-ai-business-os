# TERAGON Business Graph — Recovery & Retention (Phase 4)

Non-destructive recovery of the **derived index only**. Source: `src/graph/store/recovery.ts`.
**Recovery never modifies canonical CRM records** — it only re-serves a previously-validated snapshot.

## Retention

Kept per organization: the current **ACTIVE** snapshot · the **previous known-good** snapshot · a small
**configurable number of historical** snapshots. `deleteExpiredSnapshots(organizationId)` removes **only
eligible** historical snapshots — never the served snapshot and never the previous known-good (proven by
the retention test). Recovery points are retained separately as an audit trail.

## Recovery flow

```
active snapshot unhealthy (see INDEX_HEALTH)
  → select the previous VALID known-good snapshot for the SAME organization
  → verify its checksum AND organization match
  → activate it as RECOVERY (buildState → RECOVERY)
  → record the replaced snapshot in a GraphIndexRecoveryPoint
```

- Only a snapshot that **re-validates** (checksum recomputes, organization matches, still `VALID`) may
  be activated as `RECOVERY`. A corrupt candidate is rejected, not served.
- The unhealthy snapshot is superseded, not deleted, so the recovery is auditable and reversible.
- **Canonical repositories are untouched** — proven by the "recovery does not mutate canonical records"
  test.

## When recovery is not possible

If no previous known-good snapshot re-validates, the store reports health `REBUILD_REQUIRED` /
`MISSING` and serves nothing (rather than serving a corrupt or stale index). The correct next action is a
full `rebuildOrganizationGraph` from current canonical data — never a partial or forced activation.

## Safety invariants

- Recovery affects one organization's index only; no cross-organization effect.
- No `INVALID`/`FAILED`/`CORRUPT` snapshot is ever activated (recovery or otherwise).
- Exactly one served snapshot per organization at all times (or none, honestly, when unrecoverable).
