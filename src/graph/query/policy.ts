// TERAGON Business Graph — Phase 7 query policy + business-status vocabulary.
// ---------------------------------------------------------------------------
// Deterministic time policy (calendar-day cutoff over an INJECTED clock — no
// hidden Date.now) plus the CLOSED business-status classifications the queries
// rely on. Every set is a literal closed vocabulary drawn from the canonical
// domain types; nothing is inferred from free text.
import type { BusinessQueryName, BusinessQueryPolicy } from "./types";

/** The default policy version stamped on every result unless the request overrides it. */
export const BUSINESS_QUERY_POLICY_VERSION = "business-query-v1";

/** Per-query default age threshold in days (calendar days). */
export const DEFAULT_THRESHOLD_DAYS: Partial<Record<BusinessQueryName, number>> = {
  findUnansweredQuotations: 14,
  findCustomersNeedingFollowUp: 7,
};

const MS_PER_DAY = 86_400_000;

/**
 * Subtract `days` calendar days from an ISO instant, deterministically. Uses
 * Date arithmetic on the SUPPLIED instant only (never Date.now) — identical
 * input ⇒ identical output. Returns the input unchanged if it cannot be parsed.
 */
export function subtractCalendarDays(iso: string, days: number): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms - days * MS_PER_DAY).toISOString();
}

/**
 * Resolve the applied policy for a query. `asOf` is the explicit request value or
 * the injected clock value (already resolved by the caller); `thresholdDays` is
 * the request value, else the per-query default, else null (no age threshold).
 */
export function resolvePolicy(args: {
  query: BusinessQueryName;
  asOf: string;
  thresholdDays: number | undefined;
  policyVersion: string | undefined;
}): BusinessQueryPolicy {
  const thresholdDays =
    args.thresholdDays ?? DEFAULT_THRESHOLD_DAYS[args.query] ?? null;
  const cutoff = thresholdDays === null ? null : subtractCalendarDays(args.asOf, thresholdDays);
  return {
    policyVersion: args.policyVersion ?? BUSINESS_QUERY_POLICY_VERSION,
    asOf: args.asOf,
    thresholdDays,
    cutoff,
    cutoffMode: "calendar-day",
  };
}

// ---------------------------------------------------------------------------
// closed business-status vocabularies (from the canonical domain types)
// ---------------------------------------------------------------------------

/**
 * TERMINAL task statuses — a follow-up task in one of these is DONE and must be
 * EXCLUDED from "needs follow-up". Covers the canonical TaskStatus terminal
 * values plus the fixtures' work-state spellings, deny-nothing-by-inference.
 */
export const TERMINAL_TASK_STATUSES: ReadonlySet<string> = new Set<string>([
  "הושלמה",
  "הושלם",
  "בוטלה",
  "בוטל",
  "נדחה",
  "נדחתה",
  "סגור",
  "סגורה",
]);

/** Is this task status an OPEN (actionable, non-terminal) follow-up state? */
export function isOpenTaskStatus(status: string | null): boolean {
  if (status === null || status.trim() === "") return false;
  return !TERMINAL_TASK_STATUSES.has(status);
}

/**
 * CLOSED opportunity stages (won/lost) — an opportunity in one of these needs no
 * follow-up. Everything else is treated as OPEN.
 */
export const CLOSED_OPPORTUNITY_STAGES: ReadonlySet<string> = new Set<string>([
  "נסגרה - זכייה",
  "נסגרה - הפסד",
]);

export function isOpenOpportunityStage(stage: string | null): boolean {
  if (stage === null || stage.trim() === "") return false;
  return !CLOSED_OPPORTUNITY_STAGES.has(stage);
}

/**
 * Quotation statuses that count as UNANSWERED (sent to the customer, awaiting a
 * response). CLOSED set from the canonical QuotationStatus vocabulary: only
 * "נשלחה" (sent). Draft/approved/rejected/expired are NOT unanswered.
 */
export const UNANSWERED_QUOTATION_STATUSES: ReadonlySet<string> = new Set<string>(["נשלחה"]);

export function isUnansweredQuotationStatus(status: string | null): boolean {
  return status !== null && UNANSWERED_QUOTATION_STATUSES.has(status);
}

/**
 * Quotation statuses that still count as a PENDING link for follow-up (sent, not
 * yet answered). Same closed set as unanswered.
 */
export function isPendingQuotationStatus(status: string | null): boolean {
  return isUnansweredQuotationStatus(status);
}
