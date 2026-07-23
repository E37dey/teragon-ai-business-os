# FINAL FEATURE MATRIX — TERAGON AI BUSINESS OS (teragon-os-demo-v1.0.0)

Phase 9 · Release gate · בעלות W9-E (docs-only)

מקור אמת יחיד למסלולים: `src/app/routes.ts` (`APP_ROUTES`). מטריצת ההרשאות: 9 התפקידים
הקנוניים ב-`src/domain/administration/roles.ts` + 13 תחומי ההרשאה
(`PERMISSION_DOMAINS`). כל שורה למטה משקפת מצב אמת שנקרא מהקוד — לא הצהרה שיווקית.

> **הבהרה קנונית:** זוהי "סביבת הדגמה מקומית-בדפדפן עם נתונים סינתטיים" · Mode A
> (`AI_REMOTE_ENABLED=false`). זהות: **טרגון טכנולוגיות** · מנכ"ל **צחי זוסטייהם**
> (`u-tzachi`) · ברכת הפתיחה "**ערב טוב, צחי**". אין נתונים אמיתיים, אין ספק AI מרוחק
> פעיל, אין אימות אמיתי.

---

## חלק א' — 31 המסלולים המבצעיים

כל 31 הרשומות ב-`APP_ROUTES` מבצעיות — **אפס placeholders** (FINAL_BASELINE.md, BUILD_STATUS Wave 8).
עמודת ההרשאה ממפה למודל 9-התפקידים; **אכיפת RBAC חוצת-מודולים אינה פעילה עדיין** (Wave 9/10 —
ראו FINAL_KNOWN_LIMITATIONS §12), כך שההרשאה כאן היא ה*תחום* הרלוונטי ולא שער נאכף בכל מסך.

מצבים נתמכים: L=טעינה · E=ריק · X=שגיאה · O=אופליין (cache חם של React Query) · P=הדפסה.

| # | מסלול | כותרת עברית | מודול | גל | תחום הרשאה | תהליך עיקרי | פעולות עיקריות | תלות ריפו | מצבים | כיסוי בדיקות |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | `/` | מרכז הפיקוד | command-center | 3 | crm+analytics (read) | תמונת מצב יומית "מה לעשות היום" | ניווט לפריט, יצירה מהירה | leads, quotations, serviceTickets, enrollments, activities, notifications | L E X O | selectors + e2e |
| 2 | `/crm` | ניהול לקוחות ולידים (CRM) | crm | 3 | crm | ניהול לידים ולקוחות בצנרת | סינון, מעבר לכרטיס, יצירת ליד | leads, customers, activities | L E X O | unit + e2e |
| 3 | `/customers` | לקוחות | crm | 3 | crm | רשימת לקוחות | חיפוש, פתיחת כרטיס | customers | L E X O | unit + e2e |
| 4 | `/customers/:id` | כרטיס לקוח (360) | crm | 3 | crm | תצוגת 360 של לקוח (inNav=false, נגיש מ-CRM/URL) | ציר זמן, מסמכים, קריאות | customers, quotations, serviceTickets, activities, enrollments | L E X O | unit + e2e |
| 5 | `/sales` | מכירות והצעות מחיר | sales | 3 | sales | צנרת מכירות + הצעות | יצירת הצעה, קידום שלב | quotations, opportunities, leads | L E X O | unit + e2e |
| 6 | `/courses` | קורסים ולמידה | courses | 4 | courses | ניהול קורסים והרשמות | הרשמה, מעקב השלמה | courses, enrollments, students | L E X O | unit + e2e |
| 7 | `/service` | שירות ותיקונים | service | 4 | service | קריאות שירות ו-SLA | פתיחת קריאה, שיוך | serviceTickets, printerModels, customers | L E X O | unit + e2e |
| 8 | `/printers` | מדפסות ודגמים | printers | 4 | service/crm (read) | קטלוג דגמי מדפסות | עיון, קישור לקריאה | printerModels, serviceTickets | L E X O | unit + e2e |
| 9 | `/organizations` | ארגונים | organizations | 4 | crm | ניהול ארגונים ואנשי קשר | פתיחת ארגון, חברות | organizations, customers | L E X O | unit + e2e |
| 10 | `/tasks` | משימות ופגישות | tasks | 4 | crm (general) | לוח משימות ופגישות | יצירה, סטטוס, שיוך | tasks, meetings, activities | L E X O | unit + e2e |
| 11 | `/documents` | מסמכים והצעות מחיר | documents | 3 | sales | מרכז מסמכים + תצוגת הדפסה | תצוגת הדפסה, גרסאות | quotations, documents | L E X O **P** | unit + e2e |
| 12 | `/automations` | אוטומציות | automations | 5 | automations | חוקי אוטומציה (טיוטה/הדגמה) | הפעלה/השבתה, תצוגת ריצה | automations, activities | L E X O | unit + e2e |
| 13 | `/agents` | סוכני AI | agents | 5 | agents | 7 סוכני המוצר + מרכז אישורים | תצוגת המלצה, מעטפת אישור | agents, approvals, aiRuns | L E X O | unit + e2e |
| 14 | `/agents/collaboration` | חדר התיאום של הסוכנים | agents | 5 | agents | trace שיתוף פעולה + קונפליקטים | צפייה ב-handoffs, הכרעה | agentTasks, agentMessages, handoffs, approvals | L E X O | unit + e2e |
| 15 | `/memory` | זיכרון ארגוני · Obsidian | memory | 6 | memory-general / memory-restricted | זיכרון עם [[wikilinks]] + ייבוא/ייצוא Obsidian | ייבוא, תצוגת גרסאות, אישור הצעה | memoryRecords, memoryProposals, approvals | L E X O | unit + e2e |
| 16 | `/knowledge` | מאגר ידע | knowledge | 6 | knowledge | ידע מאושר + זיהוי סתירות | פתיחת מאמר, פאנל קונפליקט | knowledgeArticles, knowledgeProposals | L E X O | unit + e2e |
| 17 | `/learning` | מרכז למידה ושיפור | learning | 6 | governance/knowledge | הצעות למידה ממושלות + rollback | בחירת הצעה, היסטוריית כלל | learningProposals, learningRules, approvals | L E X O | unit + e2e |
| 18 | `/analytics` | דוחות וניתוחים | analytics | 4/8 | analytics | 3 רמות מדידה + דוחות | תצוגת דוח, הדפסה | metricDefinitions, metricObservations, +מקורות מחושבים | L E X O **P** | unit + e2e |
| 19 | `/governance` | ממשל ובקרת AI | governance | 4/8 | governance | מטריצת הרשאות סוכנים + גבולות אדם-AI | תצוגת מדיניות, יומן ביקורת | (נגזר מ-AGENT_DEFINITIONS) auditEvents, policies | L E X O | unit + e2e |
| 20 | `/implementation` | תכנית ההטמעה | implementation | 7 | governance/administration (read) | 6 שלבי הטמעה + AS-IS/TO-BE | תצוגת שלב, בעלים | implementationProgrammes | L E X O **P** | unit + e2e |
| 21 | `/personas` | פרסונות ומסלולי הדרכה | personas | 7 | courses/knowledge | 7 פרסונות + Training Matrix | תצוגת פרסונה, מטריצה | personas, trainingMaterials | L E X O **P** | unit + e2e |
| 22 | `/stage-gates` | Stage Gates · שערי מעבר וראיות | stage-gates | 7 | governance | 6 שערים G1–G6 + ולידציה | תצוגת שער, ראיות | stageGates (validateAll) | L E X O **P** | unit + e2e |
| 23 | `/training-materials` | מרכז חומרי ההדרכה | training-materials | 7 | courses/knowledge | 13 חומרי הדרכה + תסריטים | פתיחת חומר, תצוגת הדפסה | trainingMaterials | L E X O **P** | unit + e2e |
| 24 | `/quick-start` | התחלה מהירה ושימוש נכון | quick-start | 7 | courses/knowledge | 3 פעולות + נוהל מותר/חובה/אסור | הדגמה סכמטית, בדיקת נוהל | trainingMaterials (tm-3, tm-4) | L E X O **P** | unit + e2e |
| 25 | `/faq` | FAQ והתנגדויות | faq | 7 | knowledge | התנגדויות עם תהליך LACE | פתיחת התנגדות, LACE | objections, trainingMaterials (tm-6) | L E X O **P** | unit + e2e |
| 26 | `/support` | תמיכה לאחר ההשקה | support | 4/7 | service | 3 שכבות תמיכה + SLA יעד/מדוד | פתיחת פנייה, SLA | supportRequests, trainingMaterials (tm-12) | L E X O **P** | unit + e2e |
| 27 | `/administration` | ניהול המערכת | administration | 4/8 | administration | 9 תפקידים + בקשות שינוי הרשאה + חירום | preview→approve→execute, בקרות חירום | roles, roleAssignments, accessChangeRequests, accessReviews, emergencyDisables | L E X O | unit + e2e |
| 28 | `/system-health` | בריאות המערכת | system-health | 9 | administration/governance | בריאות ai-health + build info + מדדי מערכת | תצוגת בריאות, רענון | (נגזר: ai-health, buildInfo, ai_fallbacks) | L E X O | unit + e2e |
| 29 | `/settings` | הגדרות | settings | 9 | administration | העדפות + מצב הדגמה + זהות | שינוי העדפה, איפוס דמו | settings store (localStorage) | L E X O | unit + e2e |
| 30 | `/submission` | מרכז ההגשה והראיות | submission | 7 | governance/administration | 12 תוצרים + מטריצת איכות 12×8 + מדדים | תצוגת תוצר, שמירת בדיקה, צילום מצב, אישור | submissionPackages, submissionDeliverables, qualityValidations, submissionSnapshots, approvals | L E X O **P** | 60 בדיקות submission + e2e |
| 31 | `/submission/presentation` | מצגת ההגשה | presentation | 7 | governance | 5 מקטעים × 120 שנ' = 10 דק' + "מצב הדגמה לבוחן" (11 צעדים) | ניווט שקפים, הפעלת מצב בוחן, איפוס | presentationSections, presenterNotes, demoSteps | L E X O **P** | unit + e2e |

**אישור ספירה:** 31 רשומות ב-`APP_ROUTES` (נספרו ידנית מ-`src/app/routes.ts`, שורות 18–108).
מזה 30 ב-`inNav` + `/customers/:id` (inNav=false, כרטיס פרטים). `/submission/presentation`
היא רשומת מסלול עצמאית ברמה העליונה (path נפרד, לא nested layout) לצד `/submission`.

---

## חלק ב' — מטריצת יכולות (מצב אמת כן)

### 12 תוצרי ההגשה (`REGISTRY_DELIVERABLE_KEYS`)

מצב התחלתי כן: **0/12 "מלא"** — "מלא" נגזר בלבד (תוכן + בעלים בשם + אישור תקף + ראיות
נפתרות + אין כשל איכות + נתיב קיים + הדפסה). אין רשומות אישור ⇒ הרוב "ממתין לבדיקה" / "חלקי".

| # | key | תוצר | מסלול | בעלים בשם | מצב התחלתי | חוסם עיקרי |
|---|---|---|---|---|---|---|
| 1 | one-pager | One-Pager לפתרון | /submission | u-tzachi (צחי זוסטייהם) | ממתין לבדיקה | אין אישור |
| 2 | personas-map | מפת 7 פרסונות | /personas | u-oren (אורן שגב) | ממתין לבדיקה | אין אישור |
| 3 | training-matrix | Training Matrix | /personas | u-oren | ממתין לבדיקה | אין אישור |
| 4 | implementation-plan | תכנית הטמעה 6 שלבים + Owners | /implementation | u-noa (נעה פרידמן) | חסר עד bootstrap | אין רשומת תכנית / אישור |
| 5 | stage-gates | Stage Gates + ראיות | /stage-gates | u-noa | חסר עד validateAll | ולידציה טרם רצה / אישור |
| 6 | metric-levels | מדדי הצלחה — 3 רמות | /analytics | u-tzachi | ממתין לבדיקה | אין אישור |
| 7 | quick-start | Quick Start | /quick-start | u-oren | ממתין לבדיקה | אין אישור |
| 8 | correct-use-policy | נוהל שימוש נכון | /quick-start | u-noa | ממתין לבדיקה | אין אישור |
| 9 | faq-lace | FAQ + התנגדויות (LACE) | /faq | u-ran (רן אלמוג) | חלקי/ממתין | objections bootstrap + אישור |
| 10 | training-script | תסריט הדרכה 10 דק׳ | /training-materials | u-oren | ממתין לבדיקה | אין אישור |
| 11 | microlearning | רעיון לסרטון Microlearning (לא וידאו מופק) | /training-materials | u-oren | ממתין לבדיקה | אין אישור |
| 12 | support-plan | תכנית תמיכה Tier-3 | /support | u-ran | ממתין לבדיקה | אין אישור |

> פירוט מלא של כל תוצר (חוסם/מאשר נדרש/ראיות/פעולת אישור) — ראו **HUMAN_APPROVAL_RUNBOOK.md**.

### 7 הפרסונות · 6 השלבים · 6 השערים · 13 החומרים · 5 מקטעי המצגת · 3 רמות המדד

שומרי ספירה קנוניים ב-`contentRegistry.ts` (`EXPECTED_COUNTS = 7/13/6/6/12/5`); כל סטייה
מפילה בדיקה.

| קבוצה | ספירה | מצב אמת |
|---|---|---|
| פרסונות (`REGISTRY_PERSONA_NAMES`) | 7 | משתמש קצה · מנהל צוות · הנהלה · IT/אבטחה · Legal/Compliance · Champion · המתנגד — כולן ב-seed, מונה 7/7 חי ב-/personas |
| שלבי הטמעה (`REGISTRY_STAGE_NAMES`) | 6 | בעיה ותוצאה → AS-IS/TO-BE → 7 פרסונות → פיילוט מבוקר → הרחבה בגלים → שגרה ושיפור. תלוי bootstrap ל-implementationProgrammes |
| שערים (`REGISTRY_GATE_KEYS`) | 6 | G1–G6, ולידציה דטרמיניסטית דרך validateAll(). G1 "חסרות ראיות" עד אישור One-Pager; **G4 חסום** עד PilotResult אמיתי (אין פיילוט שרץ) |
| חומרי הדרכה (`REGISTRY_MATERIAL_KEYS`) | 13 | tm-1…tm-13 ב-seed; מגושרים ל-V2 |
| מקטעי מצגת (`PRESENTATION_SECTION_TITLES`) | 5 | הבעיה והקהל · 7 פרסונות · הטמעה+Gates · Quick Start/Microlearning · מדדים+סיכון. 5×120שנ'=600שנ'. `actualRehearsalSeconds=null` ⇒ "טרם נמדד" |
| רמות מדידה (`METRIC_GROUP_TITLES`) | 3 (22 מדדים) | רמה A הדרכה (5) · רמה B אימוץ (8) · רמה C עסקי (9). baseline=null בכל 22 ⇒ "לא הוגדר קו בסיס"; מחושב/יעד פיילוט/מבני מופרדים |

### 7 סוכני המוצר (`AGENT_DEFINITIONS`, קפואים/deep-frozen)

| id | שם | codeName | סמכות |
|---|---|---|---|
| ag-orchestrator | מנהל התזמור | Teragon Orchestrator | תיאום; קריאה/טיוטה, אישור לכל פעולה רגישה |
| ag-hunter | סוכן מכירות | Hunter | טיוטת הצעות/מעקב ליד — אישור לכל שליחה |
| ag-fixer | סוכן שירות | Fixer | סיווג/טיוטת פתרון קריאה — אין אישור הנחות |
| ag-mentor | סוכן הדרכה | Mentor | המלצות למידה/חומרים |
| ag-nexa | סוכן שיווק וצמיחה | Nexa | ניתוח/טיוטת תוכן שיווקי |
| ag-wiki | סוכן ידע | Wiki | ציטוט ידע מאושר בלבד (MemorySearchPort=no-op) |
| ag-flow | סוכן אוטומציות | Flow | טיוטת/הרצת אוטומציה — ביצוע טעון אישור |

**קבוע-על:** סוכן (ag-*) לעולם אינו מחזיק תפקיד, אינו מאשר ואינו שולח החוצה — נאכף
type-level (`HumanUserId` brand) וב-runtime (`guards.ts`). 12 פעולות קנוניות טעונות אישור
אנושי; `maxUsageBudgetILS=0` (אין הוצאה מותרת ב-Mode A).

### ממשל זיכרון / ידע / למידה

| שכבה | מצב אמת |
|---|---|
| זיכרון (memory) | ייבוא/ייצוא Obsidian פעיל; גישה מקומית ישירה ל-vault **אינה** פעילה; אין service worker; חשיפת רשומה רגישה נרשמת בזהות הדמו u-tzachi עד מערכת זהויות אמיתית |
| ידע (knowledge) | ידע מאושר בלבד; זיהוי סתירות/כפילויות **דטרמיניסטי-טקסטואלי** (לא סמנטי) |
| למידה ממושלת (learning) | הצעות למידה → אישור אנושי בשם → כלל; rollback קיים; מדדי אפקטיביות "טרם נמדד" |
| מדיניות ממשל | **0 מדיניות פעילה** — כולן טיוטה/ממתין עד אישור אנושי בשם |

---

*נכתב ב-Phase 9 מקריאת מצב אמת. שגיאה שנמצאה: ראו סיכום החזרה של W9-E (BUILD_STATUS.md כותרתו
עדיין "Wave 2" למרות שהגוף מתעד עד Wave 8).*
