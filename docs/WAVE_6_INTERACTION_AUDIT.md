# WAVE 6 — INTERACTION AUDIT (W6-F)

תאריך: 23.07.2026 · Agent: W6-F · Scope: every interactive control on the NEW Wave-6 surfaces. Classification: **REAL** (persists through repositories/engine) · **DERIVED-NAV** (real routing/selection over real data) · **HONESTLY-DISABLED** (disabled + visible Hebrew `disabledReason` — the OsButton type contract makes a disabled button without a reason a compile error).

There are **zero decorative controls** on the Wave-6 surfaces: every enabled control has a working handler; every disabled control explains itself.

## 1. /memory (`src/modules/memory/MemoryPage.tsx` + components)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Layer buttons ("כל השכבות" + 4 layers, `aria-pressed`) | DERIVED-NAV | filter state → `filterRecords` | e2e w6-memory (offline test filters); unit `tests/memory/pageSelectors.test.ts` "browse / filter" |
| Folder buttons (per layer, derived counts) | DERIVED-NAV | folder filter | unit "derives folders and layer counts from the records" |
| Search input | DERIVED-NAV | `filterRecords` query | e2e offline test; unit filter tests |
| Note list rows (`aria-pressed`) | DERIVED-NAV | `setSelectedId` → NoteView | e2e "Markdown import…" (note navigation) |
| Link-graph node buttons | DERIVED-NAV | `onSelect(id)` | e2e "Markdown import…" (graph click-through) |
| Import: "בחירת קבצים לייבוא" / hidden file input | REAL | `prepareImport` staged pipeline; busy ⇒ disabled "מעבד…" | e2e import + hostile-ZIP tests; `tests/memory-import/importPipeline.test.ts` |
| Import: per-file checkbox + "תצוגה" preview button | REAL / DERIVED-NAV | selection set; safe-preview pane | e2e (review pane asserted); `sanitizer.test.tsx` safe renderer |
| Import: "צור הצעות לתור האישורים (n)" | REAL | `commitImport` ⇒ proposals ONLY; disabled "לא נבחרו קבצים"/"מעבד…" | e2e exact "0 אושרו אוטומטית" message; unit "commitImport — proposals ONLY" |
| Export: "כלול פריטים רגישים" checkbox | REAL | `includeSensitive` → selection gate (audited) | `exportLeakage.security.test.ts` include-sensitive test |
| Export: "ייצוא כספת מלאה (ZIP)" | REAL | `runExport` → job+audit+checksum+real download; busy ⇒ "מייצא…" | e2e download-event test; unit "runExport — job + audit + checksum + download seam" |
| Proposal queue — "אשר לזיכרון" | REAL | `workflow.approve` (canonical engine); busy ⇒ "פעולה מתבצעת…" | e2e approve + keyboard tests; unit "אשר לזיכרון: approve → record + version + audit" |
| "ערוך ואשר" | REAL / HONESTLY-DISABLED | enabled only after the body was edited — reason: "ערכו את הטקסט למעלה…" | unit "ערוך ואשר: the human-edited body is what gets written" |
| "בטל הצעה" | REAL | `cancelProposal` | unit "בטל הצעה cancels the engine approval and the proposal" |
| "דחה" + reason input | REAL / HONESTLY-DISABLED | reason mandatory — "דחייה מחייבת נימוק — הזינו נימוק" | unit "דחה requires a reason (engine-enforced)" |
| "בקש מקור נוסף" + input | REAL / HONESTLY-DISABLED | "תארו את המקור הנדרש" | unit "בקש מקור נוסף keeps the proposal pending" |
| "מזג עם פריט קיים" + target select | REAL / HONESTLY-DISABLED | "בחרו פריט יעד למיזוג" | e2e version-comparison (merge); unit merge test |
| "סמן כרגיש" + sensitivity select | REAL | `markSensitive` (raise-only) | e2e c360 flow; unit "סמן כרגיש raises sensitivity and refuses to lower it" |
| New-proposal form (title/body/layer/customer) + "שלח לתור האישורים" | REAL / HONESTLY-DISABLED | submit via workflow with a REAL entity source; disabled reason "נדרשים כותרת, תוכן ומקור (לקוח) — זיכרון קבוע מחייב מקור" | e2e (all memory flows use it); unit proposalWorkflow suite |

## 2. /knowledge (`src/modules/knowledge/KnowledgePage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| "טיוטת מאמר חדשה" + draft modal (7 fields, printer chips) | REAL | `governance().createDraft` (zod-validated) | e2e review-flow; unit `knowledgeDraftInputSchema` tests |
| Category chips / state filter / review-due filter / search | DERIVED-NAV | `filterArticles` + deterministic `searchArticles` | unit `tests/knowledge` browse/search tests |
| Articles table rows | DERIVED-NAV | open article drawer | e2e (all knowledge flows) |
| Drawer: "עריכת טיוטה" | REAL | `updateDraft` (draft-family states only) | e2e version-comparison flow |
| "הגשה לבדיקה" / "הגשה לבדיקה חוזרת" | REAL | `submitForReview` → canonical approval | e2e; unit "submit → checks recorded → approval requested via the engine" |
| "אישור" | REAL | `governance().approve` ⇒ signed version | e2e; unit approvalLifecycle |
| "דחייה" / "בקשת שינויים" | REAL / HONESTLY-DISABLED | note-mandatory — "דחייה מחייבת נימוק — כתבו אותו בשדה ההערה" | e2e (disabled asserted); unit "reject requires a note" |
| "סימון דורש עדכון" | REAL / HONESTLY-DISABLED | note-mandatory reason string | e2e version-comparison flow |
| "העברה לארכיון" | REAL / HONESTLY-DISABLED | `archive`; already archived ⇒ "המאמר כבר בארכיון" | `usageSurvival.security.test.ts`; unit archive tests |
| Version comparison selects (v-א / v-ב) | DERIVED-NAV | `compareVersions` field diff | e2e diff assertion; unit "compare(vA,vB) returns the field-level diff" |
| Questions: "שאל את סוכן הידע" / "הוספה לתור" / "נסה מענה מהידע המאושר" / "סמן כנענתה עם המקור המצוטט" | REAL | WikiAgent (authoritative-only) + questions store | e2e wiki test; unit wikiAgent suite |
| Conflicts: "סריקת סתירות" / "הכרעה…" / "סגירת הסתירה עם נימוק" | REAL / HONESTLY-DISABLED | deterministic scan; resolution note mandatory — "סגירת סתירה מחייבת נימוק" | e2e contradiction test; unit "resolution requires a note" |

## 3. /learning (`src/modules/learning/LearningPage.tsx`)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Recommendations table rows | DERIVED-NAV | select proposal → review rail | e2e rule-history test |
| "אשר והפעל כלל" | REAL / HONESTLY-DISABLED | `approveProposal` via engine; disabled when single-case (the marker text itself is the reason) or when not the named reviewer ("רק … רשאי לאשר") | e2e (block asserted); unit approvalGate "only the NAMED reviewer may decide", "shows the mandatory single-case marker and blocks approval" |
| "דחה" + reason textarea | REAL / HONESTLY-DISABLED | reason mandatory — "דחייה מחייבת נימוק" | e2e; unit "rejects with a reason and records it" |
| "בטל כלל (rollback)" | REAL / HONESTLY-DISABLED | `rollbackRule`; "ביטול כלל מחייב נימוק" | e2e rollback test; unit rollback lifecycle suite |

## 4. Cross-domain surfaces (Wave-6 wiring)

| Control | Class | Handler / disabled reason | Covering test |
|---|---|---|---|
| Customer-360 "זיכרון לקוח" tab | DERIVED-NAV | `customer360MemoryTabView` (approved-only) | e2e c360 test; unit customer360Tab.test.tsx |
| c360 "חשוף עם נימוק" + reason input | REAL / HONESTLY-DISABLED | reveal audited; "חשיפה מחייבת נימוק" | e2e (disabled + reveal asserted); unit "sensitive record body stays hidden; reveal requires a reason" |
| c360 "לגרסאות ולפריט המלא ←" links | DERIVED-NAV | route `/memory?record=…` | unit tab-view route derivation |
| c360 propose form + submit | REAL | proposal via workflow (pending) | unit customer360Tab suite |
| Command-Center memory band rows + recent links | DERIVED-NAV | zero rows hidden; every row routes to /memory · /knowledge · /learning | e2e band click-through; unit "only non-zero rows survive, each with a real route" + `derivedSurfaceLeakage.security.test.ts` |
| Copilot: 8 memory/knowledge/learning command buttons + input | REAL | each bound to a defined op; free text ⇒ honest "unsupported" panel | e2e copilot test; unit "adds exactly the 8 mandated commands, each bound to a defined op" |
| Copilot answer: "רשומות רלוונטיות" route links | DERIVED-NAV | real `route` per affected record | e2e `href` assertion |

## 5. Keyboard & focus

- Proposal-queue approve button: Tab-reachable and Enter-operable — proven by a bounded keyboard-only walk in e2e (`w6-memory.spec.ts`).
- Drawers/modals close on Escape (design-system `Drawer`); tabs are real `role="tab"` buttons; toggles carry `aria-pressed`.
- axe: zero serious/critical on all four scanned Wave-6 states after the one documented ConfidenceBar fix (`WAVE_6_VISUAL_QA.md` §2).
