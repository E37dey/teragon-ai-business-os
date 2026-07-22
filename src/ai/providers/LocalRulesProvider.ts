// TERAGON AI BUSINESS OS — LocalRulesProvider (Wave 5, W5-A).
// Fully deterministic rules engine behind the canonical AIProvider contract.
// NEVER pretends to be an LLM: provider="local-rules", model=null, usage
// unmeasured, confidence honestly "unavailable" ("טרם נמדד"), limitations
// always disclosed, and approval.required=true for anything that would
// mutate data or send a message.
//
// Rule logic reuses the module pure libraries where importable without cycles
// (read-only imports): printer matching (sales/matching), diagnosis rules
// (service/lib), next-exercise (courses/lib).
import { z } from "zod";
import type {
  Activity,
  AIRecommendation,
  Course,
  Customer,
  Enrollment,
  Evidence,
  ISODate,
  Lead,
  LearningPath,
  Meeting,
  PrinterModel,
  Product,
  Quotation,
  ServiceTicket,
  Task,
  User,
} from "@/domain/types";
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";
import {
  AIError,
  type AICapabilities,
  type AIProvider,
  type AIProviderHealth,
  type AIProviderResult,
  type AIRequest,
  type AIStreamEvent,
  type BoundedContext,
} from "@/ai/contracts/AIProvider";
import { matchPrinters, type NeedAssessment } from "@/modules/sales/matching";
import { getRepository } from "@/repositories";

export const LOCAL_RULES_PROVIDER_ID = "local-rules";
export const LOCAL_RULES_DISPLAY_NAME = "מנוע מקומי מבוסס כללים";

/** Operations the local engine honestly supports. */
export const LOCAL_OPERATIONS = [
  "summarize.weekly-leads",
  "summarize.meetings",
  "summarize.monthly-activity",
  "classify.lead-intent",
  "recommend.printer-match",
  "recommend.follow-up",
  "recommend.course-fit",
  "explain.recommendation",
] as const;

export type LocalOperation = (typeof LOCAL_OPERATIONS)[number];

// ---------------------------------------------------------------------------
// injected data access — keeps the provider testable and repository-agnostic
// ---------------------------------------------------------------------------

export interface LocalDataAccess {
  leads(): Promise<Lead[]>;
  customers(): Promise<Customer[]>;
  serviceTickets(): Promise<ServiceTicket[]>;
  quotations(): Promise<Quotation[]>;
  tasks(): Promise<Task[]>;
  meetings(): Promise<Meeting[]>;
  activities(): Promise<Activity[]>;
  courses(): Promise<Course[]>;
  enrollments(): Promise<Enrollment[]>;
  learningPaths(): Promise<LearningPath[]>;
  printerModels(): Promise<PrinterModel[]>;
  products(): Promise<Product[]>;
  users(): Promise<User[]>;
  aiRecommendations(): Promise<AIRecommendation[]>;
  evidence(): Promise<Evidence[]>;
}

/** Production wiring: canonical repositories behind the LocalDataAccess seam. */
export function repositoryDataAccess(): LocalDataAccess {
  return {
    leads: () => getRepository<Lead>("leads").list(),
    customers: () => getRepository<Customer>("customers").list(),
    serviceTickets: () => getRepository<ServiceTicket>("serviceTickets").list(),
    quotations: () => getRepository<Quotation>("quotations").list(),
    tasks: () => getRepository<Task>("tasks").list(),
    meetings: () => getRepository<Meeting>("meetings").list(),
    activities: () => getRepository<Activity>("activities").list(),
    courses: () => getRepository<Course>("courses").list(),
    enrollments: () => getRepository<Enrollment>("enrollments").list(),
    learningPaths: () => getRepository<LearningPath>("learningPaths").list(),
    printerModels: () => getRepository<PrinterModel>("printerModels").list(),
    products: () => getRepository<Product>("products").list(),
    users: () => getRepository<User>("users").list(),
    aiRecommendations: () => getRepository<AIRecommendation>("aiRecommendations").list(),
    evidence: () => getRepository<Evidence>("evidence").list(),
  };
}

export interface LocalRulesDeps {
  /** injectable clock (ISO datetime) — determinism in tests */
  now?: () => ISODate;
  /** injectable id factory — determinism in tests */
  idFactory?: (n: number) => string;
}

// ---------------------------------------------------------------------------
// deterministic classification rules (adapted from the donor rule classifier)
// ---------------------------------------------------------------------------

const INTENT_RULES: readonly { pattern: RegExp; intent: string }[] = [
  { pattern: /קורס|הדרכ|לימוד|סדנ/, intent: "לימודים והדרכה" },
  { pattern: /מדפסת|רכיש|קני|דגם/, intent: "רכישת מדפסת" },
  { pattern: /תקל|שירות|תיקון|לא עובד/, intent: "שירות ותמיכה" },
  { pattern: /הצעה|מחיר|עלות/, intent: "הצעת מחיר" },
];

const URGENCY_RULES: readonly { pattern: RegExp; urgency: string }[] = [
  { pattern: /דחוף|מייד|היום|בהקדם/, urgency: "גבוהה" },
  { pattern: /השבוע|בקרוב/, urgency: "בינונית" },
];

// ---------------------------------------------------------------------------
// the provider
// ---------------------------------------------------------------------------

interface OpOutcome {
  envelope: AIResponseEnvelopeV2;
  /** raw structured value for generateStructured */
  raw: unknown;
}

const BASE_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "מבוסס אך ורק על הרשומות שנמסרו לבקשה — אינו רואה נתונים מעבר להן",
];

export class LocalRulesProvider implements AIProvider {
  readonly id = LOCAL_RULES_PROVIDER_ID;
  readonly displayName = LOCAL_RULES_DISPLAY_NAME;

  private readonly data: LocalDataAccess;
  private readonly now: () => ISODate;
  private readonly idFactory: (n: number) => string;
  private seq = 0;

  constructor(data: LocalDataAccess, deps: LocalRulesDeps = {}) {
    this.data = data;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.idFactory = deps.idFactory ?? ((n) => `local-env-${n}`);
  }

  health(): Promise<AIProviderHealth> {
    return Promise.resolve({
      state: "מחובר",
      checkedAt: this.now(),
      detail: "מנוע מקומי — פועל ללא רשת וללא ספק חיצוני",
    });
  }

  capabilities(): Promise<AICapabilities> {
    return Promise.resolve({
      operations: ["summarize", "classify", "recommend", "explain"],
      streaming: true,
      structuredOutput: true,
      detail: `פעולות נתמכות: ${LOCAL_OPERATIONS.join(", ")}`,
    });
  }

  summarize(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.run(req, "summarize").then((o) => o.envelope);
  }

  classify(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.run(req, "classify").then((o) => o.envelope);
  }

  recommend(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.run(req, "recommend").then((o) => o.envelope);
  }

  explain(req: AIRequest): Promise<AIResponseEnvelopeV2> {
    return this.run(req, "explain").then((o) => o.envelope);
  }

  async generateStructured<T>(req: AIRequest, schema: z.ZodType<T>): Promise<AIProviderResult<T>> {
    const outcome = await this.run(req);
    const parsed = schema.safeParse(outcome.raw);
    if (!parsed.success) {
      throw new AIError("AI_RESPONSE_INVALID", {
        recoverable: true,
        correlationId: outcome.envelope.correlationId,
        detail: "הפלט המובנה של מנוע הכללים אינו תואם את הסכימה שביקש הקורא",
      });
    }
    return { value: parsed.data, envelope: outcome.envelope };
  }

  async *stream(req: AIRequest): AsyncIterable<AIStreamEvent> {
    let outcome: OpOutcome;
    try {
      outcome = await this.run(req);
    } catch (err) {
      if (err instanceof AIError) {
        yield {
          type: "error",
          code: err.code,
          messageHe: err.userMessageHe,
          recoverable: err.recoverable,
        };
        return;
      }
      throw err;
    }
    const { envelope } = outcome;
    yield {
      type: "start",
      requestId: envelope.requestId,
      correlationId: envelope.correlationId,
      provider: this.id,
    };
    // deterministic chunking of the recommendation text
    const text = envelope.recommendation;
    const CHUNK = 48;
    for (let i = 0; i < text.length; i += CHUNK) {
      if (req.signal?.aborted) {
        yield {
          type: "error",
          code: "AI_REQUEST_CANCELLED",
          messageHe: new AIError("AI_REQUEST_CANCELLED").userMessageHe,
          recoverable: false,
        };
        return;
      }
      yield { type: "delta", text: text.slice(i, i + CHUNK) };
    }
    yield { type: "done", envelope };
  }

  // -------------------------------------------------------------------------
  // dispatch
  // -------------------------------------------------------------------------

  private async run(req: AIRequest, expectedKind?: string): Promise<OpOutcome> {
    if (req.signal?.aborted) {
      throw new AIError("AI_REQUEST_CANCELLED", { correlationId: req.correlationId ?? null });
    }
    const op = req.operation;
    if (expectedKind && !op.startsWith(`${expectedKind}.`)) {
      throw new AIError("AI_INTERNAL_ERROR", {
        correlationId: req.correlationId ?? null,
        detail: `הפעולה "${op}" אינה פעולת ${expectedKind}`,
      });
    }
    switch (op as LocalOperation) {
      case "summarize.weekly-leads":
        return this.weeklyLeads(req);
      case "summarize.meetings":
        return this.meetingSummary(req);
      case "summarize.monthly-activity":
        return this.monthlyActivity(req);
      case "classify.lead-intent":
        return this.leadIntent(req);
      case "recommend.printer-match":
        return this.printerMatch(req);
      case "recommend.follow-up":
        return this.followUpDraft(req);
      case "recommend.course-fit":
        return this.courseFit(req);
      case "explain.recommendation":
        return this.explainRecommendation(req);
      default:
        throw new AIError("AI_INTERNAL_ERROR", {
          correlationId: req.correlationId ?? null,
          detail: `פעולה לא נתמכת במנוע המקומי: "${op}"`,
        });
    }
  }

  // -------------------------------------------------------------------------
  // envelope assembly
  // -------------------------------------------------------------------------

  private makeEnvelope(
    req: AIRequest,
    fields: {
      recommendation: string;
      reason: string;
      evidence: EvidenceItem[];
      nextStep: string;
      limitations?: string[];
      confidenceMethod: string;
      confidenceSignals?: string[];
      approvalRequired: boolean;
      status?: AIResponseEnvelopeV2["status"];
    },
  ): AIResponseEnvelopeV2 {
    this.seq += 1;
    const id = this.idFactory(this.seq);
    const createdAt = this.now();
    return {
      id,
      requestId: `${id}-req`,
      correlationId: req.correlationId ?? `${id}-corr`,
      provider: this.id,
      model: null, // rules engine — never fakes a model name
      createdAt,
      operation: req.operation,
      recommendation: fields.recommendation,
      reason: fields.reason,
      evidence: fields.evidence,
      confidence: unavailableConfidence(fields.confidenceMethod, fields.confidenceSignals ?? []),
      nextStep: fields.nextStep,
      limitations: [...BASE_LIMITATIONS, ...(fields.limitations ?? [])],
      approval: fields.approvalRequired
        ? { required: true, state: "pending", requestedAt: createdAt }
        : { required: false, state: "not_required" },
      usage: { measured: false }, // no tokens were consumed — absent ≠ zero
      status: fields.status ?? "הצלחה",
    };
  }

  private entityEvidence(
    record: { id: string; updatedAt: ISODate },
    title: string,
    excerpt: string,
    relevanceMethod: string,
  ): EvidenceItem {
    return {
      sourceType: "entity",
      sourceId: record.id,
      title,
      relevantExcerpt: excerpt,
      relevanceMethod,
      verified: true, // the record was read from the canonical data at generation time
      lastUpdated: record.updatedAt,
    };
  }

  private async slice<K extends keyof BoundedContext & keyof LocalDataAccess>(
    req: AIRequest,
    key: K,
  ): Promise<NonNullable<BoundedContext[K]>> {
    const given = req.boundedContext[key];
    if (given) return given as NonNullable<BoundedContext[K]>;
    return (await this.data[key]()) as unknown as NonNullable<BoundedContext[K]>;
  }

  private today(): string {
    return this.now().slice(0, 10);
  }

  // -------------------------------------------------------------------------
  // operations
  // -------------------------------------------------------------------------

  /** summarize.weekly-leads — leads created in the last 7 days, by status. */
  private async weeklyLeads(req: AIRequest): Promise<OpOutcome> {
    const leads = await this.slice(req, "leads");
    const today = this.today();
    const from = addDaysISO(today, -7);
    const recent = [...leads]
      .filter((l) => l.createdAt.slice(0, 10) >= from)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
    const byStatus = new Map<string, number>();
    for (const l of recent) byStatus.set(l.status, (byStatus.get(l.status) ?? 0) + 1);
    const parts = [...byStatus.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"))
      .map(([status, n]) => `${status}: ${n}`);
    const recommendation =
      recent.length === 0
        ? `בשבוע האחרון (${from} עד ${today}) לא נוצרו לידים חדשים.`
        : `בשבוע האחרון (${from} עד ${today}) נוצרו ${recent.length} לידים. פילוח לפי סטטוס — ${parts.join(" · ")}.`;
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason: "ספירה דטרמיניסטית של רשומות לידים שנוצרו בחלון של 7 ימים, מפולחת לפי שדה הסטטוס.",
      evidence: recent
        .slice(0, 8)
        .map((l) =>
          this.entityEvidence(
            l,
            `ליד: ${l.name}`,
            `סטטוס "${l.status}", נוצר ${l.createdAt.slice(0, 10)}`,
            "נכלל בחלון 7 הימים לפי createdAt",
          ),
        ),
      nextStep:
        recent.length === 0
          ? "לבחון את ערוצי הגעת הלידים"
          : "לעבור על הלידים החדשים ולוודא בעלים ומעקב לכל אחד",
      confidenceMethod: "ספירה ישירה — אין מדד ביטחון סטטיסטי למדוד",
      confidenceSignals: [`נסרקו ${leads.length} לידים`, `${recent.length} בחלון הזמן`],
      approvalRequired: false,
    });
    return {
      envelope,
      raw: {
        summary: recommendation,
        total: recent.length,
        byStatus: Object.fromEntries(byStatus),
      },
    };
  }

  /** summarize.meetings — upcoming/recent meetings for the organization. */
  private async meetingSummary(req: AIRequest): Promise<OpOutcome> {
    const meetings = await this.slice(req, "meetings");
    const today = this.today();
    const upcoming = [...meetings]
      .filter((m) => m.scheduledAt.slice(0, 10) >= today)
      .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.id.localeCompare(b.id));
    const lines = upcoming
      .slice(0, 5)
      .map(
        (m) =>
          `«${m.title}» ב-${m.scheduledAt.slice(0, 10)} (${m.durationMinutes} דק', ${m.location})`,
      );
    const recommendation =
      upcoming.length === 0
        ? "אין פגישות מתוכננות קדימה ביומן."
        : `${upcoming.length} פגישות מתוכננות. הקרובות: ${lines.join(" · ")}.`;
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason: "סינון דטרמיניסטי של רשומות פגישה עם מועד עתידי ומיון לפי תאריך.",
      evidence: upcoming
        .slice(0, 8)
        .map((m) =>
          this.entityEvidence(
            m,
            `פגישה: ${m.title}`,
            `מתוכננת ל-${m.scheduledAt}`,
            "scheduledAt עתידי ביחס להיום",
          ),
        ),
      nextStep:
        upcoming.length === 0
          ? "לתאם פגישות מעקב ללידים פתוחים"
          : "לוודא סדר יום ומשתתפים לפגישה הקרובה",
      confidenceMethod: "סינון ומיון ישירים — אין מדד ביטחון למדוד",
      approvalRequired: false,
    });
    return { envelope, raw: { summary: recommendation, upcoming: upcoming.length } };
  }

  /** summarize.monthly-activity — activity feed of the last 30 days by kind. */
  private async monthlyActivity(req: AIRequest): Promise<OpOutcome> {
    const activities = await this.slice(req, "activities");
    const today = this.today();
    const from = addDaysISO(today, -30);
    const recent = [...activities]
      .filter((a) => a.at.slice(0, 10) >= from)
      .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
    const byKind = new Map<string, number>();
    for (const a of recent) byKind.set(a.kind, (byKind.get(a.kind) ?? 0) + 1);
    const parts = [...byKind.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "he"))
      .map(([kind, n]) => `${kind}: ${n}`);
    const recommendation =
      recent.length === 0
        ? `לא נרשמה פעילות ב-30 הימים האחרונים (${from} עד ${today}).`
        : `ב-30 הימים האחרונים נרשמו ${recent.length} פעילויות. פילוח — ${parts.join(" · ")}.`;
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason: "ספירה דטרמיניסטית של רשומות פעילות בחלון 30 יום, מפולחת לפי סוג.",
      evidence: recent
        .slice(0, 8)
        .map((a) =>
          this.entityEvidence(a, `פעילות: ${a.kind}`, a.text, "נכללה בחלון 30 הימים לפי at"),
        ),
      nextStep: "להשוות את הפילוח ליעדי החודש במרכז השליטה",
      confidenceMethod: "ספירה ישירה — אין מדד ביטחון למדוד",
      approvalRequired: false,
    });
    return {
      envelope,
      raw: { summary: recommendation, total: recent.length, byKind: Object.fromEntries(byKind) },
    };
  }

  /** classify.lead-intent — deterministic keyword rules over a real lead record. */
  private async leadIntent(req: AIRequest): Promise<OpOutcome> {
    const ref = req.relatedEntities.find((e) => e.type === "lead");
    if (!ref) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: "classify.lead-intent מחייב relatedEntities עם ליד אמיתי",
      });
    }
    const leads = await this.slice(req, "leads");
    const lead = leads.find((l) => l.id === ref.id);
    if (!lead) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: `ליד "${ref.id}" לא נמצא ברשומות שסופקו`,
      });
    }
    const text = `${lead.interest} ${lead.notes}`;
    const intentHit = INTENT_RULES.find((r) => r.pattern.test(text));
    const urgencyHit = URGENCY_RULES.find((r) => r.pattern.test(text));
    const intent = intentHit?.intent ?? "בירור כללי";
    const urgency = urgencyHit?.urgency ?? "רגילה";
    const firedRules = [
      intentHit
        ? `כלל כוונה: ${intentHit.pattern.source}`
        : "כוונה: ברירת מחדל (אין התאמת מילות מפתח)",
      urgencyHit ? `כלל דחיפות: ${urgencyHit.pattern.source}` : "דחיפות: ברירת מחדל",
    ];
    const recommendation = `סיווג הליד «${lead.name}»: כוונה — ${intent}; דחיפות — ${urgency}.`;
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason: "כללי מילות מפתח דטרמיניסטיים על שדות העניין וההערות של הליד — לא מודל שפה.",
      evidence: [
        this.entityEvidence(
          lead,
          `ליד: ${lead.name}`,
          `עניין: "${lead.interest}"; הערות: "${lead.notes}"`,
          "שדות הקלט של כללי הסיווג",
        ),
      ],
      nextStep: urgency === "גבוהה" ? "ליצור קשר עוד היום" : "לתזמן מעקב לפי מדיניות הצוות",
      limitations: ["סיווג מבוסס מילות מפתח בלבד — ניסוח חריג עלול שלא להתאים לאף כלל"],
      confidenceMethod: "כללי מילות מפתח — התאמה בינארית ללא הסתברות; מספר ביטחון היה מומצא",
      confidenceSignals: firedRules,
      approvalRequired: false,
    });
    return { envelope, raw: { leadId: lead.id, intent, urgency, firedRules } };
  }

  /** recommend.printer-match — delegates to the sales matching pure library. */
  private async printerMatch(req: AIRequest): Promise<OpOutcome> {
    const paramsSchema = z.object({
      useCase: z.enum([
        "תחביב",
        "לימודים",
        "אב־טיפוס",
        "ייצור קטן",
        "חלקים טכניים",
        "מיניאטורות",
        "מודלים אדריכליים",
      ]),
      materials: z.array(z.enum(["PLA", "PETG", "ABS", "ניילון", "רזין"])),
      buildVolume: z.enum(["קטן", "בינוני", "גדול"]),
      budget: z.number().positive(),
    });
    const parsed = paramsSchema.safeParse(req.params ?? {});
    if (!parsed.success) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: "recommend.printer-match מחייב params: useCase, materials, buildVolume, budget",
      });
    }
    const need: NeedAssessment = parsed.data;
    const catalogue = await this.slice(req, "printerModels");
    const matches = matchPrinters(catalogue, need, 3);
    const top = matches[0];
    const recommendation = top
      ? `ההתאמה המובילה: ${top.model.name} (${top.model.manufacturer}) — ${top.suitability.join("; ")}.`
      : "לא נמצאו דגמים בקטלוג להשוואה.";
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason: "ניקוד כללים דטרמיניסטי מעל קטלוג הדגמים בלבד: טכנולוגיה, תיוג שימוש, נפח ותקציב.",
      evidence: matches.map((m) =>
        this.entityEvidence(
          m.model,
          `דגם: ${m.model.name}`,
          `ניקוד כללים ${m.score}; ${[...m.suitability, ...m.limitations].join("; ")}`,
          "ניקוד דטרמיניסטי (matchPrinters)",
        ),
      ),
      nextStep: top ? "להציג ללקוח את שלוש ההתאמות ולתאם הדגמה" : "להרחיב את קטלוג הדגמים",
      limitations: ["הניקוד הוא כלל עסקי — אינו הסתברות ואינו מוצג כביטחון"],
      confidenceMethod: "ניקוד כללים — במפורש אינו ביטחון סטטיסטי (ראו matching.ts)",
      confidenceSignals: matches.map((m) => `${m.model.name}: ניקוד ${m.score}`),
      approvalRequired: false,
    });
    return {
      envelope,
      raw: {
        matches: matches.map((m) => ({
          modelId: m.model.id,
          modelName: m.model.name,
          score: m.score,
          suitability: m.suitability,
          limitations: m.limitations,
          overBudget: m.overBudget,
        })),
      },
    };
  }

  /** recommend.follow-up — DRAFT of an outgoing message ⇒ approval REQUIRED. */
  private async followUpDraft(req: AIRequest): Promise<OpOutcome> {
    const ref = req.relatedEntities.find((e) => e.type === "lead");
    if (!ref) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: "recommend.follow-up מחייב relatedEntities עם ליד אמיתי",
      });
    }
    const leads = await this.slice(req, "leads");
    const lead = leads.find((l) => l.id === ref.id);
    if (!lead) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: `ליד "${ref.id}" לא נמצא ברשומות שסופקו`,
      });
    }
    const draft = `שלום ${lead.name}, כאן צוות טרגון טכנולוגיות. רצינו לוודא שקיבלת את המידע על ${lead.interest}. נשמח לענות על כל שאלה ולתאם שיחה קצרה. תודה!`;
    const envelope = this.makeEnvelope(req, {
      recommendation: draft,
      reason: `תבנית מעקב דטרמיניסטית שמולאה מפרטי הליד (סטטוס נוכחי: "${lead.status}", מעקב מתוכנן: ${lead.followUp}).`,
      evidence: [
        this.entityEvidence(
          lead,
          `ליד: ${lead.name}`,
          `סטטוס "${lead.status}", מעקב ${lead.followUp}, עניין "${lead.interest}"`,
          "מקור נתוני התבנית",
        ),
      ],
      nextStep: "אישור אנושי של הנוסח לפני כל שליחה — הטיוטה אינה נשלחת אוטומטית",
      limitations: ["תבנית קבועה — אינה מנוסחת מחדש לפי הקשר; עריכה אנושית מומלצת"],
      confidenceMethod: "מילוי תבנית — אין מה למדוד",
      approvalRequired: true, // sending a message = human approval, always
    });
    return { envelope, raw: { leadId: lead.id, draft } };
  }

  /** recommend.course-fit — open courses the customer has not taken yet. */
  private async courseFit(req: AIRequest): Promise<OpOutcome> {
    const ref = req.relatedEntities.find((e) => e.type === "customer");
    if (!ref) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: "recommend.course-fit מחייב relatedEntities עם לקוח אמיתי",
      });
    }
    const customers = await this.slice(req, "customers");
    const customer = customers.find((c) => c.id === ref.id);
    if (!customer) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: `לקוח "${ref.id}" לא נמצא ברשומות שסופקו`,
      });
    }
    const courses = await this.slice(req, "courses");
    const taken = new Set(customer.courseNames);
    const candidates = [...courses]
      .filter((c) => (c.status === "פתוח להרשמה" || c.status === "פעיל") && !taken.has(c.name))
      .sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id))
      .slice(0, 3);
    const recommendation =
      candidates.length === 0
        ? `לא נמצא קורס פתוח שמתאים ל-${customer.name} שלא נלקח כבר.`
        : `קורסים מתאימים ל-${customer.name}: ${candidates.map((c) => `«${c.name}» (מתחיל ${c.start})`).join(" · ")}.`;
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason:
        "סינון דטרמיניסטי: קורסים פתוחים/פעילים שאינם ברשימת הקורסים הקיימת של הלקוח, ממוינים לפי מועד התחלה.",
      evidence: [
        this.entityEvidence(
          customer,
          `לקוח: ${customer.name}`,
          `קורסים קיימים: ${customer.courseNames.join(", ") || "אין"}`,
          "בסיס הסינון",
        ),
        ...candidates.map((c) =>
          this.entityEvidence(
            c,
            `קורס: ${c.name}`,
            `סטטוס "${c.status}", מתחיל ${c.start}`,
            "עומד בתנאי הסינון",
          ),
        ),
      ],
      nextStep:
        candidates.length > 0
          ? "להציע את הקורס ללקוח — לאחר אישור אנושי של הפנייה"
          : "לעדכן את הלקוח כשייפתח קורס רלוונטי",
      limitations: ["ההתאמה לפי סטטוס קורס ורשימת קורסים קיימת בלבד — ללא ניתוח צרכים מעמיק"],
      confidenceMethod: "סינון בינארי — אין מדד ביטחון למדוד",
      approvalRequired: false,
    });
    return {
      envelope,
      raw: {
        customerId: customer.id,
        courses: candidates.map((c) => ({ id: c.id, name: c.name, start: c.start })),
      },
    };
  }

  /** explain.recommendation — why-this-recommendation from real evidence records. */
  private async explainRecommendation(req: AIRequest): Promise<OpOutcome> {
    const ref = req.relatedEntities.find((e) => e.type === "aiRecommendation");
    if (!ref) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: "explain.recommendation מחייב relatedEntities עם המלצת AI אמיתית",
      });
    }
    const recommendations = await this.slice(req, "aiRecommendations");
    const rec = recommendations.find((r) => r.id === ref.id);
    if (!rec) {
      throw new AIError("AI_EVIDENCE_REQUIRED", {
        correlationId: req.correlationId ?? null,
        detail: `המלצה "${ref.id}" לא נמצאה ברשומות שסופקו`,
      });
    }
    const allEvidence = await this.slice(req, "evidence");
    const cited = allEvidence
      .filter((ev) => rec.evidenceIds.includes(ev.id))
      .sort((a, b) => a.id.localeCompare(b.id));
    const evidenceLines = cited.map((ev) => `«${ev.claim}» (מקור: ${ev.sourceRef})`);
    const recommendation =
      `ההמלצה «${rec.title}» נומקה כך: ${rec.reason}` +
      (evidenceLines.length > 0
        ? ` היא נשענת על ${evidenceLines.length} ראיות: ${evidenceLines.join(" · ")}.`
        : " לא נמצאו רשומות ראיה מקושרות.") +
      (rec.approvalRequired ? " ההמלצה מחייבת אישור אנושי לפני ביצוע." : "");
    const envelope = this.makeEnvelope(req, {
      recommendation,
      reason:
        "הרכבה דטרמיניסטית של הסבר מרשומת ההמלצה ורשומות הראיה המקושרות אליה — ללא פרשנות חדשה.",
      evidence: [
        this.entityEvidence(rec, `המלצה: ${rec.title}`, rec.reason, "רשומת ההמלצה עצמה"),
        ...cited.map((ev) =>
          this.entityEvidence(
            ev,
            `ראיה: ${ev.sourceRef}`,
            ev.claim,
            "מקושרת דרך evidenceIds של ההמלצה",
          ),
        ),
      ],
      nextStep: rec.nextAction,
      limitations: cited.length === 0 ? ["להמלצה אין רשומות ראיה מקושרות — ההסבר חלקי"] : [],
      confidenceMethod: rec.confidenceMethod ?? "לא נמדד ברשומת המקור",
      approvalRequired: false,
      status: cited.length === 0 && rec.evidenceIds.length > 0 ? "חלקי" : "הצלחה",
    });
    return {
      envelope,
      raw: {
        recommendationId: rec.id,
        explanation: recommendation,
        evidenceIds: cited.map((e) => e.id),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// small date helper (UTC-safe, date-only)
// ---------------------------------------------------------------------------

function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
