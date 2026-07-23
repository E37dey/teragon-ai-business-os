// W5-D — honest usage-to-text mapping (pure, shared with tests).
// The contract: absent ≠ zero. usage.measured=false ⇒ "טרם נמדד", NEVER "0".
import type { UsageInfo } from "@/domain/ai/envelope";

export const USAGE_UNMEASURED_HE = "טרם נמדד";

/** Pure formatter (unit-tested): the only sanctioned usage-to-text mapping. */
export function usageDisplayHe(usage: UsageInfo): string {
  if (!usage.measured) return USAGE_UNMEASURED_HE;
  const parts: string[] = [];
  if (usage.totalTokens !== undefined) parts.push(`${usage.totalTokens} טוקנים`);
  else {
    if (usage.inputTokens !== undefined) parts.push(`קלט ${usage.inputTokens}`);
    if (usage.outputTokens !== undefined) parts.push(`פלט ${usage.outputTokens}`);
  }
  if (usage.estimatedCost !== undefined) {
    parts.push(`עלות משוערת ${usage.estimatedCost} ${usage.currency ?? ""}`.trim());
  }
  // measured=true but no numbers reported — still honest, never invent
  return parts.length > 0 ? parts.join(" · ") : USAGE_UNMEASURED_HE;
}
