# TERAGON Business Graph — Runtime Identity Discovery (Phase 10)

Written **before** implementation. An audit of the existing application's identity/authentication surface,
to decide honestly whether a trustworthy authenticated identity exists that the runtime Business Graph
facade could bind to. **Result: it does not.**

## Findings

| Question | Finding | Evidence |
|----------|---------|----------|
| Session / authentication source | **None.** No login, no session token, no auth gate. | `src/authorization/roleStore.ts` header: *"HONEST DEMO: there is NO login."*; `main.tsx` → `RouterProvider(createAppRouter())` with no auth/login route. |
| "Current user" | A **hardcoded demo persona** `u-tzachi` ("צחי זוסטייהם"), repeated per page. | `GovernancePage.tsx` `CURRENT_USER = { id: "u-tzachi" … }`; `AdministrationPage.tsx` `CURRENT_ACTOR_ID = "u-tzachi"`. |
| "Current role" | A **localStorage demo selector** (`teragon.w9b.demoRole`, default `crole-sysadmin`), switchable at will. | `roleStore.ts` `getCurrentRole()`/`setCurrentRole()`. |
| User repository | Exists: `users` collection; `User { role: UserRoleKey; status: EntityStatus; … }`. Active state = `"פעיל"`. | `src/domain/types.ts`. |
| Role / capability source | Real, canonical: `CANONICAL_ROLE_IDS` (`crole-sysadmin/ceo/bizmgr/sales/service/champion/viewer`) with `permissions: string[]`; 24 closed `PERMISSIONS`. | `src/domain/administration/roles.ts`, `src/authorization/permissions.ts`. |
| Authorization system | Real **simulation** — matrix/guards/routeGuard evaluate a role's permissions live, explicitly labelled *"סימולציית הרשאות במצב הדגמה"* (demo-mode permission simulation). | `src/authorization/{matrix,permissions,routeGuard}.ts`. |
| Organization resolution | **No per-user org membership.** `organizationId` is a data attribute on records (`Customer.organizationId: string \| null`) + an authz-matrix context value; there is no authenticated tenant. | `src/domain/types.ts`, `src/authorization/matrix.ts`. |
| Sensitivity clearance | **No concept in the app.** No per-user/-role clearance field exists (the graph's `GraphSensitivity` has no product counterpart). | — |
| Identity persistence across reloads | Only the localStorage **role** persists; there is no authenticated identity to persist. | `roleStore.ts`. |
| Real authentication? | **No.** Only a demo persona + a demo role selector. | (all of the above) |

## Conclusion

**The application has a real authorization *simulation* but no real *authentication*.** The only available
"identity" signals are exactly the ones the Phase-10 brief forbids trusting: a hardcoded demo persona, a
localStorage role value, and a visible Hebrew display name. None constitutes a trustworthy authenticated
identity.

Per the brief ("if no trustworthy authenticated identity currently exists, document that result and keep
runtime graph access unavailable rather than fabricating an admin"), Phase 10 therefore:

1. Builds the full runtime composition, identity resolver, permission mapping, access policy, audit
   adapter, and lifecycle **correctly**, and
2. Binds the **production** `RuntimeBusinessGraphIdentityResolver` to the only honest outcome —
   **`IDENTITY_UNAVAILABLE`** — because there is no authenticated session to resolve. It explicitly does
   **not** treat `u-tzachi` or the localStorage role as authenticated.
3. Leaves runtime graph access **UNAVAILABLE** in production (also independently gated by the
   rollout-not-approved default and the OFF feature flag).

The machinery is proven end-to-end with **deterministic fake authenticated sessions** in tests; the
production path stays closed until a real authentication boundary exists. This makes Phase 10 the honest
forcing function for real authentication before any UI or agent may consume graph results (see the Phase 11
recommendation).

## Phase 11 update — a real (headless) authentication boundary now exists

Phase 11 adds a headless internal-operator authentication foundation
([OPERATOR_AUTH](BUSINESS_GRAPH_OPERATOR_AUTH.md)) that produces a genuine `TrustedAuthenticatedSession`
from a verified operator credential against a real **active** canonical user — the honest replacement for
`UnavailableTrustedSessionSource`. It is **OFF by default** and **decoupled from graph access** (an
authenticated operator still gets `FEATURE_DISABLED`/`ROLLOUT_NOT_APPROVED` until those guards are
deliberately enabled). So a trustworthy identity is now *obtainable* for controlled internal rollout, while
the discovery's core conclusion still holds for the ordinary app: it has no ambient authenticated user, and
nothing trusts `u-tzachi` or the localStorage role.

See: [RUNTIME_AUTHORIZATION_MAP](BUSINESS_GRAPH_RUNTIME_AUTHORIZATION_MAP.md) ·
[RUNTIME_COMPOSITION](BUSINESS_GRAPH_RUNTIME_COMPOSITION.md) ·
[RUNTIME_ACCESS_POLICY](BUSINESS_GRAPH_RUNTIME_ACCESS_POLICY.md).
