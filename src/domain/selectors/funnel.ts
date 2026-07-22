// Sales funnel — ordered stage counts derived from the actual leads collection.
import type { Lead, LeadStatus } from "../types";
import { LEAD_FUNNEL_ORDER } from "../types";

export interface FunnelStage {
  stage: LeadStatus;
  count: number;
}

/**
 * Cumulative funnel: each stage counts the leads that reached AT LEAST that
 * stage (a lead in "נשלחה הצעה" has necessarily passed "נוצר קשר").
 */
export function salesFunnel(leads: readonly Lead[]): FunnelStage[] {
  const stageIndex = new Map<LeadStatus, number>(LEAD_FUNNEL_ORDER.map((s, i) => [s, i]));
  return LEAD_FUNNEL_ORDER.map((stage, i) => ({
    stage,
    count: leads.filter((l) => {
      const idx = stageIndex.get(l.status);
      return idx !== undefined && idx >= i;
    }).length,
  }));
}

/** simple per-stage (non-cumulative) distribution, in funnel order */
export function funnelDistribution(leads: readonly Lead[]): FunnelStage[] {
  return LEAD_FUNNEL_ORDER.map((stage) => ({
    stage,
    count: leads.filter((l) => l.status === stage).length,
  }));
}
