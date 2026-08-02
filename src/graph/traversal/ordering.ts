// TERAGON Business Graph — deterministic ordering (Phase 6).
// The single stable comparator used EVERYWHERE: relationshipType → sourceId →
// targetId → edgeId. Determinism is a security property (path shape must never
// depend on map/iteration order), so nothing traversed is left unordered.
import type { BusinessGraphEdge } from "../contracts/edge";
import type { GraphPath, GraphPathStep } from "./types";

/** Total order on strings (code-unit comparison — stable + locale-independent). */
export function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

/** The canonical edge order: relationshipType → source → target → edgeId. */
export function compareEdges(a: BusinessGraphEdge, b: BusinessGraphEdge): number {
  return (
    compareStrings(a.relationshipType, b.relationshipType) ||
    compareStrings(a.source, b.source) ||
    compareStrings(a.target, b.target) ||
    compareStrings(a.id, b.id)
  );
}

/** Same canonical order applied to a materialized path step. */
export function comparePathSteps(a: GraphPathStep, b: GraphPathStep): number {
  return (
    compareStrings(a.relationshipType, b.relationshipType) ||
    compareStrings(a.sourceId, b.sourceId) ||
    compareStrings(a.targetId, b.targetId) ||
    compareStrings(a.edgeId, b.edgeId)
  );
}

/**
 * Deterministic order on whole paths: shorter first, then lexicographically by
 * the canonical step order. Ties among equal-length shortest paths are broken
 * stably, so `findPath` output is byte-reproducible.
 */
export function comparePaths(a: GraphPath, b: GraphPath): number {
  if (a.length !== b.length) return a.length - b.length;
  const n = Math.min(a.steps.length, b.steps.length);
  for (let i = 0; i < n; i += 1) {
    const c = comparePathSteps(a.steps[i]!, b.steps[i]!);
    if (c !== 0) return c;
  }
  return a.steps.length - b.steps.length;
}
