# GOVERNED LEARNING — TERAGON AI BUSINESS OS (Wave 6, W6-D)

23.07.2026 · בעלות: W6-D (Governed Learning Loop) · צריכה: /learning, W6-E (Copilot/חיווט)

לולאת הלמידה המנוהלת: **אין למידה אוטונומית.** תובנה הופכת לכלל רק לאחר בדיקת
ראיות ואישור **מנהל בשם** דרך מנוע האישורים הקנוני היחיד
(`src/agents/approvalEngine.ts`), וכל כלל ניתן לביטול (rollback) בכל רגע.
הגדרות הסוכנים הקפואות (`src/agents/definitions.ts`) **לעולם אינן מושפעות** —
כלל למידה אינו יכול לגעת בהן מבנית.

## הזרימה הקנונית (8 שלבים)

```
המלצה → תגובת משתמש (אישור/עריכה/דחייה) → תצפית תוצאה → תובנה מוצעת (אגרגציה
דטרמיניסטית) → בדיקת ראיות → אישור מנהל בשם (ApprovalEngine) → כלל פעיל
מגורסא → מעקב / ביטול
```

## רשומות (`src/domain/learning/types.ts`, אוספי IDB v4)

| רשומה | אוסף | תפקיד |
|---|---|---|
| `LearningObservation` | `learningObservations` | תצפית שמקורה **סגור**: המלצה שאושרה/נערכה/נדחתה · תוצאה עסקית הצלחה/כישלון · פתרון שירות חוזר · תוצאת הדרכה · משוב משתמש · כשל אוטומציה · סתירה בידע |
| `RecommendationOutcome` | `recommendationOutcomes` | החלטת המשתמש + תוצאה עסקית; `measuredResult:null` ⇒ "טרם נמדד" (מדידה מחייבת שיטה + תאריך) |
| `LearningProposal` | `learningProposals` | תובנה נגזרת: insight, domain, sampleSize (= מספר הרשומות התומכות, נאכף בסכימה), supporting/contrary, הטיות, מגבלות (חובה), סוכנים/תהליכים מושפעים, אפקט מוצע, מאשר **בשם**, מצב אישור |
| `LearningEvidence` | `learningEvidence` | ראיה תומכת/נגד המצביעה על רשומה אמיתית |
| `LearningRule` | `learningRules` | כלל פעיל מגורסא; `sampleSize ≥ 2` נאכף בסכימה; אפקטיביות לא נמדדה ⇒ "טרם נמדד" |
| `LearningRuleVersion` | `learningRuleVersions` | snapshot בלתי-משתנה לכל גרסה (append-only) |
| `LearningRollback` | `learningRollbacks` | רשומת ביטול: גרסה, נימוק (חובה), מבטל בשם |

## כללי כנות (סכימה + לוגיקה + בדיקות)

1. **קורלציה ≠ סיבתיות**: `evidenceBasis:"causation"` מחייב `causationEvidenceRef` — אחרת הסכימה נכשלת.
2. **מקרה יחיד**: `sampleSize === 1` ⇒ חובה הסימון `"מקרה יחיד — לא מספיק ליצירת כלל"`, וההצעה **לא יכולה להפוך לכלל** — נחסם גם ב-`approveProposal` (`LEARNING_SINGLE_CASE_RULE_BLOCKED`) וגם בסכימת הכלל (`MIN_RULE_SAMPLE_SIZE = 2`).
3. **אפקטיביות ללא מדידה ⇒ "טרם נמדד"** — `effectivenessMeasured:false` עם טקסט אפקטיביות נפסל בסכימה; התצוגה היחידה: `ruleEffectivenessDisplayHe`.
4. **sampleSize כן**: תמיד שווה למספר הרשומות התומכות (superRefine).
5. **מגבלות חובה**: `limitationsHe` לעולם לא ריק.

## משטח ההשפעה — RuleEffect (איחוד סגור, `strictObject`)

כלל רשאי להשפיע **רק** על: `ranking-adjustment` · `suggested-next-action` ·
`default-draft-structure` · `follow-up-timing` · `knowledge-retrieval-weighting`
· `troubleshooting-order`.

**אסור מבנית** (לא ניתן לביטוי באיחוד — נבדק בבדיקת guard על כל ניסיון):
הרשאות · דרישות אישור · סמכות תמחור · מדיניות אבטחה · תצורת ספק · גישה
ארגונית · הוראות מערכת. `strictObject` חוסם גם הברחת שדות זרים על kind מותר.

## API (`src/learning/`)

- `learningStores()` — seam על ה-factory הקנוני.
- `deriveObservations(recs, approvals)` / `deriveOutcomes(...)` — נגזרות טהורות
  ודטרמיניסטיות מהרשומות הקיימות (אישורי-למידה עצמם מוחרגים — הלולאה אינה
  צופה בעצמה). `syncObservations` / `syncOutcomes` — כתיבה אידמפוטנטית.
- `deriveProposals(observations, evidence, reviewer)` — אגרגציה דטרמיניסטית.
- `submitProposal(stores, engine, draft)` — יוצר הצעה + ראיות + בקשת אישור
  קנונית (runId `learning-loop-w6d`, פעולה `permanent-knowledge-update`,
  payload `null` — המלצה בלבד, שום ביצוע מכונה).
- `approveProposal(stores, engine, {proposalId, decidedById, decidedByName}, clock)`
  — שער בשם: מזהה חייב להתאים ל-`namedReviewerId`; ההחלטה עוברת
  `engine.decide` (עקיפה ⇒ זריקה מהמנוע); יוצר `LearningRule` + גרסה 1 + audit.
- `rejectProposal(...{reasonHe})` — נימוק חובה (נאכף גם במנוע).
- `reviseRule(...)` — גרסה חדשה append-only; `rollbackRule(...)` — השבתה +
  רשומת rollback + audit; יישומי העבר נשארים גלויים.
- `applyRule(stores, ruleId, contextRef, actorId, clock)` — יישום כלל פעיל
  בלבד; **כל יישום נרשם** כ-`AuditEvent` בפעולה `learning.rule-apply`
  (`correlationId = ruleId`). `ruleApplicationsFromAudit` — סלקטור טהור.

## עמוד /learning (`src/modules/learning/LearningPage.tsx`)

KPI נגזרים (אושרו/נערכו/נדחו · תוצאות שנמדדו — "טרם נמדד" כשאין · תובנות
ממתינות · כללים פעילים · במעקב · ביטולים) · Stepper של 8 השלבים · טבלת
המלצה↔תגובה↔תוצאה↔תובנה↔מדגם↔ראיות-נגד↔מאשר↔סטטוס · PageRail: ההצעה הנבחרת —
ראיות, מגבלות, הטיות, מושפעים, הכלל המוצע, פקדי אישור/דחייה (דרך המנוע) ומצב
rollback. אין שום ויזואליה של "אימון עצמי".

## Seed הדגמה (`src/learning/seedDemo.ts`)

`ensureLearningDemoData()` — אידמפוטנטי, דרך repositories בלבד: תצפיות ותוצאות
**נגזרות** מה-seed הקיים (rec-1/2/3 + ap-1/2/3); הצעת שירות (מדגם 2: תצפית
rec-2 + ראיית הידע kn-1) מאושרת בשם צחי זוסטייהם דרך המנוע האמיתי ⇒ הכלל הפעיל
היחיד (troubleshooting-order, אפקטיביות "טרם נמדד"); הצעת הדרכה (מקרה יחיד,
עם הסימון) נשארת ממתינה; יישום אחד נרשם ל-audit.

## בדיקות (`tests/learning/` — 59)

schemaHonesty (13) · loopDerivation (9) · ruleGuard (17) · approvalGate (9) ·
rollback (5) · page (6+ סלקטורים ורנדר).
