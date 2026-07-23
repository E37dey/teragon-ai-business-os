# ADMINISTRATION MODEL — W8-C (Wave 8, Phases 8.0/8.7/8.8)

הכול **"ניהול הרשאות במצב הדגמה מקומי"** — כל רשומה נושאת את התווית, אין הצלחות מזויפות.

## 1. תשעת התפקידים הקנוניים

| roleId | שם | תמצית |
|--------|----|--------|
| `crole-sysadmin` | מנהל מערכת | approve על administration/governance/agents/automations; write ברוב התחומים; finance קריאה בלבד |
| `crole-ceo` | מנכ"ל | המאשר הבכיר: approve על finance/sales/governance/administration/knowledge/memory/agents/automations |
| `crole-bizmgr` | מנהל עסקי | approve sales+finance; ללא administration; ללא זיכרון מוגבל |
| `crole-sales` | מכירות | write crm+sales; **memory-restricted = none (R3)**; הנחות דורשות אישור של אחר |
| `crole-service` | שירות | write service; **finance לעולם לא approve (R4)** |
| `crole-instructor` | מדריך | write courses+knowledge |
| `crole-champion` | Champion | write knowledge+memory-general; **governance/administration ≤ read (R2)** |
| `crole-auditor` | מבקר | read בכל 13 התחומים, אפס כתיבה |
| `crole-viewer` | צופה | **לעולם לא write (R1)** — read בתחומים העסקיים בלבד |

תחומים (13): crm, sales, finance, courses, service, knowledge, memory-general, memory-restricted, agents, automations, analytics, governance, administration. רמות: none / read / write / approve.

מיפוי legacy→קנוני: מנכ"ל→ceo · מכירות→sales · מדריך→instructor · תמיכה→service · תלמיד→viewer · מנהל מערכת→sysadmin.

## 2. אכיפה קונסטרוקטיבית (לא רק UI)

- **כללי שילוב אסור R1–R4** נבדקים ב-3 שכבות: `roleGrantViolations()` (guards), `superRefine` בסכמת zod (רשומה פסולה לא נכתבת), ו-`prospectiveGrants` בשירות (בקשה פסולה לא נפתחת ולא מתבצעת).
- **ag-\* לעולם לא נושא תפקיד/מאשר**: type-level — `HumanUserId` (branded type שהבנאי היחיד שלו `toHumanUserId` זורק על ag-\* ועל כל id רשום ב-`AGENT_IDS`); runtime — refine בסכמות + בדיקות בשירות בכל נקודת החלטה.
- **אישור עצמי חסום**: בזמן הבקשה (approver ≠ requester, סכמה+שירות) ובזמן ההכרעה (decider ≠ requester); ההכרעה מותרת רק ל**מאשר בשם** שנקבע בבקשה.
- **אין grant-all שקט**: `assertNoGrantAll` — מטריצה עם write+ בכל 13 התחומים נדחית לכל תפקיד.
- **בדיוק 9**: `assertExactlyNineCanonicalRoles` (כולל גילוי כפולים) רץ אחרי כל גשר.

## 3. זרימת שינוי הרשאות (המנוע הקנוני)

`requestPermissionChange` → רשומת `AccessChangeRequestRecord` (preview מלא) + `ApprovalEngine.requestApproval` עם action `permission-change` (אחת מ-12 הפעולות הקנוניות של W5-C) → `approveChangeRequest` (decide+execute במנוע; ה-handler החיצוני מחיל את השינוי ומאמת שוב את הכללים) → **אימות בקריאה חוזרת** (verifiedAt רק אם הרמה בפועל = המבוקשת) → audit (`admin.permission.*`). דחייה = `rejectChangeRequest` — אפס מוטציה (נבדק).

## 4. בקרות חירום

| בקרה | מנגנון | היקף כן |
|------|--------|---------|
| השבתת סוכן בודד | עדכון `status: "מושבת"` ברשומת agents — מנגנון W5-D המקורי | נאכף מיידית |
| השבתת כל ה-AI המרוחק | דגל + רשומה | **מצב A — תצוגה בלבד** (אין ספק מרוחק פעיל) |
| השבתת ביצוע אוטומציות | דגל localStorage (`useEmergencyFlags`) | האכיפה במודול האוטומציות = בקשת חיווט בתור |
| נעילת שינויי הרשאות | דגל | נאכף מיידית בשירות (בקשות+הכרעות נדחות) |
| מצב קריאה בלבד | דגל | נאכף במודול הניהול; כלל-מערכתי = בקשת חיווט |

כל הפעלה: דיאלוג אישור + נימוק חובה + `EmergencyDisableRecord` + audit. ביטול חירום מותר גם במצב קריאה בלבד (זו מערכת החירום עצמה).

## 5. אחסון (רישום האוספים קפוא לגל)

- `accessChangeRequests` מארח את איחוד רשומות הניהול עם `recordKind`: `role-assignment` / `access-change-request` / `emergency-disable`.
- `accessReviews` — רשומות `AccessReviewRecord` בלבד.
- `roles` — רשומות `crole-*` (recordKind `canonical-role`) לצד 6 רשומות ה-legacy (שאף מודול אינו קורא — inventory §2).
- audit ניהולי = `auditEvents` עם prefix `admin.`.
- סשנים: **סינתטיים** — רשומת "הסשן הנוכחי" בלבד, מוצהרת ככזו. אוספים ייעודיים התבקשו ל-Wave 9 (`integration-requests-w8c.md`).

## 6. קבצים

`src/domain/administration/{types,roles,guards,schemas,index}.ts` · `src/repositories/{userStores,roleStores}.ts` · `src/administration/{service,emergencyFlags,index}.ts` · `src/modules/administration/{AdministrationPage.tsx,lib.ts,index.ts}` · `tests/administration/**` (63 בדיקות).
