# Recovery Options — decision matrix

**Planning document. No purchase, billing action or Supabase change was made.**

## The gap, stated plainly

The 2026-08-03 restore drill measured staging directly:

```
pitr_enabled: false     backups: []     plan: "free"
```

Two different things are often conflated. They must be tracked separately:

| Capability | Status | Evidence |
|---|---|---|
| **Schema reconstruction** (migrations 001–014 → working, isolated database) | **TESTED** | Drill 2026-08-03: 47 tables, RLS 47/47, 185 policies, isolation 8/8, RTO **4 m 17 s** |
| **Data backup restore** (recover rows to a point in time) | **NOT AVAILABLE / UNTESTED** | No backup artifact exists. **RPO undefined/unbounded** |

Schema is reproducible from git. **Business data is not recoverable at all today.**
That is acceptable only while staging holds seed and pilot data — it stops being
acceptable the moment real business data is entered.

---

## Options

### A. Paid Supabase backups / PITR — ❌ NOT AUTHORIZED (recorded for contrast only)

| Dimension | Assessment |
|---|---|
| Cost dependency | **Requires a paid plan — a human billing decision.** Recurring cost |
| RPO | Best: daily backups ⇒ ≤24 h; PITR ⇒ seconds-to-minutes |
| RTO | Low — provider-native restore, no bespoke tooling |
| Automation | Fully managed; nothing to build or babysit |
| Security | Backups stay inside the Supabase trust boundary; no new credential or storage surface |
| Restore testability | **High** — restore-to-new-project makes the existing runbook executable as written, and RPO becomes a *measured* number |
| Human actions | Approve billing; enable PITR/backups; re-run the drill |

### B. Scheduled logical backups to encrypted external storage

| Dimension | Assessment |
|---|---|
| Cost dependency | Low (storage only), but **real engineering cost** |
| RPO | Equal to the schedule (e.g. 24 h); worse than PITR |
| RTO | Higher — restore is a bespoke `pg_restore` path that must itself be maintained |
| Automation | Must be built: scheduled job, `pg_dump` runtime, retention, failure alerting |
| Security | **Adds surface**: a long-lived DB credential in CI, plus an encrypted bucket, its keys, and rotation. A backup that leaks is a full data breach |
| Restore testability | Medium — testable, but only against tooling we wrote and must keep working |
| Human actions | Provision storage + credentials; own the job long-term |

### C. Temporary explicit risk acceptance (internal pilot only)

| Dimension | Assessment |
|---|---|
| Cost dependency | None |
| RPO | **Unbounded — total loss of all data since project creation** |
| RTO | Schema only: ~5 min to rebuild an empty system; data never returns |
| Automation | None |
| Security | No new surface (the safest option in *that* narrow sense) |
| Restore testability | Only the reconstruction half is testable — already done |
| Human actions | A **named owner** must accept the risk in writing, with an expiry date and a hard trigger |

---

## Operator decision (2026-08-03): NO PAID OPTION

**Option A is NOT AUTHORIZED.** The operator authorizes no payment, subscription
upgrade, paid backup, paid PITR, paid storage or billing action. A is recorded
here only so the trade-off is explicit; it is **not planned**.

That removes the provider-native path and leaves exactly two:

**Adopt C now, and implement B at zero cost before real business data is entered.**

Rationale: today staging holds only seed and pilot rows, so the honest cost of
total loss is a rebuild already timed at **4 m 17 s** — C is defensible *while
that stays true*. It stops being defensible the moment real data lands, and
since A is off the table, B becomes the only remaining protection.

B must therefore be built **within free tooling** — GitHub Actions on a schedule,
client-side encryption, and encrypted Actions artifacts as the store. Its costs
(a long-lived DB credential in CI, a key that must not be lost, artifact
expiry) are now accepted deliberately rather than avoided, because the
alternative is unbounded loss.

Design: **`docs/operations/ZERO_COST_BACKUP_PLAN.md`**.

### The boundary condition (the point of this document)

> **No real business or customer data may be entered into any Teragon Supabase
> project while `backups: []` and `pitr_enabled: false`.**

Verify with `GET /v1/projects/{ref}/database/backups` before onboarding data.
Crossing that line without option A (or B) means accepting **unbounded,
irreversible data loss** — and that decision belongs to a named human, not to
this document.
