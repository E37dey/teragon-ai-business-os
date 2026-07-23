# WAVE 5 — KNOWN LIMITATIONS (כנות מלאה)

1. **אין ספק AI מרוחק מחובר.** כל ה-AI במוצר = מנוע מקומי מבוסס כללים (מוצהר בכל תשובה). ה-adapters של Anthropic/OpenAI כתובים ומאחורי env בלבד; מצב "מחובר" יוצג רק אחרי health check אמיתי. חיבור = הוראות ב-docs/AI_PROVIDER_SETUP.md (סוד רק ב-Netlify env / .env לא-עוקב — לעולם לא בצ'אט).
2. **מצב remote-connected לא נבדק ויזואלית** — אין ספק; נבדק TestAdapter ברמת שרת בלבד. מסומן N/A בכנות ב-VISUAL_QA.
3. **Rate-limit ותקציב הם per-function-instance** (in-memory) — מגבלה מבנית של serverless ללא store משותף; מתועד ב-AI_SERVER_SECURITY.md.
4. **גילוי הזרקות פרומפט הוא היוריסטי** — 13 דפוסים + בדיקת-שלילה שמוכיחה שניסוח חדשני לא נתפס; לא מוצג כמושלם.
5. **אימות זהות במצב דמו**: organizationId/userId מהלקוח = claims עם `trusted:false`; גבול authentication-ready קיים, JWT אמיתי ב-Wave 9.
6. **"בקש תיקון"** ממומש כדחייה עם הערה מחייבת (אין מצב revision בסכמת Approval דור-1) — יטופל בהרחבת הסכמה.
7. **שליחה חיצונית אמיתית אינה נתמכת** — פעולה מאושרת יוצרת Task+Activity מתויגים; אין שליחת אימייל/הודעה בפועל (בכוונה, עד Mode B מלא).
8. **אין דדופליקציית בקשות בשרת** — כל בקשה כפולה מחויבת ומבוקרת; אידמפוטנטיות במוטציות היא בשכבת המנוע; idempotency keys הוצעו.
9. מדדי usage/עלות: לא נמדדים במצב מקומי — מוצגים "טרם נמדד"/absent, לעולם לא 0 מזויף.
10. **16 ראוטים עדיין placeholders כנים** (Waves 6–9): /memory, /knowledge, /learning, /analytics, /governance, /implementation, /personas, /stage-gates, /training-materials, /quick-start, /faq, /administration, /system-health, /settings, /submission, /submission/presentation. 15 מסכים חיים (Waves 3–5).
