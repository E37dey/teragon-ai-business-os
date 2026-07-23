// W7-D — typed domain layer for the 13 canonical training materials (7.10),
// the quick-start flow (7.12), the Microlearning concept (7.13) and the
// objections + LACE workspace (7.14).
//
// TrainingMaterialV2 follows the W6-E domain-extension pattern
// (src/integration/domainExtensions.ts): src/domain/types.ts is frozen, so the
// mandated fields live as an ALL-OPTIONAL extension over the seeded
// TrainingMaterial. Every record already in IndexedDB satisfies the extended
// type; the idempotent bridge (bridge.ts) fills the canonical values.
import type { BaseEntity, ISODate, TrainingMaterial } from "@/domain/types";

// ---------------------------------------------------------------------------
// material status + section (7.10 mandated vocabulary)
// ---------------------------------------------------------------------------

export const MATERIAL_STATUSES = [
  "לא התחיל",
  "טיוטה",
  "ממתין לבדיקה",
  "מאושר",
  "דורש עדכון",
  "חסר",
  "בארכיון",
] as const;

export type MaterialStatus = (typeof MATERIAL_STATUSES)[number];

export type MaterialSection = "חומרי קריאה" | "חומרי הוראה ותרגול";

/** stable keys of the 13 mandated materials (order = mandated order) */
export const CANONICAL_MATERIAL_KEYS = [
  "purpose-doc",
  "to-be-map",
  "quick-start",
  "correct-use-policy",
  "prompt-library",
  "faq-objections",
  "risk-governance",
  "training-script",
  "training-presentation",
  "microlearning-videos",
  "hands-on-exercises",
  "support-doc",
  "adoption-dashboard",
] as const;

export type CanonicalMaterialKey = (typeof CANONICAL_MATERIAL_KEYS)[number];

// ---------------------------------------------------------------------------
// structured content blocks — REAL content, rendered safely (no HTML strings)
// ---------------------------------------------------------------------------

export type ContentBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; title?: string; items: string[] }
  | { kind: "steps"; title?: string; items: string[] }
  | {
      kind: "note";
      tone: "info" | "warning" | "success" | "danger";
      text: string;
    }
  /** a timed segment of a script (seconds are real, verifiable numbers) */
  | { kind: "timed"; label: string; fromSec: number; toSec: number; text: string }
  /** a pointer to a REAL in-app route (integration seams stay honest) */
  | { kind: "routeRef"; route: string; label: string; note: string }
  /** a prompt scenario against an actual product command */
  | {
      kind: "prompt";
      scenario: string;
      promptHe: string;
      operation: string;
      expectedOutcome: string;
      caution: string;
    };

export interface MaterialContentSection {
  heading: string;
  blocks: ContentBlock[];
}

// ---------------------------------------------------------------------------
// TrainingMaterialV2 — the seeded entity + all mandated W7 fields (optional)
// ---------------------------------------------------------------------------

export interface TrainingMaterialExtension {
  /** which of the 13 canonical materials this record is */
  canonicalKey?: CanonicalMaterialKey;
  section?: MaterialSection;
  status?: MaterialStatus;
  /** semantic content version, e.g. "1.0" */
  version?: string;
  /** named owner (users collection id); null = honestly "לא הוקצה אחראי" */
  ownerId?: string | null;
  /** in-app route the material lives at / points to; null = content-only */
  contentRoute?: string | null;
  printable?: boolean;
  exportFormats?: string[];
  relatedStageId?: string | null;
  relatedGateId?: string | null;
  /** honest quality-validation notes (what was checked, what was not) */
  qualityValidation?: string[];
  /** next scheduled content review; null = honestly "לא נקבע מועד בדיקה" */
  reviewDate?: ISODate | null;
  /** canonical Approval record ref (approvals collection); null = none yet */
  approvalId?: string | null;
  /** the measurable outcome this material targets; null = honestly missing */
  measurableOutcome?: string | null;
  /** true when the material contains actual practice / exercise steps */
  practiceIncluded?: boolean;
  /** bumped when the canonical authored content changes (bridge idempotency) */
  contentVersion?: number;
}

export type TrainingMaterialV2 = TrainingMaterial & TrainingMaterialExtension;

// ---------------------------------------------------------------------------
// objection records (7.14) — canonical `objections` collection shape
// ---------------------------------------------------------------------------

/** the four LACE stages with natural Hebrew wording */
export interface LaceResponse {
  /** Listen — מקשיבים בלי לקטוע */
  listenHe: string;
  /** Acknowledge — מכירים ברגש/בחשש */
  acknowledgeHe: string;
  /** Confirm — מוודאים שהבנו נכון */
  confirmHe: string;
  /** Explore — חוקרים יחד את הפתרון */
  exploreHe: string;
}

export type ObjectionReviewStatus =
  | "טרם נבדק בשטח"
  | "נבדק בשיחה אמיתית"
  | "דורש עדכון";

export interface ObjectionRecord extends BaseEntity {
  /** stable content key, e.g. "obj-replace-me" */
  key: string;
  /** what was actually said, verbatim */
  surfaceStatement: string;
  /** the concern underneath the words */
  underlyingConcern: string;
  /** affected persona (personas collection id) */
  personaId: string;
  relatedRisk: string;
  lace: LaceResponse;
  /** supporting evidence — REAL in-app routes / materials, never invented */
  supportingEvidence: { label: string; route: string | null; note: string }[];
  /** related training material id (trainingMaterials collection) */
  relatedMaterialId: string | null;
  /** responsible owner (users collection id) */
  ownerId: string | null;
  followUpQuestion: string;
  reviewStatus: ObjectionReviewStatus;
  /** bumped when the canonical authored content changes (bridge idempotency) */
  contentVersion: number;
}

// ---------------------------------------------------------------------------
// Microlearning concept (7.13) — a CONCEPT + SCRIPT, never a fake video
// ---------------------------------------------------------------------------

/** the exact honest label — asserted by tests, rendered by the UI */
export const MICROLEARNING_CONCEPT_LABEL = "קונספט ותסריט Microlearning";

export interface MicrolearningSegment {
  fromSec: number;
  toSec: number;
  /** storyboard: what the frame shows */
  storyboard: string;
  /** narration text (Hebrew, read aloud) */
  narration: string;
  /** on-screen Hebrew text overlay */
  onScreenText: string;
  /** what happens on the screen (real product actions) */
  screenAction: string;
  /** comprehension-check question for this segment */
  successQuestion: string;
}

export interface MicrolearningConcept {
  key: string;
  title: string;
  /** must equal MICROLEARNING_CONCEPT_LABEL — no fake video claim */
  label: string;
  totalSec: number;
  segments: MicrolearningSegment[];
  /** full accessibility transcript (narration + on-screen text) */
  accessibilityTranscript: string;
  /** thumbnail frame described as renderable data (not an image claim) */
  thumbnail: { titleHe: string; subtitleHe: string; accent: string };
  productionStatus: "קונספט בלבד — לא הופק וידאו";
}

// ---------------------------------------------------------------------------
// quick start (7.12)
// ---------------------------------------------------------------------------

export interface QuickStartAction {
  order: number;
  title: string;
  /** REAL app route the "נסה זאת" button navigates to */
  route: string;
  routeLabel: string;
  /** honest schematic UI demonstration (rendered live, not a screenshot) */
  demo: { header: string; rows: string[]; actionLabel: string };
  expectedResult: string;
  estimatedTime: string;
  commonMistake: string;
  safetyNote: string;
}

export interface CorrectUseRules {
  allowed: string[];
  mustVerify: string[];
  forbidden: string[];
}
