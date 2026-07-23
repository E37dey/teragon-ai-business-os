# WAVE 6 — VISUAL QA (W6-F, Phase 6.23)

תאריך: 23.07.2026 · Agent: W6-F · Driver: `e2e/memory/w6-visual.spec.ts` + `e2e/memory/w6-axe.spec.ts` (run inside the W6 suite, `e2e/w6.config.ts`, port 4773, production preview build).

## 1. Screenshots — 13 surfaces × 3 resolutions = 39 files → `docs/screenshots/wave6/`

Every state is DRIVEN to reality before capture (real proposals, a real merge, a real detected contradiction, a real copilot answer) — no empty-shell shots. Naming: `NN-surface-{W}x{H}.png`, full-page, at 1920×1080 / 2560×1440 / 3840×2160.

| # | Surface | State driven | Files |
|---|---|---|---|
| 01 | /memory | seed-loaded page: 8 KPIs, layers/folders, list, graph, queue, rail status lines | 3 |
| 02 | Import preview open | forged ZIP staged: file list, safe preview, link analysis | 3 |
| 03 | Proposal approval open | real pending proposal card: 4 checks + all 7 governed controls | 3 |
| 04 | Version comparison | record with v1 + merged v2: versions list + "שדות ששונו" diff | 3 |
| 05 | /knowledge | seeded articles table + KPIs + rail "איכות הידע" | 3 |
| 06 | Article open | drawer on the seeded warping article: governance actions, sources, versions | 3 |
| 07 | Conflict panel | REAL detected contradiction (two approved articles, טמפ' מיטה 60↔85) | 3 |
| 08 | /learning | metrics + loop stepper + joined table, honest "טרם נמדד" | 3 |
| 09 | Proposal selected | rail with the pending single-case proposal (marker visible) | 3 |
| 10 | Rule history | active rule selected: "פעיל · גרסה 1", applications count, effectiveness טרם נמדד | 3 |
| 11 | Customer-360 memory tab | /customers/cu-2 → "זיכרון לקוח" (seeded legacy note matched) | 3 |
| 12 | Command-Center memory rail | derived band with non-zero rows + recent-approved links | 3 |
| 13 | Copilot evidence view | real pending proposal → command → envelope with evidence + route links | 3 |

Visual sanity (manually reviewed at 1920×1080): RTL layout intact, dark-theme tokens consistent, Hebrew strings render correctly, KPI numbers derived (5 seed records, honest zeros elsewhere), no horizontal overflow at any of the three widths (full-page shots contain no clipped panels).

## 2. axe (@axe-core/playwright) — ZERO serious/critical, NO baseline

Scanned states (each a test in `w6-axe.spec.ts`): `/memory` · `/knowledge` · `/knowledge` with the article drawer OPEN · `/learning`.

- First audit run found **1 critical**: `aria-required-attr` on `.os-confidence` — `ConfidenceBar` claimed `role="meter"` without `aria-valuenow` in the unmeasured ("טרם נמדד") state (surfaced on /memory NoteView).
- **Trivial fix applied** (allowed by the W6-F a11y exception, documented): `src/design-system/ConfidenceBar.tsx` — measured ⇒ full meter semantics (`aria-valuemin/max/now/valuetext`); unmeasured ⇒ `role="img"` + `aria-label="… — טרם נמדד"`. No fake value is ever invented.
- Re-run after the fix, **strict audit mode (no filtering at all)**: **4/4 pass, zero serious/critical on every scanned state.** The Wave-5 shell baseline items (os-header__count contrast etc.) did NOT reproduce on these pages at serious/critical impact. Correction cycles used: 1 of 3.

## 3. Honest N/A / limitations

- **Cold offline boot**: no service worker exists — an offline reload cannot load the shell. The offline e2e proves warm-SPA IndexedDB reads only (documented in `WAVE_6_TEST_RESULTS.md` §4.4). No screenshot pretends otherwise.
- **/knowledge first paint**: the reported seed race (§4.1 of the test results) can show "אין מאמרים" until a reload; the visual driver reloads-until-seeded so screenshots reflect the intended seeded state. The defect itself is reported, not hidden.
- **Learning "proposal approved" moment**: the seed pre-approves the only multi-record proposal, so there is no capturable instant of clicking approve on a rule-eligible proposal; captured instead: the structurally-blocked single-case approve (09) and the resulting active rule (10) — the honest reachable states.
- Light theme: the OS is dark-theme-only by design (VISUAL_DNA) — no light-theme captures.
