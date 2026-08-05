# agents/actions — Local Demo Action Engine (S11.3)

**This module is a LOCAL DEMO Action Engine. It is NOT the future production
AI-provider architecture.** It exists to make the seven governed agents demonstrably
useful in the academic synthetic-data demo — nothing here talks to a model, a network,
or a durable store.

## What this is

- A deterministic, in-process rules engine (`engine.ts`) over a **frozen synthetic
  dataset** (`demoData.ts`). Two business actions per agent (`registry.ts`), returning a
  shared structured contract (`contract.ts`).
- **No remote LLM. No MCP. No external API. No durable persistence.** Every result
  carries the honest label *"מנוע חוקים מקומי — ללא מודל מרוחק"*, and `AI_REMOTE_ENABLED`
  stays `false`.

## Hard limitations (by design)

- **Local demo mutations reset on reload.** The two approval-gated actions
  (`fixer.apply-correction`, `flow.automation-proposal`) mutate only an **isolated
  in-memory demo store** (`appliedCorrections` / `savedAutomations` in `engine.ts`).
  That store is process memory — a page reload or test reset wipes it.
- These actions **never touch the Customers/Contacts repositories or Supabase
  persistence.** The demo customers/contacts here are synthetic and separate.
- Mutations are **approval-gated and idempotent** (duplicate application blocked), but
  that guarantee lives only in memory for the demo — it is not transactional.

## What a PRODUCTION action engine must do instead (explicitly out of scope here)

A real, production agent-action layer must **not** reuse this module's shortcuts. It
must route every effect through the platform's real seams:

1. **Repositories / domain boundaries** — never an ad-hoc in-memory store.
2. **Capabilities / RBAC** — every action checked against the caller's permissions.
3. **Organization scope** — tenant isolation on every read and write.
4. **RLS** — enforced at the database, not just in app code.
5. **Audit logging** — every mutation recorded as a durable, reviewable audit event.
6. **Human-in-the-loop approval** — persisted approvals, not in-memory flags.

Until such a layer exists, these actions remain a **demonstration of behaviour and
safety posture**, not a production capability.
