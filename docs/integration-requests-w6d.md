# W6-D → Integration Requests (Wave 6)

23.07.2026 · מאת: W6-D (Governed Learning Loop)

## 1. חיווט הראוטר (Integration Lead)

להחליף את ה-placeholder של `/learning` בעמוד הממומש:

```
"/learning" → lazy(() => import("@/modules/learning/LearningPage"))
```

- default export: `LearningPage` (כולל `PageRail` פנימי — אין צורך ב-rail נפרד).
- אין תלות חדשה; אין שינוי ב-collections (האוספים כבר קיימים ב-IDB v4).
- בדיקת placeholder קיימת: `tests/router.test.tsx` בודק ש-`/memory` הוא עדיין
  placeholder של גל 6 — הבדיקה אינה נוגעת ב-`/learning`, אך אם קיימת אסרטה
  דומה על `/learning` יש לעדכנה בעת החיווט.

## 2. חיבורים ל-W6-E (hooks של תצפיות)

הלולאה קוראת כיום תצפיות נגזרות מ-`aiRecommendations` + `approvals` בלבד.
מקורות שה-W6-E מוזמן לחווט (create-if-missing על `learningObservations` דרך
`syncObservations`-style, או ישירות עם origin מתאים):

| אירוע במוצר | origin מתאים | איך |
|---|---|---|
| פתרון קריאת שירות (service resolution) | `repeated-service-solution` / `business-result-success` | בעת סגירת קריאה עם פתרון מתועד — רשומת `LearningObservation` עם `sourceRef:"ticket:<id>"` |
| תוצאת קורס/שלב (course outcome) | `training-outcome` | בעת השלמת/כישלון שלב — `sourceRef:"enrollment:<id>"` |
| משוב משתמש חופשי | `user-feedback` | מסך/ווידג'ט משוב עתידי |
| כשל אוטומציה | `automation-failure` | מ-`automationRuns` כושלות |
| סתירה בידע | `knowledge-contradiction` | מ-`knowledgeConflicts` (W6-B) |

בנוסף: מדידת תוצאה אמיתית ⇒ עדכון `RecommendationOutcome.measuredResult` +
`measurementMethodHe` + `measuredAt` (הסכימה מחייבת את שלושתם יחד).

## 3. פקודות Copilot (W6-E)

| שאלה | מימוש מוצע |
|---|---|
| "אילו תובנות ממתינות לבדיקת מנהל?" | `learningStores().proposals.list()` → סינון `approvalState === "pending"` → תשובה: insight + sampleSize + סימון מקרה-יחיד אם קיים + `namedReviewerName`; קישור `/learning` |
| "אילו המלצות נדחו לאחרונה ולמה?" | `deriveOutcomes` (או `recommendationOutcomes`) → `decision === "rejected"` ממוין לפי `updatedAt`; הנימוק נמצא ב-note של רשומת ה-Approval הקנונית (`approvalId`) ובאירוע `learning.proposal-rejected` ב-audit |

שתי הפקודות קריאה-בלבד — אין צורך באישור; יש לתייג את התשובה כ"נגזר מרשומות".

## 4. הערות תיאום

- W6-D כותב ל-`auditEvents` רשומות עם קידומת id `lae-` ופעולות בקידומת
  `learning.*` — אין התנגשות עם `runlog` (קידומות אחרות).
- אישורי הלולאה חיים תחת runId `learning-loop-w6d` (ids:
  `learning-loop-w6d-ap-N`). `deriveObservations` מחריג אישורים עם subjectRef
  `learning-proposal:` — הלולאה אינה צופה בעצמה.
- אין שינוי נדרש ב-`src/agents/**`, ב-collections או ב-seed הראשי.
