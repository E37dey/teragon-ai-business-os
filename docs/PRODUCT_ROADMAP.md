# Product Roadmap

## Status

- ✅ **Final academic QA complete** (S12.0) — 32/32 routes accepted, ~40 functions
  accepted, 14 agent actions verified; weighted score **8.6/10**, verdict
  **FINAL PROJECT PRODUCT READY**. See [docs/final/FINAL_PRODUCT_VERDICT.md](final/FINAL_PRODUCT_VERDICT.md).
- 🟢 **Active / final checkpoint: Academic Submission Packaging (S12.1)** — root README,
  submission index, architecture overview, run/demo guide, presentation script, evaluator
  FAQ, Trusted-AI test pack, and this roadmap. Entry point:
  [docs/submission/SUBMISSION_INDEX.md](submission/SUBMISSION_INDEX.md).

There is **no open product-feature checkpoint**. The academic submission is the current
and final deliverable; any prior "next active checkpoint" references are superseded by
this line.

## Deferred future product ideas (post-academic, not in scope now)

These are preserved as ideas only — none is required for the academic submission, and
none should be started without an explicit decision.

- **Connect more domains to Supabase** — extend live persistence beyond Customers/Contacts
  (each through the same RLS-first composition seam).
- **Durable agent-action persistence** — replace the in-memory demo store with
  repositories + organization scope + RLS + a durable audit log (see
  [ARCHITECTURE_OVERVIEW §C](submission/ARCHITECTURE_OVERVIEW.md)).
- **Capability/RBAC checks on every agent action** — enforce permissions per action.
- **Optional real AI provider behind a flag** — turn on `AI_REMOTE_ENABLED` with server
  credentials, content filters, allow-lists and rate/budget controls.
- **Backup / restore + PITR** — a real recovery mechanism before any real business data.
- **Dedicated adversarial (red-team) tests** — strengthen the two by-design safety cards
  (prompt-injection, unauthorized action) with explicit tests.
- **1024 slim navigation rail** and **automated drawer/panel a11y** — visual polish once
  content is fully fluid.

## Guardrails that remain in force (do not regress)

Synthetic data only · `AI_REMOTE_ENABLED=false` · no external side effects · no email/
webhook/message senders · migrations remain 14 · Customers/Contacts behaviour unchanged ·
fail-closed persistence · RLS-first tenant isolation · human-in-the-loop before any
mutation.
