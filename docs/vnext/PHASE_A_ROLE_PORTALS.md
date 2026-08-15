# TERAGON vNext — Phase A: Role-Based Portals (Audit + Design)

Branch: `feat/role-based-portals-vnext` (from stabilization `14b2fec`; RC2/RC1/main frozen).
Scope of this document: **audit + design proposal only** — no broad implementation yet (per directive §30).

---

## 1. Auth model (as-is)

- **Login layer** — `src/auth/`: `AuthContext { currentUser, status, mode, signIn(email,password), signOut() }`, providers `LocalAuthProvider` (no-network demo, single `local-operator`) and `SupabaseAuthProvider`; `LoginPage` (email/password); `RequireAuth` gates the app on `AUTHENTICATED`.
- **User** — `src/domain/types.ts`: `User.role: UserRoleKey` ∈ {`מנכ"ל`,`מכירות`,`מדריך`,`תמיכה`,`תלמיד`,`מנהל מערכת`}. Bridged to canonical roles by `LEGACY_ROLE_TO_CANONICAL`.

## 2. RBAC model (as-is — strong, keep it)

`src/authorization/` is a complete, centralized, URL-safe RBAC:
- **24 permissions** (`permissions.ts`) → each maps to `{domain, minLevel}` (`PERMISSION_REQUIREMENTS`).
- **9 canonical roles** × **domain grants** (`none|read|write|approve`, `approve⊃write⊃read`) → computed **`ROLE_PERMISSIONS` 9×24 grid** (`matrix.ts`); `can(role, perm)` is **pure** (no cached role → a role switch can never silently escalate).
- **Route guard** (`routeGuard.ts`): `ROUTE_PERMISSIONS` maps **all 32 routes** → view-permission (or `null`=open); enforced by `<RequirePermission>` (`react.tsx`) **on every render regardless of how the route was reached** (typed URL, deep link, back/forward). `AccessDenied` screen exists (`ACCESS_DENIED_SCREEN_HE`).
- **Mutation guard** (`guardedMutation.ts`) — deny-by-default at the write layer (layer b/c).

**The one gap:** RBAC reads the role from `roleStore` — a **sessionStorage demo *selector*** ("there is NO login") — **not** from the authenticated `currentUser`. Portals require bridging authenticated identity → trusted canonical role → guards.

## 3. Current route → view-permission (the enforced baseline)

| Requirement | Routes |
|---|---|
| `null` (open to all) | `/`, `/courses`, `/tasks`, `/automations`, `/ai-workspace`, `/agents`, `/agents/collaboration`, `/memory`, `/knowledge`, `/learning`, `/analytics`, `/implementation`, `/personas`, `/stage-gates`, `/training-materials`, `/quick-start`, `/faq`, `/support`, `/submission`, `/submission/presentation` |
| `customer.read` | `/crm`, `/customers`, `/customers/:id`, `/contacts`, `/organizations` |
| `sales.read` | `/sales`, `/documents` |
| `service.read` | `/service`, `/printers` |
| `governance.review` | `/governance` |
| `user.manage` | `/administration` |
| `health.diagnostics` | `/system-health` |
| `settings.update` | `/settings` |

**Portal implication:** the executive/operational routes that are currently `null` (analytics, automations, agents, memory, ai-workspace) must become **role-gated** so Student/Technician are denied — via **new additive view-permissions** on existing domains.

## 4. Proposed portal ↔ role model (RECOMMENDED: Option A)

Keep the **frozen 9-role RBAC untouched** (the "exactly 9 canonical roles" invariant is tested). Add a thin **Portal presentation archetype** derived from the user's canonical role — the Portal drives navigation/home/landing; the **canonical role remains the sole authorization authority**.

| Demo user | Portal | Canonical role (authorization) | Rationale |
|---|---|---|---|
| `manager@teragon.demo` | **Manager** | `crole-bizmgr` (מנהל עסקי) | broad operational, not sysadmin |
| `student@teragon.demo` | **Student** | `crole-viewer` (צופה) + learning perms | minimal base; learning composed from open+new perms |
| `technician@teragon.demo` | **Technician** | `crole-service` (שירות) | service.read/update/close + technical knowledge |

`portalForRole(canonicalRole): Portal` — a pure mapping (bizmgr/ceo/sysadmin→manager, viewer/instructor→student, service/sales→technician). **UX role-selection ≠ authorization** (§3/§22): the login cards only *route to a demo credential*; the trusted canonical role is loaded from the user record.

**Additive permissions** (extend `PERMISSIONS`, do NOT change role count):
`analytics.read` (domain `analytics`, read), `automation.read` (`automations`, read), `agent.read` (`agents`, read), `learning.view` (`courses`, read), `learning.submit` (`courses`, write), `progress.view.own` (`courses`, read), `task.assigned.view` (`service`, read), `task.assigned.update` (`service`, write), `knowledge.technical.read` (`memory-restricted`, read).

**Route tightening** (proposed `ROUTE_PERMISSIONS` changes; manager passes via bizmgr grants, student/technician denied):
`/analytics`→`analytics.read`, `/automations`→`automation.read`, `/agents`→`agent.read`, `/agents/collaboration`→`agent.read`, `/memory`→`memory.approve`→(soften to a new `memory.read`), `/ai-workspace`→stays open (governed inside). `/learning`,`/knowledge`,`/courses`,`/tasks` stay open (all three portals use them, scoped by data).

### Option B (not recommended)
Add 3 new canonical roles `crole-manager/student/technician` + new perms → breaks the tested 9-role invariant and touches the RC2-frozen governance/admin substrate. More 1:1 clarity, larger blast radius.

## 5. Per-portal permission matrix (Option A)

| Capability | Manager | Student | Technician |
|---|---|---|---|
| Command Center `/` | ✅ | ✅ (student home) | ✅ (tech home) |
| Analytics | ✅ | ⛔ | ⛔ |
| Agents / Agent Coordination | ✅ | ⛔ | ⛔ |
| Automations | ✅ | ⛔ | ⛔ |
| Governance | ✅ (review) | ⛔ | ⛔ |
| Administration / System-Health / Settings | ✅ *(Advanced)* | ⛔ | ⛔ |
| Customers / Contacts / CRM | ✅ | ⛔ | ✅ *(assigned context, scoped)* |
| Service / Printers | ✅ | ⛔ | ✅ |
| Tasks | ✅ | ✅ *(my exercises)* | ✅ *(assigned)* |
| Knowledge | ✅ | ✅ *(authorized)* | ✅ *(technical)* |
| Memory | ✅ | ⛔ | ⛔ |
| Learning | ✅ *(oversight)* | ✅ *(primary)* | ⛔ |
| Mentor agent | — | ✅ | — |
| Fixer agent | ✅ | — | ✅ |

## 6. Navigation per portal (capability-driven, 5–7 primary)

- **Manager (primary):** מרכז השליטה · דוחות וניתוחים · לקוחות · משימות · ממשל · חדר התיאום — **Advanced (collapsed):** אוטומציות, סוכנים, זיכרון, בריאות המערכת, ניהול משתמשים, הגדרות.
- **Student (primary, 5):** בית · למידה · המשימות שלי · מאגר ידע · מנטור · ההתקדמות שלי.
- **Technician (primary, 6):** בית · המשימות שלי · לקוחות/הקשר · מאגר ידע טכני · עוזר טכני (Fixer) · פעילות.
Nav is generated from `{item → requiredPermission → portal → priority}` filtered by `can(userRole, perm)` — one source, three composed results (not three hardcoded files).

## 7. Home dashboards per portal (real data, composed differently)

- **Manager Home** — DECISIONS + SIGNALS: Action Inbox (pending approvals, failed workflows), executive KPIs, agent/workflow status. (Reuse `OperationsBrief` + analytics KPIs.)
- **Student Home** — NEXT LEARNING ACTION + PROGRESS: current learning module, assigned exercise, progress, Mentor entry, knowledge search. (From `enrollments`/`courses`/`learningPaths`.)
- **Technician Home** — CURRENT WORK + PRIORITY: assigned open tasks, current priority, task customer context, technical knowledge, Fixer entry, status update. (From `tasks`/`serviceTickets` filtered to the user.)

## 8. Demo accounts (per the demo-accounts directive)

Three deterministic demo users seeded via the existing safe demo-data mechanism (local/demo mode only; never production creds):

| Name | Email | Password | Canonical role | Portal |
|---|---|---|---|---|
| צחי זוסטייהם | `manager@teragon.demo` | `TeragonManager2026!` | crole-bizmgr | Manager |
| תלמיד דמו | `student@teragon.demo` | `TeragonStudent2026!` | crole-viewer(+learning) | Student |
| טכנאי דמו | `technician@teragon.demo` | `TeragonTech2026!` | crole-service | Technician |

- **Login UX:** a "כניסת דמו" section on `LoginPage` with 3 role cards (מנהל/תלמיד/טכנאי) — "כניסה כדמו" **prefills** email/password (never auto-authenticates); a small "Demo credentials" helper. Both gated behind `import.meta.env.DEV`/demo-mode — **hidden in production**.
- **Trusted role:** each demo user record stores the canonical role; `LocalAuthProvider` resolves email→user→canonical role and feeds RBAC (replacing the demo `roleStore` selector for authenticated sessions). Selecting a card cannot escalate — authorization derives from the stored record.
- **Demo reset:** a local/demo-only action restoring the 3 users' deterministic state **without** clearing the Chrome profile, Trusted Device key, Obsidian trust (`teragon-obsidian-trust`), or real Vault data.

## 9. Onboarding (Phase E)
First-login lightweight walkthrough (welcome → identify workspace → 3–4 key areas → first action) with Skip/Continue/Don't-show-again, persisted per user; contextual empty-state guidance; no full-screen coach-mark spam.

## 10. Security boundary analysis
- **Authorization authority:** `can(canonicalRole, perm)` from the trusted user record — never the login card, never the URL. `<RequirePermission>` already blocks typed-URL/deep-link access; tightening `ROUTE_PERMISSIONS` extends this to the executive routes.
- **Deny-by-default:** unknown/junk role → default; missing grant → denied. Mutation layer (`guardedMutation`) unchanged.
- **Governance untouched:** ApprovalEngine, Trusted Device, Obsidian authorization, human-approval workflows, Agent boundaries all preserved — a Manager role does **not** bypass approvals.
- **Tests:** role×route allow/deny matrix (incl. direct-URL) + the 3 demo-user journeys, on top of the frozen RC2 suite.

## 11. Phase plan (per §30–34)
- **B — RBAC foundation:** bridge auth→canonical role; add the additive permissions; tighten `ROUTE_PERMISSIONS`; capability-driven nav; permission-denied UX; role×route tests.
- **C — Role homes:** Manager/Student/Technician Home (real data).
- **D — Simplification:** progressive disclosure per authorized route (role-aware composition, not forks).
- **E — Onboarding + polish + mobile.**

**Quality gate:** must not regress RC2 (Vitest 2977, E2E 587/0, Axe 0/0, build, Obsidian). Add RBAC/security + journey tests on top.
