# W6-E → Integration Requests (Wave 6)

23.07.2026 · מאת: W6-E (Cross-Domain Normalization & Integration)

כל הקוד של W6-E כבר עובד בלי אף שינוי בקבצים המשותפים (extension-typing +
fallbacks). הבקשות כאן הופכות את הזמני לקנוני.

## 1. src/domain/types.ts — הדיף המדויק (מקור האמת: src/integration/domainExtensions.ts)

כל השדות **אופציונליים** — אפס שבירה לרשומות קיימות. אחרי ההחלה אפשר להסב את
המודולים מ-`TaskX`/`SupportRequestX`/… אל הטיפוסים הדומייניים ולמחוק את
domainExtensions.ts (או להשאירו כ-re-export).

```diff
--- a/src/domain/types.ts
+++ b/src/domain/types.ts
@@ export type TaskStatus = "פתוחה" | "בתהליך" | "הושלמה" | "בוטלה";
+
+/** Wave 6 (m001): the 6 operational board states — persisted, not marker-encoded. */
+export type TaskWorkState =
+  | "לביצוע"
+  | "בביצוע"
+  | "ממתין ללקוח"
+  | "ממתין לאישור"
+  | "חסום"
+  | "הושלם";
+
+export type TaskOwnership = "אנושית" | "משותפת";
+
+/** Wave 6 (m005): persisted approval workflow state (agentEvents stay secondary truth). */
+export type ApprovalExtendedState =
+  | "pending"
+  | "approved"
+  | "edited"
+  | "rejected"
+  | "expired"
+  | "cancelled"
+  | "executed"
+  | "execution-failed"
+  | "rolled-back";
@@ export interface Task extends BaseEntity {
   ownerId: string;
   /** "customer:cu-3" style entity ref, or null */
   relatedRef: string | null;
+  /** Wave 6 m001 — canonical operational state; absent ⇒ derived from status */
+  workState?: TaskWorkState;
+  /** Wave 6 m001 — canonical ownership; absent ⇒ אנושית */
+  ownership?: TaskOwnership;
+  /** Wave 6 m001 — original ⟦…⟧ description preserved for rollback */
+  legacyMarker?: string;
 }
@@ export interface SupportRequest extends BaseEntity {
   priority: TicketPriority;
   resolution: string;
+  /** Wave 6 m002 */
+  tier?: 1 | 2 | 3;
+  assigneeId?: string | null;
+  category?: string;
+  feedback?: "חיובי" | "שלילי" | null;
+  legacyMarker?: string;
 }
@@ export interface Opportunity extends BaseEntity {
   ownerId: string;
   notes: string;
+  /** Wave 6 m003 — fine journey step ("j1".."j10"); null ⇒ derived from stage */
+  journeyStepId?: string | null;
 }
@@ export interface Quotation extends BaseEntity {
   status: QuotationStatus;
   ownerId: string;
+  /** Wave 6 m004 — edit counter, starts at 1 */
+  version?: number;
 }
@@ export interface Approval extends BaseEntity {
   decidedAt: ISODate | null;
   note: string;
+  /** Wave 6 m005 */
+  extendedState?: ApprovalExtendedState;
 }
@@ export interface ServiceTicket extends BaseEntity {
   ownerId: string;
   solution: string;
+  /** Wave 6 m007 — set for closed tickets; null = not closed / unknown */
+  closedAt?: ISODate | null;
 }
@@ export interface Document extends BaseEntity {
   visible: boolean;
   ownerId: string;
+  /** Wave 6 m007 — direct customer link (W3 request #4) */
+  customerId?: string | null;
 }
@@ export interface CourseSession extends BaseEntity {
   zoomUrl: string;
   notes: string;
+  /** Wave 6 m007 — structured attendance (W4 request #4); [] = not recorded */
+  attendance?: { studentId: string; present: boolean }[];
 }
@@ export interface CustomerPrinter extends BaseEntity {
   underWarranty: boolean;
   notes: string;
+  /** Wave 6 m007 — null = unknown (module policy derivation stays the fallback) */
+  warrantyUntil?: ISODate | null;
+  lastMaintenanceAt?: ISODate | null;
+  maintenanceIntervalDays?: number | null;
 }
```

הערה ל-schemas.ts: אם ה-zod schemas מוקשחים ל-strict, יש להוסיף את השדות כ-optional
באותן ישויות (אחרת `quotationSchema.parse` וכד' יפילו רשומות מהוגרות).

## 2. חיווט boot — src/main.tsx (שורה אחת אחרי seedIfEmpty)

```diff
 import { seedIfEmpty } from "./repositories";
+import { runMigrationsAtBoot } from "./migrations";
 import { syncNotifications } from "./app/notifications/syncNotifications";
@@
   try {
     await seedIfEmpty();
+    // Wave 6: schema migrations (m001-m007) — idempotent, audited, never throws
+    await runMigrationsAtBoot();
     // idempotent: stable ids ⇒ refresh never duplicates, read-state survives
     await syncNotifications();
```

`runMigrationsAtBoot()` לעולם לא זורק (סטורג' לא זמין ⇒ no-op כן). חובה **אחרי**
seedIfEmpty ולפני syncNotifications (התראות עלולות להיגזר משדות חדשים).

## 3. טאב "זיכרון" בכרטיס לקוח 360 (Customer 360)

הסלקטור מוכן: `customer360MemoryView(customerId, customerName, memoryRecords,
memoryProposals)` מ-`src/integration/customer360Memory.ts` — זיכרון מאושר
(memoryRecords) + הצעות ממתינות (memoryProposals, צריכה דפנסיבית). ה-UI של הטאב אצל
המוביל/W6-A; אין כאן כתיבה — כפתור "אשר" חייב לנתב ל-workflow האישור של W6-A.
לסרגל מרכז הפיקוד: `commandCenterMemoryBand(input)` מ-commandCenterMemory.ts
(נגזרות בלבד, אפסים כנים).

## 4. העברת ה-ops ל-LocalRulesProvider

כל 11 הפעולות (5 Copilot + 6 תכנון אוטומציות) חולצו ל-`src/integration/localOps.ts`
כפונקציות טהורות + מניפסט `LOCAL_OPS_MANIFEST` (operation → proposedProviderOperation
→ fn). `src/modules/ai-copilot/ops.ts` ו-`src/modules/automations/planOps.ts` הם כעת
re-export בלבד. למעבר: לממש ב-LocalRulesProvider את הפעולות לפי המניפסט (השמות
המוצעים מ-integration-requests-w5d), ואז להסב את `commands.ts`/`AutomationsPage` לקרוא
דרך ה-Registry ולמחוק את שני קבצי ה-shim.

## 5. השבתת חירום → מנוע (בקשת W5-D #4, מאושררת)

להוסיף בתחילת `AgentOrchestrator.startRun` (src/agents/orchestrator.ts — שטח המוביל):
בדיקה מול `stores.agents` שהסוכנים אינם בסטטוס `"מושבת"` (אותה סמנטיקה של
`assertAgentsEnabled` ב-`src/components/ai/engine.ts`), עם `AgentGovernanceError`
ו-userMessageHe. אחרי ההעברה — `startGuardedRun` בצד ה-UI נשאר כ-defense-in-depth או
מוסר. W6-E לא נגע ב-src/agents (מחוץ להרשאתו).

## 6. אחרי החלת סעיף 1 — ניקיונות אופציונליים

- להסב את המודולים מ-`TaskX` וכו' לטיפוסים הדומייניים (חיפוש
  `from "@/integration/domainExtensions"`).
- Copilot history ב-localStorage (פריט W5 פתוח): הוחלט **להשאיר** ב-localStorage —
  מצב UI אישי, לא רשומה עסקית (כהחלטת W5-D §3); אין מיגרציה.
- מחיקת מפתחות ה-localStorage הישנים (journey/versions) — רק בגל שאחרי, אחרי
  אימות בדפדפן אמיתי (rollback path כרגע).

## מה W6-E לא עשה בכוונה

- לא נגע ב-src/domain/types.ts, src/app/**, src/main.tsx, src/agents/**, src/ai/**,
  collections.ts / IndexedDBRepository.ts (v4 כבר כולל `meta`), package.json.
- לא מחק מרקרים/localStorage ישנים (rollback), לא הוסיף אישור-עצמי לשום hook.
- seedData.ts שונה רק בשורת ה-purpose של Nexa (m006).
