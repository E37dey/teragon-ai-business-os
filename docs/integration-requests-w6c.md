# INTEGRATION REQUESTS — W6-C (Knowledge Governance & Wiki)

23.07.2026 · מגיש: W6-C · קבצים משותפים לא נגעו — כל הבקשות כאן ל-Integration Lead.

| # | קובץ משותף | שינוי מבוקש | פרטים |
|---|-----------|--------------|-------|
| 1 | `src/app/router.tsx` | חיבור ראוט `/knowledge` | להוסיף ל-`MODULE_PAGES`: `"/knowledge": lazy(() => import("@/modules/knowledge/KnowledgePage"))` (default export קיים; הראוט כבר מוגדר ב-routes.ts, wave 6) |
| 2 | Copilot commands (`src/modules/ai-copilot/commands.ts` / ops registry) | חיבור פקודות Wiki | לייבא `wikiOps` מ-`@/agents/wiki` ולחשוף: `searchApproved` ("חפש בידע המאושר"), `showContradictions` ("הצג סתירות בידע"), `answerQuestion` ("שאל את סוכן הידע"). כל הפעולות קריאה בלבד |
| 3 | חיבור זיכרון (W6-A) | מימוש `MemorySearchPort` | `@/agents/wiki` מגדיר `MemorySearchPort { searchApprovedMemory(query) }` עם ברירת מחדל no-op. באינטגרציה: לממש מעל חיפוש הזיכרון **המאושר** של W6-A ולהזריק ב-`new WikiAgent({ memoryPort })` (ובעמוד /knowledge אם רוצים memoryHits) |
| 4 | W6-B sanitizer | עיבוד markdown במאמרי ידע | `KnowledgePage` מציג תוכן escaped בלבד (React text nodes). כש-sanitizer של W6-B מוכן — להחליף את בלוק ה-viewer המסומן בהערה ב-`KnowledgePage.tsx` |
| 5 | `src/agents/definitions.ts` (קפוא) | הרחבת allowedDomains של `ag-wiki` | להוסיף את אוספי Wave-6: `knowledgeArticles/Sources/Versions/Usage/Conflicts/Questions/Reviews` ל-allowedDomains של ag-wiki (ההגדרה קפואה ואסורה לעריכה על ידי W6-C). עד אז סוכן ה-Wiki פועל דרך ה-stores המוזרקים |
| 6 | W6-E (ראיות 6.12) | צריכת שער הראיות | לייבא מ-`@/knowledge/evidenceEligibility`: `mayUseAsEvidence` (שער טהור), `recordKnowledgeUsage` (רישום שימוש), `markUsageSuperseded` (כבר נקרא אוטומטית ב-approve). אין לצטט מאמר ידע בלי לעבור בשער |
| 7 | boot path (`src/main.tsx` / seedIfEmpty) | הפעלת גשר ה-seed בעלייה | אופציונלי: לקרוא `ensureKnowledgeSeed(knowledgeStores())` מ-`@/knowledge/seedBridge` בעליית האפליקציה (אידמפוטנטי). כיום העמוד מריץ אותו ב-mount, כך שאין חובה |

## הערות תלות

- אין תלות חדשה ב-package.json.
- אין צריכה מ-`src/memory/**` (W6-A מקביל) — רק ה-port המוזרק.
- `KnowledgeGovernanceService` משתמש ב-`ApprovalEngine` הקנוני עם
  runId בקידומת `knowledge-gov-<articleId>` (ללא רשומת AgentRun — המנוע מדלג
  על קישור הריצה בהיעדרה; אירועי approval ו-audit נכתבים כרגיל).
