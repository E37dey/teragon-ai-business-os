// Wave 3 — the 10-step RTL sales journey, layered over the coarse
// OpportunityStage of the domain. The fine-grained journey position is
// persisted in localStorage per opportunity; the coarse stage is persisted
// on the Opportunity record itself — both survive reload.
import type { Opportunity, OpportunityStage } from "@/domain/types";

export interface JourneyStep {
  id: string;
  label: string;
  /** the coarse domain stage this journey step maps onto */
  stage: OpportunityStage;
}

export const JOURNEY_STEPS: readonly JourneyStep[] = [
  { id: "j1", label: "פנייה חדשה", stage: "זיהוי" },
  { id: "j2", label: "אבחון צרכים", stage: "אפיון צרכים" },
  { id: "j3", label: "התאמת מדפסת", stage: "אפיון צרכים" },
  { id: "j4", label: "שיחת ייעוץ", stage: "אפיון צרכים" },
  { id: "j5", label: "הצעת מחיר", stage: "הצעה" },
  { id: "j6", label: "ממתין להחלטה", stage: "משא ומתן" },
  { id: "j7", label: "הזמנה אושרה", stage: "נסגרה - זכייה" },
  { id: "j8", label: "אספקה והתקנה", stage: "נסגרה - זכייה" },
  { id: "j9", label: "הדרכה ראשונית", stage: "נסגרה - זכייה" },
  { id: "j10", label: "ליווי לאחר רכישה", stage: "נסגרה - זכייה" },
] as const;

export const JOURNEY_STORAGE_KEY = "teragon-w3.sales.journeyStages";

/** default journey step derived from the coarse opportunity stage. */
export function defaultStepForStage(stage: OpportunityStage): string {
  switch (stage) {
    case "זיהוי":
      return "j1";
    case "אפיון צרכים":
      return "j2";
    case "הצעה":
      return "j5";
    case "משא ומתן":
      return "j6";
    case "נסגרה - זכייה":
      return "j7";
    case "נסגרה - הפסד":
      return "j6"; // lost deals stay where the decision happened
  }
}

export function stepIndex(stepId: string): number {
  return JOURNEY_STEPS.findIndex((s) => s.id === stepId);
}

/** the next journey step, or null at the end of the journey. */
export function nextStep(stepId: string): JourneyStep | null {
  const i = stepIndex(stepId);
  if (i === -1 || i + 1 >= JOURNEY_STEPS.length) return null;
  return JOURNEY_STEPS[i + 1] ?? null;
}

export type JourneyPositions = Record<string, string>;

export function loadJourneyPositions(
  storage: Pick<Storage, "getItem"> = localStorage,
): JourneyPositions {
  try {
    const raw = storage.getItem(JOURNEY_STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const result: JourneyPositions = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && stepIndex(v) !== -1) result[k] = v;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveJourneyPositions(
  positions: JourneyPositions,
  storage: Pick<Storage, "setItem"> = localStorage,
): void {
  try {
    storage.setItem(JOURNEY_STORAGE_KEY, JSON.stringify(positions));
  } catch {
    // convenience persistence only
  }
}

/** resolve the journey step of an opportunity (stored fine position, else derived). */
export function journeyStepOf(opp: Opportunity, positions: JourneyPositions): string {
  const stored = positions[opp.id];
  if (stored && stepIndex(stored) !== -1) {
    // the stored fine position must not contradict a more advanced coarse stage
    const derived = defaultStepForStage(opp.stage);
    return stepIndex(stored) >= stepIndex(derived) ? stored : derived;
  }
  return defaultStepForStage(opp.stage);
}

/** opportunity count per journey step (for the Stepper). */
export function journeyCounts(
  opps: readonly Opportunity[],
  positions: JourneyPositions,
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const s of JOURNEY_STEPS) counts[s.id] = 0;
  for (const o of opps) {
    if (o.stage === "נסגרה - הפסד") continue;
    const step = journeyStepOf(o, positions);
    counts[step] = (counts[step] ?? 0) + 1;
  }
  return counts;
}

export interface JourneyConversion {
  won: number;
  lost: number;
  open: number;
  /** % of decided deals won, null when nothing decided */
  winRate: number | null;
  /** total ₪ of open (undecided) opportunities */
  openValue: number;
}

export function journeyConversion(opps: readonly Opportunity[]): JourneyConversion {
  const won = opps.filter((o) => o.stage === "נסגרה - זכייה").length;
  const lost = opps.filter((o) => o.stage === "נסגרה - הפסד").length;
  const open = opps.length - won - lost;
  const decided = won + lost;
  const openValue = opps
    .filter((o) => o.stage !== "נסגרה - זכייה" && o.stage !== "נסגרה - הפסד")
    .reduce((s, o) => s + o.amount, 0);
  return {
    won,
    lost,
    open,
    winRate: decided === 0 ? null : Math.round((won / decided) * 100),
    openValue,
  };
}

export interface StuckDeal {
  opp: Opportunity;
  daysOverdue: number;
}

/** open opportunities whose expected close date already passed. */
export function stuckDeals(opps: readonly Opportunity[], todayIso: string): StuckDeal[] {
  const base = new Date(`${todayIso}T00:00:00`).getTime();
  return opps
    .filter(
      (o) =>
        o.stage !== "נסגרה - זכייה" && o.stage !== "נסגרה - הפסד" && o.expectedClose < todayIso,
    )
    .map((opp) => ({
      opp,
      daysOverdue: Math.round(
        (base - new Date(`${opp.expectedClose}T00:00:00`).getTime()) / 86_400_000,
      ),
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue);
}
