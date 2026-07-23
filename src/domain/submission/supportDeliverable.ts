// TERAGON AI BUSINESS OS — W7-E (Phase 7.15): the 3-tier SUPPORT deliverable.
// A submission artefact that REFERENCES the real /support system: target SLA
// per tier (SPEC ch.18 — מיידי / שעתיים / יום עבודה, C10 resolution) strictly
// SEPARATED from measured SLA (computed from actual supportRequests records —
// "טרם נמדד" whenever the data cannot support a number).
import type { SupportRequest } from "@/domain/types";
import { effectiveSupport, recurringIssues, supportSla, TIER_SLA_HOURS } from "@/modules/support/lib";
import type { RecurringIssue, Tier } from "@/modules/support/lib";
import { NOT_MEASURED_HE } from "./metricLevels";

export interface SupportTierArtefact {
  tier: Tier;
  titleHe: string;
  audienceHe: string;
  channelsHe: string[];
  /** the TARGET SLA (a plan — never rendered as measured) */
  targetSlaHe: string;
  targetSlaHours: number;
  /** NAMED seed user responsible for the tier (C3) */
  ownerId: string;
  escalatesToTier: Tier | null;
}

/** SPEC ch.18 canonical tier model (C10: SPEC tiers + SLAs win over PKG) */
export const SUPPORT_TIER_ARTEFACTS: readonly SupportTierArtefact[] = [
  {
    tier: 1,
    titleHe: "Tier 1 — שירות עצמי",
    audienceHe: "כל משתמשי המערכת",
    channelsHe: ["FAQ (/faq)", "מאגר ידע (/knowledge)", "סוכן AI פנימי"],
    targetSlaHe: "מיידי",
    targetSlaHours: TIER_SLA_HOURS[1],
    ownerId: "u-noa",
    escalatesToTier: 2,
  },
  {
    tier: 2,
    titleHe: "Tier 2 — Champions",
    audienceHe: "פנייה לשגריר/ה — תמיכת עמיתים",
    channelsHe: ["צ'אט ייעודי", "תמיכת עמיתים", "Champion מקומי"],
    targetSlaHe: "שעתיים",
    targetSlaHours: TIER_SLA_HOURS[2],
    ownerId: "u-ran",
    escalatesToTier: 3,
  },
  {
    tier: 3,
    titleHe: "Tier 3 — AI Implementer + IT + Compliance",
    audienceHe: "תקלה מורכבת, החלטת מדיניות, אסקלציה טכנית",
    channelsHe: ["פנייה מנוהלת דרך /support", "ישיבת החלטה בעת הצורך"],
    targetSlaHe: "יום עבודה",
    targetSlaHours: TIER_SLA_HOURS[3],
    ownerId: "u-noa",
    escalatesToTier: null,
  },
];

/** refresh cadence — imported from the PKG donor as COMPLEMENTARY plan (C10) */
export const SUPPORT_REFRESH_CADENCE_HE: readonly string[] = [
  "בדיקת שימוש שבועית — מי נתקע ובמה (תכנית, לא מדידה)",
  "סקירת מדדים חודשית — פניות חוזרות, SLA, מאמרי ידע חדשים",
  "מפגש רענון חודשי — נושא אחד מה-Microlearning לפי הפניות החוזרות",
];

/** measured SLA per tier — a REAL computation or an honest null */
export interface MeasuredTierSla {
  tier: Tier;
  closedCount: number;
  openCount: number;
  /** median resolution hours over CLOSED requests; null ⇒ "טרם נמדד" */
  medianResolutionHours: number | null;
  /** % of closed requests that met the tier target; null ⇒ "טרם נמדד" */
  compliancePercent: number | null;
  /** display string — the measured side, never mixed with the target */
  measuredHe: string;
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const m =
    sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Math.round((m ?? 0) * 10) / 10;
}

/** Deterministic per-tier measured SLA from the actual supportRequests. */
export function measuredTierSla(
  requests: readonly SupportRequest[],
  nowMs: number,
): MeasuredTierSla[] {
  const tiers: Tier[] = [1, 2, 3];
  return tiers.map((tier) => {
    const ofTier = requests.filter((r) => effectiveSupport(r).tier === tier);
    const closed = ofTier.filter((r) => r.status === "נסגרה");
    const open = ofTier.length - closed.length;
    if (closed.length === 0) {
      return {
        tier,
        closedCount: 0,
        openCount: open,
        medianResolutionHours: null,
        compliancePercent: null,
        measuredHe: NOT_MEASURED_HE,
      };
    }
    const slas = closed.map((r) => supportSla(r, nowMs));
    const medianHours = medianOf(slas.map((s) => s.elapsedHours));
    const met = slas.filter((s) => s.ratio <= 1).length;
    const compliance = Math.round((met / closed.length) * 100);
    return {
      tier,
      closedCount: closed.length,
      openCount: open,
      medianResolutionHours: medianHours,
      compliancePercent: compliance,
      measuredHe: `חציון ${medianHours} שע' · עמידה ביעד ${compliance}% (${closed.length} סגורות)`,
    };
  });
}

/** the full support artefact — targets and measurements SEPARATED by design */
export interface SupportArtefact {
  tiers: readonly SupportTierArtefact[];
  measured: MeasuredTierSla[];
  recurring: RecurringIssue[];
  refreshCadenceHe: readonly string[];
  links: { labelHe: string; route: string }[];
}

export function buildSupportArtefact(
  requests: readonly SupportRequest[],
  nowMs: number,
): SupportArtefact {
  return {
    tiers: SUPPORT_TIER_ARTEFACTS,
    measured: measuredTierSla(requests, nowMs),
    recurring: recurringIssues(requests, nowMs),
    refreshCadenceHe: SUPPORT_REFRESH_CADENCE_HE,
    links: [
      { labelHe: "תור התמיכה החי", route: "/support" },
      { labelHe: "מאגר הידע", route: "/knowledge" },
      { labelHe: "FAQ והתנגדויות", route: "/faq" },
      { labelHe: "מדדי התמיכה (רמה B)", route: "/submission" },
    ],
  };
}
