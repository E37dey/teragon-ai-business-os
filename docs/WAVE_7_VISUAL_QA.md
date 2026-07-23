# WAVE 7 — VISUAL QA (W7-G, Phase 7.27)

תאריך: 23.07.2026 · Agent: W7-G · Scope: every Wave-7 surface, on final main (W7 A-F integrated), served from the REAL production build (vite preview, port 4973).

## 1. Screenshots — 16 surfaces × 3 resolutions = 48 captures → `docs/screenshots/wave7/`

Captured by `e2e/submission/w7g-visual.spec.ts` (48/48 passed). Each capture waits for the surface's REAL content marker (never a loading stub). Resolutions: 1920×1080 · 2560×1440 · 3840×2160.

| # | Surface (file prefix) | State captured |
|---|---|---|
| 01 | implementation | health KPIs + current stage + 6-stage roadmap + rail |
| 02 | implementation-asis-tobe | AS-IS (5) / TO-BE (7) map + human/forbidden boundary panels |
| 03 | personas | 7 lanes + KPI row (7/7 guard) + rail |
| 04 | personas-training-matrix | the canonical Training Matrix (יעד ≠ נמדד) |
| 05 | stage-gates-evidence | G1 selected + attached-evidence viewer showing the real record |
| 06 | training-materials | 13 cards in two sections (7 קריאה + 6 הוראה) |
| 07 | training-materials-preview | preview drawer open (structured content + approval flow) |
| 08 | quick-start | 3 actions + schematic demos + rules block + rail coach |
| 09 | faq | 7 objections + selected LACE detail + simulator rail |
| 10 | faq-lace-simulator | simulator result rendered (constructive feedback, no score) |
| 11 | submission | 12 deliverable cards + readiness chip + auditor rail |
| 12 | submission-quality-blockers | 12×8 quality matrix (real ✓/⚠/✕ glyphs) |
| 13 | presentation-overview | 5 sections + rehearsal "טרם נמדד" + keyboard legend |
| 14 | presentation-present-timer | present mode, section 1, countdown 10:00 + section timer |
| 15 | presentation-presenter-notes | notes drawer (N) open over present mode |
| 16 | presentation-backup-mode | backup screenshot mode (B) with honesty note |

Print captures (A4 ratio, Phase 7.20): `print-quick-start-a4.png` · `print-submission-a4.png` · `print-presentation-handout-a4.png` — see `docs/WAVE_7_PRINT_QA.md`.

## 2. The checklist — validated against the captures + e2e asserts

| Check | Result | Evidence |
|---|---|---|
| RTL everywhere | PASS | all captures; print roots assert `direction: rtl` programmatically (`w7g-print.spec.ts`) |
| Dense but readable | PASS | 01/03/11 at 1920 — KPI rows, cards and rails hold the dense-enterprise grid without crowding |
| No clipped Hebrew | PASS | manual review of the 1920 captures (01, 04, 11, 14, print-submission); no ellipsis/overflow on Hebrew labels |
| No roadmap overlap | PASS (asserted, not eyeballed) | e2e bounding-box pairwise-disjoint assert on all 12 AS-IS/TO-BE steps (`w7g-implementation.spec.ts`) + capture 02 |
| Counts visible: 7 personas / 6 gates / 6 stages / 13 materials | PASS | capture 03 ("7 / 7"), 01 (6 stage cards, "3/6"), 05 (G1–G6 navigator), 06 ("חומרי קריאה (7)" + "חומרי הוראה ותרגול (6)"); e2e counts asserted exactly |
| Evidence readable | PASS | capture 05 — the evidence viewer shows type chip, record id, eligibility status + real record fields |
| Presentation readable from distance | PASS | capture 14 — section title ~2xl, progress "1 / 5", countdown and keyboard legend legible at 1920 full-screen; backup mode (16) labels itself "צילום גיבוי — לא רכיב חי" |
| No dead controls | PASS | full audit in `docs/WAVE_7_INTERACTION_AUDIT.md` — every control REAL / DERIVED-NAV / HONESTLY-DISABLED (with visible Hebrew reason); e2e clicked through the main paths |

Honest observations (not defects):
- Capture 14 (present mode, section 1): the live AS-IS/TO-BE visual anchors to the inline-start of the slide, leaving open canvas on the other side — deliberate slide composition, readable; noted for the lead's aesthetic call.
- The 3840 captures render the same layout scaled (no layout break, no horizontal scroll).

## 3. axe — zero serious/critical, after ONE fix cycle (cycle limit 3 — used 2)

Gate: `e2e/submission/w7g-axe.spec.ts` — /implementation, /personas, /stage-gates, /submission, presentation overview. Contract identical to the W6 gate (no baseline).

**Cycle 1 (initial run): 4 pages failed, 4 distinct serious violations** — all in the trivial-fix classes explicitly allowed (contrast token / tabIndex / underline):

| Violation | Where | Trivial fix applied (documented) |
|---|---|---|
| `color-contrast` (serious) — `.os-chip--muted` text on the lightened chip bg over raised panels | /implementation (stage cards 5-6), /stage-gates (G4-G6 state chips), /personas | `src/styles/components.css` — `.os-chip--muted` color token `var(--os-muted)` → `var(--os-text-2)` (panel-safe secondary text token) |
| `color-contrast` (serious) — violet accent as TEXT (per-3 lane duration + Tier link) | /personas | `src/modules/personas/PersonasPage.tsx` — `ACCENT_VAR.violet` → the palette's readable text variant `var(--os-violet-text)` (token already existed for exactly this) |
| `scrollable-region-focusable` (serious) — max-height DataTable scroll region unreachable by keyboard | /personas (assignment tables) | `src/design-system/DataTable.tsx` — `tabIndex=0` + `role="region"` + `aria-label="אזור טבלה נגלל"` ONLY when maxHeight is set |
| `link-in-text-block` (serious) — links distinguishable by color alone | /submission (card route/print links, support links) | `src/modules/submission/SubmissionPage.tsx` — `textDecoration: underline` on the inline links |

**Cycle 2 (after fixes): 5/5 pages ZERO serious/critical.** All four fixes are within the mandated trivial-a11y exception (contrast token / tabIndex / aria / underline); no other src files were touched. Full vitest re-run stayed green (no test pinned the old colors).

## 4. Honest N/A

- Dark/light theming: the OS ships a single dark theme by design (VISUAL_DNA) — no light-mode captures exist or are claimed.
- Mobile/tablet: out of scope for Wave 7 (desktop presentation tool); no responsive claims made.
- The 5 bundled presentation backup PNGs are Wave-3/5/6 QA captures re-used as build inputs (provenance recorded per section) — they were not re-captured in Wave 7.
