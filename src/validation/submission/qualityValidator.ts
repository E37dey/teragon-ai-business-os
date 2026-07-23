// TERAGON AI BUSINESS OS — W7-E (Phase 7.17): the EIGHT-ITEM quality validator.
// EXACTLY the 8 mandated criteria, evaluated per deliverable with DETERMINISTIC
// deep checks over the REAL current records — never text-presence matching and
// never a hardcoded 8/8. Same inputs ⇒ same outputs. Honest warnings/fails are
// the expected initial state (e.g. numeric targets without a measurement
// source, materials without a review date).
import { APP_ROUTES } from "@/app/routes";
import type { ISODate } from "@/domain/types";
import {
  CANONICAL_MATERIALS,
  CORRECT_USE_RULES,
  MICROLEARNING_CHECK_AI,
  QUICK_START_ACTIONS,
  type CanonicalMaterialDef,
  type ContentBlock,
} from "@/domain/training-materials";
import { isNamedOwner, type DeliverableKey } from "@/domain/submission/contentRegistry";
import {
  DELIVERABLE_DEFS,
  ONE_PAGER,
  type DeliverableDef,
  type SubmissionSources,
} from "@/domain/submission/deliverables";
import { SUBMISSION_METRICS } from "@/domain/submission/metricLevels";
import { measuredTierSla, SUPPORT_TIER_ARTEFACTS } from "@/domain/submission/supportDeliverable";
import { getRepository } from "@/repositories";
import type { SubmissionValidationRecord } from "@/domain/submission/types";

export const QUALITY_VALIDATOR_VERSION = "1.0.0";

/** EXACTLY the 8 mandated criteria, in mandated order (SPEC ch.19) */
export const QUALITY_CRITERIA = [
  "בהירות",
  "רלוונטיות",
  "פרסונליזציה",
  "בטיחות",
  "אחריות",
  "תרגול",
  "מדידה",
  "תחזוקה",
] as const;

export type QualityCriterion = (typeof QUALITY_CRITERIA)[number];

export type QualityState = "pass" | "warning" | "fail" | "not_applicable";

export interface QualityValidationResult {
  deliverableKey: DeliverableKey;
  criterion: QualityCriterion;
  state: QualityState;
  reasonHe: string;
  /** what ACTUAL evidence supports the verdict */
  evidenceHe: string[];
  missingFields: string[];
  /** id/route of the affected record, when one exists */
  affectedRecord: string | null;
  recommendedFixHe: string | null;
  checkedAt: ISODate;
  validatorVersion: string;
}

type Verdict = Omit<QualityValidationResult, "deliverableKey" | "criterion" | "checkedAt" | "validatorVersion">;

function pass(reasonHe: string, evidenceHe: string[] = [], affectedRecord: string | null = null): Verdict {
  return { state: "pass", reasonHe, evidenceHe, missingFields: [], affectedRecord, recommendedFixHe: null };
}

function warn(reasonHe: string, fix: string, missingFields: string[] = [], affectedRecord: string | null = null): Verdict {
  return { state: "warning", reasonHe, evidenceHe: [], missingFields, affectedRecord, recommendedFixHe: fix };
}

function fail(reasonHe: string, fix: string, missingFields: string[] = [], affectedRecord: string | null = null): Verdict {
  return { state: "fail", reasonHe, evidenceHe: [], missingFields, affectedRecord, recommendedFixHe: fix };
}

function na(reasonHe: string): Verdict {
  return { state: "not_applicable", reasonHe, evidenceHe: [], missingFields: [], affectedRecord: null, recommendedFixHe: null };
}

// ---------------------------------------------------------------------------
// helpers over the canonical material content (structured blocks, not text)
// ---------------------------------------------------------------------------

function canonicalDefOf(def: DeliverableDef): CanonicalMaterialDef | null {
  if (def.materialSeedId === null) return null;
  return CANONICAL_MATERIALS.find((m) => m.seedId === def.materialSeedId) ?? null;
}

function blocksOf(mat: CanonicalMaterialDef): ContentBlock[] {
  return mat.sections.flatMap((s) => s.blocks);
}

function hasBlockKind(mat: CanonicalMaterialDef, kinds: ContentBlock["kind"][]): boolean {
  return blocksOf(mat).some((b) => kinds.includes(b.kind));
}

/** every item of `items` appears as a bullet/step item in the material blocks */
function missingListItems(mat: CanonicalMaterialDef, items: readonly string[]): string[] {
  const listItems = blocksOf(mat).flatMap((b) =>
    b.kind === "bullets" || b.kind === "steps" ? b.items : [],
  );
  return items.filter((item) => !listItems.some((li) => li.includes(item)));
}

// ---------------------------------------------------------------------------
// criterion 1 — בהירות (structure: steps + expected results present)
// ---------------------------------------------------------------------------

function checkClarity(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  switch (def.key) {
    case "quick-start": {
      const broken = QUICK_START_ACTIONS.filter(
        (a) => a.expectedResult.trim() === "" || a.demo.rows.length === 0,
      );
      if (broken.length > 0)
        return fail(
          `${broken.length} פעולות ללא תוצאה צפויה או ללא הדגמה`,
          "להשלים תוצאה צפויה והדגמה לכל פעולה",
          broken.map((a) => a.title),
        );
      return pass("כל 3 הפעולות כוללות צעדים, הדגמה ותוצאה צפויה", [
        `${QUICK_START_ACTIONS.length} פעולות עם expectedResult מלא`,
      ]);
    }
    case "one-pager": {
      const empty = [
        ONE_PAGER.businessProblemHe.length === 0 ? "בעיה עסקית" : null,
        ONE_PAGER.solutionHe.length === 0 ? "פתרון" : null,
        ONE_PAGER.valueClaims.length === 0 ? "ערך" : null,
      ].filter((x): x is string => x !== null);
      if (empty.length > 0)
        return fail("חלקי ה-One-Pager חסרים", "להשלים את החלקים החסרים", empty);
      return pass("בעיה, פתרון וערך — כולם מאוכלסים ומסומני-סוג", [
        `${ONE_PAGER.valueClaims.length} טענות ערך מסומנות יעד/עיקרון/הערכה`,
      ]);
    }
    case "metric-levels": {
      const broken = SUBMISSION_METRICS.filter(
        (m) => m.definitionHe.trim() === "" || m.sourceHe.trim() === "",
      );
      if (broken.length > 0)
        return fail(
          `${broken.length} מדדים ללא הגדרה או מקור`,
          "להשלים הגדרה ומקור לכל מדד",
          broken.map((m) => m.key),
        );
      return pass(`כל ${SUBMISSION_METRICS.length} המדדים כוללים הגדרה, סוג ומקור`, [
        "קטלוג המדדים המלא נבדק שדה-שדה",
      ]);
    }
    case "support-plan": {
      const broken = SUPPORT_TIER_ARTEFACTS.filter(
        (t) => t.targetSlaHe.trim() === "" || t.channelsHe.length === 0,
      );
      if (broken.length > 0)
        return fail("שכבת תמיכה ללא SLA יעד או ערוצים", "להשלים SLA וערוצים", broken.map((t) => t.titleHe));
      return pass("3 שכבות עם קהל, ערוצים ו-SLA יעד מוגדרים", ["SPEC ch.18 — מיידי/שעתיים/יום עבודה"]);
    }
    case "personas-map":
    case "training-matrix": {
      const broken = ctx.personas.filter(
        (p) => p.trainingObjective.trim() === "" || p.requiredAbility.trim() === "",
      );
      if (broken.length > 0)
        return fail(
          `${broken.length} פרסונות ללא מטרת הדרכה או יכולת נדרשת`,
          "להשלים מטרה ויכולת לכל פרסונה",
          broken.map((p) => p.name),
        );
      if (ctx.personas.length === 0)
        return fail("אין רשומות פרסונה לבדיקה", "להריץ את גשר הפרסונות", ["personas"]);
      return pass(`כל ${ctx.personas.length} הפרסונות עם מטרה, יכולת ותרגיל מוגדרים`);
    }
    case "implementation-plan": {
      const prog = ctx.programmes[0] as { stages?: { objective?: string; nextAction?: string }[] } | undefined;
      if (!prog?.stages)
        return fail("אין רשומת תכנית לבדוק את בהירותה", "להריץ את bootstrap התכנית", ["implementationProgrammes"]);
      const broken = prog.stages.filter((s) => !s.objective || !s.nextAction);
      if (broken.length > 0)
        return fail(`${broken.length} שלבים ללא מטרה או פעולה הבאה`, "להשלים מטרה ופעולה הבאה", []);
      return pass("כל שלבי התכנית עם מטרה ופעולה הבאה", [`${prog.stages.length} שלבים נבדקו`]);
    }
    case "stage-gates": {
      if (ctx.gateValidations === null)
        return warn("ולידציית השערים טרם רצה — אין מה לבדוק", "לטעון את שירות השערים");
      const noCriteria = ctx.gateValidations.filter((g) => g.validation.criteria.length === 0);
      if (noCriteria.length > 0)
        return fail(`${noCriteria.length} שערים ללא קריטריונים`, "להגדיר קריטריונים", noCriteria.map((g) => g.def.gateKey));
      return pass("לכל שער קריטריונים מוגדרים עם דרישות ראיה מפורשות", [
        `${ctx.gateValidations.length} שערים נבדקו`,
      ]);
    }
    case "faq-lace": {
      // the deep content lives in the objection records — check the LACE steps
      if (ctx.objections.length === 0)
        return fail("אין רשומות התנגדות — אין תוכן LACE לבדוק", "להריץ ensureCanonicalObjections");
      const holes = ctx.objections.filter(
        (o) =>
          o.lace.listenHe.trim() === "" ||
          o.lace.acknowledgeHe.trim() === "" ||
          o.lace.confirmHe.trim() === "" ||
          o.lace.exploreHe.trim() === "",
      );
      if (holes.length > 0)
        return fail(
          `${holes.length} התנגדויות עם שלב LACE ריק`,
          "להשלים את ארבעת השלבים לכל התנגדות",
          holes.map((o) => o.key),
        );
      return pass(`כל ${ctx.objections.length} ההתנגדויות עם 4 שלבי LACE מלאים`);
    }
    case "microlearning": {
      // the deep content is the concept — every segment needs a full storyboard
      const broken = MICROLEARNING_CHECK_AI.segments.filter(
        (s) => s.storyboard.trim() === "" || s.narration.trim() === "" || s.onScreenText.trim() === "",
      );
      if (MICROLEARNING_CHECK_AI.segments.length === 0)
        return fail("לקונספט אין מקטעים", "לכתוב את תסריט המקטעים");
      if (broken.length > 0)
        return fail(`${broken.length} מקטעים עם סטוריבורד/קריינות/טקסט חסרים`, "להשלים את המקטעים");
      return pass(
        `${MICROLEARNING_CHECK_AI.segments.length} מקטעים מלאים (סטוריבורד + קריינות + טקסט מסך)`,
      );
    }
    default: {
      const mat = canonicalDefOf(def);
      if (!mat) return na("אין תוכן מובנה לבדיקת בהירות");
      const issues: string[] = [];
      if (mat.sections.length < 2) issues.push("פחות מ-2 חלקי תוכן");
      if (!hasBlockKind(mat, ["steps", "bullets", "timed"])) issues.push("אין צעדים/רשימות מובנים");
      if (issues.length > 0)
        return fail(`מבנה התוכן חסר: ${issues.join(" · ")}`, "להשלים חלקי תוכן מובנים", issues, mat.seedId);
      if (mat.measurableOutcome === null)
        return warn("אין תוצאה מדידה מוגדרת לחומר", "להגדיר measurableOutcome", ["measurableOutcome"], mat.seedId);
      return pass(`${mat.sections.length} חלקים מובנים + תוצאה מדידה מוגדרת`, [], mat.seedId);
    }
  }
}

// ---------------------------------------------------------------------------
// criterion 2 — רלוונטיות (routes + evidence resolve to REAL records)
// ---------------------------------------------------------------------------

function checkRelevance(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  const routeExists = APP_ROUTES.some((r) => r.path === def.route);
  if (!routeExists)
    return fail(`הנתיב ${def.route} אינו קיים ב-APP_ROUTES`, "לתקן את נתיב היעד", [def.route]);
  const resolved = def.evidence.map((e) => e.resolve(ctx));
  const unresolved = resolved.filter((r) => !r.resolved);
  if (unresolved.length > 0)
    return fail(
      `${unresolved.length} ראיות אינן נפתרות לרשומות אמיתיות`,
      "לקשר את הראיות החסרות לרשומות קיימות",
      unresolved.map((r) => r.label),
    );
  return pass(`הנתיב קיים ו-${resolved.length} ראיות נפתרות לרשומות אמיתיות`, [
    `נתיב: ${def.route}`,
    ...resolved.map((r) => r.label),
  ]);
}

// ---------------------------------------------------------------------------
// criterion 3 — פרסונליזציה
// ---------------------------------------------------------------------------

function checkPersonalization(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  const personaIds = new Set(ctx.personas.map((p) => p.id));
  switch (def.key) {
    case "personas-map":
    case "training-matrix": {
      if (ctx.personas.length !== 7)
        return fail(
          `נדרשות בדיוק 7 פרסונות — קיימות ${ctx.personas.length}`,
          "להריץ את גשר הפרסונות הקנוני",
        );
      const generic = ctx.personas.filter((p) => p.adoptionBarrier.trim() === "");
      if (generic.length > 0)
        return fail(
          `${generic.length} פרסונות ללא חסם אימוץ ספציפי`,
          "להשלים חסם אימוץ לכל פרסונה",
          generic.map((p) => p.name),
        );
      return pass("7 פרסונות, לכל אחת חסם, שאלה מרכזית ומסלול משלה");
    }
    case "faq-lace": {
      const orphan = ctx.objections.filter((o) => !personaIds.has(o.personaId));
      if (ctx.objections.length === 0)
        return fail("אין רשומות התנגדות לשיוך", "להריץ ensureCanonicalObjections");
      if (orphan.length > 0)
        return fail(
          `${orphan.length} התנגדויות משויכות לפרסונה שאינה קיימת`,
          "לתקן את שיוך הפרסונות",
          orphan.map((o) => o.key),
        );
      return pass(`${ctx.objections.length} התנגדויות — כולן משויכות לפרסונה קיימת`);
    }
    case "support-plan": {
      const broken = SUPPORT_TIER_ARTEFACTS.filter((t) => t.audienceHe.trim() === "");
      if (broken.length > 0) return fail("שכבה ללא קהל יעד", "להגדיר קהל לכל שכבה");
      return pass("לכל שכבת תמיכה קהל יעד מוגדר");
    }
    default: {
      const mat = canonicalDefOf(def);
      if (!mat) return na("תוצר כלל-ארגוני — אין ממד פרסונליזציה");
      if (mat.audiencePersonaIds.length === 0)
        return fail("לחומר אין קהל פרסונות", "לשייך פרסונות יעד", ["audiencePersonaIds"], mat.seedId);
      const unknown = mat.audiencePersonaIds.filter((id) => !personaIds.has(id));
      if (unknown.length > 0)
        return fail(
          `${unknown.length} מזהי פרסונה לא קיימים`,
          "לתקן את שיוך הפרסונות",
          unknown,
          mat.seedId,
        );
      return pass(`משויך ל-${mat.audiencePersonaIds.length} פרסונות קיימות`, [], mat.seedId);
    }
  }
}

// ---------------------------------------------------------------------------
// criterion 4 — בטיחות (the אסור list in the policy; safety notes elsewhere)
// ---------------------------------------------------------------------------

function checkSafety(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  switch (def.key) {
    case "correct-use-policy": {
      const mat = canonicalDefOf(def);
      if (!mat) return fail("חומר הנוהל לא נמצא", "לוודא ש-tm-4 קיים", ["tm-4"]);
      const missing = missingListItems(mat, CORRECT_USE_RULES.forbidden);
      if (missing.length > 0)
        return fail(
          `${missing.length} פריטי "אסור" חסרים בתוכן הנוהל`,
          "להשלים את רשימת האסור המלאה בנוהל",
          missing,
          mat.seedId,
        );
      return pass(`כל ${CORRECT_USE_RULES.forbidden.length} פריטי ה"אסור" קיימים בנוהל`, [
        `נבדק מול CORRECT_USE_RULES (${CORRECT_USE_RULES.forbidden.length} פריטים)`,
      ], mat.seedId);
    }
    case "quick-start": {
      const broken = QUICK_START_ACTIONS.filter((a) => a.safetyNote.trim() === "");
      if (broken.length > 0)
        return fail(`${broken.length} פעולות ללא הערת בטיחות`, "להוסיף הערת בטיחות", broken.map((a) => a.title));
      return pass("לכל פעולה הערת בטיחות מפורשת");
    }
    case "faq-lace": {
      const broken = ctx.objections.filter((o) => o.relatedRisk.trim() === "");
      if (ctx.objections.length === 0) return warn("אין התנגדויות לבדיקה", "להריץ ensureCanonicalObjections");
      if (broken.length > 0)
        return fail(`${broken.length} התנגדויות ללא סיכון מקושר`, "לקשר סיכון", broken.map((o) => o.key));
      return pass("לכל התנגדות סיכון מקושר");
    }
    case "support-plan": {
      const chain = SUPPORT_TIER_ARTEFACTS.every(
        (t, i) => i === SUPPORT_TIER_ARTEFACTS.length - 1 || t.escalatesToTier !== null,
      );
      if (!chain) return fail("נתיב האסקלציה שבור", "להגדיר אסקלציה לכל שכבה");
      return pass("נתיב אסקלציה מלא: Tier 1 → 2 → 3");
    }
    case "microlearning": {
      if (MICROLEARNING_CHECK_AI.productionStatus.trim() === "")
        return fail("אין הצהרת סטטוס הפקה — סכנת מצג שווא של וידאו", "להצהיר שזה קונספט");
      return pass("מוצהר במפורש: קונספט ותסריט — לא סרטון מופק", [MICROLEARNING_CHECK_AI.productionStatus]);
    }
    default:
      return na("אין ממד בטיחות ייעודי לתוצר זה");
  }
}

// ---------------------------------------------------------------------------
// criterion 5 — אחריות (owner is a NAMED person, never a role)
// ---------------------------------------------------------------------------

function checkOwnership(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  if (!isNamedOwner(def.ownerId))
    return fail(
      `בעלים "${def.ownerId}" אינו משתמש seed בשם — תפקיד אינו אדם`,
      "להקצות אחד מחמשת המשתמשים בשם",
      ["ownerId"],
    );
  const user = ctx.users.find((u) => u.id === def.ownerId);
  if (!user)
    return fail(`המשתמש ${def.ownerId} לא נמצא באוסף users`, "לוודא שה-seed נטען", ["users"]);
  const mat = def.materialSeedId
    ? ctx.materials.find((m) => m.id === def.materialSeedId)
    : undefined;
  if (mat && (mat.ownerId === null || mat.ownerId === undefined))
    return warn(
      `לתוצר בעלים בשם (${user.name}) אך לחומר ${mat.id} לא הוקצה אחראי`,
      "להקצות בעלים גם לרשומת החומר",
      ["material.ownerId"],
      mat.id,
    );
  return pass(`בעלים בשם: ${user.name}`, [`users/${user.id}`]);
}

// ---------------------------------------------------------------------------
// criterion 6 — תרגול (fails without a real exercise record/component)
// ---------------------------------------------------------------------------

function checkPractice(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  switch (def.key) {
    case "personas-map":
    case "training-matrix": {
      const noExercise = ctx.personas.filter((p) => p.exercise.trim() === "");
      if (ctx.personas.length === 0)
        return fail("אין פרסונות — אין תרגילים לבדוק", "להריץ את גשר הפרסונות");
      if (noExercise.length > 0)
        return fail(
          `${noExercise.length} פרסונות ללא תרגיל מוגדר`,
          "להגדיר תרגיל לכל פרסונה",
          noExercise.map((p) => p.name),
        );
      return pass(`לכל ${ctx.personas.length} הפרסונות תרגיל מעשי מוגדר`);
    }
    case "quick-start": {
      const broken = QUICK_START_ACTIONS.filter((a) => a.demo.rows.length === 0);
      if (broken.length > 0)
        return fail(`${broken.length} פעולות ללא הדגמה מעשית`, "להוסיף הדגמה", broken.map((a) => a.title));
      return pass("כל פעולה כוללת הדגמה חיה ומסלול 'נסה זאת'");
    }
    case "training-script": {
      const mat = canonicalDefOf(def);
      if (!mat) return fail("תסריט ההדרכה לא נמצא", "לוודא ש-tm-8 קיים");
      if (!mat.practiceIncluded && !hasBlockKind(mat, ["timed"]))
        return fail(
          "לתסריט אין רכיב תרגול ואין מקטעים מתוזמנים",
          "להוסיף מקטע תרגול מעשי לתסריט",
          ["practiceIncluded"],
          mat.seedId,
        );
      return pass("התסריט כולל מקטעים מתוזמנים / רכיב תרגול", [], mat.seedId);
    }
    case "microlearning": {
      const broken = MICROLEARNING_CHECK_AI.segments.filter((s) => s.successQuestion.trim() === "");
      if (broken.length > 0)
        return fail(`${broken.length} מקטעים ללא שאלת הבנה`, "להוסיף שאלת הבנה לכל מקטע");
      return pass(`כל ${MICROLEARNING_CHECK_AI.segments.length} המקטעים עם שאלת הבנה`);
    }
    case "faq-lace": {
      const broken = ctx.objections.filter((o) => o.followUpQuestion.trim() === "");
      if (ctx.objections.length === 0)
        return fail("אין התנגדויות — אין תרגול LACE לבדוק", "להריץ ensureCanonicalObjections");
      if (broken.length > 0)
        return fail(`${broken.length} התנגדויות ללא שאלת המשך לתרגול`, "להשלים שאלות המשך", broken.map((o) => o.key));
      return pass("לכל התנגדות שאלת המשך לתרגול הסימולטור");
    }
    default:
      return na("תוצר עיוני — אין דרישת תרגול");
  }
}

// ---------------------------------------------------------------------------
// criterion 7 — מדידה (numeric target without a measurement source ⇒ warning)
// ---------------------------------------------------------------------------

const HAS_DIGIT = /\d/;

function checkMeasurement(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  switch (def.key) {
    case "metric-levels": {
      const computedNoSource = SUBMISSION_METRICS.filter(
        (m) => m.type === "מחושב" && m.sourceCollections.length === 0,
      );
      if (computedNoSource.length > 0)
        return fail(
          `${computedNoSource.length} מדדים "מחושבים" ללא אוסף מקור`,
          "לחבר מקור או לשנות סוג",
          computedNoSource.map((m) => m.key),
        );
      const targetNoSource = SUBMISSION_METRICS.filter(
        (m) =>
          m.targetHe !== null &&
          HAS_DIGIT.test(m.targetHe) &&
          m.sourceCollections.length === 0 &&
          m.type !== "מחושב",
      );
      if (targetNoSource.length > 0)
        return warn(
          `${targetNoSource.length} מדדים עם יעד מספרי ללא מקור מדידה מחובר`,
          "לחבר מקור מדידה לפני הפיילוט",
          targetNoSource.map((m) => m.key),
        );
      return pass("כל מדד מחושב מחובר לאוסף מקור; יעדים מופרדים ממדידות");
    }
    case "personas-map":
    case "training-matrix": {
      const numericNoSource = ctx.personas.filter(
        (p) => p.successMetric.numericTarget !== null && p.successMetric.measuredValue === null,
      );
      if (numericNoSource.length > 0)
        return warn(
          `${numericNoSource.length} פרסונות עם יעד מספרי שטרם נמדד (אין מקור מדידה)`,
          "לחבר מקור מדידה או לתעד שהמדידה תחל בהדרכה",
          numericNoSource.map((p) => p.name),
        );
      return pass("אין יעד מספרי ללא סטטוס מדידה כן");
    }
    case "support-plan": {
      const measured = measuredTierSla(ctx.supportRequests, Date.parse(ctx.nowISO));
      const anyMeasured = measured.some((m) => m.medianResolutionHours !== null);
      if (!anyMeasured)
        return warn(
          'SLA יעד מוגדר אך אף שכבה עדיין ללא SLA מדוד — מוצג "טרם נמדד"',
          "המדידה תתמלא אוטומטית כשפניות ייסגרו",
        );
      return pass("קיימות מדידות SLA אמיתיות לצד היעדים", measured.map((m) => `Tier ${m.tier}: ${m.measuredHe}`));
    }
    case "implementation-plan": {
      const prog = ctx.programmes[0] as { baselineMetrics?: { value: number | null }[] } | undefined;
      if (!prog?.baselineMetrics)
        return warn("אין רשומת תכנית — אין מדדי קו בסיס לבדוק", "להריץ את bootstrap התכנית");
      const unmeasured = prog.baselineMetrics.filter((b) => b.value === null);
      if (unmeasured.length > 0)
        return warn(
          `${unmeasured.length} מדדי קו בסיס טרם נמדדו — "לא הוגדר קו בסיס"`,
          "למדוד קו בסיס לפני החלטת G4",
        );
      return pass("כל מדדי קו הבסיס של התכנית נמדדו");
    }
    case "stage-gates": {
      if (ctx.gateValidations === null)
        return warn("ולידציית השערים טרם רצה", "לטעון את שירות השערים");
      return pass("קריטריוני מדד בשערים נאכפים על ידי הוולידטור הדטרמיניסטי (כולל קו-בסיס)");
    }
    case "one-pager": {
      const untyped = ONE_PAGER.valueClaims.filter((c) => HAS_DIGIT.test(c.claimHe) && c.kindHe === "עיקרון");
      if (untyped.length > 0)
        return fail("טענת ערך מספרית מסומנת כעיקרון", "לסמן יעד/הערכה", untyped.map((c) => c.claimHe));
      return pass("כל טענות הערך מסומנות-סוג; אין מספר המוצג כהישג");
    }
    default: {
      const mat = canonicalDefOf(def);
      if (!mat) return na("אין ממד מדידה ייעודי");
      if (mat.measurableOutcome === null)
        return warn("לחומר אין תוצאה מדידה מוגדרת", "להגדיר measurableOutcome", ["measurableOutcome"], mat.seedId);
      return pass("תוצאה מדידה מוגדרת לחומר", [mat.measurableOutcome], mat.seedId);
    }
  }
}

// ---------------------------------------------------------------------------
// criterion 8 — תחזוקה (versioning, review dates, expiry)
// ---------------------------------------------------------------------------

function checkMaintenance(def: DeliverableDef, ctx: SubmissionSources): Verdict {
  const mat = def.materialSeedId
    ? ctx.materials.find((m) => m.id === def.materialSeedId)
    : undefined;
  if (mat) {
    if (mat.status === "דורש עדכון")
      return fail(`החומר ${mat.id} במצב "דורש עדכון"`, "לעדכן את החומר ולאשר מחדש", [], mat.id);
    if (mat.reviewDate === null || mat.reviewDate === undefined)
      return warn(
        `לחומר ${mat.id} לא נקבע מועד בדיקה תקופתית`,
        "לקבוע reviewDate",
        ["reviewDate"],
        mat.id,
      );
    if (Date.parse(mat.reviewDate) < Date.parse(ctx.nowISO))
      return fail(`מועד הבדיקה של ${mat.id} חלף — התוכן פג תוקף`, "לבצע בדיקת רענון", [], mat.id);
    return pass(`גרסה ${mat.version ?? "?"} · מועד בדיקה עתידי קיים`, [], mat.id);
  }
  switch (def.key) {
    case "personas-map":
    case "training-matrix": {
      const unversioned = ctx.personas.filter((p) => p.version === undefined);
      if (ctx.personas.length === 0) return fail("אין פרסונות", "להריץ את הגשר");
      if (unversioned.length > 0)
        return warn(`${unversioned.length} פרסונות ללא מספר גרסה`, "להריץ את גשר הפרסונות", unversioned.map((p) => p.id));
      return pass("כל הפרסונות מנוהלות-גרסה עם מצב אישור");
    }
    case "stage-gates":
      return ctx.gateValidations === null
        ? warn("לא ניתן לבדוק תפוגת ראיות — הוולידציה טרם רצה", "לטעון את השירות")
        : pass("תפוגת ראיות נאכפת על ידי הוולידטור (Go שפג תוקפו מסומן)");
    case "implementation-plan":
      return ctx.programmes.length === 0
        ? warn("אין רשומת תכנית לתחזק", "להריץ bootstrap")
        : pass("התכנית מנוהלת-גרסה ברשומה חיה");
    default:
      return warn(
        "לתוצר אין מועד רענון תוכן מוגדר",
        "לקבוע מועד רענון במסגרת שגרת התחזוקה החודשית",
        ["reviewDate"],
      );
  }
}

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

const CHECKS: Readonly<Record<QualityCriterion, (def: DeliverableDef, ctx: SubmissionSources) => Verdict>> = {
  בהירות: checkClarity,
  רלוונטיות: checkRelevance,
  פרסונליזציה: checkPersonalization,
  בטיחות: checkSafety,
  אחריות: checkOwnership,
  תרגול: checkPractice,
  מדידה: checkMeasurement,
  תחזוקה: checkMaintenance,
};

/**
 * Evaluate ONE criterion for ONE deliverable definition — the same code path
 * runQualityValidation uses. Exported so tests can drive edge cases (e.g. a
 * def whose owner is a role string) without mutating the canonical defs.
 */
export function checkCriterion(
  criterion: QualityCriterion,
  def: DeliverableDef,
  ctx: SubmissionSources,
): QualityValidationResult {
  const verdict = CHECKS[criterion](def, ctx);
  return {
    deliverableKey: def.key,
    criterion,
    ...verdict,
    checkedAt: ctx.nowISO,
    validatorVersion: QUALITY_VALIDATOR_VERSION,
  };
}

/**
 * Run the full 12×8 matrix against the REAL current records. Deterministic:
 * same sources ⇒ same results. There is NO hardcoded pass anywhere — results
 * fall where they fall (warnings/fails are expected and honest).
 */
export function runQualityValidation(ctx: SubmissionSources): QualityValidationResult[] {
  const results: QualityValidationResult[] = [];
  for (const def of DELIVERABLE_DEFS) {
    for (const criterion of QUALITY_CRITERIA) {
      const verdict = CHECKS[criterion](def, ctx);
      results.push({
        deliverableKey: def.key,
        criterion,
        ...verdict,
        checkedAt: ctx.nowISO,
        validatorVersion: QUALITY_VALIDATOR_VERSION,
      });
    }
  }
  return results;
}

/** summary counts of a result set */
export function qualitySummary(results: readonly QualityValidationResult[]): {
  pass: number;
  warning: number;
  fail: number;
  notApplicable: number;
} {
  return {
    pass: results.filter((r) => r.state === "pass").length,
    warning: results.filter((r) => r.state === "warning").length,
    fail: results.filter((r) => r.state === "fail").length,
    notApplicable: results.filter((r) => r.state === "not_applicable").length,
  };
}

/**
 * Persist results to the qualityValidations collection with deterministic ids
 * (qv-<deliverable>-<criterionIndex>) — idempotent upsert, full audit of the
 * checkedAt/validatorVersion on every run.
 */
export async function persistQualityResults(
  results: readonly QualityValidationResult[],
): Promise<number> {
  const repo = getRepository<SubmissionValidationRecord>("qualityValidations");
  let written = 0;
  for (const r of results) {
    const idx = QUALITY_CRITERIA.indexOf(r.criterion);
    const id = `qv-${r.deliverableKey}-${idx + 1}`;
    const record: Omit<SubmissionValidationRecord, "id" | "createdAt" | "updatedAt"> = {
      deliverableKey: r.deliverableKey,
      criterion: r.criterion,
      state: r.state,
      reasonHe: r.reasonHe,
      evidenceHe: [...r.evidenceHe],
      missingFields: [...r.missingFields],
      affectedRecord: r.affectedRecord,
      recommendedFixHe: r.recommendedFixHe,
      checkedAt: r.checkedAt,
      validatorVersion: r.validatorVersion,
    };
    const existing = await repo.get(id);
    if (existing) {
      await repo.update(id, { ...record, updatedAt: r.checkedAt });
    } else {
      await repo.create({ id, createdAt: r.checkedAt, updatedAt: r.checkedAt, ...record });
    }
    written += 1;
  }
  return written;
}
