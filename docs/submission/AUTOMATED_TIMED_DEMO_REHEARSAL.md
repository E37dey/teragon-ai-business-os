# Automated Timed Demo Rehearsal (S12.4)

A **clean** end-to-end run of the optimized 04:30 script
([PRESENTATION_SCRIPT_4_30_HE.md](PRESENTATION_SCRIPT_4_30_HE.md)) through the running
application — no debugging, no source inspection, no DevTools, no diagnostics between
sections, each action run once, **no duplicate-blocking demo**, no docs opened mid-flow.

> **This is an AUTOMATED rehearsal performed by Claude/browser automation — NOT a human
> presenter.** The human-rehearsal checklist item stays **unchecked**.

## Run metadata

- **Date / local time:** 2026-08-07, ~11:36 local (flow executed across a resumed session).
- **Base SHA:** `a8788a92f20f77356b88c63cf5eb2f4b150c6498`.
- **Browser / viewport:** in-app Chromium, **1440×900** desktop.
- **Mode:** local demo (synthetic data, Demo banner), `AI_REMOTE_ENABLED=false`.
- **Pre-flight (before timer):** app built + `npm run preview` on :4173; all 6 required
  routes returned HTTP 200; engine reset via fresh load; agent-button indices confirmed
  (Hunter #2, Fixer #0, Orchestrator #5); Fixer record `dc-2` prepared. No action pre-executed.

## Two clocks — read this before the numbers

- **Raw automation wall-clock: 18:17** (T0 01:18:32 → 01:36:49). This is **NOT** the
  presentation duration and is reported only per the "do not round down" rule. It is
  inflated by (a) per-tool-call round-trip latency inherent to browser automation and
  (b) a **mid-run session interruption/resume gap**. Neither reflects a human's pace.
- **Simulated human-presentation duration: ~03:25** — the classification metric. Built
  from the mandatory narration at a normal Hebrew pace **+ the real in-app render/action
  times measured in-page** (via `performance.now()`, unaffected by automation latency).

## Per-section timeline (script budget · narration @130 wpm · measured in-app time)

| Section | Budget | Narration | Measured in-app | Status |
|---------|:------:|:---------:|:---------------:|:------:|
| Opening | 00:25 | 21s (45 w) | — | ✅ |
| Command Center | 00:20 | 16s (34 w) | render 3 ms | ✅ 4 KPIs · AI decision card · banner |
| Customers + Detail | 00:35 | 14s (30 w) | list render 0 ms · detail 22 ms | ✅ 15 rows · search · detail "אבי לוטם" |
| Contacts | 00:20 | 10s (22 w) | filter 250 ms | ✅ 6 rows · search filter exercised |
| Hunter | 00:55 | 17s (37 w) | action 129 ms | ✅ ok · finding · evidence · why |
| Fixer | 00:55 | 19s (42 w) | flow 1382 ms | ✅ propose "הצעה בלבד" → **awaiting (unchanged)** → **applied once** |
| Orchestrator | 00:35 | 10s (21 w) | action 122 ms | ✅ ok · priority · evidence · nav link |
| System Health | 00:15 | 11s (23 w) | render 16 ms | ✅ content · overview |
| Closing | 00:10 | 17s (37 w) | — | ✅ GO / INTERNAL statement |

- **Total mandatory narration:** 291 words → **~2:14** @130 wpm.
- **Total measured in-app render/action:** ~1.9 s (+ ~4 s route/drawer clicks).
- **Simulated human-presentation duration:** narration 2:14 + in-app ~6 s + realistic
  per-section transition/reading pauses (~7 s × 9 ≈ 63 s) ≈ **03:25** (active floor,
  overlapping talk+click, ~2:20). **Well under 05:00, and inside the 04:30 script budget.**

## Actions executed (each once)

| Action | Result |
|--------|--------|
| **Hunter** · איתור לקוחות חסרי מידע | **ok** — "3 לקוחות עם מידע חסר; «סטודיו אורות» חסר: דוא\"ל, מקטע שוק" + evidence + why + local-demo label |
| **Fixer** · propose (dc-2) | **ok · "הצעה בלבד"** — "הצעת תיקון ל«סטודיו אורות» — 2 שדות" |
| **Fixer** · before approval | **"ממתין לאישור"** — state unchanged (no mutation) |
| **Fixer** · approve once | **"הוחל"** — applied once (duplicate run **not** performed) |
| **Orchestrator** · סקירת מצב | **ok** — "3 רשומות חסרות, 2 ללא איש קשר ראשי" + evidence + nav link |

## Observations

- **Loading delays:** none — every screen render-ready in ≤ 22 ms in-page.
- **Navigation delays:** none material (route transitions near-instant on the built preview).
- **Emergency cuts used:** **none.**
- **Console errors:** **0** (re-confirmed: "No console logs").
- **Overflow:** **0** on every section at 1440.
- **Functional defects:** **none** — no NO_OP, no misleading statement, no blocker.

## Classification

**AUTOMATED PASS.** Simulated human-presentation duration **~03:25 ≤ 05:00**; all 9
mandatory sections completed; all required actions worked; no unsupported claim; no
functional blocker; no console error; no presentation-breaking visual defect.

- **Attempts:** **1** (no second attempt needed — under 05:00). No script change required
  (§6 applies only when > 05:00).

## Checklist

`FINAL_SUBMISSION_CHECKLIST.md` — evidence line added:
*"Automated end-to-end timed rehearsal: PASS — ~03:25 simulated human-presentation
duration (raw automation wall-clock 18:17, non-representative)."* The **"evaluator demo
rehearsed"** item stays **UNCHECKED** — this is an automated run, not a human rehearsal.
