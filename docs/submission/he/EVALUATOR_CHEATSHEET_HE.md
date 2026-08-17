# TERAGON — דף עזר להצגה (Cheat Sheet)

**Elevator pitch:** "TERAGON היא מערכת הפעלה עסקית מבוססת-AI ומבוססת-תפקידים: סביבה אחת מבוקרת, חוויה שונה לכל משתמש, וה-AI ממליץ — האדם מחליט."

**3 פורטלים:** מנהל · תלמיד · טכנאי (נגזרים מהתפקיד, רק מצמצמים).

**7 סוכנים:** Teragon Orchestrator · Wiki · Mentor · Hunter · Flow · Fixer · Nexa.

**2 workflows:** `governed-knowledge-capture` · `operational-recovery`.

**זרימת ארכיטקטורה:** זהות → תפקיד → יכולת → פורטל (route) → רשומה (record) → תוצאה.

**מודל אבטחה:** RBAC 9 תפקידים (deny-by-default) · הגבלת פורטל (לא מסלים) · record-scope (fail-closed) · Trusted Device · שערי אישור אנושי.

**מספרי בדיקות:** Vitest **3041** · E2E **611/0-נכשלו** · Axe **0/0** · build נקי.

**מספרי Obsidian:** מחובר · Vault **TERAGON OS** · גשר `127.0.0.1:5200` v0.3.0-phase3 · מפת ידע **63 צמתים / 147 קשרים / 6 אשכולות** · **0 כתיבות אוטומטיות**.

**פרטי דמו:**
- מנהל: `manager@teragon.demo` / `TeragonManager2026!`
- תלמיד: `student@teragon.demo` / `TeragonStudent2026!`
- טכנאי: `technician@teragon.demo` / `TeragonTech2026!`

**3 ההישגים החזקים:**
1. פורטל-מעל-תפקידים עם אכיפת route+record אמיתית (deny-by-default, IDOR-tested).
2. AI מבוקר עם שער אישור אנושי — **0 כתיבות אוטומטיות** לכספת אמיתית.
3. Obsidian אמיתי חי + operational-recovery מקצה-לקצה (retryOf, המקורית נשמרת כראיה).

**3 מגבלות ידועות (אמרו בכנות):**
1. record-scope מקומי = הצגה, לא גבול שרת.
2. Supabase RLS = רמת ארגון (לא רמת-משתמש עדיין).
3. `AI_REMOTE_ENABLED=false` — מנוע דטרמיניסטי מקומי; נתונים סינתטיים.

**Roadmap:** RLS ברמת-משתמש · SSO/OIDC · הקשחת פריסה · הרחבת Supabase.

**Fallback חירום להדגמה:** אם Obsidian לא זמין — הראו את הצילומים `07/08/09` והפנו ל-TEST_REPORT (הכול מאומת ומתועד). הפורטלים אינם תלויים ב-Obsidian.

**אם שואלים על AI-assisted:** "פותח בסיוע כלי-AI, אבל הבעלות, הדרישות, הארכיטקטורה, ה-debugging, האינטגרציה והאימות — שלי."
