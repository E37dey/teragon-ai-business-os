// TERAGON AI BUSINESS OS — the 19 orchestration event types (Wave 5, W5-C).
// Discriminated union AgentRunCreated … AgentRunCancelled. Every orchestrator
// step persists exactly one of these inside an AgentEventRecord (agentEvents
// collection). The UI collaboration graph derives ONLY from these records —
// never from ad-hoc state.
//
// Design notes (honest deviations, see docs/AGENT_GOVERNANCE.md):
// - Run failure is a cancellation with kind "שגיאה" + an agentErrors record ref
//   (keeps the catalog at exactly 19 without a redundant AgentRunFailed twin).
// - Agent messages are first-class records (agentMessages collection), not a
//   separate event type — graph edges derive from them directly.
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type {
  ApprovalRequiredAction,
  ConflictDetail,
  ExecutionPayload,
  InversePayload,
} from "./types";

export type AgentRunEventType =
  | "AgentRunCreated"
  | "AgentRunAuthorized"
  | "TaskClassified"
  | "ContextSelected"
  | "PlanCreated"
  | "SpecialistsSelected"
  | "SpecialistTaskStarted"
  | "SpecialistTaskCompleted"
  | "SpecialistTaskFailed"
  | "HandoffOccurred"
  | "EvidenceVerified"
  | "ConflictDetected"
  | "ConflictResolved"
  | "SynthesisCompleted"
  | "ApprovalRequested"
  | "ApprovalDecided"
  | "ExecutionCompleted"
  | "AgentRunCompleted"
  | "AgentRunCancelled";

export const AGENT_RUN_EVENT_TYPES: readonly AgentRunEventType[] = [
  "AgentRunCreated",
  "AgentRunAuthorized",
  "TaskClassified",
  "ContextSelected",
  "PlanCreated",
  "SpecialistsSelected",
  "SpecialistTaskStarted",
  "SpecialistTaskCompleted",
  "SpecialistTaskFailed",
  "HandoffOccurred",
  "EvidenceVerified",
  "ConflictDetected",
  "ConflictResolved",
  "SynthesisCompleted",
  "ApprovalRequested",
  "ApprovalDecided",
  "ExecutionCompleted",
  "AgentRunCompleted",
  "AgentRunCancelled",
] as const;

/** Terminal decision of an approval, as recorded by the ApprovalDecided event. */
export type ApprovalDecision = "approved" | "edited" | "rejected" | "expired" | "cancelled";

export type AgentRunEvent =
  | { type: "AgentRunCreated"; goal: string; requestedById: string }
  | { type: "AgentRunAuthorized"; agentId: string; operations: string[] }
  | { type: "TaskClassified"; classification: string; matchedDomains: string[] }
  | { type: "ContextSelected"; collections: string[]; recordCounts: Record<string, number> }
  | {
      type: "PlanCreated";
      steps: { agentId: string; operation: string; domain: string; titleHe: string }[];
    }
  | { type: "SpecialistsSelected"; agentIds: string[] }
  | { type: "SpecialistTaskStarted"; taskId: string; agentId: string; operation: string }
  | {
      type: "SpecialistTaskCompleted";
      taskId: string;
      agentId: string;
      /** full envelope persisted here — the ONLY store for run envelopes */
      envelope: AIResponseEnvelopeV2;
    }
  | {
      type: "SpecialistTaskFailed";
      taskId: string;
      agentId: string;
      errorCode: string;
      detailHe: string;
    }
  | {
      type: "HandoffOccurred";
      handoffId: string;
      taskId: string;
      fromAgentId: string;
      toAgentId: string;
      depth: number;
      reasonHe: string;
    }
  | {
      type: "EvidenceVerified";
      taskId: string;
      verifiedCount: number;
      /** sourceIds cited but NOT verified at generation time */
      missing: string[];
    }
  | {
      type: "ConflictDetected";
      conflictId: string;
      participants: string[];
      descriptionHe: string;
      /** full structured conflict (claims / evidence per side / severity …) */
      detail: ConflictDetail;
    }
  | {
      type: "ConflictResolved";
      conflictId: string;
      /** one of the 5 resolution actions (Hebrew keys, see conflicts.ts) */
      action: string;
      resolvedById: string;
      noteHe: string;
    }
  | { type: "SynthesisCompleted"; summaryHe: string; envelopeIds: string[] }
  | {
      type: "ApprovalRequested";
      approvalId: string;
      action: ApprovalRequiredAction;
      /** what execution will do — persisted so execute() replays from records */
      executionPayload: ExecutionPayload | null;
      previewHe: string;
    }
  | {
      type: "ApprovalDecided";
      approvalId: string;
      decision: ApprovalDecision;
      decidedById: string;
      noteHe: string;
      /** decision "edited" ⇒ the human-edited payload that will execute */
      editedPayload: ExecutionPayload | null;
    }
  | {
      type: "ExecutionCompleted";
      approvalId: string;
      outcome: "הצלחה" | "נכשל";
      resultRef: string | null;
      /** inverse op captured at execution time (or honest "unsupported") */
      inverse: InversePayload | null;
      detailHe: string;
    }
  | { type: "AgentRunCompleted"; status: "הושלם"; envelopeIds: string[] }
  | {
      type: "AgentRunCancelled";
      kind: "משתמש" | "מגבלה" | "שגיאה";
      reasonHe: string;
      /** agentErrors record id when kind is "שגיאה" */
      errorId: string | null;
    };
