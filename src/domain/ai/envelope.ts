// TERAGON AI BUSINESS OS — canonical AI response envelope V2 (Wave 5, W5-A).
// Supersedes the Wave-1 7-field AIResponseEnvelope (src/domain/types.ts) without
// breaking it: bridge helpers below convert in both directions.
//
// Honesty contract (non-negotiable):
// - confidence.status === "unavailable" ⇒ the UI MUST render "טרם נמדד".
//   An absent confidence value is NEVER defaulted to 0.
// - usage fields are optional: absent ≠ zero. usage.measured says whether the
//   numbers were actually reported by the provider.
// - limitations is always non-empty for honest providers.
import type { ISODate } from "@/domain/types";
import type { AIResponseEnvelope, Evidence } from "@/domain/types";

// ---------------------------------------------------------------------------
// building blocks
// ---------------------------------------------------------------------------

/** Where an evidence item comes from (mirrors domain Evidence.sourceType). */
export type EvidenceSourceType = "entity" | "document" | "computation" | "external";

/** A single piece of evidence backing an AI output — cites a REAL record. */
export interface EvidenceItem {
  sourceType: EvidenceSourceType;
  /** id of the actual record cited (e.g. "lead-3") — never invented */
  sourceId: string;
  /** human-readable title of the source (Hebrew) */
  title: string;
  /** the exact slice of the source that is relevant */
  relevantExcerpt: string;
  /** how relevance was determined (e.g. "כלל דטרמיניסטי — התאמת סטטוס") */
  relevanceMethod: string;
  /** true only when the cited record was verified to exist at generation time */
  verified: boolean;
  /** updatedAt of the cited record at generation time */
  lastUpdated: ISODate;
}

export type ConfidenceStatus = "measured" | "estimated" | "unavailable";

/**
 * Honest confidence. Renderer contract:
 * - status "unavailable" ⇒ render "טרם נמדד" (see confidenceDisplayHe).
 * - value is 0–100 when present; an ABSENT value must never be rendered as 0.
 */
export interface ConfidenceInfo {
  /** percent 0–100; present only when honestly measured/estimated */
  value?: number;
  /** short Hebrew label for the UI (e.g. "טרם נמדד") */
  label: string;
  /** how the value/label was derived (never an invented number) */
  method: string;
  /** signals that contributed to the derivation (rule hits, data coverage…) */
  contributingSignals: string[];
  status: ConfidenceStatus;
}

export type ApprovalState =
  "not_required" | "pending" | "approved" | "edited" | "rejected" | "expired" | "cancelled";

/** Human-in-the-loop approval envelope slice. */
export interface ApprovalInfo {
  /** true for anything that would mutate data or send a message */
  required: boolean;
  state: ApprovalState;
  requestedAt?: ISODate;
  approvedAt?: ISODate;
  approverId?: string;
  approverName?: string;
  /** the human's edits to the AI output (state "edited") */
  userEdits?: string;
  /** mandatory when state is "rejected" */
  rejectionReason?: string;
}

/**
 * Provider usage accounting. Every field optional: absent ≠ zero.
 * measured=false ⇒ the provider did not report usage (e.g. local rules engine).
 */
export interface UsageInfo {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  estimatedCost?: number;
  /** ISO currency code, e.g. "ILS" | "USD" — present only with estimatedCost */
  currency?: string;
  measured: boolean;
}

/** Outcome of the AI operation (Hebrew product language). */
export type AIEnvelopeStatus = "הצלחה" | "נכשל" | "חלקי" | "בוטל";

// ---------------------------------------------------------------------------
// the canonical envelope
// ---------------------------------------------------------------------------

export interface AIResponseEnvelopeV2 {
  /** unique envelope id */
  id: string;
  /** id of the originating AIRequest */
  requestId: string;
  /** correlation id threading client → server → provider → audit */
  correlationId: string;
  /** provider id, e.g. "local-rules" | "remote" */
  provider: string;
  /** model that produced the output; null for rule engines (never faked) */
  model: string | null;
  createdAt: ISODate;
  /** operation key, e.g. "summarize.weekly-leads" */
  operation: string;
  /** ההמלצה — the main output text */
  recommendation: string;
  /** למה — the reasoning behind the output */
  reason: string;
  /** ראיות — real records cited */
  evidence: EvidenceItem[];
  confidence: ConfidenceInfo;
  /** הפעולה הבאה */
  nextStep: string;
  /** honest limitations — always non-empty for honest providers */
  limitations: string[];
  approval: ApprovalInfo;
  usage: UsageInfo;
  status: AIEnvelopeStatus;
}

// ---------------------------------------------------------------------------
// renderer helpers (the UI contract lives here, next to the type)
// ---------------------------------------------------------------------------

export const CONFIDENCE_UNAVAILABLE_HE = "טרם נמדד";

/**
 * The ONLY sanctioned way to render confidence as text.
 * - unavailable ⇒ "טרם נמדד".
 * - measured/estimated WITHOUT a value ⇒ label (never "0%").
 * - with a value ⇒ "NN%" (the label carries qualitative wording).
 */
export function confidenceDisplayHe(confidence: ConfidenceInfo): string {
  if (confidence.status === "unavailable") return CONFIDENCE_UNAVAILABLE_HE;
  if (confidence.value === undefined) return confidence.label || CONFIDENCE_UNAVAILABLE_HE;
  return `${Math.round(confidence.value)}%`;
}

/** ConfidenceInfo for "we did not measure" — the honest default. */
export function unavailableConfidence(method: string, signals: string[] = []): ConfidenceInfo {
  return {
    label: CONFIDENCE_UNAVAILABLE_HE,
    method,
    contributingSignals: signals,
    status: "unavailable",
  };
}

// ---------------------------------------------------------------------------
// bridge: V2 ⇄ Wave-1 AIResponseEnvelope (used by AIRecommendation records)
// ---------------------------------------------------------------------------

/**
 * Downgrade a V2 envelope to the Wave-1 7-field envelope so existing
 * consumers (AIRecommendation records, decision center) keep working.
 * Evidence items become full domain Evidence records anchored on the envelope.
 */
export function toLegacyEnvelope(v2: AIResponseEnvelopeV2): AIResponseEnvelope<string> {
  const evidence: Evidence[] = v2.evidence.map((item, i) => ({
    id: `${v2.id}-ev-${i + 1}`,
    createdAt: v2.createdAt,
    updatedAt: v2.createdAt,
    subjectRef: `ai-envelope:${v2.id}`,
    sourceType: item.sourceType,
    sourceRef: item.sourceId,
    claim: item.relevantExcerpt,
    capturedAt: item.lastUpdated,
  }));
  return {
    result: v2.recommendation,
    reason: v2.reason,
    evidence,
    // Wave-1 contract: null ⇒ "טרם נמדד"
    confidenceMethod: v2.confidence.status === "unavailable" ? null : v2.confidence.method,
    limitations: v2.limitations.join(" · "),
    nextAction: v2.nextStep,
    approvalRequired: v2.approval.required,
  };
}

/** Metadata the Wave-1 envelope does not carry, required to lift it to V2. */
export interface LegacyLiftMeta {
  id: string;
  requestId: string;
  correlationId: string;
  provider: string;
  model: string | null;
  createdAt: ISODate;
  operation: string;
}

/**
 * Lift a Wave-1 envelope to V2. Confidence becomes "estimated" only when the
 * legacy confidenceMethod exists (still WITHOUT a number — none was measured);
 * otherwise honestly "unavailable". Usage is unmeasured (absent ≠ zero).
 */
export function fromLegacyEnvelope(
  legacy: AIResponseEnvelope<string>,
  meta: LegacyLiftMeta,
): AIResponseEnvelopeV2 {
  const evidence: EvidenceItem[] = legacy.evidence.map((ev) => ({
    sourceType: ev.sourceType,
    sourceId: ev.sourceRef,
    title: ev.claim,
    relevantExcerpt: ev.claim,
    relevanceMethod: "הועבר ממעטפת דור 1",
    verified: false,
    lastUpdated: ev.capturedAt,
  }));
  const confidence: ConfidenceInfo =
    legacy.confidenceMethod === null
      ? unavailableConfidence("לא נמדד במעטפת דור 1")
      : {
          label: "הוערך (ללא ערך מספרי)",
          method: legacy.confidenceMethod,
          contributingSignals: [],
          status: "estimated",
        };
  return {
    id: meta.id,
    requestId: meta.requestId,
    correlationId: meta.correlationId,
    provider: meta.provider,
    model: meta.model,
    createdAt: meta.createdAt,
    operation: meta.operation,
    recommendation: legacy.result,
    reason: legacy.reason,
    evidence,
    confidence,
    nextStep: legacy.nextAction,
    limitations: legacy.limitations.length > 0 ? [legacy.limitations] : ["לא צוינו מגבלות במקור"],
    approval: {
      required: legacy.approvalRequired,
      state: legacy.approvalRequired ? "pending" : "not_required",
    },
    usage: { measured: false },
    status: "הצלחה",
  };
}
