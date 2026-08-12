# ADR 0001 — RLS-first tenant isolation

**Status:** Accepted · **Context:** S7–S9 (Supabase platform, customers + contacts)

## Context

Teragon is multi-tenant: every domain row belongs to an organization. Isolation could be
enforced in the client, in the repository layer, or in the database.

Client-side filtering is not isolation — it is presentation. Anything the browser can filter,
a modified browser can unfilter. Repository-layer filtering is better but still fails open if
one query forgets its predicate.

## Decision

**The database is the authority.** Every tenant table has RLS enabled with explicit policies
(`012_rls_policies.sql`) keyed to capabilities (e.g. `contacts` SELECT on `customer.read`).
Application layers *cooperate* with that boundary; they never substitute for it.

Consequences of that choice, applied consistently:
- The tenant organization is injected by the repository mapper from the **canonical
  authenticated identity** — never from a component, form, URL or localStorage.
- Route guards mirror the RLS capability (`/contacts` → `customer.read`), so UI and database
  agree rather than drift.
- Write seams refuse to carry a tenant/parent key from user input (e.g. `ContactInput` has no
  `customerId` and no organization field), so re-parenting is impossible by construction.

## Consequences

**Positive** — a forgotten predicate is a failed query, not a leak. Isolation is testable
independently of the UI (`supabase/tests/01…08`), and a restore drill can verify it directly.

**Negative** — policies must exist for every new table, and an RLS denial surfaces as an error
the UI must handle honestly rather than as an empty list. Both are accepted costs.

**Rejected** — client-side org filtering, and "trusted" org values passed from the browser.
