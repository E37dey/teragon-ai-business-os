// TERAGON AI BUSINESS OS — W7-E (Phase 7.18): the 12 canonical deliverables.
// Each deliverable declares WHERE its real content lives (route + records) and
// HOW its evidence resolves against the live collections. Content that exists
// only as an authored typed record (One-Pager, metric levels, support plan,
// microlearning concept) is declared here — rewritten from the donors, never
// imported verbatim, never carrying donor numbers as measurements.
import type { Approval, BaseEntity, User } from "@/domain/types";
import type { PersonaV2 } from "@/domain/personas";
import type { ObjectionRecord, TrainingMaterialV2 } from "@/domain/training-materials";
import type { GateWithValidation } from "@/domain/stage-gates";
import type {
  Activity,
  Enrollment,
  Lead,
  MetricDefinition,
  MetricObservation,
  Quotation,
  ServiceTicket,
  SupportRequest,
} from "@/domain/types";
import {
  CANONICAL_CEO_NAME,
  CANONICAL_COMPANY_NAME,
  REGISTRY_DELIVERABLE_KEYS,
  REGISTRY_DELIVERABLE_TITLES,
  type DeliverableKey,
} from "./contentRegistry";
import type { ResolvedEvidence, SubmissionEvidenceRef } from "./types";

// ---------------------------------------------------------------------------
// One-Pager — authored typed content (Phase 7.18 deliverable #1)
// ---------------------------------------------------------------------------

export interface OnePagerValueClaim {
  claimHe: string;
  /** every claim is honestly typed — a יעד is never presented as an outcome */
  kindHe: "יעד" | "עיקרון" | "הערכת בעל העסק";
  basisHe: string;
}

export interface OnePagerContent {
  title: string;
  companyName: string;
  ceoName: string;
  businessProblemHe: string[];
  solutionHe: string[];
  valueClaims: OnePagerValueClaim[];
  boundariesHe: string[];
  honestyNoteHe: string;
}

/** donor content REWRITTEN (not embedded) — no donor number as a measurement */
export const ONE_PAGER: OnePagerContent = {
  title: "TERAGON AI BUSINESS OS — One-Pager",
  companyName: CANONICAL_COMPANY_NAME,
  ceoName: CANONICAL_CEO_NAME,
  businessProblemHe: [
    "המידע העסקי של טרגון — לקוחות, לידים, הצעות מחיר, קורסים וקריאות שירות — חי בכלים מפוזרים ובראש של אנשים.",
    "לידים נופלים בין הכיסאות כשהמעקב תלוי בזיכרון; הצעת מחיר נבנית מאפס בכל פעם (הערכת בעל העסק: 10-20 דק' להצעה — לא נמדד).",
    "פתרונות לתקלות חוזרות אינם מתועדים, ולהנהלה אין מסך אחד שמראה את מצב העסק.",
  ],
  solutionHe: [
    "מערכת הפעלה עסקית אחת: CRM, מכירות, קורסים, שירות ומסמכים — על בסיס נתונים אחד.",
    "שכבת AI ממושלת: סיכומים, סיווגים והמלצות — תמיד עם נימוק, ראיות מרשומות אמיתיות ומעטפת אישור אנושי לכל פעולה רגישה.",
    "ממשל מובנה: יומן ביקורת מלא, נוהל שימוש נכון (מותר / חובה לבדוק / אסור) ושערי Stage-Gate מבוססי ראיות.",
  ],
  valueClaims: [
    {
      claimHe: "קיצור זמן הכנת הצעת מחיר",
      kindHe: "יעד",
      basisHe: "קו בסיס טרם נמדד — הערכת בעל העסק 10-20 דק' להצעה (C13)",
    },
    {
      claimHe: "אפס לידים שנופלים בין הכיסאות",
      kindHe: "יעד",
      basisHe: "יימדד דרך מדד זמן-תגובה-לליד (רמה C) — כרגע ללא קו בסיס",
    },
    {
      claimHe: "כל המלצת AI ניתנת להסבר עד רמת הרשומה",
      kindHe: "עיקרון",
      basisHe: "נאכף במבנה המערכת: המלצה · נימוק · ראיות · מגבלות",
    },
    {
      claimHe: "ירידה בפניות 'איך עושים' אחרי ההדרכה",
      kindHe: "יעד",
      basisHe: "יעד פיילוט 50%- — מחייב קו בסיס שטרם נמדד",
    },
  ],
  boundariesHe: [
    "שום הודעה לא נשלחת החוצה ללא אישור אדם.",
    "אין המצאת מקורות ואין רמת ביטחון מומצאת — כשאין מדידה מוצג \"טרם נמדד\".",
    "ROI ו-NPS הם יעדים למדידה בפיילוט — לא הישגים.",
  ],
  honestyNoteHe:
    "מסמך זה נכתב מחדש מחומרי המקור. אף מספר מהדונור אינו מוצג כערך מדוד — כל טענה מסומנת יעד / עיקרון / הערכה.",
};

// ---------------------------------------------------------------------------
// the live sources every evaluation reads (page loads, tests inject)
// ---------------------------------------------------------------------------

/** W7-F seam — minimal shape read from presentationSections (untyped until F lands) */
export interface PresentationSectionLike extends BaseEntity {
  durationMinutes?: number;
  order?: number;
  title?: string;
}

/** W7-F seam — minimal shape read from presenterNotes */
export interface PresenterNoteLike extends BaseEntity {
  deliverableKey?: string;
  sectionId?: string;
  text?: string;
}

export interface SubmissionSources {
  users: readonly User[];
  /** the 7 canonical PersonaV2 records (bridged) */
  personas: readonly PersonaV2[];
  /** the 13 materials, upgraded to V2 (bridge is idempotent) */
  materials: readonly TrainingMaterialV2[];
  objections: readonly ObjectionRecord[];
  approvals: readonly Approval[];
  /** implementationProgrammes raw records (W7-A bootstrap may not have run) */
  programmes: readonly BaseEntity[];
  /** stage-gate validateAll() output; null ⇒ the service has not run */
  gateValidations: readonly GateWithValidation[] | null;
  presenterNotes: readonly PresenterNoteLike[];
  presentationSections: readonly PresentationSectionLike[];
  supportRequests: readonly SupportRequest[];
  quotations: readonly Quotation[];
  serviceTickets: readonly ServiceTicket[];
  activities: readonly Activity[];
  leads: readonly Lead[];
  enrollments: readonly Enrollment[];
  metricDefinitions: readonly MetricDefinition[];
  metricObservations: readonly MetricObservation[];
  nowISO: string;
}

// ---------------------------------------------------------------------------
// deliverable definitions
// ---------------------------------------------------------------------------

export interface DeliverableEvidenceSpec {
  label: string;
  resolve: (ctx: SubmissionSources) => ResolvedEvidence;
}

export interface DeliverableDef {
  key: DeliverableKey;
  order: number;
  titleHe: string;
  descriptionHe: string;
  /** the linked operational route — MUST exist in APP_ROUTES */
  route: string;
  /** NAMED seed user (C3) */
  ownerId: string;
  printable: boolean;
  /** seeded material backing the deliverable, when one exists */
  materialSeedId: string | null;
  /** does the authored/derived content exist right now? */
  contentExists: (ctx: SubmissionSources) => { exists: boolean; reasonHe: string | null };
  evidence: DeliverableEvidenceSpec[];
}

function found(label: string, ref: SubmissionEvidenceRef): ResolvedEvidence {
  return { label, ref, resolved: true, statusHe: "נמצאה" };
}

function missing(label: string, statusHe: string): ResolvedEvidence {
  return { label, ref: null, resolved: false, statusHe };
}

function materialEvidence(label: string, seedId: string): DeliverableEvidenceSpec {
  return {
    label,
    resolve: (ctx) => {
      const m = ctx.materials.find((x) => x.id === seedId);
      if (!m) return missing(label, `רשומת חומר ההדרכה ${seedId} לא נמצאה`);
      return found(label, {
        collection: "trainingMaterials",
        recordId: seedId,
        route: "/training-materials",
      });
    },
  };
}

function personaEvidence(personaId: string): DeliverableEvidenceSpec {
  return {
    label: `רשומת פרסונה ${personaId}`,
    resolve: (ctx) => {
      const p = ctx.personas.find((x) => x.id === personaId);
      if (!p) return missing(`רשומת פרסונה ${personaId}`, "חסרה ראיה — הרשומה לא נמצאה");
      return found(`פרסונה: ${p.name}`, {
        collection: "personas",
        recordId: personaId,
        route: "/personas",
      });
    },
  };
}

const always = (): { exists: boolean; reasonHe: string | null } => ({
  exists: true,
  reasonHe: null,
});

export const DELIVERABLE_DEFS: readonly DeliverableDef[] = [
  {
    key: "one-pager",
    order: 1,
    titleHe: REGISTRY_DELIVERABLE_TITLES["one-pager"],
    descriptionHe: "בעיה עסקית, פתרון וערך — כתוב מחדש כרשומה טיפוסית, ללא מספרי דונור כמדידות.",
    route: "/submission",
    ownerId: "u-tzachi",
    printable: true,
    materialSeedId: "tm-1",
    contentExists: always,
    evidence: [
      materialEvidence("מסמך מטרת הפתרון (tm-1)", "tm-1"),
      {
        label: "רשומת תכנית ההטמעה (בעיה ותוצאה עסקית)",
        resolve: (ctx) => {
          const prog = ctx.programmes[0];
          if (!prog)
            return missing(
              "רשומת תכנית ההטמעה",
              "חסרה ראיה — bootstrap תכנית ההטמעה טרם רץ",
            );
          return found("רשומת תכנית ההטמעה", {
            collection: "implementationProgrammes",
            recordId: prog.id,
            route: "/implementation",
          });
        },
      },
    ],
  },
  {
    key: "personas-map",
    order: 2,
    titleHe: REGISTRY_DELIVERABLE_TITLES["personas-map"],
    descriptionHe: "שבע הפרסונות הקנוניות (SPEC פרק 13) עם מסלול, תרגיל ובעלים בשם.",
    route: "/personas",
    ownerId: "u-oren",
    printable: true,
    materialSeedId: null,
    contentExists: (ctx) =>
      ctx.personas.length === 7
        ? { exists: true, reasonHe: null }
        : { exists: false, reasonHe: `נדרשות בדיוק 7 פרסונות — קיימות ${ctx.personas.length}` },
    evidence: ["per-1", "per-2", "per-3", "per-4", "per-5", "per-6", "per-7"].map(
      personaEvidence,
    ),
  },
  {
    key: "training-matrix",
    order: 3,
    titleHe: REGISTRY_DELIVERABLE_TITLES["training-matrix"],
    descriptionHe: "מטריצת פרסונה × פורמט × משך × חומרים — הקומפוננטה החיה ב-/personas.",
    route: "/personas",
    ownerId: "u-oren",
    printable: true,
    materialSeedId: null,
    contentExists: (ctx) => {
      if (ctx.personas.length !== 7)
        return { exists: false, reasonHe: "המטריצה מחייבת בדיוק 7 פרסונות" };
      const noTrack = ctx.personas.filter(
        (p) => !p.trainingFormat || p.durationMinutes === undefined,
      );
      return noTrack.length === 0
        ? { exists: true, reasonHe: null }
        : { exists: false, reasonHe: `${noTrack.length} פרסונות ללא פורמט/משך הדרכה` };
    },
    evidence: [
      {
        label: "13 חומרי הדרכה מקושרים למטריצה",
        resolve: (ctx) => {
          if (ctx.materials.length !== 13)
            return missing(
              "13 חומרי הדרכה",
              `נדרשים בדיוק 13 חומרים — קיימים ${ctx.materials.length}`,
            );
          return found("13 חומרי הדרכה", {
            collection: "trainingMaterials",
            recordId: "tm-1",
            route: "/training-materials",
          });
        },
      },
    ],
  },
  {
    key: "implementation-plan",
    order: 4,
    titleHe: REGISTRY_DELIVERABLE_TITLES["implementation-plan"],
    descriptionHe: "תכנית 6 השלבים (SPEC פרק 12) עם בעלים בשם לכל שלב — רשומת התכנית החיה.",
    route: "/implementation",
    ownerId: "u-noa",
    printable: true,
    materialSeedId: null,
    contentExists: (ctx) =>
      ctx.programmes.length > 0
        ? { exists: true, reasonHe: null }
        : { exists: false, reasonHe: "רשומת תכנית ההטמעה טרם נוצרה (bootstrap לא רץ)" },
    evidence: [
      {
        label: "רשומת התכנית עם 6 שלבים",
        resolve: (ctx) => {
          const prog = ctx.programmes[0];
          if (!prog) return missing("רשומת התכנית", "חסרה ראיה — התכנית טרם נוצרה");
          const stages = (prog as { stages?: unknown[] }).stages;
          if (!Array.isArray(stages) || stages.length !== 6)
            return missing(
              "רשומת התכנית",
              `התכנית קיימת אך אינה מכילה בדיוק 6 שלבים (${Array.isArray(stages) ? stages.length : 0})`,
            );
          return found("רשומת התכנית (6 שלבים)", {
            collection: "implementationProgrammes",
            recordId: prog.id,
            route: "/implementation",
          });
        },
      },
    ],
  },
  {
    key: "stage-gates",
    order: 5,
    titleHe: REGISTRY_DELIVERABLE_TITLES["stage-gates"],
    descriptionHe: "ששת השערים G1-G6 עם ולידציה דטרמיניסטית — נצרך מ-validateAll(), לא מחושב מחדש.",
    route: "/stage-gates",
    ownerId: "u-noa",
    printable: true,
    materialSeedId: null,
    contentExists: (ctx) =>
      ctx.gateValidations === null
        ? { exists: false, reasonHe: "ולידציית השערים טרם רצה (validateAll)" }
        : ctx.gateValidations.length === 6
          ? { exists: true, reasonHe: null }
          : { exists: false, reasonHe: `נדרשים בדיוק 6 שערים — התקבלו ${ctx.gateValidations.length}` },
    evidence: [
      {
        label: "6 שערים מגושרים עם תוצאות ולידציה",
        resolve: (ctx) => {
          if (ctx.gateValidations === null)
            return missing("6 שערים", "חסרה ראיה — שירות השערים טרם רץ בעמוד זה");
          if (ctx.gateValidations.length !== 6)
            return missing("6 שערים", `התקבלו ${ctx.gateValidations.length} שערים במקום 6`);
          return found("6 שערים (G1-G6) + ולידציה", {
            collection: "stageGates",
            recordId: ctx.gateValidations[0]?.gate.id ?? "sg-1",
            route: "/stage-gates",
          });
        },
      },
    ],
  },
  {
    key: "metric-levels",
    order: 6,
    titleHe: REGISTRY_DELIVERABLE_TITLES["metric-levels"],
    descriptionHe: "שלוש רמות מדידה (הדרכה/אימוץ/עסקי) — מחושב/יעד פיילוט/מבני, יעד לעולם לא כמדידה.",
    route: "/analytics",
    ownerId: "u-tzachi",
    printable: true,
    materialSeedId: null,
    contentExists: always,
    evidence: [
      {
        label: "9 הגדרות מדד seed (md-1..md-9) מגושרות",
        resolve: (ctx) => {
          if (ctx.metricDefinitions.length < 9)
            return missing(
              "הגדרות מדד seed",
              `נדרשות 9 הגדרות מדד — קיימות ${ctx.metricDefinitions.length}`,
            );
          return found("9 הגדרות מדד seed", {
            collection: "metricDefinitions",
            recordId: "md-1",
            route: "/analytics",
          });
        },
      },
    ],
  },
  {
    key: "quick-start",
    order: 7,
    titleHe: REGISTRY_DELIVERABLE_TITLES["quick-start"],
    descriptionHe: "שלוש פעולות ההתחלה המהירה (SPEC פרק 16) — המסך החי ב-/quick-start.",
    route: "/quick-start",
    ownerId: "u-oren",
    printable: true,
    materialSeedId: "tm-3",
    contentExists: always,
    evidence: [materialEvidence("חומר Quick Start (tm-3)", "tm-3")],
  },
  {
    key: "correct-use-policy",
    order: 8,
    titleHe: REGISTRY_DELIVERABLE_TITLES["correct-use-policy"],
    descriptionHe: "נוהל מותר / חובה לבדוק / אסור — רשומת tm-4 והמסך החי.",
    route: "/quick-start",
    ownerId: "u-noa",
    printable: true,
    materialSeedId: "tm-4",
    contentExists: always,
    evidence: [materialEvidence("נוהל שימוש נכון (tm-4)", "tm-4")],
  },
  {
    key: "faq-lace",
    order: 9,
    titleHe: REGISTRY_DELIVERABLE_TITLES["faq-lace"],
    descriptionHe: "ההתנגדויות עם תהליך LACE מלא — רשומות objections החיות ב-/faq.",
    route: "/faq",
    ownerId: "u-ran",
    printable: true,
    materialSeedId: "tm-6",
    contentExists: (ctx) =>
      ctx.objections.length > 0
        ? { exists: true, reasonHe: null }
        : { exists: false, reasonHe: "אוסף ההתנגדויות ריק — ensureCanonicalObjections טרם רץ" },
    evidence: [
      materialEvidence("FAQ והתנגדויות (tm-6)", "tm-6"),
      {
        label: "רשומות התנגדות עם LACE",
        resolve: (ctx) => {
          const first = ctx.objections[0];
          if (!first) return missing("רשומות התנגדות", "חסרה ראיה — אין רשומות התנגדות");
          return found(`${ctx.objections.length} רשומות התנגדות`, {
            collection: "objections",
            recordId: first.id,
            route: "/faq",
          });
        },
      },
    ],
  },
  {
    key: "training-script",
    order: 10,
    titleHe: REGISTRY_DELIVERABLE_TITLES["training-script"],
    descriptionHe: "תסריט הדרכה מתוזמן של 10 דקות — רשומת tm-8 עם מקטעי זמן אמיתיים.",
    route: "/training-materials",
    ownerId: "u-oren",
    printable: true,
    materialSeedId: "tm-8",
    contentExists: always,
    evidence: [materialEvidence("תסריט הדרכה (tm-8)", "tm-8")],
  },
  {
    key: "microlearning",
    order: 11,
    titleHe: REGISTRY_DELIVERABLE_TITLES.microlearning,
    descriptionHe: "קונספט + תסריט Microlearning — במפורש לא סרטון מופק (אין וידאו מזויף).",
    route: "/training-materials",
    ownerId: "u-oren",
    printable: true,
    materialSeedId: "tm-10",
    contentExists: always,
    evidence: [materialEvidence("סרטוני Microlearning (tm-10)", "tm-10")],
  },
  {
    key: "support-plan",
    order: 12,
    titleHe: REGISTRY_DELIVERABLE_TITLES["support-plan"],
    descriptionHe: "שלוש שכבות תמיכה עם SLA יעד מול SLA מדוד — מחובר למערכת /support החיה.",
    route: "/support",
    ownerId: "u-ran",
    printable: true,
    materialSeedId: "tm-12",
    contentExists: always,
    evidence: [
      materialEvidence("מסמך תמיכה ותקלות (tm-12)", "tm-12"),
      {
        label: "מערכת התמיכה החיה (supportRequests)",
        resolve: (ctx) => {
          const first = ctx.supportRequests[0];
          if (!first)
            return missing("מערכת התמיכה", "אין רשומות תמיכה — SLA מדוד יוצג כ\"טרם נמדד\"");
          return found(`${ctx.supportRequests.length} פניות תמיכה`, {
            collection: "supportRequests",
            recordId: first.id,
            route: "/support",
          });
        },
      },
    ],
  },
];

/** guard used by tests: defs cover exactly the 12 registry keys, in order */
export function deliverableDefKeys(): string[] {
  return DELIVERABLE_DEFS.map((d) => d.key);
}

export function deliverableByKey(key: DeliverableKey): DeliverableDef {
  const def = DELIVERABLE_DEFS.find((d) => d.key === key);
  if (!def) throw new Error(`deliverable לא מוכר: ${key}`);
  return def;
}

/** sanity — keep the registry and the defs from drifting apart */
export function defsMatchRegistry(): boolean {
  const keys = deliverableDefKeys();
  return (
    keys.length === REGISTRY_DELIVERABLE_KEYS.length &&
    keys.every((k, i) => k === REGISTRY_DELIVERABLE_KEYS[i])
  );
}
