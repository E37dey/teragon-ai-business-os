# SETTINGS — רפרנס ההגדרות המבוקרות (W8-D, Phase 8.11)

## אחסון

הערכים נשמרים ברשומת `meta/settings` (אוסף `meta`, מזהה `settings`) דרך ה-repositories הקנוניים:
`values` (ערכים שאושרו/הוחלו) · `lastChanged` (מתי + על ידי מי) · `pending` (שינויים שממתינים לאישור, עם approvalId).

## כללים קשיחים (נאכפים בקוד ונבדקים)

1. **RTL בלתי ניתן לשינוי** — `interface.rtl` הוא `z.literal(true)` ולא-editable; כל ניסיון כתיבה נדחה.
2. **אין מפתחות בדפדפן** — אין הגדרה בשם/בצורת api-key/token/secret/password; אין `input[type=password]` בעמוד (נבדק). הגדרת ספק: `docs/AI_PROVIDER_SETUP.md` (צד שרת בלבד).
3. **אין מתג מת** — הגדרה לא ממומשת היא read-only עם `readOnlyReasonHe` מוצג.
4. **רגיש ⇒ ביקורת** — שינוי sensitive כותב AuditEvent (`setting-change:<key>`).
5. **דורש אישור ⇒ מנוע האישורים הקנוני** — `ApprovalEngine.requestApproval` (runId `run-settings`, פעולת `permission-change`); הערך מוחל רק אחרי החלטת "אושר" (`applyDecidedSettingApprovals`), דחייה מוחקת את השינוי הממתין.

## שבע הקבוצות (18 הגדרות)

### עסק (business)
| מפתח | טיפוס/טווח | ברירת מחדל | עריכה |
|---|---|---|---|
| business.name | טקסט 2–60 | טרגון טכנולוגיות | ✔ |
| business.defaultCurrency | ILS בלבד | ILS | ✘ — רק ₪ ממומש |
| business.quotationValidityDays | שלם 7–90 | 30 | ✔ (צריכה במכירות — בקשת אינטגרציה) |

### ממשק (interface)
| מפתח | טיפוס/טווח | ברירת מחדל | עריכה |
|---|---|---|---|
| interface.rtl | true בלבד | true | ✘ — חוזה המוצר |
| interface.density | רגיל/צפוף | רגיל | ✔ — **חל בפועל** (font-size שורש) |
| interface.tablePageSize | שלם 5–50 | 10 | ✔ — **צרכן אמיתי**: היסטוריית התצלומים ב-/system-health |
| interface.reducedMotion | — | false | ✘ — המנגנון הגלובלי טרם קורא דגל (בקשה בתור) |

### התראות (notifications)
| מפתח | ברירת מחדל | עריכה |
|---|---|---|
| notifications.navBadges | true | ✘ — נגזר מהרשומות (deriveNotifications) |
| notifications.emailDigest | false | ✘ — אין שרת דיוור |

### AI
| מפתח | תצוגה | עריכה |
|---|---|---|
| ai.mode | מקומי — מנוע כללים (Mode A) | ✘ — נקבע בשרת |
| ai.remoteState | אמת שרת (ai-health) · ברירת מחדל "טרם נבדק" | ✘ |
| ai.approvalRequired | true | ✘ — חוזה הממשל |
| ai.dailyBudget | "טרם נמדד" / ערך שרת | ✘ — נמדד בשרת בלבד |
| ai.fallbackBehavior | נפילה גלויה למנוע המקומי | ✘ — חוזה ה-Registry |

**אין שדה מפתח API בשום מקום** — קישור ל-`docs/AI_PROVIDER_SETUP.md` בלבד (נבדק בטסט).

### זיכרון וידע (memory-knowledge)
| מפתח | ברירת מחדל | עריכה |
|---|---|---|
| memory.exportIncludeSensitive | false | ✘ — החלטה אנושית פר-ייצוא (חוזה W6-B) |
| knowledge.reviewIntervalDays | 90 | ✘ — מנוהל פר-מאמר בממשל הידע |

### אבטחה (security) — sensitive + דורש אישור קנוני
| מפתח | טיפוס/טווח | ברירת מחדל |
|---|---|---|
| security.destructiveConfirm | boolean | true — **צרכן אמיתי**: אישור כפול לאיפוס ההדגמה |
| security.slaResponseTargetHours | שלם 1–72 | 8 |

### הדגמה (demo)
| מפתח | ברירת מחדל | עריכה |
|---|---|---|
| demo.destructiveProtection | false | ✔ — מחווט לדגל `useDemoModeGuard` (sessionStorage) |

פעולות בקבוצה: **איפוס נתוני הדגמה דטרמיניסטי** (resetDeterministicData הקנוני, עם אישור כפול כש-destructiveConfirm פעיל, חסום במצב הדגמה) · קישור **מצב הדגמה לבוחן** (/submission/presentation) · הצהרת נתונים סינתטיים.

## תחולת הגדרות ממשק (מנגנון)

`applyUiSettings(record)` מחיל density על `document.documentElement.style.fontSize`. מוחל בטעינת עמוד ההגדרות ואחרי כל שינוי; **החלה בעליית האפליקציה** דורשת קריאה מ-main.tsx — בקשת אינטגרציה פתוחה (docs/integration-requests-w8d.md).
