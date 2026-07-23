// TERAGON AI BUSINESS OS — governed Wiki agent (Wave 6, W6-C, Phase 6.11).
// The knowledge agent (ag-wiki, frozen definition in src/agents/definitions.ts)
// gets a real retrieval service over the Wave-6 governed knowledge articles.
//
// HARD RULES (all tested):
// - Only isAuthoritative() articles are retrievable by default. Draft /
//   pending / rejected / disputed / archived / expired ⇒ NEVER retrieved.
// - No approved source ⇒ the answer is EXACTLY NO_APPROVED_SOURCE_HE — the
//   agent never fills gaps from general knowledge.
// - Every citation resolves to a real stored record (id + version) — the
//   agent never invents a source.
// - The agent proposes changes ONLY as proposal objects that carry their
//   approval requirement ('permanent-knowledge-update' /
//   'permanent-memory-update') — it never approves or permanently changes
//   anything itself (see AGENT_GOVERNANCE.md, ag-wiki).
// - Retrieval is deterministic token search — declared honestly, never
//   presented as semantic/model-based.
import type { ISODate } from "@/domain/types";
import type {
  KnowledgeArticleV2,
  KnowledgeConflict,
  KnowledgeDraftInput,
  KnowledgeState,
} from "@/domain/knowledge";
import { isAuthoritative } from "@/domain/knowledge";
import type { ApprovalRequiredAction } from "@/domain/agents";
import { RETRIEVAL_METHOD_HE, searchArticles, type KnowledgeSearchHit } from "@/knowledge/search";
import type { KnowledgeGovernanceService } from "@/knowledge/governance";
import type { KnowledgeStores } from "@/knowledge/stores";

export const WIKI_AGENT_ID = "ag-wiki";

/** The exact honest no-source answer — never paraphrased. */
export const NO_APPROVED_SOURCE_HE = "לא נמצא מקור מאושר שמספיק למענה";

// ---------------------------------------------------------------------------
// injected memory-search seam (W6-A owns src/memory — nothing consumed yet;
// the integration lead wires the real implementation to this port)
// ---------------------------------------------------------------------------

export interface MemorySearchHit {
  /** id of a REAL approved memory record */
  recordId: string;
  titleHe: string;
  relevantExcerpt: string;
}

export interface MemorySearchPort {
  /** Search APPROVED memory only — same governance rule as knowledge. */
  searchApprovedMemory(query: string): Promise<MemorySearchHit[]>;
}

/** Default until integration: honestly returns nothing (no fake memory). */
export const noopMemorySearchPort: MemorySearchPort = {
  searchApprovedMemory: () => Promise.resolve([]),
};

// ---------------------------------------------------------------------------
// answer envelope
// ---------------------------------------------------------------------------

export interface WikiSourceRef {
  articleId: string;
  version: number;
  titleHe: string;
}

export interface WikiAnswer {
  answer: string;
  /** citations — every entry resolves to a real stored article (id+version) */
  sources: WikiSourceRef[];
  relevantExcerpts: string[];
  /** state of each cited source at answer time (articleId → state) */
  sourceStates: Record<string, KnowledgeState>;
  limitations: string[];
  /** open conflicts touching the cited articles */
  unresolvedConflicts: KnowledgeConflict[];
  retrievalMethod: string;
  nextAction: string;
  /** set ONLY when the answer includes a change proposal */
  approvalRequirement: ApprovalRequiredAction | null;
  /** approved memory hits (via the injected port) — empty until integration */
  memoryHits: MemorySearchHit[];
}

/** A change the Wiki agent PROPOSES — never applies. Requires human approval. */
export interface WikiProposal {
  kind: "טיוטת מאמר חדש" | "עדכון מאמר" | "עדכון זיכרון";
  proposedBy: string;
  approvalRequirement: ApprovalRequiredAction;
  requiresApproval: true;
  detailHe: string;
  draft?: KnowledgeDraftInput;
  targetArticleId?: string;
}

export interface WikiBoundedContext {
  /** restrict retrieval to these articles (still authoritative-filtered) */
  articles?: readonly KnowledgeArticleV2[];
}

// ---------------------------------------------------------------------------
// deterministic contradiction detection (claim overlap)
// ---------------------------------------------------------------------------

/** Parameter keys whose numeric claims are compared across articles. */
export const CLAIM_PARAM_KEYS_HE = [
  "טמפ' מיטה",
  "טמפ' הדפסה",
  "טמפ' חוד",
  "מהירות הדפסה",
  "Brim",
] as const;

export interface ArticleClaim {
  keyHe: string;
  value: number;
  textHe: string;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Extract numeric parameter claims from an article's content (deterministic). */
export function extractClaims(article: KnowledgeArticleV2): ArticleClaim[] {
  const claims: ArticleClaim[] = [];
  for (const key of CLAIM_PARAM_KEYS_HE) {
    const re = new RegExp(`${escapeRegExp(key)}[^0-9]{0,15}(\\d+(?:\\.\\d+)?)`, "iu");
    const m = re.exec(article.content);
    if (m?.[1]) {
      claims.push({ keyHe: key, value: Number.parseFloat(m[1]), textHe: m[0] });
    }
  }
  return claims;
}

export interface ContradictionCandidate {
  articleA: KnowledgeArticleV2;
  articleB: KnowledgeArticleV2;
  keyHe: string;
  claimA: ArticleClaim;
  claimB: ArticleClaim;
}

function shareScope(a: KnowledgeArticleV2, b: KnowledgeArticleV2): boolean {
  if (a.category === b.category) return true;
  return a.supportedMaterials.some((m) => b.supportedMaterials.includes(m));
}

/**
 * Pure detection: two articles in overlapping scope (same category or shared
 * material) claiming DIFFERENT numeric values for the same parameter key.
 * Deterministic order: by article-id pair, then key.
 */
export function detectContradictions(
  articles: readonly KnowledgeArticleV2[],
): ContradictionCandidate[] {
  const sorted = [...articles].sort((a, b) => a.id.localeCompare(b.id));
  const out: ContradictionCandidate[] = [];
  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]!;
    const claimsA = extractClaims(a);
    if (claimsA.length === 0) continue;
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]!;
      if (!shareScope(a, b)) continue;
      const claimsB = extractClaims(b);
      for (const ca of claimsA) {
        const cb = claimsB.find((c) => c.keyHe === ca.keyHe);
        if (cb && cb.value !== ca.value) {
          out.push({ articleA: a, articleB: b, keyHe: ca.keyHe, claimA: ca, claimB: cb });
        }
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// the agent
// ---------------------------------------------------------------------------

export interface WikiAgentDeps {
  stores: KnowledgeStores;
  /** required only for persisting contradiction flags (state flow) */
  governance?: KnowledgeGovernanceService;
  memoryPort?: MemorySearchPort;
  now?: () => ISODate;
}

const BASE_LIMITATIONS = [
  `אחזור באמצעות ${RETRIEVAL_METHOD_HE} — לא חיפוש סמנטי ולא מודל שפה`,
  "נשענים אך ורק על מאמרי ידע מאושרים ותקפים — ידע כללי אינו מקור",
];

export class WikiAgent {
  private readonly stores: KnowledgeStores;
  private readonly governance: KnowledgeGovernanceService | null;
  private readonly memoryPort: MemorySearchPort;
  private readonly now: () => ISODate;

  constructor(deps: WikiAgentDeps) {
    this.stores = deps.stores;
    this.governance = deps.governance ?? null;
    this.memoryPort = deps.memoryPort ?? noopMemorySearchPort;
    this.now = deps.now ?? (() => new Date().toISOString());
  }

  /** Authoritative-only retrieval — THE default (and only) search surface. */
  async searchApproved(query: string): Promise<KnowledgeSearchHit[]> {
    const articles = await this.stores.articles.list();
    const nowISO = this.now();
    return searchArticles(
      articles.filter((a) => isAuthoritative(a, nowISO)),
      query,
    );
  }

  /**
   * Answer a question from approved knowledge ONLY. When no approved source
   * matches, the answer is EXACTLY NO_APPROVED_SOURCE_HE — never a guess.
   */
  async answerQuestion(question: string, boundedContext?: WikiBoundedContext): Promise<WikiAnswer> {
    const nowISO = this.now();
    const pool = boundedContext?.articles ?? (await this.stores.articles.list());
    const authoritative = pool.filter((a) => isAuthoritative(a, nowISO));
    const hits = searchArticles(authoritative, question).slice(0, 5);
    const memoryHits = await this.memoryPort.searchApprovedMemory(question);

    if (hits.length === 0 && memoryHits.length === 0) {
      return {
        answer: NO_APPROVED_SOURCE_HE,
        sources: [],
        relevantExcerpts: [],
        sourceStates: {},
        limitations: [
          ...BASE_LIMITATIONS,
          "לא נמצא מאמר מאושר שתואם את השאלה — אין השלמה מידע כללי",
        ],
        unresolvedConflicts: [],
        retrievalMethod: RETRIEVAL_METHOD_HE,
        nextAction: "לנסח את השאלה מחדש, או להציע טיוטת מאמר חדש (מחייב אישור אנושי)",
        approvalRequirement: null,
        memoryHits: [],
      };
    }

    // every citation comes from a record that was just read from the store —
    // verified again here so a citation can never point at a phantom id
    const sources: WikiSourceRef[] = [];
    const sourceStates: Record<string, KnowledgeState> = {};
    for (const hit of hits) {
      const stored = await this.stores.articles.get(hit.article.id);
      if (!stored) continue; // never cite a record that does not resolve
      sources.push({ articleId: stored.id, version: stored.version, titleHe: stored.title });
      sourceStates[stored.id] = stored.approval.state;
    }

    const conflicts = (await this.stores.conflicts.list()).filter(
      (c) => c.status === "פתוח" && c.articleIds.some((id) => sources.some((s) => s.articleId === id)),
    );

    const lines = hits.map((h) => `«${h.article.title}» (גרסה ${h.article.version}): ${h.excerpt}`);
    const answer =
      `נמצאו ${sources.length} מקורות מאושרים: ` +
      lines.join(" · ") +
      (conflicts.length > 0 ? ` שימו לב: ${conflicts.length} סתירות פתוחות נוגעות למקורות אלו.` : "");

    return {
      answer,
      sources,
      relevantExcerpts: hits.map((h) => h.excerpt),
      sourceStates,
      limitations: [
        ...BASE_LIMITATIONS,
        ...(conflicts.length > 0 ? ["חלק מהמקורות נמצאים בסתירה פתוחה — נדרשת הכרעה אנושית"] : []),
      ],
      unresolvedConflicts: conflicts,
      retrievalMethod: RETRIEVAL_METHOD_HE,
      nextAction:
        conflicts.length > 0
          ? "להכריע בסתירות הפתוחות לפני הסתמכות על התשובה"
          : "לאמת מול המאמרים המצוטטים ולפעול לפי הנהלים",
      approvalRequirement: null,
      memoryHits,
    };
  }

  /** PROPOSAL ONLY — a new draft article. Nothing is persisted here. */
  proposeDraftArticle(draft: KnowledgeDraftInput, detailHe: string): WikiProposal {
    return {
      kind: "טיוטת מאמר חדש",
      proposedBy: WIKI_AGENT_ID,
      approvalRequirement: "permanent-knowledge-update",
      requiresApproval: true,
      detailHe,
      draft,
    };
  }

  /** PROPOSAL ONLY — an update to an existing article. */
  proposeArticleUpdate(
    targetArticleId: string,
    draft: KnowledgeDraftInput,
    detailHe: string,
  ): WikiProposal {
    return {
      kind: "עדכון מאמר",
      proposedBy: WIKI_AGENT_ID,
      approvalRequirement: "permanent-knowledge-update",
      requiresApproval: true,
      detailHe,
      draft,
      targetArticleId,
    };
  }

  /** PROPOSAL ONLY — a permanent memory update (W6-A wiring at integration). */
  proposeMemoryUpdate(detailHe: string): WikiProposal {
    return {
      kind: "עדכון זיכרון",
      proposedBy: WIKI_AGENT_ID,
      approvalRequirement: "permanent-memory-update",
      requiresApproval: true,
      detailHe,
    };
  }

  /** Open conflicts + fresh deterministic detection over stored articles. */
  async showContradictions(): Promise<{
    open: KnowledgeConflict[];
    detected: ContradictionCandidate[];
  }> {
    const [conflicts, articles] = await Promise.all([
      this.stores.conflicts.list(),
      this.stores.articles.list(),
    ]);
    const nowISO = this.now();
    // detection scans approved/authoritative content — drafts are not compared
    const detected = detectContradictions(articles.filter((a) => isAuthoritative(a, nowISO)));
    return {
      open: conflicts
        .filter((c) => c.status === "פתוח")
        .sort((a, b) => a.id.localeCompare(b.id)),
      detected,
    };
  }

  /**
   * Persist newly detected contradictions (flag-contradiction — the ONE
   * mutating power the frozen Wiki definition grants): a KnowledgeConflict
   * record per candidate + both articles → "שנוי במחלוקת" (fail-closed; the
   * way back to "מאושר" is the full human review cycle).
   */
  async flagContradictions(): Promise<KnowledgeConflict[]> {
    if (!this.governance) {
      throw new Error(
        "WIKI_GOVERNANCE_MISSING: סימון סתירות מחייב KnowledgeGovernanceService מוזרק",
      );
    }
    const { open, detected } = await this.showContradictions();
    const created: KnowledgeConflict[] = [];
    for (const cand of detected) {
      const already = open.some(
        (c) =>
          c.overlapKeyHe === cand.keyHe &&
          c.articleIds.includes(cand.articleA.id) &&
          c.articleIds.includes(cand.articleB.id),
      );
      if (already) continue;
      const nowISO = this.now();
      created.push(
        await this.governance.flagDisputed({
          articleIds: [cand.articleA.id, cand.articleB.id],
          claims: [
            {
              articleId: cand.articleA.id,
              articleVersion: cand.articleA.version,
              claimHe: cand.claimA.textHe,
            },
            {
              articleId: cand.articleB.id,
              articleVersion: cand.articleB.version,
              claimHe: cand.claimB.textHe,
            },
          ],
          overlapKeyHe: cand.keyHe,
          detectionMethodHe: "חפיפת טענות דטרמיניסטית — ערכים שונים לאותו פרמטר",
          status: "פתוח",
          detectedAt: nowISO,
          resolvedAt: null,
          resolutionNoteHe: "",
        }),
      );
    }
    return created;
  }
}

// ---------------------------------------------------------------------------
// Copilot ops registry (integration lead wires these to Copilot commands)
// ---------------------------------------------------------------------------

export interface WikiOps {
  searchApproved(query: string): Promise<KnowledgeSearchHit[]>;
  showContradictions(): ReturnType<WikiAgent["showContradictions"]>;
  answerQuestion(question: string): Promise<WikiAnswer>;
}

/** Build the ops surface over a WikiAgent instance. */
export function makeWikiOps(agent: WikiAgent): WikiOps {
  return {
    searchApproved: (query) => agent.searchApproved(query),
    showContradictions: () => agent.showContradictions(),
    answerQuestion: (question) => agent.answerQuestion(question),
  };
}
