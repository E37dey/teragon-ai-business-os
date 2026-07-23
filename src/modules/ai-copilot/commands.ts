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
import { wikiOps } from "@/agents/wiki";
import { getMemoryEngine } from "@/memory/core/engine";
import { CEO_NAME_HE } from "@/memory/adapters/legacyBridge";
import {
  courseFitScanOp,
  quotationsNoResponseOp,
  recurringFaultsOp,
  stuckStudentsOp,
  unansweredCustomersOp,
} from "./ops";
import {
  customerMemorySummaryOp,
  knowledgeContradictionsOp,
  pendingLearningProposalsOp,
  pendingMemoryProposalsOp,
  proposeMemoryFromConversationOp,
  recommendationEvidenceOp,
  rejectedRecommendationsOp,
  searchApprovedKnowledgeOp,
  type MemoryOpResult,
} from "./memoryOps";

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
  /** the raw (normalized) user input — parameterized commands parse it (W6) */
  inputText?: string;
  /** derived summary of the current conversation (user messages) — W6 */
  conversationSummaryHe?: string;
}

export interface AffectedRecord {
  type: string;
  id: string;
  labelHe: string;
  /** navigable route to the actual record/module (W6 — evidence links) */
  route?: string;
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
  /** extra deterministic matcher for parameterized commands (W6) */
  matchesInput?(normalized: string): boolean;
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

// ---------------------------------------------------------------------------
// W6 WIRING (Phase 6.19) — 8 cross-domain commands over the governed
// memory/knowledge/learning domains. Each maps to a DEFINED op in
// memoryOps.ts (no free forwarding); Wiki answers pass the exact
// NO_APPROVED_SOURCE_HE string through when no approved source exists.
// ---------------------------------------------------------------------------

const KNOWLEDGE_SEARCH_PREFIX_HE = "מצא ידע מאושר על";
const KNOWLEDGE_SEARCH_CANONICAL_HE = `${KNOWLEDGE_SEARCH_PREFIX_HE} Warping`;

function w6Outcome(result: MemoryOpResult): CommandOutcome {
  return {
    envelope: result.envelope,
    fallback: null,
    affected: result.affected,
    proposedAction: null,
  };
}

export const W6_MEMORY_COMMANDS: readonly CopilotCommand[] = [
  {
    id: "customer-memory",
    textHe: "מה אנחנו יודעים על הלקוח הזה?",
    descriptionHe:
      "סיכום זיכרון הלקוח המאושר (מחייב צ'יפ לקוח) — פריטים רגישים נשארים מוסתרים",
    binding: "local",
    operation: "copilot.customer-memory",
    async execute(ctx) {
      return w6Outcome(await customerMemorySummaryOp(ctx.chips.customerId, ctx.stores));
    },
  },
  {
    id: "recommendation-evidence",
    textHe: "אילו מקורות תומכים בהמלצה?",
    descriptionHe: "רשומות הראיה המקושרות להמלצה (לפי צ'יפ ההקשר, אחרת העדכנית)",
    binding: "local",
    operation: "copilot.recommendation-evidence",
    async execute(ctx) {
      return w6Outcome(await recommendationEvidenceOp(ctx.chips, ctx.stores));
    },
  },
  {
    id: "knowledge-search",
    textHe: KNOWLEDGE_SEARCH_CANONICAL_HE,
    descriptionHe: 'חיפוש במאמרי ידע מאושרים בלבד — "מצא ידע מאושר על <נושא>"',
    binding: "local",
    operation: "wiki.search-approved",
    matchesInput: (normalized) => normalized.startsWith(`${KNOWLEDGE_SEARCH_PREFIX_HE} `),
    async execute(ctx) {
      const raw = normalizeCommandText(ctx.inputText ?? KNOWLEDGE_SEARCH_CANONICAL_HE);
      const topic = raw.startsWith(KNOWLEDGE_SEARCH_PREFIX_HE)
        ? raw.slice(KNOWLEDGE_SEARCH_PREFIX_HE.length).trim()
        : raw;
      return w6Outcome(await searchApprovedKnowledgeOp(topic, wikiOps));
    },
  },
  {
    id: "knowledge-contradictions",
    textHe: "הצג סתירות במאגר הידע",
    descriptionHe: "סתירות פתוחות + זיהוי דטרמיניסטי של טענות חופפות במאמרים מאושרים",
    binding: "local",
    operation: "wiki.show-contradictions",
    async execute() {
      return w6Outcome(await knowledgeContradictionsOp(wikiOps));
    },
  },
  {
    id: "memory-propose-from-conversation",
    textHe: "הצע פריט זיכרון מהשיחה",
    descriptionHe: "בונה הצעת זיכרון מסיכום השיחה — נכנסת לתור האישורים (ללא כתיבה ישירה)",
    binding: "local",
    operation: "memory.propose-from-conversation",
    async execute(ctx) {
      const { stores, workflow } = getMemoryEngine();
      return w6Outcome(
        await proposeMemoryFromConversationOp(
          ctx.conversationSummaryHe ?? "",
          {
            sources: stores.sources,
            submitProposal: (input) => workflow.submitProposal(input),
          },
          { id: CEO_USER_ID, name: CEO_NAME_HE },
        ),
      );
    },
  },
  {
    id: "memory-pending-proposals",
    textHe: "הצג הצעות זיכרון שממתינות לאישור",
    descriptionHe: "הצעות הזיכרון הפתוחות בתור האישורים, עם קישורים",
    binding: "local",
    operation: "copilot.memory-pending-proposals",
    async execute(ctx) {
      return w6Outcome(await pendingMemoryProposalsOp(ctx.stores));
    },
  },
  {
    id: "learning-rejected-recommendations",
    textHe: "אילו המלצות נדחו לאחרונה ולמה?",
    descriptionHe: "המלצות שנדחו + הנימוק מרשומת האישור (נגזר מרשומות)",
    binding: "local",
    operation: "copilot.learning-rejected-recommendations",
    async execute(ctx) {
      return w6Outcome(await rejectedRecommendationsOp(ctx.stores));
    },
  },
  {
    id: "learning-pending-proposals",
    textHe: "אילו תובנות ממתינות לבדיקת מנהל?",
    descriptionHe: "הצעות למידה במצב ממתין — תובנה, מדגם, מאשר בשם וקישור",
    binding: "local",
    operation: "copilot.learning-pending-proposals",
    async execute(ctx) {
      return w6Outcome(await pendingLearningProposalsOp(ctx.stores));
    },
  },
] as const;

/** the full registry the workspace renders/matches (W5 + W6) */
export const ALL_COPILOT_COMMANDS: readonly CopilotCommand[] = [
  ...COPILOT_COMMANDS,
  ...W6_MEMORY_COMMANDS,
];

/** Deterministic matcher — exact match after normalization, then declared
 *  parameterized matchers (still deterministic); unmapped input ⇒ null. */
export function matchCommand(input: string): CopilotCommand | null {
  const normalized = normalizeCommandText(input);
  if (normalized.length === 0) return null;
  return (
    ALL_COPILOT_COMMANDS.find((c) => normalizeCommandText(c.textHe) === normalized) ??
    ALL_COPILOT_COMMANDS.find((c) => c.matchesInput?.(normalized) === true) ??
    null
  );
}
