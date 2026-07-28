# TERAGON Business Graph — Security Contracts (Phase 2)

Deny-by-default security contracts a later traversal layer MUST honor. Source:
`src/graph/contracts/security.ts`. These are **contracts + pure guards** — no traversal executes them
yet. (Design rationale in [SECURITY_MODEL](BUSINESS_GRAPH_SECURITY_MODEL.md).)

## Contracts

- **`GraphViewerContext`** `{ organizationId, actorRef: GraphEntityRef, role?, isAgent: boolean,
  agentId? }` — who is asking, in which org, as a human or an agent.
- **`GraphPermissionDecision`** `{ allowed: boolean; reasonHe; reasonCode }`. Helper
  **`denyByDefault(reasonHe)`** returns a denied decision — the *default* answer is always **no**.
- **`GraphSensitivityPolicy`** + **`mayRevealBody(viewerClearance, nodeSensitivity, hasReason)`** — a
  pure predicate; the hidden sensitivities **רגיש/מוגבל** require an explicit reveal reason.
  `GRAPH_HIDDEN_SENSITIVITIES` / `DEFAULT_GRAPH_SENSITIVITY_POLICY` mirror the domain scale.
- **`GraphTraversalLimits`** `{ maxDepth, maxNodes, maxPaths, timeoutMs, cancellable }` with bounded,
  positive defaults (`DEFAULT_GRAPH_TRAVERSAL_LIMITS`) and a schema rejecting non-positive/unbounded
  values — the seam for "no unlimited recursive traversal."
- **`GraphAuditContext`** `{ actorRef, action, rootRef, correlationId }` — the shape every future graph
  query must emit so it is auditable (`action` e.g. `graph.query`).
- **`ActorRef`** (Phase-2.1) — a discriminated actor contract: `{ kind:"HUMAN"; userId }` |
  `{ kind:"AGENT"; agentId }` | `{ kind:"SYSTEM" }`. The **kind is authoritative** — actor type is
  **never inferred from an `ag-*` id prefix** (a HUMAN whose userId merely contains "ag" is still a
  HUMAN). `GraphViewerContext.actor` is an `ActorRef`.
- **`assertHumanApprover(actor, { eligibility, requesterUserId?, prohibitSelfApproval? })`** (Phase-2.1,
  replaces the old prefix-sniffing `humanApproverGuard`) — a pure guard that **throws
  `GraphSecurityError`** unless ALL hold: `actor.kind === "HUMAN"`; a canonical user id (non-empty, no
  whitespace, not an array-position id); the caller-injected `eligibility.active === true`;
  `eligibility.hasRequiredPermission === true`; and no prohibited self-approval
  (`requesterUserId !== actor.userId` when `prohibitSelfApproval`). **AI can never be a human approver.**

## Security invariants (each is unit-tested)

1. **Deny-by-default** — a node being *connected* never makes it visible; every hop must independently
   pass: same organization · viewer permission · entity permission · sensitivity clearance · lifecycle
   eligibility · authoritative-state policy.
2. **Cross-organization is rejected** at the edge contract (`source.org === target.org === edge.org`).
3. **Sensitive bodies never leave via the envelope** — `BusinessGraphNode` carries no body/content;
   sensitive content is reachable only through a separate `ProtectedPayloadReference` (a pointer, with
   `requiresRevealReason`), and `mayRevealBody` gates the reveal.
4. **AI ≠ human approver** — `assertHumanApprover` throws for any AGENT/SYSTEM actor, inactive/
   ineligible user, missing permission, or prohibited self-approval; actor kind (never an id prefix)
   decides.
5. **Proposed ≠ authoritative** — a PROPOSED edge is UNVERIFIED and cannot be approved (edge refinement).
6. **Rejected/unverified evidence is non-authoritative** — `edgeIsAuthoritative` denies REJECTED/
   UNVERIFIED/PROPOSED.
7. **Name/ambiguous references never create an authoritative edge** — `referenceMayBeAuthoritative`
   returns `false` for DENORMALIZED_NAME/AMBIGUOUS/MISSING_TARGET/MALFORMED/CROSS_ORGANIZATION/
   UNSUPPORTED.
8. **Hard agent walls** (to enforce in the traversal phase via `canAgent`): all 7 agents are barred from
   `approvals/auditEvents/users/roles`, plus per-agent bans (e.g. Hunter↛serviceTickets, Flow↛customers).

## Honesty caveat (carried from Phase 1)

The app has **no real authentication** (single CEO identity, demo mode). These contracts are governance
*simulation* seams — several enforcement points (multi-tenant org checks, sensitive-record refusal at
linkage) are the reason the graph traversal layer exists, and must be labeled as honestly as the rest
of the app. The contracts provide the *shape*; a later phase provides the *enforcement*.
