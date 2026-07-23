# בקשות אינטגרציה — W8-D (בריאות המערכת + הגדרות)

הבקשות מיועדות ל-Integration Lead בלבד. W8-D לא נגע ב-router.tsx / main.tsx / vite.config.ts.

## 1. חיווט ראוטים (חובה לסגירת הגל)

ב-`src/app/router.tsx`, בתוך `MODULE_PAGES`, להוסיף:

```ts
"/system-health": lazy(() => import("@/modules/system-health/SystemHealthPage")),
"/settings": lazy(() => import("@/modules/settings/SettingsPage")),
```

שני הנתיבים כבר קיימים ב-`APP_ROUTES` (routes.ts) — אין שינוי בטבלת הראוטים. הכותרות תואמות: "בריאות המערכת", "הגדרות".

## 2. defines של מטא-נתוני build ב-vite.config.ts (מומלץ)

```ts
define: {
  "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.npm_package_version ?? ""),
  "import.meta.env.VITE_BUILD_COMMIT": JSON.stringify(process.env.VITE_BUILD_COMMIT ?? ""),
},
```

`collectBuildInformation()` (src/system-health/buildInfo.ts) כבר קורא את שניהם וידווח אותם אוטומטית; עד אז מדווח ביושר "לא סופק בזמן build".

## 3. החלת הגדרות ממשק בעליית האפליקציה (מומלץ)

ב-`src/main.tsx`, אחרי seedIfEmpty/מיגרציות:

```ts
import { applyUiSettings, productionSettingsStores, readSettingsRecord } from "@/modules/settings/settingsStore";
void readSettingsRecord(productionSettingsStores()).then((rec) => applyUiSettings(rec));
```

בלי זה, density מוחל רק אחרי ביקור בעמוד ההגדרות (מתועד ב-SETTINGS_REFERENCE.md).

## 4. אירועי בריאות בעמוד הממשל (ל-workstream הממשל)

/system-health כותב רשומות `HealthIncident` (zod: `healthIncidentSchema`, `source: "system-health"`, סטטוס פתוח/סגור) לאוסף `governanceIncidents`. מבוקש שעמוד /governance יציג רשומות אלה ויאפשר סגירה. עד אז הרשומות נשמרות ותקפות.

## 5. אכיפת מצב קריאה-בלבד בזמן הדגמה (רוחבי, קיים מ-W7-F)

הגדרת `demo.destructiveProtection` מפעילה את דגל `useDemoModeGuard`. מודולים שטרם קוראים לגארד ימשיכו לאפשר פעולות הרסניות — הרחבת האכיפה למודולים נוספים היא בקשת W7-F המקורית; W8-D אוכף בעצמו את הגארד על שינוי הגדרות ועל איפוס ההדגמה.

## 6. דגל reduced-motion גלובלי (עתידי)

`interface.reducedMotion` מוצג read-only עם סיבה. אם ה-Lead יוסיף מנגנון גלובלי (class על root שנצרך ב-styles/os), W8-D יהפוך את ההגדרה ל-editable ויחווט אותה.

## 7. צריכת business.quotationValidityDays במודול המכירות (עתידי)

הערך נשמר ומאומת; מודול המכירות מוזמן לקרוא אותו כברירת מחדל ל-validUntil של הצעה חדשה.
