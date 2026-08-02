# Teragon Trusted-AI — Risk Register (11 risks)

Each risk: description · flow · likelihood · impact · detection · prevention ·
fallback · owner · residual · pilot-blocking. Scored for the current state
(AI OFF; domain layer not wired to Supabase).

| # | Risk | Description / flow | Likelihood | Impact | Detection | Prevention | Fallback | Owner | Residual | Pilot-blocking |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | Prompt injection | Malicious content instructs a model to change protected behavior. Flow: input → model → action. | N/A now (AI OFF) | High | Adversarial evals (TA-A3); trusted-instruction separation | Model off; when on: instruction/data separation, action allow-list, human approval | Refuse; escalate | ai/security | Deferred (AI not evaluated) | Yes (before AI on) |
| 2 | Hallucination / fabrication | Model asserts an unsupported confident answer. | N/A now | High | Grounding axis; source checks | Model off; when on: retrieval grounding, cite-or-refuse | Refuse / mark low-confidence | ai | Deferred | Yes (before AI on) |
| 3 | Sensitive-data exposure | Secret/PII surfaced to the browser or a report. | Low | Critical | scan:secrets, bundle scan (TA-A3), report redaction | Publishable key only; redaction; RLS | Block + rotate | security | Low (no leaks found) | No (currently controlled) |
| 4 | Excessive permissions | A capability can do more than intended. | Low | High | RLS review; capability checks | Least-privilege RLS; no service_role in browser | Revoke; tighten policy | security | Low | No |
| 5 | Over-reliance | Humans trust AI output without review. | N/A now | Medium | HITL classification | AI off; advisory-only design when on | Require human sign-off | product | Deferred | Yes (before AI on) |
| 6 | Excessive agency | System takes irreversible action autonomously. | Low | Critical | Approval-gate review; audit | Approval-gated workflows; no auto-execute | Human approval required | product/security | Low (no auto-exec) | No |
| 7 | Auth / session failure | Session lost/expired mishandled. | Low | High | TA-E4/I2; fail-closed tests | Fail-closed identity; typed safe errors; no fallback | Re-login; deny | auth | Low (proven) | No |
| 8 | Cross-org leakage | One org reads/writes another's data. | Low | Critical | TA-A2 (RLS scoping) | RLS on every table; server-resolved org | Deny; audit | security | Low (proven denied) | No |
| 9 | Secret exposure in build/CI | service_role/token committed or bundled. | Low | Critical | scan:secrets, privileged bundle scan, safety hooks | Gitignore; publishable-only; hooks | Block commit; rotate | infra/security | Low | No |
| 10 | Infra outage | Auth/data server unreachable. | Medium | Medium | TA-I2; health checks | Typed safe errors; no fallback; retries | Degrade to read-only/deny | infra | Medium | No (handled safely) |
| 11 | Incorrect retry / duplication | A retried write creates duplicates, or a UI success does not persist. | High (domain) | High | TA-B1 (silent IndexedDB fallback); idempotency review | Idempotent writes; boundary persistence | **BLOCKED**: domain not wired → fix required | domain | **High** | **Yes** (blocking defect) |

## Top pilot blockers (current)
- **Risk 11** (domain data writes to IndexedDB, not staging — silent-fallback / no-persistence) → blocks any domain pilot.
- **Risks 1, 2, 5** are deferred but **must** be evaluated before the AI capability is enabled (AI is currently OFF → NOT YET EVALUATED).
