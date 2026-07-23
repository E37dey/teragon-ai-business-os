# WAVE 6 — KNOWN LIMITATIONS (כנות מלאה)

1. **גישה מקומית ישירה ל-vault של Obsidian אינה קיימת ואינה נטענת** — בדיוק כמוצהר במסך: "ייבוא וייצוא Obsidian פעיל" · "גישה מקומית ישירה אינה פעילה". אין סנכרון רציף; ייבוא/ייצוא ידניים בלבד.
2. **ZIP export ב-store method** (ללא דחיסה) — קריא בכל כלי; דחיסת deflate לייצוא לא מומשה (מתועד).
3. **PII redaction ייעודי לא מומש** — שער הרגישות (רגיש/מוגבל) הוא מנגנון ההגנה; redaction אוטומטי של פרטים אישיים בייצוא = מגבלה מוצהרת (אין העמדת פנים).
4. **aliases של Obsidian** נפתרים רק בתוך אצוות ייבוא (אין שדה aliases ב-MemoryRecordV2 עדיין).
5. **בחירה אוטומטית מקישורי עומק** (?record=/?proposal=) טרם נקראת בעמודי memory/knowledge/learning — הניווט עובד, האוטו-בחירה ב-Wave 7.
6. **MemorySearchPort של Wiki = no-op** — Wiki מצטט כרגע ידע מאושר בלבד; חיפוש זיכרון מאושר יחובר בהמשך.
7. **גילוי סתירות/כפילויות דטרמיניסטי** (השוואת claims טקסטואלית) — לא סמנטי; מוצהר בשיטת ה-retrieval.
8. **חשיפת רשומה רגישה** נרשמת ב-audit עם זהות הדמו הקבועה (u-tzachi) עד שקיימת מערכת זהויות אמיתית (Wave 9).
9. **מדדי אפקטיביות למידה** — "טרם נמדד" עד שקיימות תוצאות עסקיות נמדדות; אין מספרי שיפור מומצאים.
10. **מרקרי legacy ו-localStorage ישנים לא נמחקו** (נתיב rollback מכוון) — ניקוי אחרי תקופת אימות.
11. **13 ראוטים עדיין placeholders** (Waves 7–9): /analytics, /governance, /implementation, /personas, /stage-gates, /training-materials, /quick-start, /faq, /administration, /system-health, /settings, /submission, /submission/presentation.
12. Mode A נמשך: `AI_REMOTE_ENABLED=false`; אף ספק מרוחק לא חובר ולא נבדק בפועל.
