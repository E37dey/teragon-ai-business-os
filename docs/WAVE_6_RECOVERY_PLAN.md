# WAVE 6 — RECOVERY PLAN

## שכבות שחזור

1. **Git**: ענף `backup/pre-wave6-20260723-0400` (HEAD=3bb230b). שחזור קוד מלא: `git reset --hard backup/pre-wave6-20260723-0400` (או checkout לענף).
2. **נתוני דמו**: `docs/backups/wave6-baseline-seed-snapshot.json` — 49 collections, 283 רשומות. שחזור: מחיקת DB `teragon-os` בדפדפן (DevTools → Application → IndexedDB) → רענון → `seedIfEmpty()` זורע מחדש דטרמיניסטית.
3. **נתוני משתמש בדפדפן**: מיגרציות שומרות שדות מקור (`legacyMarker`) עד אימות; מיגרציה כושלת לרשומה בודדת מדלגת ורושמת audit — לא מפילה את האפליקציה ולא מוחקת.
4. **חזרה מגרסת IDB**: הורדת גרסה אינה נתמכת ב-IndexedDB; לכן כל מיגרציה חייבת להיות תואמת-קדימה (שדות חדשים אופציונליים; קוד ישן לא ירוץ על DB חדש כי הקוד והסכמה מגיעים יחד מאותו build).
5. **עצירת חירום ל-AI**: `AI_REMOTE_ENABLED=false` (כבר ברירת המחדל) + emergency-disable לכל סוכן ב-/agents.

## נוהל תקלה חמורה באמצע הגל
עצירת אינטגרציות → `git status`+`git log` לזיהוי הקומיט הירוק האחרון → reset אליו → הרצת השערים לאימות → המשך מהעקבה האחרונה ב-AGENT_EXECUTION_LOG. worktrees של סוכנים שרדו — ענפיהם נשמרים עד merge מוצלח.
