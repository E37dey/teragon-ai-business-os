// TERAGON AI BUSINESS OS — "מצב הדגמה לבוחן" (W7-F, 7.23).
// The deterministic 11-step evaluator path. Progress lives in the demoSteps
// COLLECTION (repository ⇒ survives refresh); the demo-mode flag lives in
// sessionStorage and is exposed through a guard hook other modules can read
// to refuse destructive changes while an evaluator is walking the path
// (wiring for other modules is requested via docs/integration-requests-w7f.md;
// within the presentation pages it is enforced directly).
// Works offline: every step is a client-side route; no network calls.
import { useCallback, useSyncExternalStore } from "react";
import { COLLECTIONS } from "@/repositories/collections";
import { getRepository, SEED, seedIfEmpty } from "@/repositories";
import { ensurePresentationContent } from "./bootstrap";
import { demoStepSchema } from "./schemas";
import type { PresentationClock, PresentationStores } from "./stores";
import type { DemoStep } from "./types";

// ---------------------------------------------------------------------------
// the deterministic 11-step path (every route is a REAL app route — tested)
// ---------------------------------------------------------------------------

export interface DemoStepDefinition {
  id: string;
  order: number;
  titleHe: string;
  objectiveHe: string;
  route: string;
  evidenceHe: string;
}

export const DEMO_STEP_DEFINITIONS: readonly DemoStepDefinition[] = [
  {
    id: "ds-1",
    order: 1,
    titleHe: "מרכז הפיקוד",
    objectiveHe: "פתיחה בתמונה החיה של העסק — ״מה לעשות היום״ מנתונים אמיתיים",
    route: "/",
    evidenceHe: "כרטיסי KPI נגזרים מהרשומות + רשימת ״מה לעשות היום״",
  },
  {
    id: "ds-2",
    order: 2,
    titleHe: "הבעיה העסקית",
    objectiveHe: "להראות את הגדרת הבעיה עם מספר ואת מפת AS-IS/TO-BE",
    route: "/implementation",
    evidenceHe: "כותרת הבעיה העסקית בתכנית ההטמעה + מפת התהליך החיה",
  },
  {
    id: "ds-3",
    order: 3,
    titleHe: "שבע הפרסונות",
    objectiveHe: "בדיוק 7 פרסונות קנוניות — כולל ה-Champion והמתנגד",
    route: "/personas",
    evidenceHe: "מונה 7/7 בעמוד הפרסונות + כרטיסי הפרסונות",
  },
  {
    id: "ds-4",
    order: 4,
    titleHe: "Training Matrix",
    objectiveHe: "חוזה ההדרכה: פורמט, משך, תרגול ומדד הצלחה לכל פרסונה",
    route: "/personas",
    evidenceHe: "טבלת ה-Training Matrix בעמוד הפרסונות (גלילה מטה)",
  },
  {
    id: "ds-5",
    order: 5,
    titleHe: "תכנית שישה שלבים",
    objectiveHe: "מפת הדרכים: בעלים בשמות, תאריכי החלטה, סטטוס אמת",
    route: "/implementation",
    evidenceHe: "שישה שלבי האימוץ עם שערי היציאה ונקודת ההחלטה של שבוע 7",
  },
  {
    id: "ds-6",
    order: 6,
    titleHe: "ראיות G3 / G4",
    objectiveHe: "שערים עם ראיות אמת — G4 חסום ביושר עד תוצאת פיילוט מדודה",
    route: "/stage-gates",
    evidenceHe: "מצב הראיות של G3 (קיימות) מול G4 (חסר — הפיילוט טרם נמדד)",
  },
  {
    id: "ds-7",
    order: 7,
    titleHe: "Quick Start",
    objectiveHe: "חומר הדרכה ממשי: שלוש פעולות + כללי מותר/חובה לבדוק/אסור",
    route: "/quick-start",
    evidenceHe: "שלוש הפעולות עם הדגמות סכמטיות חיות + בדיקת הנוהל ברייל",
  },
  {
    id: "ds-8",
    order: 8,
    titleHe: "פעולה מונחית אחת",
    objectiveHe: "לצפות בהמלצת AI אמיתית: נימוק, ראיות, ביטחון כן — בלי לאשר",
    route: "/agents",
    evidenceHe: "המלצה ממתינה במרכז האישורים עם נימוק וראיות מקושרות",
  },
  {
    id: "ds-9",
    order: 9,
    titleHe: "שלוש רמות המדידה",
    objectiveHe: "הגדרות מדד בשלוש רמות; ״טרם נמדד״ בכל מקום שאין תצפית",
    route: "/analytics",
    evidenceHe: "הגדרות המדדים לפי רמה + מצב מדידה כן",
  },
  {
    id: "ds-10",
    order: 10,
    titleHe: "מוכנות ההגשה",
    objectiveHe: "מרכז ההגשה מדווח מוכנות אמת — כולל חסמים פתוחים",
    route: "/submission",
    evidenceHe: "12 התוצרים עם סטטוס וראיות; אין מצב ירוק כשקיים חסם",
  },
  {
    id: "ds-11",
    order: 11,
    titleHe: "חזרה למצגת",
    objectiveHe: "סגירת המסלול — חזרה לשקף המדדים והסיכון לסיום",
    route: "/submission/presentation",
    evidenceHe: "המצגת נפתחת באותו שקף שממנו יצאנו (מצב שמור)",
  },
] as const;

// ---------------------------------------------------------------------------
// progress — persisted in the demoSteps collection (survives refresh)
// ---------------------------------------------------------------------------

/** Idempotent: creates missing ds-1..ds-11 records with honest "לא בוצע". */
export async function ensureDemoSteps(
  stores: PresentationStores,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<{ created: number }> {
  const now = clock();
  let created = 0;
  for (const def of DEMO_STEP_DEFINITIONS) {
    if (await stores.demoSteps.get(def.id)) continue;
    const record: DemoStep = {
      id: def.id,
      createdAt: now,
      updatedAt: now,
      order: def.order,
      titleHe: def.titleHe,
      objectiveHe: def.objectiveHe,
      route: def.route,
      evidenceHe: def.evidenceHe,
      status: "לא בוצע",
      completedAt: null,
    };
    demoStepSchema.parse(record);
    await stores.demoSteps.create(record);
    created += 1;
  }
  return { created };
}

export async function completeDemoStep(
  stores: PresentationStores,
  stepId: string,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<DemoStep> {
  const step = await stores.demoSteps.get(stepId);
  if (!step) throw new Error(`completeDemoStep: צעד ${stepId} לא קיים`);
  if (step.status === "בוצע") return step;
  const now = clock();
  return stores.demoSteps.update(stepId, { updatedAt: now, status: "בוצע", completedAt: now });
}

export async function resetDemoProgress(
  stores: PresentationStores,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<number> {
  const steps = await stores.demoSteps.list();
  const now = clock();
  let reset = 0;
  for (const s of steps) {
    if (s.status === "לא בוצע") continue;
    await stores.demoSteps.update(s.id, { updatedAt: now, status: "לא בוצע", completedAt: null });
    reset += 1;
  }
  return reset;
}

/** The highlight-next-action selector: first incomplete step in order. */
export function nextDemoStep(steps: readonly DemoStep[]): DemoStep | null {
  return [...steps].sort((a, b) => a.order - b.order).find((s) => s.status === "לא בוצע") ?? null;
}

export function demoProgress(steps: readonly DemoStep[]): { done: number; total: number } {
  return { done: steps.filter((s) => s.status === "בוצע").length, total: steps.length };
}

// ---------------------------------------------------------------------------
// demo-mode flag + guard hook
// ---------------------------------------------------------------------------

export const DEMO_MODE_KEY = "teragon.w7f.demoMode";
const DEMO_MODE_EVENT = "w7f-demo-mode-changed";

function safeSession(): Storage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

export function isDemoModeActive(): boolean {
  try {
    return safeSession()?.getItem(DEMO_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoModeActive(active: boolean): void {
  try {
    const s = safeSession();
    if (!s) return;
    if (active) s.setItem(DEMO_MODE_KEY, "1");
    else s.removeItem(DEMO_MODE_KEY);
    if (typeof window !== "undefined") window.dispatchEvent(new Event(DEMO_MODE_EVENT));
  } catch {
    // the flag must never throw into UI code
  }
}

export interface DemoGuardVerdict {
  allowed: boolean;
  reasonHe: string;
}

/**
 * Pure guard: while demo mode is active, destructive changes are refused.
 * Read/navigation actions are always allowed.
 */
export function guardDestructiveAction(actionHe: string, demoActive: boolean): DemoGuardVerdict {
  if (!demoActive) return { allowed: true, reasonHe: "" };
  return {
    allowed: false,
    reasonHe: `מצב הדגמה לבוחן פעיל — הפעולה «${actionHe}» חסומה כדי לשמור על נתוני הדגמה דטרמיניסטיים. צא ממצב ההדגמה כדי לבצע אותה.`,
  };
}

function subscribeDemoMode(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(DEMO_MODE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DEMO_MODE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * The exported guard hook — other modules call this to refuse destructive
 * changes while an evaluator demo is running (see the integration queue for
 * the wiring request). Within W7-F pages it is enforced directly.
 */
export function useDemoModeGuard(): {
  active: boolean;
  guard: (actionHe: string) => DemoGuardVerdict;
} {
  const active = useSyncExternalStore(subscribeDemoMode, isDemoModeActive, () => false);
  const guard = useCallback((actionHe: string) => guardDestructiveAction(actionHe, active), [active]);
  return { active, guard };
}

// ---------------------------------------------------------------------------
// reset deterministic data — clear + reseed via the existing seedIfEmpty path
// ---------------------------------------------------------------------------

export interface ResetResult {
  clearedCollections: number;
  reseededCollections: number;
}

/**
 * The "אפס נתוני הדגמה" action (confirm dialog in the UI): clears EVERY
 * collection, then reseeds through the canonical seedIfEmpty() boot path and
 * re-runs the idempotent presentation bootstraps. Demo-step progress resets
 * to "לא בוצע" as part of the re-bootstrap. No network involved — IndexedDB
 * only (works offline).
 */
export async function resetDeterministicData(
  stores: PresentationStores,
  clock: PresentationClock = () => new Date().toISOString(),
): Promise<ResetResult> {
  let cleared = 0;
  for (const collection of COLLECTIONS) {
    await getRepository(collection).clear();
    cleared += 1;
  }
  // canonical boot path — reseeds every empty IndexedDB collection
  const reseeded = new Set<string>(await seedIfEmpty());
  // non-IDB fallback (in-memory repositories, e.g. jsdom): seedIfEmpty only
  // touches IndexedDB stores, so restore the same deterministic seed directly
  for (const collection of COLLECTIONS) {
    const seed = SEED[collection];
    if (seed.length === 0 || reseeded.has(collection)) continue;
    const repo = getRepository(collection);
    if ((await repo.list()).length > 0) continue;
    for (const item of seed) await repo.create(item);
    reseeded.add(collection);
  }
  await ensurePresentationContent(stores, clock);
  await ensureDemoSteps(stores, clock);
  return { clearedCollections: cleared, reseededCollections: reseeded.size };
}
