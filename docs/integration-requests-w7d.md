# W7-D → Integration Requests (Wave 7)

23.07.2026 · מאת: W7-D (חומרי הדרכה, התחלה מהירה, FAQ)

## 1. חיווט הראוטר (Integration Lead)

להחליף שלושה placeholders בעמודים הממומשים (default exports):

```
"/training-materials" → lazy(() => import("@/modules/training-materials/TrainingMaterialsPage"))
"/quick-start"        → lazy(() => import("@/modules/quick-start/QuickStartPage"))
"/faq"                → lazy(() => import("@/modules/faq/FaqPage"))
```

- כל עמוד כולל `PageRail` פנימי — אין צורך ב-rail נפרד.
- אין תלות npm חדשה; אין שינוי ב-collections (`trainingMaterials` ו-`objections`
  כבר קיימים ב-IDB v5).
- `QuickStartPage` מקבל prop אופציונלי `presentation?: boolean` (תצוגת מצגת) —
  ברירת המחדל היא תצוגת אפליקציה, אין צורך להעביר דבר בחיווט הרגיל.
- אם `tests/router.test.tsx` מכיל אסרטת placeholder על אחד מהראוטים האלה — יש
  לעדכנה בעת החיווט (נכון לבסיס הנוכחי אין כזו).

## 2. שדות קנוניים ל-types.ts (Integration Lead, בסוף הגל)

`TrainingMaterialV2` ממומש בתבנית ההרחבה של W6-E
(`src/domain/training-materials/types.ts`, כל השדות אופציונליים). הדיף המוכן
לקיפול לתוך `TrainingMaterial` ב-`src/domain/types.ts`:

```ts
// TrainingMaterialExtension → fold into TrainingMaterial
canonicalKey?: CanonicalMaterialKey;
section?: "חומרי קריאה" | "חומרי הוראה ותרגול";
status?: "לא התחיל" | "טיוטה" | "ממתין לבדיקה" | "מאושר" | "דורש עדכון" | "חסר" | "בארכיון";
version?: string;
ownerId?: string | null;
contentRoute?: string | null;
printable?: boolean;
exportFormats?: string[];
relatedStageId?: string | null;
relatedGateId?: string | null;
qualityValidation?: string[];
reviewDate?: ISODate | null;
approvalId?: string | null;
measurableOutcome?: string | null;
practiceIncluded?: boolean;
contentVersion?: number;
```

`ObjectionRecord` (אוסף `objections`) מוגדר במלואו באותו קובץ — אם ה-Lead
מעדיף אותו ב-types.ts, ההעברה היא copy-paste (אין תלות מודולרית).

## 3. תפרי אינטגרציה עם סוכני W7 אחרים

| תפר | מצב | מה נדרש |
|---|---|---|
| W7-A — מפת תהליך TO-BE | החומר tm-2 מפנה ל-`/implementation` עם הערת תפר גלויה ("התרשים החי חלק ממסך תכנית ההטמעה") | כשמסך W7-A ממומש — אפשר לעדכן את ה-note ב-`content.ts` (בלוק routeRef של to-be-map) לניסוח סופי |
| W7-C — מצגת ההגשה | tm-9 מפנה ל-`/submission/presentation` עם הערת תפר | אין פעולה — ההפניה כבר לראוט הקנוני |
| W7-B — objections | ההנחיה קבעה: אם ה-export של W7-B לא בבסיס — W7-D מגדיר רשומות `objections` משלו (קנוני ממילא). ה-bridge שלי הוא create-if-missing לפי `key` (`obj-*`) — אם W7-B יוסיף רשומות עם keys אחרים אין התנגשות; אם יבחר באותם keys, גרסת התוכן (`contentVersion`) מכריעה | תיאום keys בלבד אם W7-B seeds רשומות משלו |

## 4. הערות תיאום

- ה-bridge של 13 החומרים (`ensureCanonicalMaterials`) אידמפוטנטי ורץ בטעינת
  `/training-materials`; הוא לעולם אינו מאשר חומר (סטטוסים כנים: טיוטה/ממתין
  לבדיקה) ואינו דורס סטטוס שנקבע בידי אדם (מאושר/דורש עדכון/בארכיון).
- אישור חומר נעשה דרך רשומות `Approval` קנוניות (`subjectRef:
  "trainingMaterial:tm-N"`, קידומת id `ap-`) — אותה זרימה כמו שאר המערכת.
- פעילויות נכתבות ל-`activities` עם `kind: "הדרכה"` ו-entityRef
  `trainingMaterial:<id>` — אין התנגשות קידומות.
- הסימולטור (`local-rules-lace`) הוא מנוע כללים עצמאי ואינו נוגע
  ב-`LocalRulesProvider` — אין שינוי ב-`src/ai/**`.
