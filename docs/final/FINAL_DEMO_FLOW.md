# Final Demo Flow (S12.0)

**For the academic presentation.** Base `a6af99e`. Synthetic data; Demo-Mode banner
visible throughout — say once: *"כל הנתונים סינתטיים; לקוחות ואנשי קשר מחוברים ל-Supabase
עם RLS, השאר דמו מקומי כן."*

## 5-minute flow

1. **(0:30) מרכז השליטה `/`** — point to the 4 KPI cards and the **human-in-the-loop AI
   decision card**: read the "למה" + evidence, then **אשר / דחה / פתח ראיות**. Message:
   the AI proposes, the human decides.
2. **(1:30) Customers `/customers` (LIVE)** — create a customer, edit it, show validation.
   Say: this is real Supabase persistence with RLS tenant isolation.
3. **(1:00) Contacts `/contacts` (LIVE)** — add a contact, show it scoped to the customer.
4. **(1:30) AI Lab → Agents `/agents`** — open **Fixer** → **פעולות**: run
   *הצעת תיקון לרשומה* (`dc-2`) → show before/after "הצעה בלבד"; switch to *החלת תיקון דמו
   מאושר* → **ממתין לאישור** → **אישור והחלה** → **הוחל**; run again → **כפילות נחסמה**.
   Point to "מנוע חוקים מקומי — ללא מודל מרוחק".
5. **(0:30) Close** — mention responsiveness (0 overflow at 4 viewports), a11y, and the
   honest demo framing.

## 10-minute flow

1. **(1:00) `/` command center** — KPIs, approval card, agent network status.
2. **(1:30) Customers (LIVE)** — list → create → detail → update → validation → safe error.
3. **(1:00) Contacts (LIVE)** — create + customer-scoped read; note "no delete by design".
4. **(2:30) Agents — cover 3–4 agents:**
   - **Hunter** → *איתור לקוחות חסרי מידע* + *איתור אנשי קשר חסרים* (evidence + nav link).
   - **Fixer** → propose → approve → apply → duplicate-blocked (as above).
   - **Nexa** → *שאלת מערכת* ("היכן מנהלים לידים?") → answer + source + nav; *הכוונה לפעולה*.
   - **Wiki** → *חיפוש במאגר הידע* ("אישור") → ranked results; *סיכום ערך ידע*.
5. **(1:30) Governance `/governance` + AI Lab framing** — human-in-the-loop policy;
   deterministic, no remote model, no external side effects.
6. **(1:00) Responsiveness + navigation** — resize to mobile; show hamburger drawer,
   quick-add, standardized selects, dark mode toggle.
7. **(1:00) Submission `/submission` + `/submission/presentation`** — the evidence index
   and the fluid slide deck.
8. **(0:30) Close** — quality gates green; honest limitations stated.

## Evaluator Q&A (grounded answers)

- **"Is this real AI?"** — Deterministic local rules engine, honestly labelled; no LLM by
  design (synthetic academic scope, `AI_REMOTE_ENABLED=false`). The differentiator is the
  human-in-the-loop, evidence-first, approval-gated posture — real intelligence is a
  flag+credentials change against a type-safe seam.
- **"Which data is real?"** — Customers & Contacts on Supabase with RLS (12/12 live
  acceptance each). All other domains are honest local demos with the Demo-Mode banner.
- **"Do the agents change data?"** — Only two actions mutate, only after explicit
  approval, only an isolated in-memory demo store (never Customers/Contacts), idempotent,
  and it resets on reload — stated in the UI and `src/agents/actions/README.md`.
- **"Is it responsive / accessible?"** — 0 document overflow on all 32 routes at
  1440/1024/768/390; axe-core a11y gate 18/18; cross-browser matrix green.
- **"What about backup/production?"** — Out of academic scope; documented (staging free
  plan, no PITR). Real business data is prohibited until backup/restore exists.
- **"Why do some screens say 'demo'?"** — Deliberate honesty: synthetic data, not
  unfinished work. It is a design principle of the project.
