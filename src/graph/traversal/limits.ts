// TERAGON Business Graph — traversal limits (Phase 6).
// Hard INTERNAL maxima that a caller can only REDUCE, never raise. resolveLimits
// clamps every numeric budget to its cap and intersects the type allow-lists —
// a caller value larger than the cap is silently clamped DOWN to the cap; the
// allow-lists can only narrow the internal universe.
import type {
  GraphTraversalQueryLimits,
  GraphTraversalQueryLimitsInput,
} from "./types";

/** The non-negotiable internal ceilings. No caller input can exceed these. */
export const TRAVERSAL_HARD_MAXIMA = {
  maxDepth: 12,
  maxNodes: 2000,
  maxEdges: 5000,
  maxPaths: 200,
  timeoutBudgetMs: 10_000,
} as const;

/** The default budget applied when the caller narrows nothing. */
export const DEFAULT_TRAVERSAL_QUERY_LIMITS: GraphTraversalQueryLimits = {
  maxDepth: 6,
  maxNodes: 500,
  maxEdges: 1000,
  maxPaths: 50,
  timeoutBudgetMs: 5000,
  allowedEntityTypes: null,
  allowedRelationshipTypes: null,
};

function clampNumeric(
  requested: number | undefined,
  fallback: number,
  cap: number,
): number {
  const base =
    typeof requested === "number" && Number.isFinite(requested) && requested > 0
      ? Math.floor(requested)
      : fallback;
  // caller may only REDUCE: never above the internal cap.
  return Math.min(base, cap);
}

/**
 * Resolve the effective, capped limits. Numeric budgets are clamped to the hard
 * maxima (a larger caller value is reduced to the cap). The allow-lists narrow
 * only: a supplied array becomes the universe (a strict reduction from "all");
 * omitting it keeps the internal universe (`null`).
 */
export function resolveLimits(
  requested?: GraphTraversalQueryLimitsInput,
): GraphTraversalQueryLimits {
  const d = DEFAULT_TRAVERSAL_QUERY_LIMITS;
  const cap = TRAVERSAL_HARD_MAXIMA;
  return {
    maxDepth: clampNumeric(requested?.maxDepth, d.maxDepth, cap.maxDepth),
    maxNodes: clampNumeric(requested?.maxNodes, d.maxNodes, cap.maxNodes),
    maxEdges: clampNumeric(requested?.maxEdges, d.maxEdges, cap.maxEdges),
    maxPaths: clampNumeric(requested?.maxPaths, d.maxPaths, cap.maxPaths),
    timeoutBudgetMs: clampNumeric(
      requested?.timeoutBudgetMs,
      d.timeoutBudgetMs,
      cap.timeoutBudgetMs,
    ),
    allowedEntityTypes:
      requested?.allowedEntityTypes && requested.allowedEntityTypes.length > 0
        ? [...requested.allowedEntityTypes]
        : null,
    allowedRelationshipTypes:
      requested?.allowedRelationshipTypes && requested.allowedRelationshipTypes.length > 0
        ? [...requested.allowedRelationshipTypes]
        : null,
  };
}
