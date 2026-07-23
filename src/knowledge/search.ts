// TERAGON AI BUSINESS OS — deterministic full-text search over knowledge
// articles (Wave 6, W6-C). Pure token scoring — same input always returns the
// same ranked output. Shared by the /knowledge page and the Wiki agent.
// This is NOT semantic search and never pretends to be: the retrieval method
// is always declared as "חיפוש טקסטואלי דטרמיניסטי".
import type { KnowledgeArticleV2 } from "@/domain/knowledge";

export const RETRIEVAL_METHOD_HE = "חיפוש טקסטואלי דטרמיניסטי";

/** Split a query/text into lowercase tokens (Hebrew + Latin + digits). */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}°]+/u)
    .filter((t) => t.length >= 2);
}

export interface KnowledgeSearchHit {
  article: KnowledgeArticleV2;
  /** deterministic token score (not a confidence — never rendered as one) */
  score: number;
  /** which tokens matched, for honest display */
  matchedTokens: string[];
  /** first content line containing a matched token (excerpt for citations) */
  excerpt: string;
}

const TITLE_WEIGHT = 5;
const SUMMARY_WEIGHT = 3;
const TAGLIKE_WEIGHT = 3;
const CONTENT_WEIGHT = 1;

/**
 * Rank articles against a query. Deterministic: score desc, then id asc.
 * Zero-score articles are excluded — no match means no result, honestly.
 */
export function searchArticles(
  articles: readonly KnowledgeArticleV2[],
  query: string,
): KnowledgeSearchHit[] {
  const tokens = [...new Set(tokenize(query))];
  if (tokens.length === 0) return [];
  const hits: KnowledgeSearchHit[] = [];
  for (const article of articles) {
    const title = article.title.toLowerCase();
    const summary = article.summary.toLowerCase();
    const content = article.content.toLowerCase();
    const taglike = [
      article.category,
      ...article.troubleshootingCategories,
      ...article.supportedMaterials,
      ...article.supportedPrinterModels,
    ]
      .join(" ")
      .toLowerCase();
    let score = 0;
    const matched: string[] = [];
    for (const token of tokens) {
      let tokenScore = 0;
      if (title.includes(token)) tokenScore += TITLE_WEIGHT;
      if (summary.includes(token)) tokenScore += SUMMARY_WEIGHT;
      if (taglike.includes(token)) tokenScore += TAGLIKE_WEIGHT;
      if (content.includes(token)) tokenScore += CONTENT_WEIGHT;
      if (tokenScore > 0) {
        score += tokenScore;
        matched.push(token);
      }
    }
    if (score > 0) {
      hits.push({
        article,
        score,
        matchedTokens: matched,
        excerpt: firstMatchingLine(article, matched),
      });
    }
  }
  hits.sort((a, b) => b.score - a.score || a.article.id.localeCompare(b.article.id));
  return hits;
}

function firstMatchingLine(article: KnowledgeArticleV2, tokens: string[]): string {
  const lines = article.content.split("\n").filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (tokens.some((t) => lower.includes(t))) return line.trim();
  }
  return article.summary;
}
