# TERAGON — Known Limitations

Technically honest, professionally framed. Each item: **current state → why → production next step.** These are deliberate scoping decisions for an academic demo, not oversights.

## 1. LOCAL_INDEXEDDB is local/demo persistence
- **Current state:** The default persistence provider is `LOCAL_INDEXEDDB` — all demo data lives in the browser (IndexedDB); it resets per browser and carries synthetic data only.
- **Why:** The project is an academic demo with no real company database and no hosting requirement; local-first makes it instantly runnable and reviewable.
- **Production next step:** Promote a server-backed provider (Supabase) as the default after staging acceptance; the provider abstraction (`src/persistence/provider.ts`) already supports `SUPABASE`.

## 2. Client-side record scoping is not a server security boundary
- **Current state:** `scopeRecords` (students see own enrollment, technicians own jobs) is a **least-privilege presentation policy** enforced in the client; in the local build the browser holds all data.
- **Why:** Without a server in the demo build there is no trusted boundary to enforce per-row ownership; the policy guarantees an unauthorized row is never *surfaced*, and it is fail-closed.
- **Production next step:** Enforce the same predicate at the database with per-owner RLS (see item 4). Documented in `docs/vnext/RECORD_SCOPE.md`.

## 3. Supabase provides organization-level RLS (not per-user yet)
- **Current state:** The Supabase-backed customer surfaces enforce **organization/tenant** isolation via RLS (`organization_id = auth_org_id()`), derived from `auth.uid()`.
- **Why:** Org isolation was the first, highest-value trusted boundary to validate.
- **Production next step:** Extend RLS from org-level to per-user/assignment-level ownership.

## 4. Per-user / assignment-level RLS is future work
- **Current state:** "Technician A cannot read technician B's job" is enforced as a client policy, not yet a server guarantee.
- **Why:** True per-user enforcement requires per-owner RLS policies plus a real auth session — beyond the demo's scope.
- **Production next step:** Add per-owner RLS (`owner_id = auth.uid()` on tickets/tasks, `student_id = auth.uid()` on enrollments) and real authentication. This is the named next security phase.

## 5. Obsidian bridge is a local desktop integration
- **Current state:** The vault connection runs over a **localhost** bridge (`127.0.0.1:5200`) to the Obsidian desktop plugin; the Trusted Device is browser-profile-bound.
- **Why:** It is a genuine local-first integration (real vault, real reads), not a hosted service.
- **Production next step:** A hosted/remote knowledge connector with server-side trust if multi-user cloud access is needed; local reads and human-approved writes stay the model.

## 6. AI remote mode is intentionally disabled
- **Current state:** `AI_REMOTE_ENABLED=false` — the AI layer is a **deterministic local rules engine** ("local rules engine — no remote model"); agent outputs are explainable and reproducible.
- **Why:** Determinism, zero external dependencies/cost, and full auditability for an academic evaluation.
- **Production next step:** Optionally enable a governed remote model behind the same approval boundary and evidence trail, with the human gate unchanged.

## 7. Authentication is demo-mode
- **Current state:** The three demo accounts are local shortcuts; the credential only *prefills* — the trusted canonical role decides access. There is no real identity provider.
- **Why:** Demonstrates the RBAC/portal model without standing up auth infrastructure.
- **Production next step:** Real authentication (SSO/OIDC) driving the same role→portal→scope chain.

---
**Bottom line:** The security model is *considered and layered*; the boundaries above are the honest edges of a demo, each with a concrete production path — not gaps left unexamined.
