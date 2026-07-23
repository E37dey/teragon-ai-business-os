# e2e/agents — STAGED (waiting on W5-D UI integration)

**Status: skeletons only. No UI e2e tests run from this directory yet — honestly.**

W5-E ran in parallel with W5-D. `/agents`, `/agents/collaboration` and
`/automations` were lazy PLACEHOLDER stubs in this worktree (commit `0f41cc0`),
so there is no real agents UI to drive. Selectors invented against placeholders
would be fake coverage; the engine is instead verified headlessly.

## What runs TODAY instead

- `tests/agents/**` — orchestrator bounds, 19-event catalog, approval engine
  (bypass blocked, rollback, retry), conflicts, deterministic demo scenario
- `tests/agents/integration/**` — W5-E flows 2/3/6: approve→execute→Task,
  reject→no-mutation+audit, Hunter+Wiki+Fixer conflict → human resolution

## Planned specs (stage 2, after W5-D)

| Planned file | Covers |
|---|---|
| `agents-run-lifecycle.spec.ts` | start demo run from UI → timeline renders the persisted 19-event trail |
| `agents-collaboration-graph.spec.ts` | graph nodes/edges derive from records; conflict node "ממתין להחלטה" |
| `agents-approval-gate.spec.ts` | approve / edit / reject from the UI; execution only after approval; rejected leaves no mutation |
| `agents-conflict-resolution.spec.ts` | the 5 human resolution actions; decided conflict shows "הוחלט" |
| `agents-cancellation.spec.ts` | user cancel from UI ⇒ run "בוטל" with the cancellation event |

Visual QA (Phase 5.17 screenshots) is also deferred to stage 2 with these.
