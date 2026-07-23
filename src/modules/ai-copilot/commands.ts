// W5-D — the Copilot COMMAND REGISTRY (Phase 5.9). Free text is NEVER
// forwarded to a provider: input must match one of the mapped commands below,
// each bound to a defined operation (provider op or module-local deterministic
// op). Unmapped input ⇒ the honest "הפקודה אינה נתמכת עדיין" + supported list.
import type { AIRequest, AIRelatedEntity } from "@/ai/contracts/AIProvider";
import { AIError } from "@/ai/contracts/AIProvider";
import type { FallbackDisclosure } from "@/ai/providers/registry";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import type { Course, Customer, Enrollment, Lead, Quotation, ServiceTicket } from "@/domain/types";
import type { AgentStores } from "@/repositories/agentStores";
import { CEO_USER_ID } from "@/repositories/seed";
import { selectProvider } from "@/components/ai/engine";
import {
  courseFitScanOp,
  quotationsNoResponseOp,
  recurringFaultsOp,
  stuckStudentsOp,
  unansweredCustomersOp,
} from "./ops";

export const UNSUPPORTED_COMMAND_HE = "הפקודה אינה נתמכת עדיין";

export interface CopilotContextChips {
  leadId: string | null;
  customerId: string | null;
  ticketId: string | null;
}

export const EMPTY_CHIPS: CopilotContextChips = { leadId: null, customerId: null, ticketId: null };

export interface CommandExecContext {
  stores: AgentStores;
  chips: CopilotContextChips;
  todayIso: string;
  signal?: AbortSignal;
}

export interface AffectedRecord {
  type: string;
  id: string;
  labelHe: string;
}

/** A draft that may proceed to the human approval gate. */
export interface ProposedAction {
  kind: "customer-message";
  labelHe: string;
  leadId: string;
  draft: string;
}

export interface CommandOutcome {
  envelope: AIResponseEnvelopeV2;
  /** non-null ⇔ the registry disclosed remote→local fallback (must render) */
  fallback: FallbackDisclosure | null;
  affected: AffectedRecord[];
  proposedAction: ProposedAction | null;
}

export interface CopilotCommand {
  id: string;
  /** the canonical Hebrew command text */
  textHe: string;
  descriptionHe: string;
  /** where the operation runs — for the registry table + tests */
  binding: "provider" | "local" | "provider-or-local";
  operation: string;
  execute(ctx: CommandExecContext): Promise<CommandOutcome>;
}

/** Normalization: trim, collapse whitespace, strip trailing punctuation. */
export function normalizeCommandText(input: string): string {
  return input
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[?!.،؟]+$/u, "");
}

async function callProvider(
  ctx: CommandExecContext,
  operation: string,
  relatedEntities: AIRelatedEntity[] = [],
): Promise<{ envelope: AIResponseEnvelopeV2; fallback: FallbackDisclosure | null }> {
  const selection = await selectProvider();
  if (!selection.provider) {
    throw new AIError(selection.unavailable?.code ?? "AI_PROVIDER_UNAVAILABLE");
  }
  const req: AIRequest = {
    operation,
    organizationId: "org-teragon",
    userId: CEO_USER_ID,
    sessionId: "copilot",
    relatedEntities,
    boundedContext: {},
    outputSchemaVersion: "v1",
    ...(ctx.signal ? { signal: ctx.signal } : {}),
  };
  const kind = operation.split(".")[0];
  const provider = selection.provider;
  const envelope =
    kind === "summarize"
      ? await provider.summarize(req)
      : kind === "classify"
        ? await provider.classify(req)
        : kind === "recommend"
          ? await provider.recommend(req)
          : await provider.explain(req);
  return { envelope, fallback: selection.fallback };
}

function affectedFromEnvelope(envelope: AIResponseEnvelopeV2): AffectedRecord[] {
  return envelope.evidence.map((e) => ({
    type: e.sourceType,
    id: e.sourceId,
    labelHe: e.title,
  }));
}

async function pickLead(ctx: CommandExecContext): Promise<Lead> {
  const leads = await ctx.stores.collection<Lead>("leads").list();
  if (ctx.chips.leadId) {
    const chosen = leads.find((l) => l.id === ctx.chips.leadId);
    if (chosen) return chosen;
  }
  const open = leads
    .filter((l) => l.status !== "נסגר כלקוח" && l.status !== "לא רלוונטי")
    .sort((a, b) => a.followUp.localeCompare(b.followUp) || a.id.localeCompare(b.id));
  const first = open[0] ?? leads[0];
  if (!first) {
    throw new AIError("AI_EVIDENCE_REQUIRED", {
      detail: "אין רשומות ליד במערכת — אין למי להכין טיוטת מעקב",
    });
  }
  return first;
}

export const COPILOT_COMMANDS: readonly CopilotCommand[] = [
  {
    id: "weekly-leads",
    textHe: "סכם את הפניות שהתקבלו השבוע",
    descriptionHe: "סיכום לידים שנוצרו ב-7 הימים האחרונים, מפולח לפי סטטוס",
    binding: "provider",
    operation: "summarize.weekly-leads",
    async execute(ctx) {
      const { envelope, fallback } = await callProvider(ctx, "summarize.weekly-leads");
      return { envelope, fallback, affected: affectedFromEnvelope(envelope), proposedAction: null };
    },
  },
  {
    id: "unanswered-customers",
    textHe: "מי מהלקוחות עדיין לא קיבל מענה?",
    descriptionHe: "לקוחות שממתינים למענה + לידים שמועד המעקב שלהם עבר",
    binding: "local",
    operation: "copilot.unanswered-customers",
    async execute(ctx) {
      const customers = await ctx.stores.collection<Customer>("customers").list();
      const leads = await ctx.stores.collection<Lead>("leads").list();
      const envelope = unansweredCustomersOp(customers, leads, ctx.todayIso);
      return {
        envelope,
        fallback: null,
        affected: affectedFromEnvelope(envelope),
        proposedAction: null,
      };
    },
  },
  {
    id: "quotations-no-response",
    textHe: "הצג הצעות מחיר ללא תגובה",
    descriptionHe: "הצעות שנשלחו וטרם התקבלה עליהן החלטה",
    binding: "local",
    operation: "copilot.quotations-no-response",
    async execute(ctx) {
      const quotations = await ctx.stores.collection<Quotation>("quotations").list();
      const envelope = quotationsNoResponseOp(quotations, ctx.todayIso);
      return {
        envelope,
        fallback: null,
        affected: affectedFromEnvelope(envelope),
        proposedAction: null,
      };
    },
  },
  {
    id: "follow-up-draft",
    textHe: "הכן טיוטת הודעת מעקב",
    descriptionHe: "טיוטת מעקב לליד (בחרו ליד בצ'יפ ההקשר; אחרת נבחר הליד הדחוף ביותר)",
    binding: "provider",
    operation: "recommend.follow-up",
    async execute(ctx) {
      const lead = await pickLead(ctx);
      const { envelope, fallback } = await callProvider(ctx, "recommend.follow-up", [
        { type: "lead", id: lead.id },
      ]);
      return {
        envelope,
        fallback,
        affected: affectedFromEnvelope(envelope),
        proposedAction: {
          kind: "customer-message",
          labelHe: `בקש אישור לשליחת ההודעה ל-${lead.name}`,
          leadId: lead.id,
          draft: envelope.recommendation,
        },
      };
    },
  },
  {
    id: "stuck-students",
    textHe: "אילו תלמידים אינם מתקדמים?",
    descriptionHe: "שלבי למידה חסומים, באיחור או שנדרש בהם תיקון",
    binding: "local",
    operation: "copilot.stuck-students",
    async execute(ctx) {
      const enrollments = await ctx.stores.collection<Enrollment>("enrollments").list();
      const envelope = stuckStudentsOp(enrollments);
      return {
        envelope,
        fallback: null,
        affected: affectedFromEnvelope(envelope),
        proposedAction: null,
      };
    },
  },
  {
    id: "recurring-faults",
    textHe: "הצג תקלות חוזרות לפי דגם מדפסת",
    descriptionHe: "קיבוץ קריאות שירות לפי דגם — דגמים עם שתי קריאות ומעלה",
    binding: "local",
    operation: "copilot.recurring-faults",
    async execute(ctx) {
      const tickets = await ctx.stores.collection<ServiceTicket>("serviceTickets").list();
      const envelope = recurringFaultsOp(tickets);
      return {
        envelope,
        fallback: null,
        affected: affectedFromEnvelope(envelope),
        proposedAction: null,
      };
    },
  },
  {
    id: "meeting-brief",
    textHe: "הכן סיכום לפגישה עם ארגון",
    descriptionHe: "סקירת הפגישות הקרובות ביומן כבסיס להכנה",
    binding: "provider",
    operation: "summarize.meetings",
    async execute(ctx) {
      const { envelope, fallback } = await callProvider(ctx, "summarize.meetings");
      return { envelope, fallback, affected: affectedFromEnvelope(envelope), proposedAction: null };
    },
  },
  {
    id: "course-fit",
    textHe: "מצא לקוחות המתאימים לקורס מתקדם",
    descriptionHe: "עם צ'יפ לקוח — התאמה ללקוח שנבחר; בלעדיו — סריקה על כל הלקוחות",
    binding: "provider-or-local",
    operation: "recommend.course-fit / copilot.course-fit-scan",
    async execute(ctx) {
      if (ctx.chips.customerId) {
        const { envelope, fallback } = await callProvider(ctx, "recommend.course-fit", [
          { type: "customer", id: ctx.chips.customerId },
        ]);
        return {
          envelope,
          fallback,
          affected: affectedFromEnvelope(envelope),
          proposedAction: null,
        };
      }
      const customers = await ctx.stores.collection<Customer>("customers").list();
      const courses = await ctx.stores.collection<Course>("courses").list();
      const envelope = courseFitScanOp(customers, courses);
      return {
        envelope,
        fallback: null,
        affected: affectedFromEnvelope(envelope),
        proposedAction: null,
      };
    },
  },
  {
    id: "monthly-report",
    textHe: "הכן דוח פעילות חודשי",
    descriptionHe: "פילוח הפעילות העסקית של 30 הימים האחרונים",
    binding: "provider",
    operation: "summarize.monthly-activity",
    async execute(ctx) {
      const { envelope, fallback } = await callProvider(ctx, "summarize.monthly-activity");
      return { envelope, fallback, affected: affectedFromEnvelope(envelope), proposedAction: null };
    },
  },
] as const;

/** Deterministic matcher — exact match after normalization, else null. */
export function matchCommand(input: string): CopilotCommand | null {
  const normalized = normalizeCommandText(input);
  return COPILOT_COMMANDS.find((c) => normalizeCommandText(c.textHe) === normalized) ?? null;
}
