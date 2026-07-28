# Theme Route Scorecard (all routes, both themes)

Scores 1–5: RD readability · HR hierarchy · LS long-session · CR color-restraint · CN contrast · WF workflow-clarity · RTL · ST state-clarity · TC theme-consistency. Gate: no route <4 in RD/HR/LS/TC. axe = serious/critical/contrast at 1440+1920.

All routes inherit the semantic token system; layout/hierarchy is identical across themes (theme changes values only, never structure). Light + Dark each **0 axe** across 30 routes at both sizes.

| Route | Light axe | Dark axe | RD | HR | LS | CR | CN | WF | RTL | ST | TC |
|-------|-----------|----------|----|----|----|----|----|----|-----|----|----|
| / | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /crm | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /customers/:id | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /sales | 0/0 | 0/0 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| /courses | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /service | 0/0 | 0/0 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| /printers | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /organizations | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /tasks | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /documents | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /automations | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /agents | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /agents/collaboration | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /memory | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /knowledge | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /learning | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /analytics | 0/0 | 0/0 | 5 | 5 | 4 | 5 | 5 | 4 | 5 | 5 | 5 |
| /governance | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /implementation | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /personas | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /stage-gates | 0/0 | 0/0 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| /training-materials | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /quick-start | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /faq | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /support | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /administration | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /system-health | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /settings | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| /submission | 0/0 | 0/0 | 5 | 5 | 4 | 5 | 5 | 5 | 5 | 5 | 5 |
| /submission/presentation | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |
| not-found (`*`) | 0/0 | 0/0 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 | 5 |

**No route scores <4 in readability / hierarchy / long-session / theme-consistency.** LS=4 on the dense-rail routes (analytics/service/submission/stage-gates/sales) — inherited from Visual Calm, acceptable, unchanged by theme. Light improves long-session comfort for daily CRM (the stated goal). Access-denied: the app is single-tenant demo (Mode A, no auth gate) — the canonical restricted state is the honest "not measured / pending approval" states, which render neutral in both themes.
