# Teragon Trusted-AI — Operations Readiness

State of operational controls for the platform. No production claim is made where
recovery / emergency-disable is untested.

| Control | State | Evidence / notes |
| --- | --- | --- |
| **RBAC** | Ready (auth), enforced server-side | Canonical role/org from `current_profile()` + RLS; browser authority rejected (`TA-A1`). |
| **Secret management** | Ready | Publishable/anon key only in browser; `.env.staging.local` gitignored; `scan:secrets` CLEAN; privileged bundle scan clean (`TA-A3`). service_role/secret are server-only. |
| **Performance (P95)** | Measured locally | Interactive auth/route ops complete in <5s locally against staging (network-bound). Not load-tested. |
| **Timeout / retry** | Partial | Auth calls surface typed safe errors on network failure (`TA-I2`); no automatic domain-write retry (domain layer not wired). Idempotency untested for domain (blocked). |
| **Cost visibility** | N/A | AI OFF — no model spend. When AI is enabled, budget/rate-limit controls (AI_* env) must be wired + monitored. |
| **Audit logs** | Partial | `audit_events` table + RLS exist; audit-on-write not exercisable via UI (domain writes not wired to staging). Audit immutability (no update/delete by normal caller) enforced by RLS. |
| **Health checks** | Partial | App boots + provenance published; no dedicated liveness/readiness endpoint for staging pilot. |
| **Backup / recovery** | **NOT AVAILABLE** | ⚠️ **Corrected 2026-08-03 by measurement.** The earlier note claimed "Neon PITR exists at the platform level" — that is **false for this project**. `GET /v1/projects/bjvi…azjj/database/backups` returns `pitr_enabled: false` and `backups: []` on a `free`-plan organization. **There is no recovery point and nothing to restore; RPO is undefined/unbounded.** Breaking this into the two capabilities that were previously conflated: **schema reconstruction = TESTED** (drill 2026-08-03, RTO 4 m 17 s); **native backup/PITR = unavailable on the current free plan, and NO PAID UPGRADE IS PLANNED** (operator decision); **data restore = not yet tested** — nothing exists to restore from. Mitigation is a zero-cost logical backup, planned but **not yet built**: `docs/operations/ZERO_COST_BACKUP_PLAN.md`. See also `docs/operations/evidence/RESTORE_DRILL_2026-08-03.md` and `docs/operations/RECOVERY_OPTIONS.md`. |
| **Kill-switch / feature-disable** | Partial (untested end-to-end) | `VITE_PERSISTENCE_PROVIDER` selects LOCAL vs SUPABASE; Graph/AI flags are compile-time OFF constants. Emergency disable of a live pilot (revoke sessions / flip provider) is **not drilled**. |

## Readiness conclusion
- **Auth/security operations**: ready for an internal/staging pilot (RBAC, secrets, fail-closed errors proven).
- **Domain operations**: **not ready** — domain data does not persist to staging (blocking defect); audit/idempotency/atomicity unverified.
- **Recovery + emergency-disable**: **schema reconstruction TESTED; data recovery NOT AVAILABLE.** The 2026-08-03 drill proved the schema/RLS/policy surface rebuilds and isolates correctly (47 tables, RLS 47/47, 185 policies, isolation 8/8), but also proved staging holds **no backups at all**. Native backup/PITR is unavailable on the free plan and **no paid upgrade is planned**; the mitigation is a zero-cost logical backup that is **planned, not built** (`docs/operations/ZERO_COST_BACKUP_PLAN.md`). No production claim may be made until that backup runs on a schedule, a restore drill runs against a genuine artifact, and the kill-switch drill passes.
- **AI operations**: **N/A** — AI disabled; cost/monitoring controls to be wired before enablement.
