// TERAGON AI BUSINESS OS — hard orchestration limits (Wave 5, W5-C).
// Every loop in the engine is bounded by one of these. Exceeding a limit
// NEVER degrades silently — it throws a structured AgentGovernanceError
// (code AGENT_LIMIT_EXCEEDED) and the run is cancelled with kind "מגבלה".
import type { RunLimitConfig } from "@/domain/agents";

export const AGENT_HARD_LIMITS = Object.freeze({
  /** max specialists a single run may dispatch */
  maxSpecialists: 4,
  /** max handoff chain depth per task (orchestrator hop included) */
  maxHandoffDepth: 3,
  /** max provider calls per run (retries included) */
  maxModelCallsPerRun: 8,
  /** max retries for recoverable provider errors, per specialist task */
  maxTransientRetries: 2,
  /** max synthesize→verify revision cycles per run */
  maxRevisionCycles: 2,
} as const);

export type AgentHardLimitName = keyof typeof AGENT_HARD_LIMITS;

/** Configurable per-run limits — duration + budget. */
export const DEFAULT_RUN_LIMITS: Readonly<RunLimitConfig> = Object.freeze({
  maxRunDurationMs: 60_000,
  /** Mode A: the local rules engine spends nothing; 0 = no spending allowed */
  maxUsageBudgetILS: 0,
});
