// W6 WIRING — the 8 cross-domain Copilot operations (Phase 6.19).
// Every op is a DEFINED operation (no free forwarding): deterministic reads
// over the governed memory/knowledge/learning collections, or a governed
// proposal submission through MemoryProposalWorkflow (approval always pending
// — nothing here writes permanent memory directly).
//
// Honesty contract (same as localOps): provider "local-rules", model null,
// usage unmeasured, confidence "טרם נמדד", limitations always disclosed,
// evidence cites REAL records only. The Wiki no-source passthrough is the
// exact NO_APPROVED_SOURCE_HE string — never paraphrased.
import type {
  AIRecommendation,
  Approval,
  Customer,
  ISODate,
  MemoryRecord,
  Evidence,
} from "@/domain/types";
import type { AIResponseEnvelopeV2, EvidenceItem } from "@/domain/ai/envelope";
import { unavailableConfidence } from "@/domain/ai/envelope";
import type {
  MemoryProposal,
  MemoryProposalDraft,
  MemoryRecordV2,
  MemorySource,
} from "@/domain/memory";
import type { LearningProposal } from "@/domain/learning";
import type { AgentStores } from "@/repositories/agentStores";
import { AIError } from "@/ai/contracts/AIProvider";
import { NO_APPROVED_SOURCE_HE, type WikiOps } from "@/agents/wiki";
import { deriveOutcomes } from "@/learning";
import { customer360MemoryTabView } from "@/integration/customer360MemoryExtras";

// ---------------------------------------------------------------------------
// shared plumbing
// ---------------------------------------------------------------------------

export interface MemoryOpDeps {
  now?: () => ISODate;
  idFactory?: (n: number) => string;
}

let memOpSeq = 0;

/** test-only: deterministic envelope ids across runs */
export function __resetMemoryOpSeqForTests(): void {
  memOpSeq = 0;
}

const W6_LIMITATIONS = [
  "מנוע כללים מקומי ודטרמיניסטי — לא מודל שפה; אותו קלט מחזיר תמיד אותו פלט",
  "נשענים אך ורק על רשומות ממשל אמיתיות (זיכרון/ידע/למידה) — אין השלמה מידע כללי",
] as const;

interface EnvelopeFields {
  recommendation: string;
  reason: string;
  evidence: EvidenceItem[];
  nextStep: string;
  limitations?: string[];
  confidenceMethod: string;
  approvalRequired?: boolean;
}

function buildEnvelope(
  operation: string,
  fields: EnvelopeFields,
  deps: MemoryOpDeps,
): AIResponseEnvelopeV2 {
  memOpSeq += 1;
  const id = (deps.idFactory ?? ((n: number) => `w6-env-${n}`))(memOpSeq);
  const createdAt = (deps.now ?? (() => new Date().toISOString()))();
  return {
    id,
    requestId: `${id}-req`,
    correlationId: `${id}-corr`,
    provider: "local-rules",
    model: null,
    createdAt,
    operation,
    recommendation: fields.recommendation,
    reason: fields.reason,
    evidence: fields.evidence,
    confidence: unavailableConfidence(fields.confidenceMethod),
    nextStep: fields.nextStep,
    limitations: [...W6_LIMITATIONS, ...(fields.limitations ?? [])],
    approval: fields.approvalRequired
      ? { required: true, state: "pending", requestedAt: createdAt }
      : { required: false, state: "not_required" },
    usage: { measured: false },
    status: "הצלחה",
  };
}

/** the store surface the ops need — the canonical collection accessor */
export type MemoryOpStores = Pick<AgentStores, "collection">;

export interface MemoryOpResult {
  envelope: AIResponseEnvelopeV2;
  /** navigable references (type/id/label/route) for the workspace */
  affected: { type: string; id: string; labelHe: string; route?: string }[];
}

// ---------------------------------------------------------------------------
// 1 — "מה אנחנו יודעים על הלקוח הזה?" (customer chip required)
// ---------------------------------------------------------------------------

export async function customerMemorySummaryOp(
  customerId: string | null,
  stores: MemoryOpStores,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  if (!customerId) {
    throw new AIError("AI_EVIDENCE_REQUIRED", {
      detail: "הפקודה מחייבת בחירת לקוח בצ'יפ ההקשר — אין ניחוש לקוח",
    });
  }
  const customers = await stores.collection<Customer>("customers").list();
  const customer = customers.find((c) => c.id === customerId);
  if (!customer) {
    throw new AIError("AI_EVIDENCE_REQUIRED", {
      detail: `לקוח "${customerId}" לא נמצא במאגר`,
    });
  }
  const records = await stores
    .collection<MemoryRecord | MemoryRecordV2>("memoryRecords")
    .list();
  const proposals = await stores.collection<MemoryProposal>("memoryProposals").list();
  const sources = await stores.collection<MemorySource>("memorySources").list();
  const view = customer360MemoryTabView(customer.id, customer.name, records, proposals, sources);

  const visible = view.approved.filter((r) => !r.hiddenByDefault);
  const lines = visible.map(
    (r) => `«${r.title}» (גרסה ${r.version}, ${r.sensitivity})`,
  );
  const sensitiveNote =
    view.sensitiveCount > 0
      ? ` · ${view.sensitiveCount} פריטים רגישים מוסתרים — חשיפה מפורשת עם נימוק בטאב "זיכרון לקוח" בלבד`
      : "";
  const recommendation =
    visible.length === 0 && view.sensitiveCount === 0
      ? `אין זיכרון מאושר על «${customer.name}» — ניתן להציע פריט זיכרון (באישור אנושי)`
      : `זיכרון מאושר על «${customer.name}»: ${lines.join(" · ")}${sensitiveNote}` +
        (view.pending.length > 0 ? ` · ${view.pending.length} הצעות ממתינות לאישור` : "");

  return {
    envelope: buildEnvelope(
      "copilot.customer-memory",
      {
        recommendation,
        reason:
          "נגזר מהתאמה דטרמיניסטית של רשומות זיכרון מאושרות ללקוח (קישורי ישות/אזכורים) — פריטים רגישים אינם נחשפים בצ'אט",
        evidence: visible.map((r) => ({
          sourceType: "entity",
          sourceId: r.id,
          title: r.title,
          relevantExcerpt: r.bodyMarkdown.slice(0, 120),
          relevanceMethod: "התאמת קישור ישות / אזכור שם הלקוח ברשומה",
          verified: true,
          lastUpdated: r.updatedAt,
        })),
        nextStep:
          view.pending.length > 0
            ? "לעבור לתור האישורים ב-/memory ולהכריע בהצעות הממתינות"
            : "לעיין בטאב זיכרון הלקוח בכרטיס 360 לפרטים ולראיות",
        limitations:
          view.sensitiveCount > 0
            ? ["פריטים ברגישות רגיש/מוגבל מוסתרים כאן במכוון (שער רגישות)"]
            : [],
        confidenceMethod: "התאמה דטרמיניסטית — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: visible.map((r) => ({
      type: "memoryRecord",
      id: r.id,
      labelHe: r.title,
      route: r.memoryRoute,
    })),
  };
}

// ---------------------------------------------------------------------------
// 2 — "אילו מקורות תומכים בהמלצה?"
// ---------------------------------------------------------------------------

export async function recommendationEvidenceOp(
  chips: { customerId: string | null; leadId: string | null; ticketId: string | null },
  stores: MemoryOpStores,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const recs = await stores.collection<AIRecommendation>("aiRecommendations").list();
  if (recs.length === 0) {
    return {
      envelope: buildEnvelope(
        "copilot.recommendation-evidence",
        {
          recommendation: "אין המלצות AI במערכת — אין ראיות להציג",
          reason: "אוסף ההמלצות ריק; אפס כן ולא רשימה מומצאת",
          evidence: [],
          nextStep: "להריץ פקודת המלצה (למשל טיוטת מעקב) ואז לשאול שוב",
          confidenceMethod: "ספירת רשומות — ביטחון לא נמדד",
        },
        deps,
      ),
      affected: [],
    };
  }
  const chipRefs = [
    chips.customerId ? `customer:${chips.customerId}` : null,
    chips.leadId ? `lead:${chips.leadId}` : null,
    chips.ticketId ? `ticket:${chips.ticketId}` : null,
  ].filter((r): r is string => r !== null);
  const sorted = [...recs].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id),
  );
  const rec =
    sorted.find((r) => r.entityRef !== null && chipRefs.includes(r.entityRef)) ?? sorted[0]!;
  const evidence = (await stores.collection<Evidence>("evidence").list()).filter((e) =>
    rec.evidenceIds.includes(e.id),
  );
  const recommendation =
    evidence.length === 0
      ? `להמלצה «${rec.title}» לא צורפו רשומות ראיה — אין מקור תומך מתועד`
      : `המקורות התומכים בהמלצה «${rec.title}»: ${evidence
          .map((e) => `${e.claim} (${e.sourceRef})`)
          .join(" · ")}`;
  return {
    envelope: buildEnvelope(
      "copilot.recommendation-evidence",
      {
        recommendation,
        reason: chipRefs.length
          ? "ההמלצה נבחרה לפי צ'יפ ההקשר (התאמת entityRef); הראיות הן רשומות Evidence מקושרות בפועל"
          : "לא נבחר הקשר — הוצגה ההמלצה העדכנית ביותר; הראיות הן רשומות Evidence מקושרות בפועל",
        evidence: evidence.map((e) => ({
          sourceType: e.sourceType,
          sourceId: e.id,
          title: e.claim,
          relevantExcerpt: e.claim,
          relevanceMethod: "רשומת Evidence המקושרת להמלצה (evidenceIds)",
          verified: true,
          lastUpdated: e.updatedAt,
        })),
        nextStep: "לפתוח את מרכז ההחלטות במרכז הפיקוד ולעיין בראיות המלאות",
        limitations:
          evidence.length === 0 ? ["המלצה ללא ראיות — מומלץ לא להסתמך עליה"] : [],
        confidenceMethod: "קישור רשומות ישיר — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: [
      { type: "aiRecommendation", id: rec.id, labelHe: rec.title, route: "/" },
      ...evidence.map((e) => ({ type: "evidence", id: e.id, labelHe: e.claim })),
    ],
  };
}

// ---------------------------------------------------------------------------
// 3 — "מצא ידע מאושר על <נושא>" (wikiOps.searchApproved)
// ---------------------------------------------------------------------------

export async function searchApprovedKnowledgeOp(
  topic: string,
  wiki: Pick<WikiOps, "searchApproved">,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const query = topic.trim();
  if (query.length === 0) {
    throw new AIError("AI_EVIDENCE_REQUIRED", {
      detail: 'יש לציין נושא לחיפוש: "מצא ידע מאושר על <נושא>"',
    });
  }
  const hits = (await wiki.searchApproved(query)).slice(0, 5);
  const recommendation =
    hits.length === 0
      ? NO_APPROVED_SOURCE_HE
      : `נמצאו ${hits.length} מאמרי ידע מאושרים על «${query}»: ${hits
          .map((h) => `«${h.article.title}» (גרסה ${h.article.version})`)
          .join(" · ")}`;
  return {
    envelope: buildEnvelope(
      "wiki.search-approved",
      {
        recommendation,
        reason:
          hits.length === 0
            ? "לא נמצא מאמר מאושר ותקף שתואם את הנושא — אין השלמה מידע כללי"
            : "אחזור בחיפוש טקסטואלי דטרמיניסטי על מאמרים מאושרים ותקפים בלבד (isAuthoritative)",
        evidence: hits.map((h) => ({
          sourceType: "document",
          sourceId: h.article.id,
          title: h.article.title,
          relevantExcerpt: h.excerpt,
          relevanceMethod: `חיפוש טקסטואלי דטרמיניסטי — טוקנים תואמים: ${h.matchedTokens.join(", ")}`,
          verified: true,
          lastUpdated: h.article.updatedAt,
        })),
        nextStep:
          hits.length === 0
            ? "לנסח את הנושא מחדש או להציע טיוטת מאמר חדש (מחייב אישור אנושי)"
            : "לפתוח את המאמרים בעמוד /knowledge ולאמת מול הגרסה המצוטטת",
        limitations: ["טיוטות / הצעות / מאמרים שנדחו או פגי תוקף לעולם אינם מאוחזרים"],
        confidenceMethod: "חיפוש טקסטואלי דטרמיניסטי — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: hits.map((h) => ({
      type: "knowledgeArticle",
      id: h.article.id,
      labelHe: h.article.title,
      route: `/knowledge?article=${h.article.id}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// 4 — "הצג סתירות במאגר הידע" (wikiOps.showContradictions)
// ---------------------------------------------------------------------------

export async function knowledgeContradictionsOp(
  wiki: Pick<WikiOps, "showContradictions">,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const { open, detected } = await wiki.showContradictions();
  const openLines = open.map(
    (c) => `סתירה פתוחה ${c.id}: ${c.overlapKeyHe} (${c.articleIds.join(" ↔ ")})`,
  );
  const detectedLines = detected.map(
    (d) => `זוהתה חפיפה: «${d.articleA.title}» ↔ «${d.articleB.title}» על ${d.keyHe}`,
  );
  const total = open.length + detected.length;
  return {
    envelope: buildEnvelope(
      "wiki.show-contradictions",
      {
        recommendation:
          total === 0
            ? "לא נמצאו סתירות במאגר הידע — אפס כן (בדיקה דטרמיניסטית)"
            : [...openLines, ...detectedLines].join(" · "),
        reason:
          "סתירות פתוחות מאוסף knowledgeConflicts + זיהוי דטרמיניסטי של טענות מספריות חופפות במאמרים מאושרים",
        evidence: open.map((c) => ({
          sourceType: "entity",
          sourceId: c.id,
          title: `סתירה: ${c.overlapKeyHe}`,
          relevantExcerpt: c.claims.map((cl) => cl.claimHe).join(" ↔ "),
          relevanceMethod: "רשומת KnowledgeConflict במצב פתוח",
          verified: true,
          lastUpdated: c.updatedAt,
        })),
        nextStep:
          total === 0
            ? "אין פעולה נדרשת"
            : "להכריע בסתירות בעמוד /knowledge — ההכרעה אנושית בלבד",
        limitations: ["זיהוי מבוסס חפיפת פרמטרים מספריים — לא ניתוח סמנטי"],
        confidenceMethod: "זיהוי דטרמיניסטי — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: open.map((c) => ({
      type: "knowledgeConflict",
      id: c.id,
      labelHe: `סתירה: ${c.overlapKeyHe}`,
      route: "/knowledge?filter=conflicts",
    })),
  };
}

// ---------------------------------------------------------------------------
// 5 — "הצע פריט זיכרון מהשיחה" (governed proposal — approval pending)
// ---------------------------------------------------------------------------

export interface ProposalSubmitter {
  sources: { list(): Promise<MemorySource[]>; create(s: MemorySource): Promise<MemorySource> };
  submitProposal(input: {
    observationHe: string;
    proposedById: string;
    proposedByName: string;
    draft: Omit<MemoryProposalDraft, "slug">;
  }): Promise<MemoryProposal>;
}

export async function proposeMemoryFromConversationOp(
  conversationSummaryHe: string,
  submitter: ProposalSubmitter,
  who: { id: string; name: string },
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const summary = conversationSummaryHe.trim();
  if (summary.length === 0) {
    throw new AIError("AI_EVIDENCE_REQUIRED", {
      detail: "אין תוכן שיחה להצעה — נהלו שיחה עם פקודות ואז הציעו פריט זיכרון",
    });
  }
  const now = (deps.now ?? (() => new Date().toISOString()))();
  const existing = await submitter.sources.list();
  const source = await submitter.sources.create({
    id: `msrc-${existing.length + 1}`,
    createdAt: now,
    updatedAt: now,
    kind: "conversation",
    refId: "copilot:conversation",
    titleHe: "שיחת Copilot (מקומית)",
    excerpt: summary.slice(0, 400),
    capturedAt: now,
    verified: true, // the excerpt IS the conversation — captured verbatim now
  });
  const title = `תובנה משיחת Copilot: ${summary.slice(0, 40)}`;
  const proposal = await submitter.submitProposal({
    observationHe: `סיכום שיחת Copilot: ${summary.slice(0, 200)}`,
    proposedById: who.id,
    proposedByName: who.name,
    draft: {
      title,
      bodyMarkdown: summary,
      memoryLayer: "business",
      folder: "שיחות Copilot",
      entityLinks: [],
      tags: ["copilot"],
      sourceIds: [source.id],
      sensitivity: "פנימי",
      retentionPolicy: "קבוע",
      reviewDate: null,
    },
  });
  return {
    envelope: buildEnvelope(
      "memory.propose-from-conversation",
      {
        recommendation: `נוצרה הצעת זיכרון «${title}» (${proposal.id}) — במצב "${proposal.status}". שום דבר לא נכתב לזיכרון הקבוע ללא אישור אנושי בשם.`,
        reason: "ההצעה נבנתה מסיכום השיחה הנוכחית והוגשה דרך MemoryProposalWorkflow הקנוני",
        evidence: [
          {
            sourceType: "entity",
            sourceId: proposal.id,
            title,
            relevantExcerpt: summary.slice(0, 120),
            relevanceMethod: "רשומת ההצעה שנוצרה זה עתה (proposal record)",
            verified: true,
            lastUpdated: proposal.updatedAt,
          },
        ],
        nextStep: "לאשר / לדחות בתור האישורים בעמוד /memory — ההחלטה אנושית בלבד",
        limitations: ["ההצעה ממתינה לאישור — אינה חלק מהזיכרון המאושר עד הכרעה"],
        confidenceMethod: "הגשה מנוהלת — ביטחון לא נמדד",
        approvalRequired: true,
      },
      deps,
    ),
    affected: [
      {
        type: "memoryProposal",
        id: proposal.id,
        labelHe: title,
        route: "/memory?proposal=" + proposal.id,
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// 6 — "הצג הצעות זיכרון שממתינות לאישור"
// ---------------------------------------------------------------------------

export async function pendingMemoryProposalsOp(
  stores: MemoryOpStores,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const proposals = (await stores.collection<MemoryProposal>("memoryProposals").list())
    .filter((p) => p.status === "ממתין לאישור" || p.status === "טיוטה")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
  return {
    envelope: buildEnvelope(
      "copilot.memory-pending-proposals",
      {
        recommendation:
          proposals.length === 0
            ? "אין הצעות זיכרון שממתינות לאישור — אפס כן"
            : `${proposals.length} הצעות זיכרון ממתינות: ${proposals
                .map((p) => `«${p.draft.title}» (${p.id}, ${p.status})`)
                .join(" · ")}`,
        reason: "נגזר ישירות מאוסף memoryProposals לפי סטטוס",
        evidence: proposals.map((p) => ({
          sourceType: "entity",
          sourceId: p.id,
          title: p.draft.title,
          relevantExcerpt: p.observationHe.slice(0, 120),
          relevanceMethod: "רשומת הצעה במצב ממתין/טיוטה",
          verified: true,
          lastUpdated: p.updatedAt,
        })),
        nextStep:
          proposals.length === 0
            ? "אין פעולה נדרשת"
            : "להכריע בתור האישורים בעמוד /memory (7 בקרות המבקר)",
        confidenceMethod: "סינון סטטוס דטרמיניסטי — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: proposals.map((p) => ({
      type: "memoryProposal",
      id: p.id,
      labelHe: p.draft.title,
      route: `/memory?proposal=${p.id}`,
    })),
  };
}

// ---------------------------------------------------------------------------
// 7 — "אילו המלצות נדחו לאחרונה ולמה?" (learning-loop derivation)
// ---------------------------------------------------------------------------

export async function rejectedRecommendationsOp(
  stores: MemoryOpStores,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const [recs, approvals] = await Promise.all([
    stores.collection<AIRecommendation>("aiRecommendations").list(),
    stores.collection<Approval>("approvals").list(),
  ]);
  const approvalById = new Map(approvals.map((a) => [a.id, a]));
  const rejected = deriveOutcomes(recs, approvals)
    .filter((o) => o.decision === "rejected")
    .map((o) => {
      const rec = recs.find((r) => r.id === o.recommendationId);
      const approval = rec?.approvalId ? approvalById.get(rec.approvalId) : undefined;
      return rec
        ? {
            rec,
            reasonHe: approval?.note.trim() ? approval.note : "לא תועד נימוק ברשומת האישור",
            decidedAt: approval?.decidedAt ?? rec.updatedAt,
          }
        : null;
    })
    .filter((x): x is { rec: AIRecommendation; reasonHe: string; decidedAt: string } => x !== null)
    .sort((a, b) => b.decidedAt.localeCompare(a.decidedAt));
  return {
    envelope: buildEnvelope(
      "copilot.learning-rejected-recommendations",
      {
        recommendation:
          rejected.length === 0
            ? "לא נמצאו המלצות שנדחו — אפס כן (נגזר מרשומות)"
            : rejected
                .map((r) => `«${r.rec.title}» נדחתה — נימוק: ${r.reasonHe}`)
                .join(" · "),
        reason:
          "נגזר מרשומות (deriveOutcomes על aiRecommendations + approvals); הנימוק הוא note של רשומת האישור הקנונית",
        evidence: rejected.map((r) => ({
          sourceType: "entity",
          sourceId: r.rec.id,
          title: r.rec.title,
          relevantExcerpt: r.reasonHe,
          relevanceMethod: "החלטת דחייה ברשומת ה-Approval המקושרת",
          verified: true,
          lastUpdated: r.decidedAt,
        })),
        nextStep: "לעיין בלולאת הלמידה ב-/learning — דחיות מזינות תצפיות למידה",
        limitations: ["נגזר מרשומות — קורלציה בלבד, ללא הסקה סיבתית"],
        confidenceMethod: "גזירת רשומות דטרמיניסטית — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: rejected.map((r) => ({
      type: "aiRecommendation",
      id: r.rec.id,
      labelHe: r.rec.title,
      route: "/learning?filter=rejected",
    })),
  };
}

// ---------------------------------------------------------------------------
// 8 — "אילו תובנות ממתינות לבדיקת מנהל?"
// ---------------------------------------------------------------------------

export async function pendingLearningProposalsOp(
  stores: MemoryOpStores,
  deps: MemoryOpDeps = {},
): Promise<MemoryOpResult> {
  const proposals = (await stores.collection<LearningProposal>("learningProposals").list())
    .filter((p) => p.approvalState === "pending")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  return {
    envelope: buildEnvelope(
      "copilot.learning-pending-proposals",
      {
        recommendation:
          proposals.length === 0
            ? "אין תובנות למידה שממתינות לבדיקת מנהל — אפס כן"
            : proposals
                .map(
                  (p) =>
                    `«${p.proposedInsightHe}» (מדגם: ${p.sampleSize}${
                      p.singleCaseMarkerHe ? ` · ${p.singleCaseMarkerHe}` : ""
                    }) — ממתינה ל${p.namedReviewerName}`,
                )
                .join(" · "),
        reason: "נגזר מאוסף learningProposals לפי approvalState=pending — תשובה נגזרת מרשומות",
        evidence: proposals.map((p) => ({
          sourceType: "entity",
          sourceId: p.id,
          title: p.proposedInsightHe.slice(0, 80),
          relevantExcerpt: `מדגם ${p.sampleSize} · תחום ${p.businessDomain}`,
          relevanceMethod: "הצעת למידה במצב ממתין",
          verified: true,
          lastUpdated: p.updatedAt,
        })),
        nextStep:
          proposals.length === 0
            ? "אין פעולה נדרשת"
            : "המאשר בשם מכריע בעמוד /learning — אין הפעלת כלל ללא אישור",
        limitations: ["הצעה עם מקרה יחיד לעולם לא תהפוך לכלל (חסם מדגם)"],
        confidenceMethod: "סינון סטטוס דטרמיניסטי — ביטחון לא נמדד",
      },
      deps,
    ),
    affected: proposals.map((p) => ({
      type: "learningProposal",
      id: p.id,
      labelHe: p.proposedInsightHe.slice(0, 60),
      route: `/learning?proposal=${p.id}`,
    })),
  };
}
