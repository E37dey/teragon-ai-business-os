# Visual Calm — Pilot Report (6 representative routes)

Branch `post-release/visual-calm-v2`. Not deployed. Pilot gate: **PASSED**.

The six pilots represent the app's workflow archetypes: complex learning (/courses), dense table (/crm), technical workbench (/service), AI status (/agents), policy & audit (/governance), charts & metrics (/analytics).

## Gate criteria — all met
| Criterion | Result |
|---|---|
| ≤4 primary KPIs on operational pages | ✓ all six |
| One clear primary workflow | ✓ |
| Secondary content moved out of initial view (drawer/מדדים נוספים/segmented) | ✓ |
| No excessive card nesting (>3) | ✓ |
| No default glow | ✓ |
| **No zero value shown as success** | ✓ (KpiCard `muted` tone; governance "0 active policies" & agents/service zeros now neutral) |
| No operational text <14px | ✓ (route bodies ≥14px; 11–12px limited to metadata/chips) |
| No one-word Hebrew columns / no horizontal overflow | ✓ (18/18 shots overflow=false) |
| axe: 0 serious / 0 critical | ✓ (6/6 @1440) |
| All original actions accessible | ✓ (emergency stop → row menu + header; detail → drawer) |

## Per-route summary
- **/courses** (`8d7f3e5`): 5→4 KPIs (3 cards + progress strip); לומדים פעילים/קורסים פעילים → מדדים נוספים; approved v3 structure (3 phases, active-step list, no 14-stepper, no permanent insights rail) untouched.
- **/governance** (`9ee934f`): 8→4 KPIs (ממתינות לבדיקה / סיכונים הדורשים טיפול / אירועים פתוחים / פעולות ממשל ממתינות לאישור); active-policies, drafts, audit-events, findings → מדדים נוספים; "0 active policies" no longer green.
- **/agents** (`00ae09f`-line): 4 KPIs fixed (fleet/active-runs/pending/failed-runs, zeros muted); cost (טרם נמדד) → מדדים נוספים (was green success); per-row emergency button → quiet "פעולות" row menu + one "השבתת חירום מערכתית" header control (two-step confirm).
- **/analytics** (`98ec14e`): 6 simultaneous groups → 1 at a time via segmented nav; 4 steel executive KPIs; single steel-blue chart series (removed the cyan/blue/warning/success/violet rainbow map); calculation methods/sources → disclosure; table alternative preserved.
- **/crm** (`3cf9b8a`): 4 quiet KPIs (conversion% & totals → מדדים נוספים); lead & customer detail → Drawer; per-row expand/owner-select/status-button removed; one steel selected-row accent; calm table.
- **/service** (`a52e5fdf` merge): 5→4 KPIs; timeline/history/parts → Drawer; SLA numbers use `-text` variants; one selected-row accent; diagnosis panel de-glowed.

## Foundation reused (no per-route shared edits)
`KpiCard muted` tone (zero-neutral), `.os-more-metrics` disclosure, calm `OS_ACCENT_HEX`, `Drawer`. Route agents were scope-locked to their module (+ a module-scoped `*.css`); zero edits to `tokens.css`/`components.css`/`design-system`/`layout`/`app` from the route waves.

## Verification method (honest)
Each route was integrated then **independently** re-verified by the lead: fresh production build → axe → screenshots at 1440/1920/2560 from an exact-viewport headless render → visual inspection. Self-reported agent results were NOT taken as proof. Screenshots: `docs/screenshots/visual-calm/<route>-<size>.png`.

## Known limitations (pilot)
- Contextual left rails on /analytics, /service, /crm remain fairly dense (they carry honest governance/queue context). Acceptable as the single permitted rail; candidates for further disclosure in VC-G.
- /agents pending-approvals KPI uses amber (action-required) rather than AI-violet; defensible under "amber when action required".
