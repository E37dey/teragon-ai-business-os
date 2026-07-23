# WAVE 7 — PRESENTATION REPORT (W7-G verification of the W7-F deliverable)

תאריך: 23.07.2026 · Agent: W7-G · Scope: `/submission/presentation` as it ships on final main — a TOP-LEVEL full-screen route outside OsShell (W7-F wiring), verified against the real production build on port 4973.

## 1. The five sections (EXACTLY 5 — structurally guarded)

| # | Section (titleHe) | Visual | Demo link (D) |
|---|---|---|---|
| 1 | הבעיה והקהל | live AS-IS/TO-BE component (רכיב חי, לא צילום) | /implementation |
| 2 | שבע פרסונות ומסלולי ההדרכה | personas/matrix visual | /personas |
| 3 | תכנית הטמעה בשישה שלבים ו-Stage Gates | roadmap + gates | /stage-gates |
| 4 | הדגמת Quick Start או Microlearning | quick-start walkthrough | /quick-start |
| 5 | שלוש רמות המדידה והסיכון המרכזי | metrics/risk | /submission |

Guards: bootstrap pins exactly 5 ordered sections (unit `tests/presentation/bootstrap.test.ts`); e2e asserts the 5 canonical titles and `exactly5-problems` count 0 (`w7f-presentation.spec.ts`, re-run green on final main). Content provenance: rewritten from the assignment deck — donor numbers labeled יעד/estimate, never a measurement (`sourceNoteHe` on every section).

## 2. Timing model

- **Total target: 600s (10 minutes)** — `PRESENTATION_TOTAL_TARGET_SECONDS = 600`.
- **Per-section target: 120s** — `SECTION_TARGET_SECONDS = 120` (5 × 120 = 600, verified by unit timing tests).
- Present mode shows a **10:00 countdown** + a per-section timer ("… / 2:00"); `T` pauses/resumes (e2e-verified: countdown ticks, freezes exactly while paused).
- The submission auditor consumes the same model: section minutes summing over 10 fire a **timing-overflow blocker** (`tests/submission/readiness.test.ts` → "timing overflow fires when presentationSections exceed 10 minutes").

## 3. Rehearsal honesty

- Rehearsal state starts **"טרם נמדד"** for every section AND the total — no fabricated timings anywhere (e2e asserts `rehearsal-ps-1` + `rehearsal-total` both contain "טרם נמדד" on first load).
- Rehearsal mode records **real measured seconds** only from an actual run: e2e spends ~2s of wall-clock on section 1, advances, and the overview then shows `(2|3) שנ׳` — a genuine measurement replacing the honest placeholder.
- W7-G re-verification: the honesty label also survives into the presenter notes ("הערת כנות" notes present; "טרם נמדד" appears in the canonical notes — pinned by `tests/wave7-security/presenterNotesAccess.security.test.ts`).

## 4. Demo path — the 11 deterministic steps (מצב הדגמה לבוחן)

1. מרכז הפיקוד (/) · 2. הבעיה העסקית (/implementation) · 3. שבע הפרסונות (/personas) · 4. Training Matrix (/personas) · 5. תכנית שישה שלבים (/implementation) · 6. ראיות G3/G4 (/stage-gates) · 7. Quick Start (/quick-start) · 8. פעולה מונחית אחת (/agents) · 9. שלוש רמות המדידה (/analytics) · 10. מוכנות ההגשה (/submission) · 11. חזרה למצגת (/submission/presentation).

- Every step routes to a REAL app route (unit `tests/presentation/demoMode.test.ts` → "every step route resolves to a REAL app route"); progress is repository-persisted (survives refresh), reset restores all steps to "לא בוצע".
- Navigation out of the presentation shows the app-wide floating **"חזרה למצגת"** control, which resumes the exact section (e2e `w7f-presentation.spec.ts` demo-link test — re-run green on final main).
- The demo-mode guard blocks destructive actions with a Hebrew reason while presenting (the only enforcement layer — see WAVE_7_SECURITY_REPORT §0).

## 5. Offline result

- **W7-F offline test (re-run on final main): PASS** (after the harness-drift fix — the first re-run failed on a duplicated return control, WAVE_7_TEST_RESULTS.md §5.5) — warm pass loads the lazy chunks + IndexedDB, then `context.setOffline(true)` and the same demo walk (presentation → step 3 → /personas → back → resume) completes with zero non-network console errors.
- **W7-G offline warm-walk (new, `w7g-keyboard-offline.spec.ts`): PASS** — client-side walk across ALL seven in-shell Wave-7 surfaces repeated fully offline after one warm pass.
- **Backup mode (B)**: bundled assets (vite `?url`, hashed) render offline; the view labels itself "צילום גיבוי — לא רכיב חי" + honesty note + source-file provenance — verified by e2e (natural image width > 0) and captured (`16-presentation-backup-mode-*.png`).

## Verification summary (W7-G, final main)

- `npx playwright test --config=e2e/w7f.config.ts` → **10/10 passed** after W7-G's harness-drift fix (the harness duplicated the now-integrated wiring — see WAVE_7_TEST_RESULTS.md §5.5).
- W7-G additions on this surface: axe overview gate (zero serious/critical), 4 visual states × 3 resolutions (captures 13-16), print-emulation handout QA (WAVE_7_PRINT_QA.md §1.3 — PASS; page-counter gap P-1 noted), presenter-note access-model security tests (WAVE_7_SECURITY_REPORT §1.4).
