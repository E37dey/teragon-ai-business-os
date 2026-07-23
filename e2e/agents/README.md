# e2e/agents — W5-E stage 2 (real UI specs)

Stage-1 note: this directory shipped as an honest skeleton (README only)
because `/agents`, `/agents/collaboration` and `/automations` were placeholder
stubs while W5-E ran in parallel with W5-D. Stage 2 (this state) replaced it
with real Playwright specs against the integrated app on main.

Run: `npx playwright test -c e2e/w5e.config.ts` (vite preview, port 4673).

| Spec | Covers |
|---|---|
| `w5e-approvals.spec.ts` | "ערוך ואשר" (edited payload IS what executes — asserted in the panel + command-center activity feed), "דחה" with mandated reason → no mutation, "בקש תיקון" reasoned-rejection path, demo approval = recommendation-only (edit honestly disabled), keyboard Tab/Enter over all 6 approval actions |
| `w5e-command-center.spec.ts` | demo run → command-center pending-approval/conflict counts, IndexedDB persistence across browser refresh, collaboration selected-conflict rail state |
| `w5e-a11y.spec.ts` | axe (@axe-core/playwright): /agents, collaboration (post-demo), /automations, copilot-open — zero serious/critical gate |

Not duplicated here: w5d.config.ts already covers the fleet drawer (7 tabs),
the happy-path demo→resolve→approve→complete flow, the copilot quick-command
happy path and the automations plan→approve happy path.
