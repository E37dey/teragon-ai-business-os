// W7-B — PersonaV2 domain types (Phases 7.4-7.6, SCREEN_SPECS_HE chapter 13).
// The 7 seeded persona records (per-1..per-7) are BRIDGED — same ids, enriched
// to the canonical V2 shape. Targets are TARGETS; measured results live in a
// separate field and are honest ("טרם נמדד") until a real observation exists.

/** The exactly-7 canonical persona names (spec chapter 13 — mandatory, verbatim). */
export const CANONICAL_PERSONA_NAMES = [
  "משתמש קצה",
  "מנהל צוות",
  "הנהלה",
  "IT / אבטחת מידע",
  "Legal / Compliance",
  "Champion · השגריר",
  "המתנגד",
] as const;

export type CanonicalPersonaName = (typeof CANONICAL_PERSONA_NAMES)[number];

/** Governance state of a persona record (same vocabulary as memory governance). */
export type PersonaApprovalState = "טיוטה" | "ממתין לאישור" | "מאושר";

/** Support tier the persona is routed to on /support (Tier model, ref 19). */
export type PersonaSupportTier = 1 | 2 | 3;

/**
 * Success metric — target vs measured are SEPARATE.
 * `numericTarget` exists only where the spec/donor defines one (80% task
 * completion for משתמש קצה); otherwise it is null with the honest
 * `targetNote` "לא הוגדר יעד מספרי". `measuredValue` starts null with
 * `measuredNote` "טרם נמדד" — a target is never presented as a result.
 */
export interface PersonaSuccessMetric {
  /** qualitative description of what success looks like */
  description: string;
  /** numeric TARGET — null when no numeric target is defined by the spec */
  numericTarget: number | null;
  /** unit of the numeric target (e.g. "%") — null when no numeric target */
  unit: string | null;
  /** honest note about the target (e.g. "לא הוגדר יעד מספרי") */
  targetNote: string;
  /** MEASURED result — null until a real measurement exists */
  measuredValue: number | null;
  /** honest note about the measurement state (e.g. "טרם נמדד") */
  measuredNote: string;
}

/** Link from a persona to one of the 13 seeded trainingMaterials records. */
export interface PersonaMaterialLink {
  /** id of a seeded TrainingMaterial (tm-1..tm-13) */
  materialId: string;
  /** exactly one "ראשי" per persona — the auditor flags duplicated primaries */
  role: "ראשי" | "משלים";
  /**
   * `updatedAt` of the material at the time this persona version was approved.
   * The auditor flags a version mismatch when the live material was edited later.
   */
  expectedUpdatedAt: string;
}

/** Named owner — a real person from the users seed, never a role or a team. */
export interface PersonaNamedOwner {
  userId: string;
  name: string;
}

/** Objection record (LACE model) — exported for the W7-D FAQ. */
export interface PersonaObjection {
  id: string;
  /** seed persona id (per-1..per-7) this objection belongs to */
  personaId: string;
  /** canonical persona name (redundant on purpose — W7-D consumes this flat) */
  personaName: CanonicalPersonaName;
  /** the objection as the persona voices it */
  quote: string;
  /** LACE — Listen */
  listen: string;
  /** LACE — Acknowledge */
  acknowledge: string;
  /** LACE — Clarify */
  clarify: string;
  /** LACE — Explore (the agreed next step) */
  explore: string;
  /** where the objection text originates (donor / derived) */
  sourceNote: string;
}

/**
 * PersonaV2 — the canonical enriched persona entity (spec chapter 13).
 * `id` is the SEED persona id (per-1..per-7) — the bridge enriches, it never
 * forks identities.
 */
export interface PersonaV2 {
  id: string;
  name: CanonicalPersonaName;
  /**
   * Original seed persona name (honest provenance). Lead decision on
   * contradiction C1: the brief's adoption set is canonical — seed records
   * keep their ids (1:1 by order) but name/role/content are REPLACED; the
   * old name survives here only.
   */
  legacyName: string;
  /** canonical adoption role (NOT the legacy seed role) */
  role: string;
  businessContext: string;
  /** the one question this persona asks about the system */
  primaryQuestion: string;
  desiredValue: string;
  /** unique per persona — the auditor flags generic/duplicated barriers */
  adoptionBarrier: string;
  currentKnowledge: string;
  requiredKnowledge: string;
  requiredAbility: string;
  trainingObjective: string;
  /** mandated programme format (e.g. "סדנה + Microlearning") */
  trainingFormat: string;
  /** mandated programme duration in minutes (60/45/20/60/60/90/30) */
  durationMinutes: number;
  /** unique per persona — the auditor flags a missing/duplicated exercise */
  exercise: string;
  successMetric: PersonaSuccessMetric;
  supportingMaterials: PersonaMaterialLink[];
  namedOwner: PersonaNamedOwner;
  supportTier: PersonaSupportTier;
  /** objection ids (records exported separately for the W7-D FAQ) */
  objections: string[];
  approvalState: PersonaApprovalState;
  version: number;
}

/** Result of the exactly-7 count guard. */
export interface Exactly7Result {
  ok: boolean;
  problems: string[];
}
