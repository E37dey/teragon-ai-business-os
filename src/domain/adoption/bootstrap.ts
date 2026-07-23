// TERAGON AI BUSINESS OS — content bootstrap for THE Teragon implementation
// programme (W7-A, 7.1). IDEMPOTENT: stable ids, re-running creates nothing.
// Content is REWRITTEN from the donor implementation package
// (teragon-final/docs/training/*.docx) into typed records — no legacy HTML.
//
// Honesty:
// - baseline metrics: value null ⇒ "לא הוגדר קו בסיס" (donor numbers are
//   estimates from a document, not measurements — they appear only in method
//   notes, never as measured values);
// - currentStage = "as-4" (פיילוט מבוקר) and it is NOT completed;
// - NO PilotResult records are created ⇒ the pilot is honestly "טרם נמדד";
// - all gate decisions start decision:null (טרם התקבלה החלטה);
// - target dates are יעד (plan), only startDate (seed anchor) is a fact;
// - every owner is a NAMED person resolved against the real users collection.
import type { ImplementationStores } from "@/repositories/implementationStores";
import type { CollectionKey } from "@/repositories/collections";
import { CEO_USER_ID, SEED_ANCHOR } from "@/repositories/seed/seedData";
import { alignSeedStages } from "./stageBridge";
import type {
  AdoptionStage,
  ImplementationDecision,
  ImplementationEvidence,
  ImplementationMilestone,
  ImplementationProgramme,
  ImplementationRisk,
  PilotDefinition,
  RolloutWave,
} from "./types";
import { ADOPTION_STAGE_NAMES, ROLLOUT_WAVE_NAMES } from "./types";

export const PROGRAMME_ID = "iprog-teragon";
export const PILOT_ID = "pd-teragon";

/** The implementer (מטמיע) — נעה פרידמן, מנהלת המערכת (seed user). */
export const IMPLEMENTER_USER_ID = "u-noa";

export type Clock = () => string;

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** week offset from the programme anchor (donor plan is week-based) */
function week(n: number): string {
  return addDays(SEED_ANCHOR, n * 7);
}

function buildStages(): AdoptionStage[] {
  const owners = [
    CEO_USER_ID,
    CEO_USER_ID,
    IMPLEMENTER_USER_ID,
    CEO_USER_ID,
    IMPLEMENTER_USER_ID,
    CEO_USER_ID,
  ];
  const objectives = [
    "להגדיר את הבעיה העסקית עם מספר ואת התוצאה הרצויה — לפני כל כלי",
    "למפות את התהליך הקיים מול העתידי ולקבע את גבולות אדם-AI (HITL)",
    "מסלול הדרכה נפרד לכל אחת משבע הפרסונות — הדרכה אחידה לכולם היא הדרכה לאף אחד",
    "להריץ פיילוט אישי מבוקר (צחי בלבד) עם תאריך החלטה קבוע מראש",
    "להרחיב גל אחרי גל — לא Big Bang — עם למידה ותיקון חומרים בין גלים",
    "להפוך את המערכת לשגרה: KPI חודשי, בקרה ושיפור מתמשך",
  ];
  const deliverables: string[][] = [
    ["הגדרת בעיה עם מספר", "תוצאה עסקית מדידה", "מדדי הצלחה בשלוש רמות", "תצפיות קו בסיס"],
    ["מפת AS-IS (5 שלבים)", "מפת TO-BE (7 שלבים)", "נוהל גבולות אדם-AI", "רשימת מותר/אסור"],
    ["מפת 7 פרסונות", "Training Matrix", "13 חומרי הדרכה", "תכנית טיפול בהתנגדויות (LACE)"],
    ["הגדרת פיילוט והיקפו", "קריטריוני הצלחה", "תאריך החלטה קבוע", "מדידות פיילוט"],
    ["מודל 5 גלים", "רשימת Champions", "Playbook הרחבה", "SLA תמיכה"],
    ["שגרת KPI חודשית", "Cadence בקרה", "מנגנון שיפור מתמשך", "סקירת Governance"],
  ];
  const evidenceReqs: string[][] = [
    ["מדדי הצלחה מוגדרים בשלוש רמות", "תצפיות קו בסיס מתועדות"],
    ["גבולות אדם-AI נאכפים במערכת (HITL)", "מפת AS-IS/TO-BE כרשומת חומר הדרכה"],
    ["שבע פרסונות מוגדרות במערכת", "13 חומרי הדרכה קיימים"],
    ["הגדרת פיילוט עם תאריך החלטה", "מדדי פיילוט נמדדים (WAU / שימוש / NPS)"],
    ["רשימת Champions מתועדת", "Playbook הרחבה כתוב"],
    ["סקירת KPI חודשית ראשונה", "יומן ביקורת פעיל"],
  ];
  const nextActions = [
    "לתעד תצפיות קו בסיס (לידים אבודים, זמן הצעה, שעות ניהול) ולקבל החלטת G1",
    "לקשר את מפת ה-AS-IS/TO-BE כרשומת חומר הדרכה ולקבל החלטת G2",
    "לוודא Training Matrix מלא לכל פרסונה ולקבל החלטת G3",
    "להתחיל את הפיילוט האישי — כל פעולה אמיתית מתבצעת במערכת; מדידה שבועית",
    "להכין רשימת Champions ו-Playbook לפני פתיחת גל 2",
    "לקבע סקירת KPI חודשית ראשונה ביומן",
  ];
  const gates = [
    "G1 — מוכנות",
    "G2 — עיצוב הדרכה",
    "G3 — פיילוט מוכן",
    "G4 — הפיילוט הצליח",
    "G5 — מוכן להרחבה",
    "G6 — הפעלה שגרתית",
  ];
  // donor week plan: 0-1 / 1-2 / 2-3 / 3-7 / 7-9 / 9-12
  const spans: Array<[number, number]> = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 7],
    [7, 9],
    [9, 12],
  ];
  // honest statuses: planning artifacts (1-3) exist as real records; the
  // pilot (4) is defined but NOT completed; 5-6 have not started.
  const statuses: AdoptionStage["status"][] = [
    "הושלם",
    "הושלם",
    "הושלם",
    "בתהליך",
    "לא התחיל",
    "לא התחיל",
  ];
  return ADOPTION_STAGE_NAMES.map((name, i) => ({
    id: `as-${i + 1}`,
    order: i + 1,
    name,
    objective: objectives[i] ?? "",
    ownerId: owners[i] ?? CEO_USER_ID,
    startPlanned: week(spans[i]?.[0] ?? 0),
    targetDate: week(spans[i]?.[1] ?? 0),
    status: statuses[i] ?? "לא התחיל",
    deliverables: deliverables[i] ?? [],
    evidenceRequirements: evidenceReqs[i] ?? [],
    nextAction: nextActions[i] ?? "",
    nextGate: gates[i] ?? "",
    seedStageId: `is-${i + 1}`,
  }));
}

function buildProgramme(now: string, ownersById: Map<string, string>): ImplementationProgramme {
  const nameOf = (id: string): string => ownersById.get(id) ?? id;
  return {
    id: PROGRAMME_ID,
    createdAt: now,
    updatedAt: now,
    name: "תכנית ההטמעה — מערכת טרגון",
    businessProblem:
      "טרגון מנהלת מעל 1,000 לקוחות ו-500+ בוגרי הדרכות באופן ידני (וואטסאפ, טלפון, מייל) " +
      "דרך אדם יחיד — מה שמוביל לאובדן לידים, אחריות שפגה ללא חידוש, " +
      "ולפי הערכת מסמך ההטמעה כ-8 שעות ניהול ידני בשבוע (הערכה, טרם נמדד).",
    businessOutcome:
      "יעד: אפס לידים אבודים, מקור אמת אחד במקום וואטסאפ כערוץ ניהול, " +
      "וחיסכון של כ-8 שעות ניהול בשבוע (יעד לפי מסמך ההטמעה — יוכח רק מול קו בסיס מדוד) — " +
      "עם AI שממליץ ואדם שמאשר (HITL).",
    sponsorId: CEO_USER_ID,
    businessOwnerId: CEO_USER_ID,
    implementerId: IMPLEMENTER_USER_ID,
    owners: [
      { userId: CEO_USER_ID, name: nameOf(CEO_USER_ID), role: "ספונסר", scopeRef: "programme" },
      {
        userId: CEO_USER_ID,
        name: nameOf(CEO_USER_ID),
        role: "בעלים עסקי",
        scopeRef: "programme",
      },
      {
        userId: IMPLEMENTER_USER_ID,
        name: nameOf(IMPLEMENTER_USER_ID),
        role: "מטמיע",
        scopeRef: "programme",
      },
    ],
    startDate: SEED_ANCHOR,
    targetEndDate: week(12),
    baselineMetrics: [
      {
        metricKey: "lost_leads_month",
        nameHe: "לידים אבודים בחודש",
        unit: "לידים",
        value: null,
        capturedAt: null,
        methodHe: "ספירת פניות ללא מענה/מעקב בחודש — טרם נמדד בפועל",
      },
      {
        metricKey: "quote_draft_minutes",
        nameHe: "זמן ניסוח הצעת מחיר",
        unit: "דקות",
        value: null,
        capturedAt: null,
        methodHe: "מדידת זמן בפועל (הערכת המסמך: 10–20 דק׳) — טרם נמדד",
      },
      {
        metricKey: "admin_hours_week",
        nameHe: "שעות ניהול ידני בשבוע",
        unit: "שעות",
        value: null,
        capturedAt: null,
        methodHe: "יומן זמן שבועי (הערכת המסמך: ~8 שעות) — טרם נמדד",
      },
    ],
    baselineState: "לא הוגדר קו בסיס",
    approvalState: "טיוטה",
    approvalId: null,
    version: 1,
    currentStageId: "as-4",
    stages: buildStages(),
    demo: true,
  };
}

function buildMilestones(now: string): ImplementationMilestone[] {
  const base = { createdAt: now, updatedAt: now, programmeId: PROGRAMME_ID };
  const rows: Array<[string, string, string, string]> = [
    ["im-1", "as-1", "תיעוד קו בסיס: לידים אבודים, זמן הצעה, שעות ניהול", week(1)],
    ["im-2", "as-3", "אישור Training Matrix לכל שבע הפרסונות", week(3)],
    ["im-3", "as-4", "תחילת הפיילוט האישי (צחי בלבד)", week(3)],
    ["im-4", "as-4", "נקודת החלטה — סוף שבוע 7 (חוק התאריך)", week(7)],
    ["im-5", "as-5", "צירוף Early Adopters ראשונים", week(9)],
    ["im-6", "as-6", "סקירת KPI חודשית ראשונה", week(12)],
  ];
  const ownerFor: Record<string, string> = {
    "im-2": IMPLEMENTER_USER_ID,
    "im-5": IMPLEMENTER_USER_ID,
  };
  return rows.map(([id, stageId, title, dueDate]) => ({
    ...base,
    id,
    stageId,
    title,
    dueDate,
    ownerId: ownerFor[id] ?? CEO_USER_ID,
    status: "מתוכננת",
    completedAt: null,
  }));
}

function buildRisks(now: string): ImplementationRisk[] {
  const base = {
    createdAt: now,
    updatedAt: now,
    programmeId: PROGRAMME_ID,
    status: "פתוח" as const,
    reviewDate: week(2),
  };
  return [
    {
      ...base,
      id: "ir-1",
      stageId: "as-4",
      title: "המשך ניהול בוואטסאפ במקביל למערכת",
      description: "אם וואטסאפ נשאר ערוץ ניהול — המערכת בקופסה, לא בשגרה.",
      probability: "בינונית",
      impact: "גבוהה",
      mitigation: "שער G5 חוסם הרחבה כל עוד וואטסאפ פעיל כערוץ ניהול; הדגמת ערך מהיר בשבוע הראשון",
      ownerId: CEO_USER_ID,
    },
    {
      ...base,
      id: "ir-2",
      stageId: "as-4",
      title: "סיווג AI שגוי פוגע באמון",
      description: "טעות סיווג בולטת בתחילת הפיילוט עלולה לעצור את האימוץ.",
      probability: "בינונית",
      impact: "בינונית",
      mitigation: "HITL מלא + הצגת אחוז ביטחון + מצב ״AI ממליץ, אדם מאשר״ בשבועיים הראשונים",
      ownerId: IMPLEMENTER_USER_ID,
    },
    {
      ...base,
      id: "ir-3",
      stageId: "as-5",
      title: "תלות באדם יחיד נמשכת",
      description: "ללא האצלה, צוואר הבקבוק נשאר גם עם מערכת.",
      probability: "בינונית",
      impact: "גבוהה",
      mitigation: "מסלולי הדרכה מוכנים מראש לכל תפקיד עתידי (שלב 3) — האצלה מהירה בגל 2",
      ownerId: CEO_USER_ID,
    },
    {
      ...base,
      id: "ir-4",
      stageId: "as-6",
      title: "ההדרכה נשכחת — 75% מהאימוץ אחרי ההדרכה",
      description: "בלי תמיכה שוטפת, הידע מההדרכה מתפוגג תוך שבועות.",
      probability: "גבוהה",
      impact: "גבוהה",
      mitigation: "תשתית תמיכה Tier 1–3 + Cadence שבועי בפיילוט וסקירה חודשית אחריו",
      ownerId: IMPLEMENTER_USER_ID,
    },
    {
      ...base,
      id: "ir-5",
      stageId: null,
      title: "חיבור LLM נכשל או מתייקר",
      description: "תלות בספק חיצוני עלולה להשבית יכולות או לחרוג מתקציב.",
      probability: "נמוכה",
      impact: "בינונית",
      mitigation: "נפילה אוטומטית ללוגיקת חוקים כשאין LLM; תקציב יומי 0 כברירת מחדל",
      ownerId: IMPLEMENTER_USER_ID,
    },
    {
      ...base,
      id: "ir-6",
      stageId: null,
      title: "התנגדות לשינוי מהרגלים קיימים",
      description: "״הוואטסאפ עובד לי״ — חסם אימוץ מרכזי שזוהה מראש.",
      probability: "בינונית",
      impact: "בינונית",
      mitigation: "מודל LACE לכל התנגדות + מסלול הדרכה ממוקד-פרסונה במקום הדרכה אחידה",
      ownerId: CEO_USER_ID,
    },
  ];
}

function buildEvidence(now: string): ImplementationEvidence[] {
  const base = { createdAt: now, updatedAt: now, programmeId: PROGRAMME_ID };
  const linked = (
    id: string,
    stageId: string,
    requirementHe: string,
    collection: CollectionKey,
    recordId: string,
    route: string,
    noteHe: string,
  ): ImplementationEvidence => ({
    ...base,
    id,
    stageId,
    requirementHe,
    ref: { collection, recordId, route },
    capturedById: CEO_USER_ID,
    capturedAt: now,
    noteHe,
  });
  const missing = (
    id: string,
    stageId: string,
    requirementHe: string,
    noteHe: string,
  ): ImplementationEvidence => ({
    ...base,
    id,
    stageId,
    requirementHe,
    ref: null,
    capturedById: null,
    capturedAt: null,
    noteHe,
  });
  return [
    linked(
      "ie-1",
      "as-1",
      "מדדי הצלחה מוגדרים בשלוש רמות",
      "metricDefinitions",
      "md-1",
      "/analytics",
      "9 הגדרות מדד בשלוש רמות (עסקי / תפעולי / AI) קיימות במערכת",
    ),
    missing(
      "ie-2",
      "as-1",
      "תצפיות קו בסיס מתועדות",
      "קו הבסיס (לידים אבודים, זמן הצעה, שעות ניהול) טרם נמדד — בלי Baseline אין הוכחת שיפור",
    ),
    linked(
      "ie-3",
      "as-2",
      "גבולות אדם-AI נאכפים במערכת (HITL)",
      "controls",
      "ctl-1",
      "/governance",
      "בקרת ״אישור אנושי לפעולות חיצוניות״ מיושמת ומתועדת",
    ),
    missing(
      "ie-4",
      "as-2",
      "מפת AS-IS/TO-BE כרשומת חומר הדרכה",
      "המפה קיימת כרכיב בעמוד ההטמעה; טרם קושרה כרשומת חומר הדרכה מנוהלת",
    ),
    linked(
      "ie-5",
      "as-3",
      "שבע פרסונות מוגדרות במערכת",
      "personas",
      "per-1",
      "/personas",
      "7 פרסונות קיימות באוסף personas",
    ),
    linked(
      "ie-6",
      "as-3",
      "13 חומרי הדרכה קיימים",
      "trainingMaterials",
      "tm-1",
      "/training-materials",
      "13 חומרי הדרכה קיימים באוסף trainingMaterials",
    ),
    linked(
      "ie-7",
      "as-4",
      "הגדרת פיילוט עם תאריך החלטה",
      "pilotDefinitions",
      PILOT_ID,
      "/implementation",
      "פיילוט אישי מוגדר עם תאריך החלטה קבוע (חוק התאריך)",
    ),
    missing(
      "ie-8",
      "as-4",
      "מדדי פיילוט נמדדים (WAU / שימוש / NPS)",
      "הפיילוט טרם החל — אין תוצאות מדודות; מצב כנה: טרם נמדד",
    ),
    missing("ie-9", "as-5", "רשימת Champions מתועדת", "תיפתח רק לאחר החלטת G4"),
    missing("ie-10", "as-5", "Playbook הרחבה כתוב", "ייכתב מתוך לקחי הפיילוט"),
    missing("ie-11", "as-6", "סקירת KPI חודשית ראשונה", "תתועד לאחר כניסה לשגרה"),
    linked(
      "ie-12",
      "as-6",
      "יומן ביקורת פעיל",
      "controls",
      "ctl-3",
      "/governance",
      "בקרת ״יומן ביקורת מלא״ מיושמת — כל פעולת סוכן ואישור נרשמים",
    ),
  ];
}

function buildDecisions(now: string, stages: AdoptionStage[]): ImplementationDecision[] {
  const evidenceByStage: Record<string, string[]> = {
    "as-1": ["ie-1", "ie-2"],
    "as-2": ["ie-3", "ie-4"],
    "as-3": ["ie-5", "ie-6"],
    "as-4": ["ie-7", "ie-8"],
    "as-5": ["ie-9", "ie-10"],
    "as-6": ["ie-11", "ie-12"],
  };
  return stages.map((s, i) => ({
    id: `idec-${i + 1}`,
    createdAt: now,
    updatedAt: now,
    programmeId: PROGRAMME_ID,
    stageId: s.id,
    gateName: s.nextGate,
    plannedDate: s.targetDate,
    decision: null,
    decidedById: null,
    decidedAt: null,
    rationaleHe: "",
    evidenceIds: evidenceByStage[s.id] ?? [],
  }));
}

function buildWaves(now: string): RolloutWave[] {
  const base = { createdAt: now, updatedAt: now, programmeId: PROGRAMME_ID };
  const audiences = [
    "צחי לבד — הפיילוט האישי",
    "איש המכירות/התמיכה הראשון שמצטרף",
    "כל צוות המכירות והתמיכה",
    "הרחבה לקורסים ולמדריכים",
    "כלל הארגון — המערכת היא הדרך היחידה לעבוד",
  ];
  const criteria: string[][] = [
    ["G3 — פיילוט מוכן עבר"],
    ["G4 — הפיילוט הצליח (WAU ≥ 70%, NPS ≥ 7)", "לפחות 4 שבועות מהגל הקודם"],
    ["G5 — מוכן להרחבה", "לפחות 4 שבועות מהגל הקודם"],
    ["חומרי ההדרכה תוקנו לפי לקחי הגלים הקודמים", "לפחות 4 שבועות מהגל הקודם"],
    ["G6 — הפעלה שגרתית", "וואטסאפ נסגר כערוץ ניהול"],
  ];
  const starts: Array<string | null> = [week(3), week(7), week(9), null, null];
  return ROLLOUT_WAVE_NAMES.map((name, i) => ({
    ...base,
    id: `rw-${i + 1}`,
    order: i + 1,
    name,
    audienceHe: audiences[i] ?? "",
    plannedStart: starts[i] ?? null,
    status: "לא התחיל",
    entryCriteria: criteria[i] ?? [],
  }));
}

function buildPilot(now: string): PilotDefinition {
  return {
    id: PILOT_ID,
    createdAt: now,
    updatedAt: now,
    programmeId: PROGRAMME_ID,
    scopeHe:
      "פיילוט אישי מבוקר — צחי בלבד (גל Champions); כל פעולה אמיתית מתבצעת במערכת. " +
      "יעדי ההצלחה נלקחו ממסמך ההטמעה כיעדים בלבד — אף ערך לא נמדד עדיין.",
    startDate: null,
    decisionDate: week(7),
    successCriteria: [
      { metricKey: "wau", nameHe: "משתמשים פעילים שבועיים", targetHe: "WAU ≥ 70%" },
      { metricKey: "usage_per_week", nameHe: "שימוש בתהליך", targetHe: "≥ 3 פעמים בשבוע" },
      { metricKey: "nps", nameHe: "שביעות רצון", targetHe: "NPS ≥ 7" },
      { metricKey: "lost_leads_month", nameHe: "לידים אבודים", targetHe: "≈ 0 בחודש" },
    ],
    status: "מוגדר",
  };
}

export interface BootstrapResult {
  created: number;
}

/**
 * Idempotent bootstrap — safe to call on every mount / test setup. Existing
 * records (by stable id) are never touched; missing ones are created.
 * Owner names are resolved against the REAL users collection; a missing
 * named user is an error (no anonymous or invented owners).
 */
export async function ensureImplementationProgramme(
  stores: ImplementationStores,
  clock: Clock = () => new Date().toISOString(),
): Promise<BootstrapResult> {
  const now = clock();
  let created = 0;

  const users = await stores.users.list();
  const ownersById = new Map(users.map((u) => [u.id, u.name]));
  for (const required of [CEO_USER_ID, IMPLEMENTER_USER_ID]) {
    if (!ownersById.has(required)) {
      throw new Error(`ensureImplementationProgramme: משתמש ${required} חסר — אין בעלים ללא שם`);
    }
  }

  // C4 migration (Lead decision): the stored is-N records adopt the canonical
  // adoption-stage names 1:1 by order; old build-plan names kept in legacyName.
  const stages = buildStages();
  await alignSeedStages(
    stores.seedStages,
    new Map(stages.map((s) => [s.id, `${s.objective} (שם קודם נשמר ב-legacyName)`])),
  );

  if (!(await stores.programmes.get(PROGRAMME_ID))) {
    await stores.programmes.create(buildProgramme(now, ownersById));
    created += 1;
  }
  for (const m of buildMilestones(now)) {
    if (await stores.milestones.get(m.id)) continue;
    await stores.milestones.create(m);
    created += 1;
  }
  for (const r of buildRisks(now)) {
    if (await stores.risks.get(r.id)) continue;
    await stores.risks.create(r);
    created += 1;
  }
  for (const e of buildEvidence(now)) {
    if (await stores.evidence.get(e.id)) continue;
    await stores.evidence.create(e);
    created += 1;
  }
  const programme = await stores.programmes.get(PROGRAMME_ID);
  for (const d of buildDecisions(now, programme?.stages ?? stages)) {
    if (await stores.decisions.get(d.id)) continue;
    await stores.decisions.create(d);
    created += 1;
  }
  for (const w of buildWaves(now)) {
    if (await stores.rolloutWaves.get(w.id)) continue;
    await stores.rolloutWaves.create(w);
    created += 1;
  }
  if (!(await stores.pilotDefinitions.get(PILOT_ID))) {
    await stores.pilotDefinitions.create(buildPilot(now));
    created += 1;
  }
  // deliberately NO pilotResults — an absent result is the honest "טרם נמדד"
  return { created };
}
