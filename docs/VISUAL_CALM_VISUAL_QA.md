# Visual Calm — Visual QA

Branch `post-release/visual-calm-v2`. Not deployed. Screenshots captured from exact-viewport headless renders (not the interactive browser, which adds window chrome) at 1440×900, 1920×1080, 2560×1440 → `docs/screenshots/visual-calm/<route>-<w>x<h>.png`. Every route was also **visually inspected** by the integration lead, not accepted on subagent self-report.

## Method (honest verification)
Per wave: merge worktree → fresh production build → axe + overflow (`calm-verify.mjs`) → screenshots at 3 sizes → eyeball. The earlier provenance failure (screenshot vs DOM mismatch) is structurally prevented: axe/overflow numbers and the screenshot come from **one identical render**.

## Automated visual rules enforced (verified in sweep)
- ✅ ≤4 primary KPIs on operational pages (governance 8→4, memory 8→4, learning 8→4, analytics grouped, admin 5→4, printers 5→3, customers-360 6→3, sales 4→3, tasks strip→0)
- ✅ No zero rendered as success — `KpiCard muted` tone; verified on governance (0 policies), agents/service/admin/collaboration zeros, command-center governance strip, system-health
- ✅ No permanent glow on normal cards/nav/tabs/tables (default glow → hairline ring; Copilot orb removed; idle agents de-glowed)
- ✅ No permanent left insights rail competing at 1440 on the dense pages (courses insights→drawer; memory/knowledge graphs→tabs)
- ✅ No 14-step horizontal stepper (courses PhaseProgress = 3 phases + active steps; verified `legacyStepperCircleCount: 0`)
- ✅ No horizontal overflow (0/30 at all three widths)
- ✅ One primary accent + one status color per section; single steel chart series (analytics rainbow map removed; command-center funnel single-series)
- ✅ No permanent emergency button per row (agents + administration → row actions menu + one header/system control)
- ✅ Zero-value nav + tab badges hidden

## Per-route scores
See `VISUAL_CALM_ROUTE_SCORECARD.md` — no route scored <4 in readability / hierarchy / long-session comfort. Lowest long-session marks (4/5): /analytics, /service, /submission (dense contextual rails / deliverable lists — acceptable, noted in KNOWN_LIMITATIONS).

## Eyeballed routes (representative, all sizes on pilots)
courses, governance, agents, analytics, crm, service (pilot) · command-center, customers-360, tasks, printers, sales · memory, knowledge, learning, agents-collaboration, organizations, automations · system-health, submission, administration, customers-list, quick-start.

## States captured
Default states for all routes. The honest empty state (/agents-collaboration "אין ריצות") and pending-approval state (/submission, /command-center AI decision center) are visible in the default demo seed. Drawer/menu states exercised in-code (courses insights drawer earlier; agents/admin row menus).
