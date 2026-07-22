# WAVES 2–4 — KNOWN LIMITATIONS (כנות מלאה)

1. **19 ראוטים הם עדיין placeholders כנים** (Waves 5–9): agents, collaboration, automations, memory, knowledge, learning, analytics, governance, implementation, personas, stage-gates, training-materials, quick-start, faq, administration, system-health, settings, submission, presentation.
2. **אין AI מרוחק** — כל ההמלצות דטרמיניסטיות, מתויגות "מנוע מקומי מבוסס כללים" / "מצב הדגמה מקומי"; ביטחון מוצג "טרם נמדד" כשאין מדידה. אין Netlify Functions פעילים עדיין.
3. **שדות domain חסרים עם עקיפות מקומיות** (docs/integration-requests-w3.md + w4.md): צעד-מסע עדין ב-localStorage (Opportunity.journeyStepId), גרסת הצעה ב-localStorage, מצבי משימה מורחבים/tier תמיכה במרקרים `⟦…⟧` בתוך description — המרקרים עלולים להיראות כטקסט גולמי במסכים של גלים אחרים. מתוכנן ל-normalization ב-Wave 5/6 (הרחבת domain על ידי ה-Architect).
4. **PDF export** להצעות מחיר מושבת עם סיבה ("השתמשו בתצוגת הדפסה") — print-view מלא קיים.
5. **ייצוא תעודות** בקורסים מושבת עם סיבה.
6. **Auth** — אין התחברות/הרשאות עדיין (ארכיטקטורה מוכנה; Wave 9 administration).
7. **Bundle** — chunk ליבה ~572kB (אזהרת Vite); פיצול נוסף מתוכנן ב-Wave 10.
8. **Copilot** בכרטיס הניווט מושבת בכנות ("טרם מחובר למנוע AI") עד Wave 5.
9. אזהרות CRLF/LF של git ב-Windows — קוסמטי; יטופל עם .gitattributes ב-Wave 10.
