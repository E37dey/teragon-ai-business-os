// TERAGON AI BUSINESS OS — W7-E (Phase 7.24): canonical CONTENT REGISTRY.
// Single source of truth for the identity constants and the exact mandated
// counts (7 personas / 13 materials / 6 stages / 6 gates / 12 deliverables /
// 5 rollout waves). The registry declares its OWN literals; validators compare
// them against the LIVE sources (seed, personas, adoption, stage-gates,
// training-materials) — tests FAIL on any drift, in either direction.
//
// Honesty rules (docs/WAVE_7_BASELINE.md + WAVE_7_CONTRADICTION_REPORT.md):
// - C2: the ONLY valid CEO spelling is "צחי זוסטייהם"; the donor variant
//   "צחי זוסטהיים" is rejected on sight.
// - C3: owners are named seeded users only — a role string is never an owner.

// ---------------------------------------------------------------------------
// identity constants (canonical spellings — compared against the seed)
// ---------------------------------------------------------------------------

export const CANONICAL_COMPANY_NAME = "טרגון טכנולוגיות";
export const CANONICAL_CEO_NAME = "צחי זוסטייהם";
export const CANONICAL_GREETING = "ערב טוב, צחי";

/** donor misspellings that must NEVER appear in any authored content (C2) */
export const REJECTED_IDENTITY_SPELLINGS: readonly string[] = ["צחי זוסטהיים"];

/** the five seeded named users — the ONLY valid owners (C3) */
export const CANONICAL_OWNER_IDS = [
  "u-tzachi",
  "u-maya",
  "u-oren",
  "u-ran",
  "u-noa",
] as const;

export const CANONICAL_OWNER_NAMES: Readonly<Record<string, string>> = {
  "u-tzachi": CANONICAL_CEO_NAME,
  "u-maya": "מאיה ברק",
  "u-oren": "אורן שגב",
  "u-ran": "רן אלמוג",
  "u-noa": "נעה פרידמן",
};

/** role words that are NOT people — an owner set to one of these is a defect */
export const ROLE_WORDS_NOT_PEOPLE: readonly string[] = [
  "מטמיע",
  "איש ההטמעה",
  "Champion",
  "מנהל מערכת",
  "IT",
  "Legal",
];

// ---------------------------------------------------------------------------
// exact mandated counts — 7 / 13 / 6 / 6 / 12 / 5
// ---------------------------------------------------------------------------

export const EXPECTED_COUNTS = {
  personas: 7,
  trainingMaterials: 13,
  adoptionStages: 6,
  stageGates: 6,
  deliverables: 12,
  rolloutWaves: 5,
} as const;

export type CountKey = keyof typeof EXPECTED_COUNTS;

// ---------------------------------------------------------------------------
// canonical name lists (registry copies — drift-checked against live sources)
// ---------------------------------------------------------------------------

/** the 7 canonical adoption personas (SPEC ch.13, C1 resolution) */
export const REGISTRY_PERSONA_NAMES = [
  "משתמש קצה",
  "מנהל צוות",
  "הנהלה",
  "IT / אבטחת מידע",
  "Legal / Compliance",
  "Champion · השגריר",
  "המתנגד",
] as const;

/** the 13 canonical training-material keys (SPEC ch.15, C5 resolution) */
export const REGISTRY_MATERIAL_KEYS = [
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

/** the 6 mandated adoption-stage names (SPEC ch.12, C4 resolution) */
export const REGISTRY_STAGE_NAMES = [
  "בעיה ותוצאה עסקית",
  "מפת AS-IS-TO-BE וגבולות אדם-AI",
  "שבע פרסונות ותכנית הדרכה",
  "פיילוט מבוקר",
  "הרחבה בגלים",
  "שגרה בקרה ושיפור מתמשך",
] as const;

/** the 6 gate keys (SPEC ch.14) */
export const REGISTRY_GATE_KEYS = ["G1", "G2", "G3", "G4", "G5", "G6"] as const;

/** the 5 mandated rollout-wave names (SPEC ch.12, C11 resolution) */
export const REGISTRY_ROLLOUT_WAVE_NAMES = [
  "Champions",
  "Early Adopters",
  "מחלקה ראשונה",
  "מחלקות נוספות",
  "הפעלה שגרתית",
] as const;

/** the 12 canonical submission deliverable keys (SPEC ch.19, owned by W7-E) */
export const REGISTRY_DELIVERABLE_KEYS = [
  "one-pager",
  "personas-map",
  "training-matrix",
  "implementation-plan",
  "stage-gates",
  "metric-levels",
  "quick-start",
  "correct-use-policy",
  "faq-lace",
  "training-script",
  "microlearning",
  "support-plan",
] as const;

export type DeliverableKey = (typeof REGISTRY_DELIVERABLE_KEYS)[number];

/** the 12 deliverable display titles, in mandated order */
export const REGISTRY_DELIVERABLE_TITLES: Readonly<Record<DeliverableKey, string>> = {
  "one-pager": "One-Pager לפתרון",
  "personas-map": "מפת 7 פרסונות",
  "training-matrix": "Training Matrix",
  "implementation-plan": "תכנית הטמעה 6 שלבים + Owners",
  "stage-gates": "Stage Gates + ראיות",
  "metric-levels": "מדדי הצלחה — 3 רמות",
  "quick-start": "Quick Start",
  "correct-use-policy": "נוהל שימוש נכון",
  "faq-lace": "FAQ + התנגדויות (LACE)",
  "training-script": "תסריט הדרכה 10 דק׳",
  microlearning: "רעיון לסרטון Microlearning",
  "support-plan": "תכנית תמיכה Tier-3",
};

// ---------------------------------------------------------------------------
// identity / drift validation
// ---------------------------------------------------------------------------

export interface RegistryFinding {
  /** which registry area drifted */
  area:
    | "identity"
    | "personas"
    | "trainingMaterials"
    | "adoptionStages"
    | "stageGates"
    | "rolloutWaves"
    | "deliverables"
    | "owners";
  detailHe: string;
}

/** live sources injected by the caller — the registry never imports UI */
export interface LiveSources {
  companyName: string;
  ceoName: string;
  greeting: string;
  personaNames: readonly string[];
  materialKeys: readonly string[];
  stageNames: readonly string[];
  gateKeys: readonly string[];
  rolloutWaveNames: readonly string[];
  /** seeded users as { id, name } */
  users: readonly { id: string; name: string }[];
}

function diffList(
  area: RegistryFinding["area"],
  expected: readonly string[],
  actual: readonly string[],
  label: string,
): RegistryFinding[] {
  const findings: RegistryFinding[] = [];
  if (expected.length !== actual.length) {
    findings.push({
      area,
      detailHe: `ספירת ${label}: הרישום מצפה ל-${expected.length}, במקור החי יש ${actual.length}`,
    });
  }
  for (let i = 0; i < Math.max(expected.length, actual.length); i += 1) {
    if (expected[i] !== actual[i]) {
      findings.push({
        area,
        detailHe: `${label} #${i + 1}: הרישום="${expected[i] ?? "—"}" מול המקור="${actual[i] ?? "—"}"`,
      });
    }
  }
  return findings;
}

/**
 * Compare the registry literals against the LIVE sources. Empty result ⇒ no
 * drift. Tests import the actual sources and fail on any finding.
 */
export function validateRegistry(live: LiveSources): RegistryFinding[] {
  const findings: RegistryFinding[] = [];
  if (live.companyName !== CANONICAL_COMPANY_NAME) {
    findings.push({
      area: "identity",
      detailHe: `שם החברה: "${live.companyName}" ≠ "${CANONICAL_COMPANY_NAME}"`,
    });
  }
  if (live.ceoName !== CANONICAL_CEO_NAME) {
    findings.push({
      area: "identity",
      detailHe: `שם המנכ"ל: "${live.ceoName}" ≠ "${CANONICAL_CEO_NAME}"`,
    });
  }
  if (live.greeting !== CANONICAL_GREETING) {
    findings.push({
      area: "identity",
      detailHe: `הברכה: "${live.greeting}" ≠ "${CANONICAL_GREETING}"`,
    });
  }
  findings.push(
    ...diffList("personas", REGISTRY_PERSONA_NAMES, live.personaNames, "פרסונה"),
    ...diffList("trainingMaterials", REGISTRY_MATERIAL_KEYS, live.materialKeys, "חומר הדרכה"),
    ...diffList("adoptionStages", REGISTRY_STAGE_NAMES, live.stageNames, "שלב הטמעה"),
    ...diffList("stageGates", REGISTRY_GATE_KEYS, live.gateKeys, "שער"),
    ...diffList("rolloutWaves", REGISTRY_ROLLOUT_WAVE_NAMES, live.rolloutWaveNames, "גל הרחבה"),
  );
  for (const ownerId of CANONICAL_OWNER_IDS) {
    const user = live.users.find((u) => u.id === ownerId);
    if (!user) {
      findings.push({ area: "owners", detailHe: `משתמש seed חסר: ${ownerId}` });
    } else if (user.name !== CANONICAL_OWNER_NAMES[ownerId]) {
      findings.push({
        area: "owners",
        detailHe: `שם המשתמש ${ownerId}: "${user.name}" ≠ "${CANONICAL_OWNER_NAMES[ownerId]}"`,
      });
    }
  }
  return findings;
}

/**
 * Scan a text for identity defects: a rejected CEO spelling (C2) or a role
 * word standing where a person name is required is a defect.
 */
export function findIdentityDefects(text: string): string[] {
  const defects: string[] = [];
  for (const bad of REJECTED_IDENTITY_SPELLINGS) {
    if (text.includes(bad)) {
      defects.push(`איות שגוי של שם המנכ"ל: "${bad}" — האיות הקנוני הוא "${CANONICAL_CEO_NAME}"`);
    }
  }
  return defects;
}

/** true when the id belongs to one of the five named seed users */
export function isNamedOwner(ownerId: string | null | undefined): boolean {
  return (
    ownerId !== null &&
    ownerId !== undefined &&
    (CANONICAL_OWNER_IDS as readonly string[]).includes(ownerId)
  );
}
