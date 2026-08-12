# Timed Five-Minute Demo Rehearsal (S12.2)

An **actual** end-to-end run of the presentation flow through the running application,
with a real wall-clock timer. This was not a script review — every screen was opened and
every action executed live. Times are reported **raw and un-rounded**.

## Run metadata

- **Date / local time:** 2026-08-06, 15:04–15:13 local.
- **Base SHA:** `b405c651073c7aaaba5c36b2bb30bc50537f99aa` (`feature/teragon-supabase-app-auth`).
- **Browser / viewport:** in-app Chromium browser, **1440×900** desktop.
- **App start:** `npm run build` → `npm run preview` on **http://localhost:4173** → HTTP 200.
- **Demo mode:** local demo (synthetic data, Demo banner present) — the documented default.
- **Action-engine reset:** fresh page load at start; the Fixer flow was run on a freshly
  reloaded `/agents` (clean in-memory store).

## How this run was driven (honest disclosure)

The flow was driven **programmatically** (browser automation), not spoken aloud. The
elapsed wall-clock therefore includes **per-tool-call round-trip latency** and **two
diagnostic detours** to locate the Hunter control (a first CSS selector missed; the DOM
was inspected twice), plus **three re-navigations to `/agents`** to switch agents cleanly.
None of these represent a human presenter's pace — each app interaction itself completed
in **< 1.5 s** with zero errors. The raw total is reported as measured; a valid ≤ 5:00
**human-paced** timing was **not** established by this automated run.

## Section timestamps (real Get-Date captures)

| Section | Clock | Elapsed from T0 |
|---------|:-----:|:---------------:|
| **T0** — Opening + Command Center + Customers + Customer Detail | 15:04:42 | 00:00 |
| Contacts start | 15:05:58 | **01:17** |
| Agents start | 15:06:38 | **01:57** |
| Orchestrator start (after Hunter + full Fixer flow) | 15:11:21 | **06:39** |
| End (Orchestrator + System Health + Closing) | 15:13:00 | **08:18** |

The overrun is concentrated in the **Agents section (~4:43)** — the two diagnostic
detours + the multi-step Fixer orchestration + re-navigations.

## Routes opened (all rendered · 0 overflow · 0 console errors)

`/` · `/customers` · `/customers/cu-1` · `/contacts` · `/agents` (×3) · `/system-health`.

| Screen | Verified |
|--------|----------|
| Command Center `/` | heading "צהריים טובים, צחי"; **4 KPI cards**; AI decision card present; Demo banner; RTL; overflow 0 |
| Customers `/customers` | heading "לקוחות"; 16 rows; search present; overflow 0 |
| Customer Detail `/customers/cu-1` | heading "אבי לוטם"; content rendered; overflow 0 |
| Contacts `/contacts` | 6 rows; search present; overflow 0 |
| Agents `/agents` | 7 agents; drawer + "פעולות" panel; local-demo label present |
| System Health `/system-health` | content rendered; overflow 0 |

## Actions executed (real results)

| Action | Result | Status |
|--------|--------|:------:|
| **Hunter** · איתור לקוחות חסרי מידע | ok — "3 לקוחות עם מידע חסר" + findings + **evidence** + **why** | ✅ |
| **Fixer** · הצעת תיקון (dc-2) | ok — "הצעת תיקון ל«סטודיו אורות» — 2 שדות", **"הצעה בלבד"** | ✅ |
| **Fixer** · החלת תיקון — before approval | **"ממתין לאישור"** — no mutation before approval | ✅ |
| **Fixer** · approve → apply | **"הוחל"** (applied once) | ✅ |
| **Fixer** · re-run + re-approve | **"כפילות"** (duplicate blocked) | ✅ |
| **Orchestrator** · סקירת מצב המערכת | ok — "3 רשומות חסרות, 2 ללא איש קשר ראשי" + recommendations + evidence + nav link | ✅ |

## Observations

- **Loading delays:** each screen settled in ~1.1–1.3 s (built preview); no excessive delay.
- **Navigation mistakes:** none by the app; the automation needed 2 diagnostic detours to
  find the Hunter control (an automation artifact, not a UI defect).
- **Confusing wording:** none observed.
- **Fallback used:** none.
- **Console errors:** **0** across the entire run.
- **Visual/functional defects:** **none** — no NO_OP, no misleading statement, no blocker.
- **Within five minutes:** **NO** — raw total **08:18** (automation-dominated).

## Classification

**Functional result: PASS** — all required screens and actions completed, no misleading
statement, no blocker, zero console errors.

**Timed result: does NOT meet ≤ 5:00 (raw 08:18 > 5:30).** Because the total exceeds
5:30, this run is **not** a clean PASS. The overrun is automation overhead + diagnostic
detours, not app or presentation pace — but per the rules the elapsed time is reported as
measured and **not rounded down**. → **DEMO REHEARSAL NEEDS ADJUSTMENT (timing).**

### Recommended reductions for a human ≤ 5:00 run (to validate next)

1. **Pre-open the Fixer drawer** before the timer (opening + selector search is the main sink).
2. **Do not re-navigate `/agents`** between agents — close the drawer and open the next.
3. **Run one Orchestrator action** (system-review) only.
4. Keep Customers/Contacts to list + one detail + one search (no extra edits).

With the app responding < 1.5 s per interaction and only ~6 clicks of real work, a spoken
5:00 budget is realistic — but this must be confirmed by an **actual human spoken
dry-run** before checking the box.

## Checklist status

`FINAL_SUBMISSION_CHECKLIST.md` → **"evaluator demo rehearsed" remains UNCHECKED** (only a
clean ≤ 5:00 PASS may check it). This file is recorded as the rehearsal evidence.
