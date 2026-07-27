# Visual Calm — Known Limitations

Branch `post-release/visual-calm-v2`. Honest list of what is imperfect or deferred. Nothing here blocks the calm goal; each is a conscious trade-off.

1. **Spec palette lifted for AA.** The operator's exact hexes for `--success` (#57936f), `--warning` (#b98e4e), `--danger` (#b8606a) and `--text-muted` (#748194) failed WCAG AA as text on dark surfaces. Solid bases were lifted (`#6bb083` / `#ca9a55` / `#cf7b84` / `#8593a5`) so text/icons clear AA; the **soft fills and borders keep the exact spec intensity** (independent rgba literals), so calm surfaces are unchanged. This is the only palette deviation and it is per the mandatory-AA instruction.

2. **Dense contextual rails remain on a few routes.** /analytics (metric-governance rail), /service (SLA-risk queue), /submission (submission-auditor) still carry fairly dense left rails. They are the single permitted rail and hold honest governance context, so they were kept; long-session score 4/5. Candidate for further disclosure if desired.

3. **12/13 "inherit" routes got color/shell calm but no bespoke density restructure.** Content routes (documents, faq, personas, stage-gates, training-materials, implementation, settings, support, customers-list, quick-start, system-health, submission) were verified axe-clean + overflow-free + visually calm and did not exhibit KPI-overload/glow/zero-as-success, so no per-route density agent was spent. If deeper per-route IA is wanted for any, it can be added.

4. **`/agents` pending-approvals KPI uses amber, not AI-violet.** Defensible under "amber when action required"; violet is reserved for Copilot/agent-activity/AI-evidence.

5. **States coverage is default-seed.** Empty (/agents-collaboration), pending-approval (/submission, command-center) appear in the default demo data. Dedicated loading/error/degraded state screenshots were not separately captured for all 31 routes; error boundaries and honest "not measured" states exist and were verified in code.

6. **`--os-text-sm` = 13px** is used for some secondary/meta text app-wide (matches the type scale's secondary floor). Operational **body** text is ≥14px; 13/12/11px are secondary/metadata/decorative only.

7. **presentation route** intentionally untouched (keeps its own full-screen hierarchy per brief).

8. **Screenshots are the default demo tenant** (CEO צחי זוסטייהם, טרגון טכנולוגיות, Mode A / AI_REMOTE_ENABLED=false) — canonical identity preserved throughout.
