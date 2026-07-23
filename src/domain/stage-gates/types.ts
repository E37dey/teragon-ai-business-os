// TERAGON AI BUSINESS OS — Stage Gates V2 (Wave 7, W7-C, Phases 7.7-7.9).
// EXACTLY SIX canonical gates (G1-G6, SCREEN_SPECS_HE ch.14) layered as a V2
// bridge over the six seeded StageGate records (sg-1..sg-6) — the legacy
// records are never replaced, only annotated. Evidence = typed refs to REAL
// canonical records; there is NO free-text evidence and NO percentage field
// anywhere in this model — a gate can never pass "מאחוז התקדמות".
import type { ISODate, StageGate } from "@/domain/types";

// ---------------------------------------------------------------------------
// gate keys + the 7 reachable states
// ---------------------------------------------------------------------------

export const STAGE_GATE_KEYS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;
export type StageGateKey = (typeof STAGE_GATE_KEYS)[number];

/** All 7 states of a V2 gate (SCREEN_SPECS_HE ch.14 + Wave-7 honesty rules). */
export const STAGE_GATE_V2_STATES = [
  "לא התחיל",
  "בבדיקה",
  "חסרות ראיות",
  "Go",
  "No-Go",
  "פג תוקף",
  "נפתח מחדש",
] as const;
export type StageGateV2State = (typeof STAGE_GATE_V2_STATES)[number];

export type StageGateDecision = "Go" | "No-Go";

// ---------------------------------------------------------------------------
// typed evidence refs — REAL canonical collections only
// ---------------------------------------------------------------------------

/**
 * The only record kinds a gate may cite as evidence. Each maps to one REAL
 * canonical collection; screenshots are attached as document refs.
 */
export const STAGE_GATE_EVIDENCE_REF_TYPES = [
  "persona",
  "trainingMaterial",
  "metricDefinition",
  "metricObservation",
  "memoryRecord",
  "knowledgeArticle",
  "implementationEvidence",
  "document",
  "pilotDefinition",
  "pilotResult",
  "rolloutWave",
] as const;
export type StageGateEvidenceRefType = (typeof STAGE_GATE_EVIDENCE_REF_TYPES)[number];

export const EVIDENCE_REF_TYPE_LABELS_HE: Record<StageGateEvidenceRefType, string> = {
  persona: "פרסונה",
  trainingMaterial: "חומר הדרכה",
  metricDefinition: "הגדרת מדד",
  metricObservation: "תצפית מדד",
  memoryRecord: "רשומת זיכרון",
  knowledgeArticle: "מאמר ידע מאושר",
  implementationEvidence: "ראיית הטמעה",
  document: "מסמך (כולל צילומי מסך)",
  pilotDefinition: "הגדרת פיילוט",
  pilotResult: "תוצאת פיילוט (PilotResult)",
  rolloutWave: "גל הרחבה",
};

/** One attached evidence reference — always to an existing record by id. */
export interface StageGateEvidenceRef {
  id: string;
  refType: StageGateEvidenceRefType;
  /** id of the REAL record in the canonical collection */
  refId: string;
  /** which criterion of the gate this evidence supports */
  criterionKey: string;
  attachedAt: ISODate;
  attachedById: string;
  noteHe: string;
}

// ---------------------------------------------------------------------------
// criterion definitions (code-canonical — deterministic, not stored)
// ---------------------------------------------------------------------------

export interface StageGateCriterionDef {
  key: string;
  titleHe: string;
  /** which record kinds satisfy this criterion */
  requiredRefTypes: readonly StageGateEvidenceRefType[];
  /** minimum count of VALID attached refs */
  minCount: number;
  /**
   * metric-based claim: every attached metricObservation must have a non-null
   * value AND an earlier non-null baseline observation for the same metric —
   * otherwise the claim is blocked ("לא הוגדר קו בסיס").
   */
  needsBaseline: boolean;
  /**
   * training-matrix coverage: the attached trainingMaterials must cover every
   * persona that has a real training track.
   */
  personaCoverage: boolean;
  /** SCREEN_SPECS_HE ch.14 evidence examples for this criterion */
  evidenceExamplesHe: readonly string[];
}

export interface StageGateDef {
  gateKey: StageGateKey;
  /** id of the seeded Wave-1 StageGate record this V2 gate bridges onto */
  legacyId: string;
  nameHe: string;
  descriptionHe: string;
  criteria: readonly StageGateCriterionDef[];
  riskHe: string;
}

/**
 * THE six canonical gates. This list is the single source of truth — the
 * bridge refuses to run against anything but exactly these six seeded ids.
 */
export const CANONICAL_STAGE_GATES: readonly StageGateDef[] = [
  {
    gateKey: "G1",
    legacyId: "sg-1",
    nameHe: "מוכנות",
    descriptionHe: "הבעיה, הפתרון והקהל מוגדרים; לכל פרסונה מסלול ולשער בעלים בשם.",
    riskHe: "התחלה ללא הגדרת קהל — הדרכה גנרית שלא נקלטת.",
    criteria: [
      {
        key: "g1-personas",
        titleHe: "מפת פרסונות מלאה — כל 7 הפרסונות ממופות עם מסלול הדרכה",
        requiredRefTypes: ["persona"],
        minCount: 7,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Persona Map", "Use Case Brief"],
      },
      {
        key: "g1-goal",
        titleHe: "מטרת הפתרון מתועדת ברשומה אמיתית (זיכרון/מסמך/מאמר ידע)",
        requiredRefTypes: ["memoryRecord", "document", "knowledgeArticle"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Use Case Brief"],
      },
    ],
  },
  {
    gateKey: "G2",
    legacyId: "sg-2",
    nameHe: "עיצוב הדרכה",
    descriptionHe: "מטריצת הדרכה מכסה כל פרסונה עם מסלול; חומרי היסוד קיימים כרשומות.",
    riskHe: "חומרים גנריים ללא התאמה לפרסונה — אימוץ נמוך.",
    criteria: [
      {
        key: "g2-matrix",
        titleHe: "מטריצת הדרכה — חומר הדרכה אמיתי לכל פרסונה בעלת מסלול",
        requiredRefTypes: ["trainingMaterial"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: true,
        evidenceExamplesHe: ["Training Matrix"],
      },
      {
        key: "g2-core-materials",
        titleHe: "חומרי יסוד — FAQ/התנגדויות ונוהל תמיכה קיימים",
        requiredRefTypes: ["trainingMaterial", "document"],
        minCount: 2,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["FAQ", "Quick Start", "Support Plan"],
      },
    ],
  },
  {
    gateKey: "G3",
    legacyId: "sg-3",
    nameHe: "פיילוט מוכן",
    descriptionHe: "פיילוט מוגדר ומדיד: קבוצת יעד, מדדים עם קו בסיס וחומרי תמיכה זמינים.",
    riskHe: "פיילוט בלי קו בסיס — אי אפשר להוכיח שינוי.",
    criteria: [
      {
        key: "g3-pilot-def",
        titleHe: "הגדרת פיילוט (PilotDefinition) עם קבוצת יעד ותאריכים",
        requiredRefTypes: ["pilotDefinition"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Pilot Metrics"],
      },
      {
        key: "g3-baseline",
        titleHe: "קו בסיס מדוד לכל מדד פיילוט (תצפית עם ערך אמיתי)",
        requiredRefTypes: ["metricObservation"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Pilot Metrics"],
      },
      {
        key: "g3-support",
        titleHe: "Quick Start ונוהל תמיכה זמינים למשתתפי הפיילוט",
        requiredRefTypes: ["trainingMaterial", "document"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Quick Start", "Support Plan"],
      },
    ],
  },
  {
    gateKey: "G4",
    legacyId: "sg-4",
    nameHe: "הפיילוט הצליח",
    descriptionHe:
      "טענת «הפיילוט הצליח» מחייבת רשומת PilotResult אמיתית ומדידות מול קו הבסיס — בלעדיה השער לא יכול לעבור.",
    riskHe: "הכרזת הצלחה ללא תוצאה מתועדת — הרחבה על בסיס אשליה.",
    criteria: [
      {
        key: "g4-pilot-result",
        titleHe: "רשומת PilotResult אמיתית עם תוצאות מתועדות",
        requiredRefTypes: ["pilotResult"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Pilot Metrics"],
      },
      {
        key: "g4-metrics",
        titleHe: "מדידות פיילוט עם ערך אמיתי מול קו בסיס קיים",
        requiredRefTypes: ["metricObservation"],
        minCount: 1,
        needsBaseline: true,
        personaCoverage: false,
        evidenceExamplesHe: ["Pilot Metrics"],
      },
    ],
  },
  {
    gateKey: "G5",
    legacyId: "sg-5",
    nameHe: "מוכן להרחבה",
    descriptionHe: "תכנית הרחבה מוגדרת, רשימת Champions מתועדת ונוהל תמיכה פעיל.",
    riskHe: "הרחבה בלי Champions — אין מי שיחזיק את האימוץ בשטח.",
    criteria: [
      {
        key: "g5-rollout",
        titleHe: "גל הרחבה (RolloutWave) מוגדר עם קבוצות ותאריכים",
        requiredRefTypes: ["rolloutWave"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Champion List"],
      },
      {
        key: "g5-champions",
        titleHe: "Champion List — נציגים בשמות מתועדים ברשומה אמיתית",
        requiredRefTypes: ["memoryRecord", "document", "implementationEvidence"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Champion List"],
      },
      {
        key: "g5-support-plan",
        titleHe: "נוהל תמיכה לאחר השקה קיים וזמין",
        requiredRefTypes: ["trainingMaterial", "document"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Support Plan"],
      },
    ],
  },
  {
    gateKey: "G6",
    legacyId: "sg-6",
    nameHe: "הפעלה שגרתית",
    descriptionHe: "מדדי אימוץ שוטפים נמדדים בפועל וסקירת ממשל מאושרת קיימת.",
    riskHe: "«שגרה» בלי מדידה שוטפת — נסיגה שקטה באימוץ.",
    criteria: [
      {
        key: "g6-adoption",
        titleHe: "מדדי אימוץ שוטפים — תצפיות עדכניות עם ערך אמיתי מול קו בסיס",
        requiredRefTypes: ["metricObservation"],
        minCount: 1,
        needsBaseline: true,
        personaCoverage: false,
        evidenceExamplesHe: ["Pilot Metrics", "Governance Review"],
      },
      {
        key: "g6-governance",
        titleHe: "Governance Review — סקירת ממשל כרשומה מאושרת",
        requiredRefTypes: ["knowledgeArticle", "implementationEvidence", "document"],
        minCount: 1,
        needsBaseline: false,
        personaCoverage: false,
        evidenceExamplesHe: ["Governance Review"],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// persisted V2 layer — extension fields on the SAME six seeded records
// ---------------------------------------------------------------------------

export interface StageGateCompletionRequest {
  requestedAt: ISODate;
  requestedById: string;
  noteHe: string;
}

/** The persisted V2 extension (stored under `v2` on the seeded record). */
export interface StageGateV2Fields {
  gateKey: StageGateKey;
  nameHe: string;
  attachedEvidence: StageGateEvidenceRef[];
  ownerId: string | null;
  reviewerId: string | null;
  decision: StageGateDecision | null;
  decisionDate: ISODate | null;
  decidedById: string | null;
  decisionNoteHe: string;
  /** true after "פתח מחדש" until the next decision */
  reopened: boolean;
  reopenNoteHe: string;
  completionRequests: StageGateCompletionRequest[];
  /** planned next decision date — null ⇒ "לא נקבע" (never invented) */
  targetDecisionDate: ISODate | null;
  bridgedAt: ISODate;
}

/** A seeded StageGate record after the idempotent V2 bridge annotated it. */
export interface StageGateV2 extends StageGate {
  v2: StageGateV2Fields;
}

export function isStageGateV2(gate: StageGate): gate is StageGateV2 {
  return typeof (gate as Partial<StageGateV2>).v2 === "object" &&
    (gate as Partial<StageGateV2>).v2 !== null;
}

// ---------------------------------------------------------------------------
// minimal readers for Wave-7 collections whose canonical types are owned by
// W7-A (integration request filed) — we only read id + optional display fields
// ---------------------------------------------------------------------------

export interface W7RecordLike {
  id: string;
  createdAt: ISODate;
  updatedAt: ISODate;
  /** optional display fields various W7 records may carry */
  name?: string;
  title?: string;
  titleHe?: string;
  status?: string;
  outcome?: string;
}
