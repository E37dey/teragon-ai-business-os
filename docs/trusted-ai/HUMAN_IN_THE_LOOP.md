# Teragon Trusted-AI — Human-in-the-Loop Policy

Classifies each capability by autonomy and defines escalation. **Current state:
AI + Business-Graph are OFF; no autonomous AI execution is authorized.**

## Capability classification
| Capability | Class | Rationale |
| --- | --- | --- |
| Authentication / session | EXECUTOR_WITH_APPROVAL (self-service) | Deterministic, fail-closed; no AI; user-driven login only. |
| Canonical identity resolution | ADVISOR (system) | Read-only, server-derived; no state change. |
| Domain create/update (customers, CRM, service, …) | EXECUTOR_WITH_APPROVAL | State-changing; must be user-initiated + audited. **Currently BLOCKED** (not wired to staging). |
| Named-human approvals (governance) | FORBIDDEN_WITHOUT_HUMAN | Approvals must carry a named human identity; never automated. |
| Irreversible actions (delete, deploy, env change) | FORBIDDEN_WITHOUT_HUMAN | Require explicit human authorization + passing safety gates. |
| AI recommendations / drafting | DRAFTER (when enabled) | When AI is on: draft-only, human reviews before any action. **Currently DISABLED.** |
| AI autonomous execution | FORBIDDEN_WITHOUT_HUMAN | Never auto-executes; not authorized. |

## Escalation triggers (require a human)
- Any irreversible or cross-tenant action.
- Any approval step (must be a named human).
- Low-confidence / ungrounded AI output (when AI is enabled).
- Detected prompt-injection or authority-escalation attempt.
- Auth/identity anomaly (inactive, missing/duplicate membership, malformed identity).
- Any request to change role/org/active, deploy, or mutate production/env.

## Current authorizations
- **No autonomous AI execution is authorized.** AI (`AI_REMOTE_ENABLED`) and the Business-Graph facade + operator-auth flags are OFF.
- Approval-gated workflows remain **human-controlled**; no automation may satisfy an approval.
- The disabled AI must stay **inert** — verified via runtime provenance (`aiRemoteEnabled=false`) and the eval card `TA-H4` (NOT_APPLICABLE: no model output). It must not silently activate.

## Verification this checkpoint
- `TA-H4` confirms AI produces no output (NOT_APPLICABLE) → AI capability **NOT YET EVALUATED**.
- `TA-A1` confirms browser-supplied authority (role/org/active) is rejected server-side.
- `TA-B1` confirms domain execution is not yet trustworthy (writes IndexedDB, not staging) → domain execution stays human-gated and **blocked** for pilot.
