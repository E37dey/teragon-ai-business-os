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
| **Backup / recovery** | **Untested** | Neon PITR exists at the platform level (S7 lineage) but a restore drill for teragon-staging was **not** performed in this checkpoint. |
| **Kill-switch / feature-disable** | Partial (untested end-to-end) | `VITE_PERSISTENCE_PROVIDER` selects LOCAL vs SUPABASE; Graph/AI flags are compile-time OFF constants. Emergency disable of a live pilot (revoke sessions / flip provider) is **not drilled**. |

## Readiness conclusion
- **Auth/security operations**: ready for an internal/staging pilot (RBAC, secrets, fail-closed errors proven).
- **Domain operations**: **not ready** — domain data does not persist to staging (blocking defect); audit/idempotency/atomicity unverified.
- **Recovery + emergency-disable**: **untested** — no production claim may be made until a restore drill + kill-switch drill pass.
- **AI operations**: **N/A** — AI disabled; cost/monitoring controls to be wired before enablement.
