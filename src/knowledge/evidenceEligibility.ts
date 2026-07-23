// TERAGON AI BUSINESS OS — evidence eligibility gate (Wave 6, W6-C side of
// Phase 6.12). Exported for W6-E integration: any agent/recommendation that
// wants to cite a knowledge article as evidence MUST pass mayUseAsEvidence and
// record the use through recordKnowledgeUsage. Superseding never rewrites old
// usage — it only sets the superseded markers and links the replacement.
import type { ISODate } from "@/domain/types";
import type { KnowledgeArticleV2, KnowledgeUsage } from "@/domain/knowledge";
import { isAuthoritative, nonAuthoritativeReasonHe } from "@/domain/knowledge";
import type { KnowledgeClock, KnowledgeStores } from "./stores";

export interface EvidenceEligibility {
  eligible: boolean;
  /** Hebrew reason when NOT eligible; null when eligible */
  reasonHe: string | null;
}

/**
 * The pure gate: an article may back a recommendation ONLY while it is
 * authoritative (approved + effective + not expired + not archived) — the same
 * single predicate the Wiki agent and the /knowledge page use.
 */
export function mayUseAsEvidence(article: KnowledgeArticleV2, nowISO: ISODate): EvidenceEligibility {
  if (isAuthoritative(article, nowISO)) return { eligible: true, reasonHe: null };
  return {
    eligible: false,
    reasonHe: `המאמר "${article.id}" אינו כשיר כראיה: ${nonAuthoritativeReasonHe(article, nowISO) ?? "לא מאושר"}`,
  };
}

export interface RecordUsageInput {
  articleId: string;
  byAgent: string;
  /** reference to the recommendation/envelope, e.g. "ai-envelope:local-env-3" */
  inRecommendation: string;
}

/**
 * Record one evidence use. Refuses (throws) when the article is not eligible —
 * there is no way to log a "use" of non-approved knowledge.
 */
export async function recordKnowledgeUsage(
  stores: KnowledgeStores,
  input: RecordUsageInput,
  clock: KnowledgeClock,
): Promise<KnowledgeUsage> {
  const article = await stores.articles.get(input.articleId);
  if (!article) {
    throw new Error(`KNOWLEDGE_NOT_FOUND: מאמר "${input.articleId}" לא נמצא — אין רישום שימוש`);
  }
  const ts = clock();
  const gate = mayUseAsEvidence(article, ts);
  if (!gate.eligible) {
    throw new Error(`KNOWLEDGE_EVIDENCE_INELIGIBLE: ${gate.reasonHe}`);
  }
  const existing = await stores.usage.list();
  return stores.usage.create({
    id: `ku-${existing.length + 1}-${input.articleId}`,
    createdAt: ts,
    updatedAt: ts,
    articleId: input.articleId,
    articleVersion: article.version,
    usedAt: ts,
    byAgent: input.byAgent,
    inRecommendation: input.inRecommendation,
    supersededByVersion: null,
    supersededAt: null,
  });
}

/**
 * Superseded marking: when version `newVersion` of an article is approved,
 * usage records of OLDER versions get their superseded markers set (linking
 * the replacement version). The original usage fields are NOT rewritten —
 * articleVersion/usedAt/byAgent/inRecommendation stay exactly as recorded.
 */
export async function markUsageSuperseded(
  stores: KnowledgeStores,
  articleId: string,
  newVersion: number,
  clock: KnowledgeClock,
): Promise<KnowledgeUsage[]> {
  const all = await stores.usage.list();
  const affected = all.filter(
    (u) =>
      u.articleId === articleId && u.articleVersion < newVersion && u.supersededByVersion === null,
  );
  const ts = clock();
  const updated: KnowledgeUsage[] = [];
  for (const u of affected) {
    updated.push(
      await stores.usage.update(u.id, {
        supersededByVersion: newVersion,
        supersededAt: ts,
        updatedAt: ts,
      }),
    );
  }
  return updated;
}
