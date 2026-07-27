# Visual Calm — Rollout Report

Branch `post-release/visual-calm-v2`. **Not deployed. No release tag created. Production untouched** (still runs the pre-calm code).

## What shipped (to the branch)
A system-wide **Quiet Enterprise Intelligence** redesign: one canonical calm token system applied globally (all 31 routes calm at the source), a calmed application shell, and per-route density/hierarchy passes on every operational route.

## Workstreams & agents
| Wave | Scope | How |
|------|-------|-----|
| VC-A | canonical calm tokens + primitives + AA restore | lead (hand) |
| VC-B | shell/nav + Copilot | lead (hand) |
| Pilot | courses, governance, agents, analytics, crm, service | governance+agents+courses(hand) hand-verified; crm/service/analytics via worktree subagents |
| VC-C/D | command-center, customers/:id, sales, tasks, printers | 5 worktree subagents |
| VC-E | organizations, automations, memory, knowledge, learning, agents/collaboration | 6 worktree subagents |
| VC-F | administration (density) + quick-start (AA); 12 routes verified-inherit | 1 subagent + lead |
| VC-G | full sweep, scorecard, docs, integration | lead |

Total distinct route/density subagents that landed clean: **11** (each scope-locked to its module, verified in-scope before merge; 2 infra/wrong-worktree failures were discarded and redone). Every merge was independently re-verified by the lead (build + axe + screenshots + eyeball).

## Metrics — before → after
- **Palette**: near-black `#030812` → `#070D15`; blue-tinted borders → neutral slate; neon cyan `#20c4e8` + blue → single steel `#4D91A3`; near-white body → `#E5EBF2`; leading 1.45 → 1.55.
- **Glow**: 6 neon glow tokens @0.18 halo used 28× on normal UI → default glow neutralized to a hairline ring (0 halos on normal cards/nav/tabs/tables/rows); 3 reserved subtle (≤0.12) active-glow tokens for live/critical only; Copilot orb de-animated; idle agents de-glowed.
- **KPI reductions** (operational routes): governance 8→4 · memory 8→4 · learning 8→4 · admin 5→4 · printers 5→3 · organizations 5→4 · customers-360 6→3 · command-center 6→4 · sales 4→3 · service 5→4 · courses 5→4 · tasks 5→0 (strip removed) · analytics 6-groups→4+1chart.
- **Zero≠success**: enforced via new `KpiCard muted` tone across all routes; verified on governance/agents/service/admin/collaboration/command-center/system-health.
- **Secondary content moved** (never deleted): `.os-more-metrics` disclosures + `Drawer`s + tabs + segmented nav across ~18 routes (evidence, history, run logs, totals, calc methods, graphs).
- **Borders**: shared blue-tinted border → neutral slate globally; per-cell table borders → subtle row separators; single selected-row steel accent.
- **Emergency actions**: per-row buttons (agents, administration) → row actions menu + one header/system-level control.

## Verification (final)
- Full app sweep at **1440 / 1920 / 2560**: 30/30 routes **0 axe serious, 0 critical, 0 color-contrast, 0 horizontal overflow, 0 page errors**.
- `tsc -b` clean · `oxlint` clean · **Vitest 1694/1694** on every integration.

## Commits (branch, chronological highlights)
`c51150f` VC-A tokens · `00ae09f` VC-B shell · `9ee934f` governance+KPI foundation · `e0f5f35` pilot report · `0ffdce9` VC-C/D + shared AA · `4d5d4f6` VC-E · `4d…` quick-start AA · administration · VC-G docs + final integration.

## Recommended release version
`1.1.0` (minor — visual language overhaul, no behavior/route/data change). Suggested tag name after human sign-off: `v1.1.0-visual-calm`. **Do NOT tag or deploy without explicit approval.**

## Next step
Human visual review of the screenshots, then (if approved) deploy the branch as a preview before production.
