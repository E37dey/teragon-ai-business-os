# INTEGRATION REQUESTS — W7-B (פרסונות ומסלולי הדרכה)

בקשות ל-Integration Lead בלבד — W7-B לא נגע באף קובץ משותף.

## 1. חיווט ראוט /personas (src/app/router.tsx — קובץ Lead)

להוסיף ל-`MODULE_PAGES`:

```ts
"/personas": lazy(() => import("@/modules/personas/PersonasPage")),
```

הראוט כבר קיים ב-`src/app/routes.ts` (wave 7, inNav) — נדרש רק החיווט. `PersonasPage` הוא default export לפי PAGE_CONTRACT ומרנדר `PageRail` משלו ("מבקר הפרסונות").

## 2. נתיב צריכת ההתנגדויות עבור W7-D (FAQ)

W7-D צורך את נתוני ההתנגדויות מ:

```ts
import { PERSONA_OBJECTIONS, objectionsOf, type PersonaObjection } from "@/domain/personas";
```

9 רשומות LACE מלאות (quote/listen/acknowledge/clarify/explore/sourceNote) עם `personaId` + `personaName` קנוני. אין תלות ב-UI של W7-B.

## 3. רכיב המטריצה עבור W7-E/F

```ts
import { TrainingMatrix } from "@/modules/training-matrix";
```

Props: `personas` (מ-`bridgePersonas(seedPersonas)`), `materials` (אוסף trainingMaterials), אופציונלית `onMaterialClick`/`onPersonaClick`/`maxHeight`.

## 4. תיעוד החלטת C1 (מיגרציית טקסונומיה)

בוצע לפי החלטת ה-Lead: סט האימוץ קנוני; רשומות ה-seed per-1..per-7 נשמרו במזהים ומופו 1:1 לפי סדר; השם הישן נשמר ב-`legacyName`; אין ערבוב טקסונומיות. פירוט מלא: `docs/TRAINING_MATRIX.md` + `SEED_BRIDGE_NOTES` ב-`src/domain/personas/canonical.ts`. **שימו לב:** רשומות ה-seed עצמן (seedData.ts — קובץ Lead) עדיין נושאות את השמות הישנים; הגשר מחליף אותם בזמן קריאה. אם ה-Lead יעדכן בעתיד את ה-seed לשמות הקנוניים — הגשר ימשיך לעבוד (legacyName יעקוב אחרי ה-seed החי) ואף בדיקה לא תישבר פרט ל-`bridge.test.ts` שמוודא ששם קנוני ≠ שם seed (יידרש עדכון מודע של הבדיקה — מצוין כאן מראש).

## 5. תלות ב-timestamp של ה-seed (לתשומת לב בלבד)

`MATERIAL_EXPECTED_UPDATED_AT` מצלם את `updatedAt` של 13 חומרי ההדרכה (נגזר מ-`dt()` של ה-seed). אם ה-Lead ישנה את ה-offsets של tm-1..tm-13 ב-seedData, מבקר הפרסונות יציג "אי-התאמת גרסת חומר" — התנהגות מכוונת (חומר שהשתנה אחרי אישור גרסת פרסונה מחייב סקירה), אבל שינוי seed גורף ידרוש עדכון הטבלה ב-canonical.ts.
