# WAVE 8 — PERMISSION INVENTORY (Phase 8.0, W8-C)

תאריך: 23.07.2026 · נכתב מתוך בדיקה אמיתית של הקוד (grep + קריאת קבצים), לא מהנחות.

## 1. משתמשים קיימים (seed — `src/repositories/seed/seedData.ts`)

| id | שם | role (UserRoleKey) | סטטוס | הערות |
|----|-----|--------------------|--------|-------|
| `u-tzachi` | צחי זוסטייהם | מנכ"ל | פעיל | הזהות הקנונית (D-005, `src/app/identity.ts` → CANONICAL_USER) |
| `u-maya` | מאיה ברק | מכירות | פעיל | בעלת לידים/הזדמנויות בנתוני ההדגמה |
| `u-oren` | אורן שגב | מדריך | פעיל | בעל קורסים ומפגשים |
| `u-ran` | רן אלמוג | תמיכה | פעיל | בעל קריאות שירות |
| `u-noa` | נעה פרידמן | מנהל מערכת | פעיל | היחידה עם role "מנהל מערכת" |

`UserRoleKey` (`src/domain/types.ts:26`) = מנכ"ל | מכירות | מדריך | תמיכה | תלמיד | מנהל מערכת — **6 מפתחות, לא 9**. אין בו מנהל עסקי / Champion / מבקר / צופה / שירות (הקיים: "תמיכה").

## 2. רשומות תפקיד קיימות (`roles` collection, seed `role-1..role-6`)

6 רשומות `Role { key, label, description, permissions: string[] }` — ההרשאות הן **מחרוזות חופשיות** ("הכול", "לידים", "תצורה"), ללא מודל read/write/approve וללא אכיפה. **ממצא מרכזי: אף מודול אינו קורא את אוסף `roles` בזמן ריצה** (grep: הקוראים היחידים הם ה-seed עצמו ו-`prohibitedDomains` של הסוכנים שמפנים למפתח האוסף). לכן אפשר להוסיף לאוסף רשומות תפקיד קנוניות חדשות (`crole-*`) בלי לשבור אף קורא קיים.

## 3. שימוש בזהויות משתמש ברחבי המודולים (בעלות ומאשרים בפועל)

- **בעלות על רשומות**: `ownerId` על Customer / Lead / Opportunity / Quotation / ServiceTicket ועוד (src/domain/types.ts שורות 187/201/227/363/388/428/621/725) — מפנה ל-ids של 5 המשתמשים. `assigneeId` על Task.
- **פעילות אחרונה**: `Activity.actorId` (types.ts:414) — המקור האמיתי היחיד ל"פעילות אחרונה" של משתמש; W8-C נגזר ממנו.
- **מאשרים בפועל**: `Approval.requestedById` / `decidedById` הם **string חופשי**. בקוד קיים המאשר תמיד מוזרק כ-`"u-tzachi"` או מזהות CANONICAL_USER (`src/components/approval/ApprovalPanel.tsx`, `src/modules/automations/AutomationsPage.tsx`, `src/memory/core/proposalWorkflow.ts`, `src/knowledge/governance.ts`, `src/learning/loop.ts`).
- **שמות מאשרים בשם**: memory (`decidedByName`), knowledge, learning — כולם שומרים שם מאשר מפורש (עקרון "אישור אנושי בשם").

## 4. בדיקות RBAC-דמויות שקיימות היום

| מנגנון | מיקום | מה הוא אוכף |
|--------|-------|--------------|
| `canAgent()` deny-by-default | `src/agents/definitions.ts:284` | ההרשאה **היחידה** הנאכפת בקוד — פעולות/דומיינים של 7 סוכני ה-AI (הגדרות קפואות deep-freeze). `users`+`roles` ב-`prohibitedDomains` של **כל** 7 הסוכנים. |
| `APPROVAL_REQUIRED_ACTIONS` (12) | `src/domain/agents/types.ts:64` | `permission-change` כבר רשום כפעולה המחייבת אישור — W8-C משתמש בו כלשונו. |
| ApprovalEngine | `src/agents/approvalEngine.ts` | אין ביצוע ללא אישור (AGENT_EXECUTION_WITHOUT_APPROVAL). **פער: אין בדיקת אישור-עצמי ואין חסימת סוכן-AI כמאשר ברמת המנוע** — `decidedById` חופשי. W8-C סוגר את הפער בשכבת ה-Administration (לא נוגע במנוע הקפוא). |
| Demo-mode guard | `src/presentation/demoMode.ts` (`useDemoModeGuard`) | חוסם פעולות הרסניות בזמן מצב הדגמה לבוחן — W8-C מכבד אותו בעמוד. |
| Mode-A (AI מרוחק כבוי) | `src/ai/providers/registry.ts` (`remoteEnabled:false`) | "השבתת AI מרוחק" היא כיום **מצב תצוגה בלבד** — אין ספק מרוחק פעיל להשבית. |

## 5. פערים ש-W8-C סוגר

1. אין מודל הרשאות טיפוסי (read/write/approve) — רק מחרוזות חופשיות ב-`Role.permissions`.
2. אין 9 תפקידים קנוניים — קיימים 6 מפתחות legacy; חסרים מנהל עסקי, Champion, מבקר, צופה.
3. אין חסימת אישור-עצמי ואין חסימת `ag-*` כמאשר/נושא-תפקיד.
4. אין רשומות סקירת גישה / בקשות שינוי (`accessReviews` / `accessChangeRequests` קיימים כאוספים ריקים, IDB v6, ללא טיפוסים).
5. אין מסך `/administration` (placeholder בלבד) ואין מצבי חירום מערכתיים (מעבר להשבתת סוכן בודד ב-W5-D `AgentsPage.toggleDisable`).

## 6. מגבלות ידועות שהמודל החדש מכבד

- אוסף הרשומות (`collections.ts`) קפוא לגל — רשומות הניהול החדשות מתאכסנות באוספים הקיימים `accessChangeRequests` (עם שדה `recordKind` מפלה) + `accessReviews` + `roles` (רשומות `crole-*` לצד ה-legacy). בקשה לאוספים ייעודיים נרשמה ב-`docs/integration-requests-w8c.md`.
- `router.tsx` אסור לסוכנים — חיווט `/administration` → העמוד נרשם כבקשת אינטגרציה.
- `EntityStatus` אינו כולל "מושהה" — השעיית משתמש ממומשת כ-`status: "לא פעיל"` + רשומת audit, ומוצגת "מושהה" בעמוד.
