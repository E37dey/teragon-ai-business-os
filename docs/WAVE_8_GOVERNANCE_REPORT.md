# WAVE 8 — GOVERNANCE REPORT (W8-B)

23.07.2026 · Phases 8.0-gov + 8.4 + 8.5 + 8.6 · ענף: worktree מבודד · commit יחיד.

## מה נבנה

### דומיין (8.4) — `src/domain/governance/types.ts` (typed + zod)
- **GovernancePolicy / GovernancePolicyVersion** — גרסאות append-only בלתי-שינויות **ברמת המאגר** (`immutableGovernanceStore` ב-`src/repositories/governanceStores.ts`, כמו memoryVersions) + checksum sha-256 לתוכן. סכמה אוכפת: מדיניות לא-פעילה ⇒ `effectiveAt=null`; פעילה ⇒ מאשר בשם + תחולה.
- **GovernanceRisk** — מצבים פתוח/בטיפול/התקבל/הופחת/נסגר/נפתח מחדש; חומרות נמוכה/בינונית/גבוהה/קריטית; היסטוריית מעברים מלאה; `RISK_TRANSITIONS` קשיח.
- **GovernanceIncident / GovernanceReview** — זרימת תקרית מלאה; סגירה מחייבת תחקיר (סכמה+קוד).
- **PromptVersionRecord** — agent/operation/version/active/owner/approval + `checksumSha256` של הטקסט המוגן; `protectedTextStored:false` literal — הטקסט לעולם לא בצד הלקוח.
- **AgentPermissionView / ToolPermissionView** — נגזרות read-only מ-`AGENT_DEFINITIONS` (same-reference, נבדק).
- **ProviderConfigurationState / ModelConfigurationRecord** — כן: מקומי פעיל, מרוחק מושבת, model:null.
- **AuditQuery / AuditExport** — ייצוא redacted (דפוסי redact של W5-B) + truncation ל-160 תווים.

### סט המדיניות (8.6) — `src/governance/policySet.ts` + `policies.ts`
10 מדיניות קנוניות, bootstrap אידמפוטנטי: 3 "ממתין לבדיקה" (עם Approval קנוני פתוח, action `permanent-knowledge-update`, payload null) + 7 "טיוטה". **אף אחת לא אושרה אוטומטית** — 0 פעילות אחרי boot. מדיניות #1 = שכתוב תוכן tm-4 (נוהל שימוש נכון). לכל מדיניות: בעלים בשם, effectiveAt=null עד אישור, סוכנים/פעולות מושפעים; nextReviewAt נקבע (+90 יום) רק באישור. אישור/דחייה דרך `ApprovalEngine.decide` בלבד; גרסה חדשה מבטלת אישור קיים.

### /governance (8.5) — `src/modules/governance/GovernancePage.tsx`
7 האזורים: 1 מדיניות פעילה (גרסה/בעלים/מאשר/תחולה/בדיקה/מושפעים + אשר/דחה/הגש) · 2 גבולות אדם-AI (4 קטגוריות נגזרות מהקבועים) · 3 הרשאות סוכנים (מטריצה נגזרת + מצב חירום מאוסף agents + תצורת ספקים/מודלים) · 4 Prompt Registry ("תוכן מוגן — checksum בלבד") · 5 Audit Explorer (פילטרים actor/agent/operation/entity/approval/severity/date/correlation/טקסט; פריט נפתח עם גורם/רשומה/לפני-אחרי-כשמותר/ראיות/אישור/שרשרת correlation; ייצוא redacted עם preview) · 6 Risk Register (10 סיכונים פתוחים, מעבר מצב עם נימוק) · 7 ניהול תקריות (פתיחה/הקצאה/הכלה/פתרון/תחקיר/סגירה — רשומות אמיתיות). PageRail: "מבקר הממשל" — 9 בדיקות.

## בדיקות — tests/governance (8 קבצים, 76 בדיקות)
checksum (וקטורי FIPS + יציבות + חוזה הטקסט המוגן) · policyVersions (immutability במאגר, no-auto-approve, מנוע-בלבד, revision) · riskLifecycle (bootstrap + מעברים + reopen + חסימות) · incidents (זרימה מלאה + audit trail מסודר + חסימת סגירה ללא תחקיר) · permissionMatrix (same-reference derivation, אפס גישה ל-approvals, frozen-source) · auditExplorer (כל הפילטרים + redaction + truncation + מבנה ייצוא + סריקת seed נקייה) · railChecks (9 הבדיקות, כולל צריכת שומר RuleEffect) · page (7 אזורים, "— עד אישור" ×10, טקסט מוגן לא ב-DOM, ספקים כנים, idempotent boot).

## ממצאי מבקר צפויים אחרי boot (מצב אמת, לא באג)
- 8× "גרסת פרומפט ללא אישור" — לא קיים תהליך אישור פורמלי לפרומפטים; מוצג בכנות.
- 1× "סיכון קריטי פתוח" — gr-sensitive-data-leak.
- 2× "פער כיסוי ביקורת" אפשרי מול approvals היסטוריים של seed (ap-3 מכוסה; תלוי בזמן הריצה של מודולים אחרים).

## מגבלות מוצהרות
ראו docs/AI_GOVERNANCE_FRAMEWORK.md §6 (אין אכיפה סמנטית של מדיניות; חומרת ביקורת היוריסטית; זיהוי עקיפות מבוסס דפוסים).
