# FINAL RBAC MATRIX — W9-B (Phase 9.4)

> **חוזה כנות:** זוהי **סימולציית הרשאות במצב הדגמה** — אין מנגנון אימות (authentication) אמיתי.
> "התפקיד הנוכחי" הוא הגדרת הדגמה (sessionStorage) שהבוחן יכול להחליף. אף מסך אינו כותב
> "Authentication פעיל". כל מסך חסום אומר במפורש `סימולציית הרשאות במצב הדגמה`.

מקור: `src/authorization/**`. המטריצה **נגזרת** מ-`CANONICAL_ROLE_BASELINES` (W8-C) — אין
מטריצה שנייה מתוחזקת ביד שיכולה לסטות. תפקיד מחזיק הרשאה ⇔ ה-grant שלו על התחום של ההרשאה
עומד ברמה הנדרשת (`approve ⊃ write ⊃ read`, `GRANT_RANK`).

## 24 ההרשאות → (תחום W8-C, רמת grant נדרשת)

| # | הרשאה | תחום | רמה |
|---|---|---|---|
| 1 | `customer.read` | crm | read |
| 2 | `customer.create` | crm | write |
| 3 | `customer.update` | crm | write |
| 4 | `sales.read` | sales | read |
| 5 | `quotation.create` | sales | write |
| 6 | `quotation.approve` | sales | approve |
| 7 | `discount.approve` | finance | approve |
| 8 | `service.read` | service | read |
| 9 | `service.update` | service | write |
| 10 | `service.close` | service | write |
| 11 | `course.manage` | courses | write |
| 12 | `knowledge.review` | knowledge | write |
| 13 | `memory.approve` | memory-general | approve |
| 14 | `learning.approve` | governance | approve |
| 15 | `agent.disable` | agents | approve |
| 16 | `automation.approve` | automations | approve |
| 17 | `governance.review` | governance | read |
| 18 | `policy.approve` | governance | approve |
| 19 | `audit.read` | administration | read |
| 20 | `user.manage` | administration | write |
| 21 | `permission.approve` | administration | approve |
| 22 | `settings.update` | administration | write |
| 23 | `health.diagnostics` | administration | read |
| 24 | `submission.approve` | governance | approve |

## הגריד המלא — 9 תפקידים × 24 הרשאות

עמודות: `SА`=מנהל מערכת · `CEO`=מנכ"ל · `BM`=מנהל עסקי · `SL`=מכירות · `SV`=שירות ·
`IN`=מדריך · `CH`=Champion · `AU`=מבקר · `VW`=צופה.

| הרשאה | SА | CEO | BM | SL | SV | IN | CH | AU | VW |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| customer.read | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| customer.create | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · |
| customer.update | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · |
| sales.read | ✓ | ✓ | ✓ | ✓ | · | · | ✓ | ✓ | ✓ |
| quotation.create | ✓ | ✓ | ✓ | ✓ | · | · | · | · | · |
| quotation.approve | · | ✓ | ✓ | · | · | · | · | · | · |
| discount.approve | · | ✓ | ✓ | · | · | · | · | · | · |
| service.read | ✓ | ✓ | ✓ | ✓ | ✓ | · | ✓ | ✓ | ✓ |
| service.update | ✓ | · | · | · | ✓ | · | · | · | · |
| service.close | ✓ | · | · | · | ✓ | · | · | · | · |
| course.manage | ✓ | · | · | · | · | ✓ | · | · | · |
| knowledge.review | ✓ | ✓ | ✓ | · | · | ✓ | ✓ | · | · |
| memory.approve | · | ✓ | · | · | · | · | · | · | · |
| learning.approve | ✓ | ✓ | · | · | · | · | · | · | · |
| agent.disable | ✓ | ✓ | · | · | · | · | · | · | · |
| automation.approve | ✓ | ✓ | · | · | · | · | · | · | · |
| governance.review | ✓ | ✓ | ✓ | · | · | · | ✓ | ✓ | · |
| policy.approve | ✓ | ✓ | · | · | · | · | · | · | · |
| audit.read | ✓ | ✓ | · | · | · | · | · | ✓ | · |
| user.manage | ✓ | ✓ | · | · | · | · | · | · | · |
| permission.approve | ✓ | ✓ | · | · | · | · | · | · | · |
| settings.update | ✓ | ✓ | · | · | · | · | · | · | · |
| health.diagnostics | ✓ | ✓ | · | · | · | · | · | ✓ | · |
| submission.approve | ✓ | ✓ | · | · | · | · | · | · | · |
| **סה"כ** | **21** | **21** | **10** | **6** | **4** | **3** | **5** | **6** | **3** |

### הפרדות עסקיות כנות שנובעות מהגזירה

- **מנהל מערכת אינו מאשר עסקים:** אין לו `quotation.approve` / `discount.approve` / `memory.approve`
  (grant שלו: sales=write, finance=read, memory=write). מנהל המערכת מנהל את המערכת, לא את העסק.
- **מכירות יוצר אך אינו מאשר:** `quotation.create` ✓, `quotation.approve`/`discount.approve` ✗.
- **שירות לעולם אינו מאשר הנחות** (כלל R4) — אין `discount.approve`.
- **צופה לעולם אינו כותב** (כלל R1) — 3 הרשאות קריאה בלבד.
- **Champion לעולם אינו עורך מדיניות** (כלל R2) — `governance.review` (קריאה) כן, `policy.approve` לא.
- **אישור הנחה/הצעה** = מנכ"ל + מנהל עסקי בלבד. **ניהול משתמשים/הרשאות** = מנהל מערכת + מנכ"ל בלבד.

## ארבע שכבות האכיפה

| שכבה | פרימיטיב | קובץ | מצב |
|---|---|---|---|
| (a) גישת מסלול | `routeGuard(route, role)` · `<RequirePermission>` · `useCurrentRole()` | `routeGuard.ts`, `react.tsx`, `roleStore.ts` | **מסופק + בדוק**; חיווט ל-`router.tsx`/`OsShell` **מבוקש** (מודול משותף) |
| (b) פעולת UI | `usePermission(perm)` → `{allowed, reasonHe}` | `usePermission.ts` | **מסופק + בדוק**; אימוץ במסכים = seam |
| (c) מוטציית מאגר | `guardedMutation(perm, role, fn)` (זורק `AUTHZ_DENIED`) | `guardedMutation.ts` | **מסופק + בדוק**; אימוץ ברפוזיטוריז **מבוקש** |
| (d) פעולת Netlify Function | `authorizeFunctionOperation(ctx)` (fail-closed) | `src/security/functionAuthz.ts` | **מסופק + בדוק** (הדגמה, לא auth) |

### ערבויות (מכוסות בבדיקות `tests/rbac/**`)

- **ניווט URL אינו עוקף:** `routeGuard` הוא הסמכות — אותה תשובה בין אם הגיעו מ-nav או מ-URL מוקלד;
  מסלול לא-מוכר נחסם (fail-closed).
- **אישור עצמי חסום** + **ag-\* לעולם אינו מאשר** — **שימוש חוזר** ב-W8-C (`assertHumanApprover`,
  `toHumanUserId` המבוסס על brand `HumanUserId`). `tests/rbac/approverGuards.rbac.test.ts`.
- **החלפת תפקיד הדגמה אינה מסלימה בשקט:** אין grants במטמון — כל שכבה קוראת את התפקיד החי
  ומעריכה מחדש. `tests/rbac/roleSwitch.rbac.test.tsx`.
- **גבול הארגון בחוזה:** `AuthzContext` נושא `orgId` (הדגמה חד-ארגונית; השדה קיים לבדיקה
  רב-דיירת אמיתית).

## מה מחווט מול seam-pending

| שכבה | מחווט היום | ממתין לאימוץ (בקשה: `integration-requests-w9b.md`) |
|---|---|---|
| (a) | פרימיטיבים + בדיקות מלאות | `<RequirePermission>` סביב מסלולי `/administration`, `/governance`, `/settings`, `/system-health` ב-`OsShell`/`router.tsx` |
| (b) | הוק + בדיקות | אימוץ ב-כפתורי פעולה (אישור הנחה/הצעה, ניהול משתמש) |
| (c) | wrapper + בדיקות | אימוץ במוטציות של administration/sales/service/settings |
| (d) | boundary + בדיקות | חיווט ב-`src/server/handlers.ts` (מיפוי operation→permission) |
