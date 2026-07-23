// TERAGON AI BUSINESS OS — typed accessors over the Wave-6 knowledge
// collections (W6-C). One seam for the governance service, the Wiki agent,
// the evidence gate and the /knowledge page. Existing repository files
// untouched — this only wraps the canonical factory.
import type {
  KnowledgeArticleV2,
  KnowledgeConflict,
  KnowledgeQuestion,
  KnowledgeReview,
  KnowledgeSource,
  KnowledgeUsage,
  KnowledgeVersion,
} from "@/domain/knowledge";
import type { Repository } from "@/repositories/Repository";
import { getRepository } from "@/repositories";

export interface KnowledgeStores {
  articles: Repository<KnowledgeArticleV2>;
  sources: Repository<KnowledgeSource>;
  /** APPEND-ONLY — write versions only via appendVersionSnapshot (immutable) */
  versions: Repository<KnowledgeVersion>;
  usage: Repository<KnowledgeUsage>;
  conflicts: Repository<KnowledgeConflict>;
  questions: Repository<KnowledgeQuestion>;
  reviews: Repository<KnowledgeReview>;
}

/** Production wiring over the canonical repository factory. */
export function knowledgeStores(): KnowledgeStores {
  return {
    articles: getRepository<KnowledgeArticleV2>("knowledgeArticles"),
    sources: getRepository<KnowledgeSource>("knowledgeSources"),
    versions: getRepository<KnowledgeVersion>("knowledgeVersions"),
    usage: getRepository<KnowledgeUsage>("knowledgeUsage"),
    conflicts: getRepository<KnowledgeConflict>("knowledgeConflicts"),
    questions: getRepository<KnowledgeQuestion>("knowledgeQuestions"),
    reviews: getRepository<KnowledgeReview>("knowledgeReviews"),
  };
}

/** Injectable clock (ISO datetime) — determinism in tests. */
export type KnowledgeClock = () => string;

/**
 * The ONLY sanctioned way to write a version record. Versions are immutable:
 * a snapshot for an (articleId, version) pair that already exists throws —
 * history is never rewritten.
 */
export async function appendVersionSnapshot(
  stores: KnowledgeStores,
  article: KnowledgeArticleV2,
  changeNoteHe: string,
  createdById: string,
  clock: KnowledgeClock,
): Promise<KnowledgeVersion> {
  const id = `${article.id}-v${article.version}`;
  const existing = await stores.versions.get(id);
  if (existing) {
    throw new Error(
      `KNOWLEDGE_VERSION_IMMUTABLE: גרסה ${article.version} של "${article.id}" כבר קיימת — היסטוריית גרסאות לעולם אינה נכתבת מחדש`,
    );
  }
  const ts = clock();
  return stores.versions.create({
    id,
    createdAt: ts,
    updatedAt: ts,
    articleId: article.id,
    version: article.version,
    snapshot: {
      title: article.title,
      category: article.category,
      summary: article.summary,
      content: article.content,
      supportedPrinterModels: [...article.supportedPrinterModels],
      supportedMaterials: [...article.supportedMaterials],
      troubleshootingCategories: [...article.troubleshootingCategories],
      safetyNotes: [...article.safetyNotes],
    },
    changeNoteHe,
    createdById,
  });
}

/** Field-level diff between two version snapshots (deterministic order). */
export interface VersionFieldDiff {
  field: string;
  labelHe: string;
  before: string;
  after: string;
}

const SNAPSHOT_FIELDS: readonly { key: keyof KnowledgeVersion["snapshot"]; labelHe: string }[] = [
  { key: "title", labelHe: "כותרת" },
  { key: "category", labelHe: "קטגוריה" },
  { key: "summary", labelHe: "תקציר" },
  { key: "content", labelHe: "תוכן" },
  { key: "supportedPrinterModels", labelHe: "דגמי מדפסות נתמכים" },
  { key: "supportedMaterials", labelHe: "חומרים נתמכים" },
  { key: "troubleshootingCategories", labelHe: "קטגוריות פתרון תקלות" },
  { key: "safetyNotes", labelHe: "הערות בטיחות" },
];

export function compareVersions(a: KnowledgeVersion, b: KnowledgeVersion): VersionFieldDiff[] {
  const diffs: VersionFieldDiff[] = [];
  for (const { key, labelHe } of SNAPSHOT_FIELDS) {
    const av = a.snapshot[key];
    const bv = b.snapshot[key];
    const as = Array.isArray(av) ? av.join(" · ") : av;
    const bs = Array.isArray(bv) ? bv.join(" · ") : bv;
    if (as !== bs) diffs.push({ field: key, labelHe, before: as, after: bs });
  }
  return diffs;
}
