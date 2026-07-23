# Integration Requests — W9-B (RBAC & Security Enforcement)

W9-B מספק את הפרימיטיבים (`src/authorization/**`, `src/security/**`) עם בדיקות מלאות, אך **אינו עורך
מודולים משותפים** (`src/modules/**`, `src/app/router.tsx`, `src/analytics/**`, `src/server/handlers.ts`).
להלן בקשות חיווט מדויקות. כל אחת אופציונלית ובטוחה — ללא אימוץ, המערכת מתנהגת בדיוק כמו היום.

---

## בקשה 1 — חיווט route-guard (LAYER a) · בעלים: Integration Lead / W9-A shell

לעטוף את המסלולים הרגישים ב-`<RequirePermission>`. **המקום הנכון** הוא ב-`routeElement()` שב-
`src/app/router.tsx`, כדי שאף מסלול (nav / URL מוקלד / deep-link) לא יעקוף. snippet מדויק:

```tsx
// src/app/router.tsx
import { RequirePermission } from "@/authorization";
import { routePermission } from "@/authorization";

function routeElement(path: string, title: string, wave: number) {
  const Page = MODULE_PAGES[path];
  if (!Page) return <RoutedPlaceholder title={title} wave={wave} />;
  const perm = routePermission(path); // null ⇒ מסך פתוח לכל תפקיד
  const page = (
    <Suspense fallback={<div className="os-route-loading" aria-busy="true" />}>
      <Page />
    </Suspense>
  );
  return perm ? <RequirePermission permission={perm}>{page}</RequirePermission> : page;
}
```

מסלולים חסומים כברירת מחדל (מ-`ROUTE_PERMISSIONS`): `/crm`,`/customers`,`/customers/:id`,
`/organizations` (`customer.read`) · `/sales`,`/documents` (`sales.read`) · `/service`,`/printers`
(`service.read`) · `/governance` (`governance.review`) · `/administration` (`user.manage`) ·
`/settings` (`settings.update`) · `/system-health` (`health.diagnostics`). כל השאר `null` = פתוח.

**בורר תפקיד להדגמה** (אופציונלי, לבוחן) — להוסיף ל-`OsShell` בורר שקורא ל-`setCurrentRole()`
מ-`@/authorization`; הכל יעריך מחדש מיידית (אין מטמון).

---

## בקשה 2 — אימוץ `csvSafeCell` ב-exporter (FINDING #1) · בעלים: W8-A

**זו החשיפה האמיתית מדוח האבטחה.** ב-`src/analytics/csv.ts`, להעביר כל תא דרך `csvSafeCell`
**לפני** ה-escaping המבני (`esc`). snippet מדויק:

```ts
// src/analytics/csv.ts
import { csvSafeCell } from "@/security";

function row(cells: readonly (string | number | null)[]): string {
  return cells
    .map((c) => {
      const safe = csvSafeCell(c);            // ← נטרול נוסחה (= + - @) קודם
      return safe === null ? "" : esc(String(safe)); // ← ואז escaping מבני
    })
    .join(",");
}
```

`csvSafeCell` משאיר מספרים/מחרוזות רגילות/`null`/מחרוזת ריקה ללא שינוי — תא ריק **נשאר ריק**
(לעולם לא הופך ל-`0` או ל-`'`). בדיקה שמוכיחה באג→תיקון: `tests/security-final/csvInjection.security.test.ts`.

> עד האימוץ הדוח משאיר את הפריט כ-FINDING מתועד — אין טענה שה-exporter תוקן.

---

## בקשה 3 — אימוץ `guardedMutation` ברפוזיטוריז (LAYER c) · בעלים: מודולים

seam לעטיפת מוטציות מאשרות-פעולה. רשימת אימוץ מומלצת (permission → מוטציה):

| permission | מוטציה לעטוף | מודול |
|---|---|---|
| `user.manage` | יצירה/עדכון/השעיה של משתמש | administration |
| `permission.approve` | הכרעת `AccessChangeRequest` | administration |
| `settings.update` | `setSetting()` (רגישות/אישור) | settings |
| `discount.approve` | אישור הנחה | sales |
| `quotation.approve` | אישור הצעת מחיר | sales |
| `service.close` | סגירת קריאת שירות | service |
| `agent.disable` | השבתת סוכן (emergency) | administration/agents |

snippet:

```ts
import { guardedMutation } from "@/authorization";
import { getCurrentRole } from "@/authorization";

await guardedMutation("settings.update", getCurrentRole(), () => setSetting(stores, key, value, actor));
// תפקיד לא-מורשה ⇒ נזרק AUTHZ_DENIED לפני שהמוטציה רצה (אין מוטציה חלקית).
```

---

## בקשה 4 — חיווט `authorizeFunctionOperation` בשרת (LAYER d) · בעלים: W5-B / server

ב-`src/server/handlers.ts`, אחרי אימות ה-shape (`demoAuthVerifier`), למפות operation→permission
ולדחות `ok:false`:

```ts
import { authorizeFunctionOperation } from "@/security";

const authz = authorizeFunctionOperation({
  role: ctx.userRoleClaim,   // טענת role מהבקשה (לא מאומתת — הדגמה)
  orgId: auth.organizationId,
  operation: mappedPermission, // מיפוי ה-endpoint להרשאה קנונית
});
if (!authz.ok) {
  throw new ServerAIError("AI_PERMISSION_DENIED", { detail: authz.detailHe });
}
```

זו **הדגמה, לא auth** — `trusted:false` תמיד; הבדיקה דוחה טענות פגומות ופעולות חורגות (fail-closed),
אך אינה טוענת זהות מאומתת. בהחלפה ל-verifier אמיתי (JWT חתום) הבדיקה רצה על טענות מהימנות ללא שינוי.
