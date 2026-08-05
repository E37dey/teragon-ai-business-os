// S11.3 — shared contract for the 7 agents' deterministic business actions.
// Every action is LOCAL and deterministic: it runs on synthetic demo data via the
// local rules engine, never a remote model, never an external side effect. The
// honest engine label below is shown in the UI on every result.
import type { CollectionKey } from "@/repositories/collections";

/** The honest, always-shown engine label (no remote model). */
export const LOCAL_ENGINE_LABEL = "מנוע חוקים מקומי — ללא מודל מרוחק";

export type ExecutionMode =
  | "READ_ONLY_LOCAL"
  | "PROPOSAL_ONLY"
  | "LOCAL_DEMO_MUTATION_WITH_APPROVAL";

export type RiskLevel = "none" | "low" | "medium";

/** Result status — fail-closed: success is NEVER shown after a failed operation. */
export type ActionStatus =
  | "ok"
  | "empty"
  | "validation_error"
  | "execution_error"
  | "awaiting_approval"
  | "applied";

export interface AgentActionInputSpec {
  readonly id: string;
  readonly labelHe: string;
  readonly kind: "text" | "select" | "recordId";
  readonly required: boolean;
  readonly options?: readonly { value: string; labelHe: string }[];
  readonly placeholderHe?: string;
}

export interface AgentActionDefinition {
  readonly id: string;
  readonly agentId: string;
  readonly titleHe: string;
  readonly descriptionHe: string;
  readonly requiredInputs: readonly AgentActionInputSpec[];
  /** the agent capability/operation this action exercises */
  readonly capability: string;
  readonly riskLevel: RiskLevel;
  readonly approvalRequired: boolean;
  readonly executionMode: ExecutionMode;
  /** the read/demo domains this action may touch (synthetic demo data only) */
  readonly domains: readonly CollectionKey[];
  /** name+version of the structured result schema this action returns */
  readonly resultSchema: string;
}

export type FindingSeverity = "info" | "low" | "medium" | "high";

export interface AgentActionFinding {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly textHe: string;
  readonly recordId?: string;
}

export interface AgentActionRecommendation {
  readonly id: string;
  readonly textHe: string;
  readonly severity?: FindingSeverity;
  readonly ownerHe?: string;
  readonly navigationTarget?: string;
}

export interface AgentActionEvidence {
  /** e.g. "customer" | "contact" | "knowledge" | "recommendation" | "proposal" */
  readonly kind: string;
  readonly refId: string;
  readonly labelHe: string;
}

/** The five mandatory explanations shown with every result. */
export interface AgentActionWhy {
  /** מה נמצא */
  readonly foundHe: string;
  /** למה זה חשוב */
  readonly importanceHe: string;
  /** על סמך אילו נתונים */
  readonly basedOnHe: string;
  /** מה הפעולה המומלצת */
  readonly recommendedHe: string;
  /** האם זו הצעה בלבד */
  readonly isProposalOnly: boolean;
}

export interface AgentActionResult {
  readonly status: ActionStatus;
  readonly summary: string;
  readonly findings: readonly AgentActionFinding[];
  readonly recommendations: readonly AgentActionRecommendation[];
  readonly evidence: readonly AgentActionEvidence[];
  readonly affectedRecordIds: readonly string[];
  readonly navigationTarget: string | null;
  readonly createdAt: string;
  readonly correlationId: string;
  readonly why: AgentActionWhy;
  /** always the local-engine label — proves no remote model was used */
  readonly engineLabel: string;
}

/** Inputs are plain scalar strings keyed by AgentActionInputSpec.id. */
export type AgentActionInputs = Readonly<Record<string, string>>;

export interface RunContext {
  /** injectable for deterministic tests; defaults to a fresh correlation id */
  readonly correlationId?: string;
  /** injectable ISO clock for deterministic tests */
  readonly now?: string;
  /** explicit human approval token for LOCAL_DEMO_MUTATION_WITH_APPROVAL actions */
  readonly approved?: boolean;
}

/** True only for statuses that represent a real successful outcome. */
export function isSuccess(status: ActionStatus): boolean {
  return status === "ok" || status === "applied";
}
