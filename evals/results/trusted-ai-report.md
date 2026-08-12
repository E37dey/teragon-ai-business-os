# Teragon Trusted-AI — Live Execution Report

- Target origin: http://localhost:4180
- Masked ref: bjvi…azjj · provider: SUPABASE

## Counts
executed 15 · pass 12 · fail 1 · blocked 1 · n/a 1 · skipped 0

## Capability gate
- **platform-auth-security**: INTERNAL (pass 12/12) — All cards PASS, no safety failure — ready for internal/staging pilot (full production GO also needs ops-readiness sign-off).
- **platform-domain**: FIX (pass 0/2) — Blocking fixable defect(s) present.
- **active-ai-capability**: NOT_YET_EVALUATED (pass 0/1) — AI_REMOTE_ENABLED OFF — no model runs; capability not evaluated.
- **platform (overall)**: FIX
- **active-ai-capability**: NOT_YET_EVALUATED

## Cards
| id | cap | verdict | action | safety | evidence |
| --- | --- | --- | --- | --- | --- |
| TA-H1 | auth-security | PASS | AUTHENTICATE_SESSION | 2 | provider.status=AUTHENTICATED |
| TA-H2 | auth-security | PASS | RESOLVE_CANONICAL_IDENTITY | 2 | org=org-teragon |
| TA-H3 | auth-security | PASS | RESTORE_SESSION | 2 | restored.status=AUTHENTICATED |
| TA-A1 | auth-security | PASS | REJECT_CLIENT_SUPPLIED_AUTHORITY | 2 | org-escalation blocked=true |
| TA-A2 | auth-security | PASS | DENY_CROSS_ORG_READ | 2 | other-org memberships=0 |
| TA-A3 | auth-security | PASS | DENY_EXTRACTION_NO_SECRET_DISCLOSURE | 2 | bundle secret-clean=true (ci-artifacts/acceptance-report.json security test passed) |
| TA-E1 | auth-security | PASS | REJECT_INVALID_CREDENTIALS | 2 | status=ERROR |
| TA-E2 | auth-security | PASS | ENFORCE_ROUTE_PROTECTION | 2 | ci-artifacts/acceptance-report.json: route-protection test passed (unauth -> /login) |
| TA-E3 | auth-security | PASS | RENDER_RESPONSIVE_RTL | 2 | ci-artifacts/acceptance-report.json: RTL + no-overflow (1024/1280/1440) + theme test passed |
| TA-I1 | auth-security | PASS | FAIL_HARD_ON_WRONG_TARGET | 2 | wrong-project throws=true |
| TA-I2 | auth-security | PASS | TYPED_SAFE_ERROR_NO_FALLBACK | 2 | status=ERROR |
| TA-E4 | auth-security | PASS | FAIL_CLOSED_NO_SESSION | 2 | post-signout resolveIdentity=MISSING_PROFILE |
| TA-H4 | active-ai-capability | NOT_APPLICABLE | NONE_AI_DISABLED | 2 | AI_REMOTE_ENABLED OFF; provenance aiRemoteEnabled=false; no model output |
| TA-H5 | domain | UI_CAPABILITY_MISSING | CREATE_CUSTOMER_PERSIST_STAGING | 2 | src/modules/** use getRepository/IndexedDBRepository, never getPersistenceRepository/createSupabaseRepository |
| TA-B1 | domain | FAIL | PERSIST_DOMAIN_TO_STAGING_ONLY | 2 | ci-artifacts/acceptance-report.json: SUPABASE composition opens local 'teragon-os' IndexedDB for domain data |
