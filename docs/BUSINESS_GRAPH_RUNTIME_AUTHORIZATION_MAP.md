# TERAGON Business Graph — Runtime Authorization Map (Phase 10)

An **explicit, closed** mapping from the app's canonical roles/permissions to graph permissions. Source:
`src/graph/runtime/{authorizationMap,permissionAdapter}.ts`. Deny-by-default: an unmapped role or missing
capability gets **no** graph access. Graph access is a **separate elevated capability** — it is never
implied by the ability to open a CRM screen. The adapter only *translates* existing product permissions
into the Phase-8 `GraphPermissionOracle` + viewer clearance; it does not modify the authorization system.

## Per-role mapping

Permitted queries = the intersection of the role's held product permissions with each query's required
permission, further gated by the explicit historical/evidence grants. `null` domains = all entity domains.

| Role | Graph? | Clearance ceiling | Domains | Permitted queries | Stale | Historical | Evidence path |
|------|:-----:|-------------------|---------|-------------------|:-----:|:----------:|:-------------:|
| crole-sysadmin | ✓ | מוגבל | all | all 9 | ✓ | ✓ | ✓ |
| crole-ceo | ✓ | מוגבל | all | 8 (no delayed-enrollments) | ✓ | ✓ | ✓ |
| crole-bizmgr | ✓ | רגיש | business | followup, unanswered, recurring, printerImpact, superseded, recConflicts | ✗ | ✓ | ✗ |
| crole-sales | ✓ | פנימי | customer/quotation/lead/printer | followup, unanswered, recurring, printerImpact | ✗ | ✗ | ✗ |
| crole-service | ✓ | רגיש | service/customer/printer | followup, recurring, printerImpact | ✗ | ✗ | ✗ |
| crole-instructor | ✓ | פנימי | course/student/enrollment | followup, delayedEnrollments | ✗ | ✗ | ✗ |
| crole-champion | ✓ | פנימי | knowledge/customer/sales | followup, unanswered, recurring, printerImpact, superseded, recConflicts | ✗ | ✓ | ✗ |
| crole-auditor | ✓ | מוגבל | all | followup, unanswered, recurring, printerImpact, recConflicts, evidencePath | ✓ | ✓ | ✓ |
| **crole-viewer** | **✗** | — | — | none (`CAPABILITY_DENIED`) | ✗ | ✗ | ✗ |

**`crole-viewer` is the deliberate proof of deny-by-default:** a viewer holds `customer.read` (can open CRM
screens) yet receives **no** graph access — an explicit `graphEligible` gate, not CRM read, decides.

## Translation into the oracle

- **`canReadEntity`** — true only for entity types in the role's mapped domains.
- **`agentDomainAllowed`** — Phase 10 resolves HUMAN actors only; the agent-domain window is not opened
  (AGENT identities are not enabled this phase).
- **`canUseStaleGraph`** — true only for roles with the stale grant (sysadmin/ceo/auditor).
- **viewer clearance** — the role's sensitivity ceiling (`ציבורי < פנימי < רגיש < מוגבל`); the traversal
  layer still refuses any node/edge above it.
- **historical/superseded** and **evidence-path** access are separate booleans gating the timeline/
  superseded operations and evidence bodies-vs-references respectively.

Unmapped roles and any capability not explicitly granted resolve to a deny (`ROLE_UNMAPPED` /
`CAPABILITY_DENIED`). See [RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md) and
[RUNTIME_IDENTITY_DISCOVERY](BUSINESS_GRAPH_RUNTIME_IDENTITY_DISCOVERY.md).
