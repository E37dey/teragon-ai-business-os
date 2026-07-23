# WAVE 7 — INTERACTION AUDIT (W7-G)

תאריך: 23.07.2026 · Agent: W7-G · Scope: every interactive control on the NEW Wave-7 surfaces. Classification: **REAL** (persists through repositories/services) · **DERIVED-NAV** (real routing/selection/scroll over real data) · **HONESTLY-DISABLED** (disabled + visible Hebrew `disabledReason` — the OsButton type contract makes a disabled button without a reason a compile error).

There are **zero decorative controls** on the Wave-7 surfaces: every enabled control has a working handler; every disabled control explains itself (the reason renders as tooltip + `aria-label` on the focusable wrapper).

## 1. /implementation (`src/modules/implementation/ImplementationPage.tsx` + `AsIsToBe.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| 6 roadmap stage cards (role=button, tabIndex, Enter/Space) | DERIVED-NAV | `setOpenStageId` → StageDrawer | e2e `w7g-implementation` "stage drawer: opens…" |
| Stage-drawer tabs (סקירה/תוצרים/ראיות/סיכונים/החלטות/היסטוריה) | DERIVED-NAV | tab state; honest empty states per tab | same e2e (all six tabs) |
| Stage-drawer close (Escape / X) | DERIVED-NAV | Drawer onClose | same e2e |
| AS-IS/TO-BE view toggles: "תצוגת עמוד" / "תצוגת מצגת 16:9" | DERIVED-NAV | `setMapView` | unit `tests/implementation/asIsToBe.test.tsx`; visual capture 02 |
| "הדפסה (A4)" | REAL (browser print) | `window.print()` + scoped @media print | print-CSS asserted by `tests/implementation/asIsToBe.test.tsx`; e2e print pattern in `w7g-print` |
| Rail auditor panels (סיכון חוסם/ראיות חסרות/…) | DERIVED-NAV | pure selectors over real records | unit `tests/implementation/selectors.test.ts`; e2e roadmap test |

## 2. /personas (`src/modules/personas/PersonasPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Supporting-material chips (per lane) | DERIVED-NAV | `setMaterialDrawerId` → MaterialDrawer | e2e `w7g-personas` "material click opens the material drawer" |
| Training-Matrix cell/material/persona clicks | DERIVED-NAV | drawer / `scrollToAnchor(persona-lane-…)` | unit `tests/personas/trainingMatrix.test.tsx`; e2e matrix test |
| Rail auditor warning buttons (title "מעבר אל …") | DERIVED-NAV | `scrollToAnchor(warning.anchorId)` | e2e "auditor warnings … CLICKABLE" |
| Tier link "Tier N — מעבר לתמיכה" | DERIVED-NAV | Link → /support | route pinned by `tests/submission/contentRegistry.test.ts` (routes exist) |
| Material drawer close | DERIVED-NAV | Drawer onClose | e2e |

## 3. /stage-gates (`src/modules/stage-gates/StageGatesPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| 6 gate navigator cards (role=button, keyboard) | DERIVED-NAV | `setSelectedGateId` | e2e `w7g-stage-gates` (G1/G2/G4 selection) |
| אחראי / בודק selects | REAL | `service().assignOwner/assignReviewer` (audited) | unit `tests/stage-gates/actions.test.ts` |
| "Go" | REAL / HONESTLY-DISABLED | `decideGo` when `readyForGo`; else disabled — "Go חסום: <first blocking reason>" or "השער כבר הוכרע Go — לשינוי פתחו מחדש" | e2e G2 full Go flow + G4 blocked (`data-disabled-reason` asserted); unit `states.test.ts` |
| "No-Go" | REAL / HONESTLY-DISABLED | reason mandatory — "No-Go מחייב נימוק — כתבו אותו בשדה ההערה" | unit actions suite |
| "פתח מחדש" | REAL / HONESTLY-DISABLED | reason mandatory — "פתיחה מחדש מחייבת נימוק…" | unit actions suite |
| "בקש השלמה" | REAL / HONESTLY-DISABLED | reason mandatory — "בקשת השלמה מחייבת נימוק…" | unit actions suite |
| הערת החלטה textarea | REAL | note state feeding the actions above | unit + e2e |
| "צרף ראיה…" (per criterion) | REAL | opens AttachEvidenceModal — ELIGIBLE candidates only (same deterministic evaluator), hidden-ineligible count disclosed | e2e G2 attach loop + keyboard-only attach (`w7g-keyboard-offline`) |
| Modal "צרף" per candidate | REAL | `service().attachEvidence` (audited — toast "נרשמה ביומן הביקורת") | e2e G2 |
| Evidence chip "📎 …" (per attached ref) | DERIVED-NAV | `setViewerRef` → EvidenceViewer real-record preview | e2e "evidence viewer" test |
| "הסרה" (per attached ref) | REAL | `service().detachEvidence` (audited) | unit actions suite |
| Busy state (all action buttons) | HONESTLY-DISABLED | "פעולה קודמת עדיין רצה" | OsButton contract |

## 4. /training-materials (`src/modules/training-materials/TrainingMaterialsPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| 13 material cards (role=button, keyboard) | DERIVED-NAV | `setSelectedId` → preview drawer | e2e `w7g-training-materials` (13 count + preview) |
| "שליחה לאישור" | REAL | creates a canonical `Approval` record + activity log | e2e approval flow |
| "אישור החומר" / "דחייה — דורש עדכון" | REAL | decides the Approval (named decider), updates material status, logs activity | e2e approval flow incl. refresh persistence |
| "סימון כדורש עדכון" | REAL | material patch + activity | unit `tests/training-materials/canonicalMaterials.test.ts` |
| "הדפסה" | REAL / HONESTLY-DISABLED | `window.print()`; disabled — "החומר אינו מסומן להדפסה" | OsButton contract |
| Content-route link "← מעבר לעמוד החומר" | DERIVED-NAV | Link to material.contentRoute | registry route guard |
| Busy state | HONESTLY-DISABLED | "פעולה קודמת עדיין רצה" | OsButton contract |

## 5. /quick-start (`src/modules/quick-start/QuickStartPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| View tabs (אפליקציה / הדפסה A4 / מצגת) | DERIVED-NAV | `setView` | e2e `w7g-quick-start` "view modes" |
| "הדפסה" | REAL (browser print) | `window.print()` + scoped print CSS | e2e `w7g-print` quick-start test |
| "נסה זאת" (×3) | DERIVED-NAV | `navigate(action.route)` to the REAL route | e2e "«נסה זאת» navigates" |
| Presentation "הקודם"/"הבא" | DERIVED-NAV / HONESTLY-DISABLED | slide state; edges — "זהו השקף הראשון"/"זהו השקף האחרון" | e2e view-modes test |
| Rail coach textarea + "בדיקה מול הנוהל" | REAL (deterministic) | `classifyPlannedAction` — rules, not a model (disclosed on-screen) | e2e rail-coach test; unit `tests/training-materials/quickStart.test.ts` |

## 6. /faq (`src/modules/faq/FaqPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| 7 objection list buttons | DERIVED-NAV | `setSelectedKey` → full LACE detail | e2e `w7g-faq` |
| Evidence links (per objection) | DERIVED-NAV | Link to real routes | unit `tests/training-materials/lace.test.ts` (objection shape) |
| Simulator objection select | DERIVED-NAV | `setObjectionKey` (resets result) | e2e simulator tests |
| Simulator response textarea + "בדיקת הנוסח" | REAL (deterministic) / HONESTLY-DISABLED | `evaluateLaceResponse` + envelope; empty ⇒ "כתבו מענה כדי לבדוק אותו" | e2e dismissive/good tests (no numeric score asserted); unit lace suite |

## 7. /submission (`src/modules/submission/SubmissionPage.tsx` + `printView.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Tabs (12 התוצרים / מטריצת איכות / מדדים / תמיכה / One-Pager) | DERIVED-NAV | `setTab` | e2e `w7g-submission` (all tabs) |
| "תצוגת הדפסה A4" | DERIVED-NAV | Link `?print=1` → SubmissionPrintView | e2e `w7g-print` |
| "הדפסה / שמירה כ-PDF" (print view) | REAL (browser print) | `window.print()` | e2e print (hidden under print media) |
| "שמירת תוצאות הבדיקה" | REAL | `persistQualityResults` → qualityValidations collection | unit `tests/submission/qualityValidator.test.ts` (persist path) |
| "צילום מצב" | REAL | `createSubmissionSnapshot` → submissionSnapshots | unit snapshot tests |
| Deliverable card route links + "הדפסה" link | DERIVED-NAV | Link (underlined — W7-G a11y fix) | axe `w7g-axe` /submission zero serious |
| Rail finding buttons (חוסם/אזהרה) | DERIVED-NAV | `navigate(f.targetRoute)` | e2e blocker click-through (→ /submission/presentation) |
| Support-tab links | DERIVED-NAV | Link (underlined — W7-G a11y fix) | axe |

## 8. /submission/presentation (`src/modules/presentation/*`) — audited by W7-F

The presenter-experience controls (start/present/arrows/T/N/B/D, rehearsal toggle, demo-mode steps, handout tab, חזרה למצגת) were audited and e2e-covered by W7-F (`e2e/presentation/w7f-*.spec.ts`, 13 tests — re-run green on final main, see WAVE_7_TEST_RESULTS.md). W7-G adds: axe on the overview (zero serious/critical), visual captures 13-16, print-emulation handout QA.

## 9. Keyboard access

- Gate navigator cards, roadmap stage cards and material cards: `role="button"` + `tabIndex=0` + Enter/Space handlers.
- Evidence picker: fully operable keyboard-only (focus → Enter opens → Tab → Enter attaches) — pinned by e2e `w7g-keyboard-offline.spec.ts`.
- Scrollable tables (`DataTable` with maxHeight): now focusable + labeled (`role="region"`, `aria-label="אזור טבלה נגלל"`) — W7-G trivial a11y fix (axe scrollable-region-focusable).
- Presentation keyboard model (RTL arrows, T/N/B/D/Escape) — W7-F coverage.
