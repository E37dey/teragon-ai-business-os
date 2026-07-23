// TERAGON AI BUSINESS OS — seed bridge (Wave 6, W6-C). Converts the 5 Wave-1
// seed knowledgeNotes into governed KnowledgeArticleV2 records, IDEMPOTENTLY
// (stable ids, re-running changes nothing), all labeled "נתוני הדגמה".
// Approved notes become "מאושר" articles with real version-1 snapshots and
// source records; the unapproved note stays an honest draft. A demo disputed
// pair + conflict record, an expired article, an open question and one real
// usage record give the UI honest non-empty states — nothing is invented at
// render time.
import type { KnowledgeNote } from "@/domain/types";
import type {
  KnowledgeArticleV2,
  KnowledgeCategory,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "@/domain/knowledge";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import { KNOWLEDGE_NOTES } from "@/repositories/seed/seedData";
import { appendVersionSnapshot, type KnowledgeClock, type KnowledgeStores } from "./stores";

export const SEED_AUTHOR_ID = "u-tzachi";
export const SEED_BRIDGE_PREFIX = "ka-kn-";

/** Wave-1 note category → canonical Wave-6 category. */
const CATEGORY_MAP: Record<string, KnowledgeCategory> = {
  תקלות: "פתרון תקלות",
  מכירות: "מכירות",
  שירות: "שירות",
};

function sourceKindOf(ref: string): KnowledgeSourceKind {
  if (ref.startsWith("ticket:")) return "קריאת שירות";
  if (ref.startsWith("quotation:")) return "מסמך";
  return "אחר";
}

/** Deterministic per-note enrichment (models/materials/troubleshooting). */
const NOTE_ENRICHMENT: Record<
  string,
  {
    printerModels: string[];
    materials: string[];
    troubleshooting: string[];
    safety: string[];
  }
> = {
  "kn-1": {
    printerModels: ["pm-2", "pm-3", "pm-5"],
    materials: ["PETG"],
    troubleshooting: ["וורפינג", "הדבקות למיטה"],
    safety: ["משטח חם 70°C — אין לגעת במיטה בזמן חימום"],
  },
  "kn-2": {
    printerModels: ["pm-3", "pm-6", "pm-7"],
    materials: ["PLA", "PETG"],
    troubleshooting: ["סתימה", "Hotend"],
    safety: ["ה-Hotend חם — לבצע Cold Pull רק לפי הנוהל ובקירור מבוקר"],
  },
  "kn-3": {
    printerModels: ["pm-1", "pm-2"],
    materials: ["PLA"],
    troubleshooting: [],
    safety: [],
  },
  "kn-4": {
    printerModels: ["pm-1", "pm-2"],
    materials: ["PLA"],
    troubleshooting: [],
    safety: [],
  },
  "kn-5": {
    printerModels: [],
    materials: [],
    troubleshooting: ["מסירה", "כיול"],
    safety: ["לוודא רישום אחריות לפני מסירה"],
  },
};

function toArticle(note: KnowledgeNote, now: string): KnowledgeArticleV2 {
  const extra = NOTE_ENRICHMENT[note.id] ?? {
    printerModels: [],
    materials: [],
    troubleshooting: [],
    safety: [],
  };
  const approved = note.approved;
  const effectiveDate = approved ? note.updatedAt.slice(0, 10) : null;
  return {
    id: `${SEED_BRIDGE_PREFIX}${note.id.slice(3)}`,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    title: note.title,
    category: CATEGORY_MAP[note.category] ?? "נהלים",
    summary: `${DEMO_DATA_LABEL} — הוסב מרשומת הידע ${note.id} (דור 1).`,
    content: note.content,
    supportedPrinterModels: extra.printerModels,
    supportedMaterials: extra.materials,
    troubleshootingCategories: extra.troubleshooting,
    safetyNotes: extra.safety,
    sourceIds: note.sourceRef ? [`ks-${note.id}`] : [],
    authorId: SEED_AUTHOR_ID,
    reviewerId: approved ? SEED_AUTHOR_ID : null,
    approval: approved
      ? {
          state: "מאושר",
          approvalId: null, // Wave-1 note approved before the canonical engine existed — honest null
          decidedById: SEED_AUTHOR_ID,
          decidedAt: note.updatedAt,
          noteHe: `אושר בהסבה מרשומת דור 1 (${DEMO_DATA_LABEL})`,
        }
      : {
          state: "טיוטה",
          approvalId: null,
          decidedById: null,
          decidedAt: null,
          noteHe: "",
        },
    version: 1,
    effectiveDate,
    reviewDate: approved ? addDays(now.slice(0, 10), 120) : null,
    archived: false,
    demo: true,
  };
}

/** The demo disputed pair — two articles claiming different ABS bed temps. */
function demoDisputedPair(now: string): KnowledgeArticleV2[] {
  const base = {
    createdAt: now,
    updatedAt: now,
    supportedPrinterModels: ["pm-4"],
    supportedMaterials: ["ABS"],
    troubleshootingCategories: ["וורפינג", "הדבקות למיטה"],
    sourceIds: [],
    authorId: SEED_AUTHOR_ID,
    reviewerId: SEED_AUTHOR_ID,
    version: 1,
    effectiveDate: now.slice(0, 10),
    reviewDate: addDays(now.slice(0, 10), 120),
    archived: false,
    demo: true,
  };
  const approval = (noteHe: string) => ({
    state: "שנוי במחלוקת" as const,
    approvalId: null,
    decidedById: SEED_AUTHOR_ID,
    decidedAt: now,
    noteHe,
  });
  return [
    {
      ...base,
      id: "ka-demo-1",
      title: "הדפסת ABS — הגדרות מיטה",
      category: "חומרי גלם",
      summary: `${DEMO_DATA_LABEL} — צד א' של סתירת הדגמה.`,
      content: "להדפסת ABS יציבה: טמפ' מיטה 100°C ותא סגור. בלי תא סגור — וורפינג כמעט מובטח.",
      safetyNotes: ["ABS פולט אדים — לאוורר את החדר"],
      approval: approval("סומן שנוי במחלוקת מול ka-demo-2 (טמפ' מיטה)"),
    },
    {
      ...base,
      id: "ka-demo-2",
      title: "ABS למתחילים — טמפרטורות",
      category: "חומרי גלם",
      summary: `${DEMO_DATA_LABEL} — צד ב' של סתירת הדגמה.`,
      content: "למתחילים ב-ABS מספיקה טמפ' מיטה 80°C עם דבק סטיק — אין צורך בתא סגור.",
      safetyNotes: ["ABS פולט אדים — לאוורר את החדר"],
      approval: approval("סומן שנוי במחלוקת מול ka-demo-1 (טמפ' מיטה)"),
    },
  ];
}

/** Approved long ago, reviewDate passed ⇒ honestly EXPIRED (not authoritative). */
function demoExpiredArticle(now: string): KnowledgeArticleV2 {
  const past = addDays(now.slice(0, 10), -400);
  return {
    id: "ka-demo-3",
    createdAt: `${past}T08:00:00.000Z`,
    updatedAt: `${past}T08:00:00.000Z`,
    title: "נוהל עדכון קושחה ישן (Ender 3)",
    category: "תחזוקה",
    summary: `${DEMO_DATA_LABEL} — מאמר שפג תוקף בדיקתו (reviewDate עבר).`,
    content: "נוהל עדכון קושחה לגרסה 4.2 — ייתכן שאינו עדכני לדגמים חדשים.",
    supportedPrinterModels: ["pm-7"],
    supportedMaterials: [],
    troubleshootingCategories: ["קושחה"],
    safetyNotes: [],
    sourceIds: [],
    authorId: SEED_AUTHOR_ID,
    reviewerId: SEED_AUTHOR_ID,
    approval: {
      state: "מאושר",
      approvalId: null,
      decidedById: SEED_AUTHOR_ID,
      decidedAt: `${past}T08:00:00.000Z`,
      noteHe: `אושר בעבר (${DEMO_DATA_LABEL})`,
    },
    version: 1,
    effectiveDate: past,
    reviewDate: addDays(past, 180), // long past ⇒ expired
    archived: false,
    demo: true,
  };
}

/**
 * Idempotent bridge. Safe to call on every app start / test setup: existing
 * records (by stable id) are left untouched; missing ones are created.
 */
export async function ensureKnowledgeSeed(
  stores: KnowledgeStores,
  clock: KnowledgeClock = () => new Date().toISOString(),
): Promise<{ created: number }> {
  const now = clock();
  let created = 0;

  const articles: KnowledgeArticleV2[] = [
    ...KNOWLEDGE_NOTES.map((n) => toArticle(n, now)),
    ...demoDisputedPair(now),
    demoExpiredArticle(now),
  ];
  for (const article of articles) {
    if (await stores.articles.get(article.id)) continue;
    await stores.articles.create(article);
    created += 1;
    // immutable v1 snapshot for every article that ever reached approval
    if (article.approval.state !== "טיוטה") {
      await appendVersionSnapshot(
        stores,
        article,
        `גרסה ראשונה (${DEMO_DATA_LABEL})`,
        SEED_AUTHOR_ID,
        () => article.updatedAt,
      );
    }
  }

  // sources for the bridged notes that cite a real record
  for (const note of KNOWLEDGE_NOTES) {
    if (!note.sourceRef) continue;
    const id = `ks-${note.id}`;
    if (await stores.sources.get(id)) continue;
    const source: KnowledgeSource = {
      id,
      createdAt: note.createdAt,
      updatedAt: note.createdAt,
      articleId: `${SEED_BRIDGE_PREFIX}${note.id.slice(3)}`,
      kind: sourceKindOf(note.sourceRef),
      ref: note.sourceRef,
      titleHe: `מקור: ${note.sourceRef} (${DEMO_DATA_LABEL})`,
      capturedAt: note.createdAt,
      ownerId: SEED_AUTHOR_ID,
    };
    await stores.sources.create(source);
    created += 1;
  }

  // the demo conflict record backing the disputed pair
  if (!(await stores.conflicts.get("kc-demo-1"))) {
    await stores.conflicts.create({
      id: "kc-demo-1",
      createdAt: now,
      updatedAt: now,
      articleIds: ["ka-demo-1", "ka-demo-2"],
      claims: [
        { articleId: "ka-demo-1", articleVersion: 1, claimHe: "טמפ' מיטה 100°C (תא סגור חובה)" },
        { articleId: "ka-demo-2", articleVersion: 1, claimHe: "טמפ' מיטה 80°C (ללא תא סגור)" },
      ],
      overlapKeyHe: "טמפ' מיטה",
      detectionMethodHe: `חפיפת טענות דטרמיניסטית — ערכים שונים לאותו פרמטר (${DEMO_DATA_LABEL})`,
      status: "פתוח",
      detectedAt: now,
      resolvedAt: null,
      resolutionNoteHe: "",
    });
    created += 1;
  }

  // an honest open question for the questions queue
  if (!(await stores.questions.get("kq-demo-1"))) {
    await stores.questions.create({
      id: "kq-demo-1",
      createdAt: now,
      updatedAt: now,
      questionHe: "איזה פרופיל Slicer מומלץ להדפסת ניילון על X1C?",
      askedById: SEED_AUTHOR_ID,
      askedAt: now,
      status: "פתוחה",
      answeredByArticleId: null,
      answerHe: null,
    });
    created += 1;
  }

  // one real usage record: the seeded AI recommendation rec-2 cites kn-1
  // (evidence sourceRef "knowledge:kn-1") — recorded against the bridged article
  if (!(await stores.usage.get("ku-demo-1"))) {
    const article = await stores.articles.get("ka-kn-1");
    if (article) {
      await stores.usage.create({
        id: "ku-demo-1",
        createdAt: now,
        updatedAt: now,
        articleId: "ka-kn-1",
        articleVersion: 1,
        usedAt: article.updatedAt,
        byAgent: "ag-fixer",
        inRecommendation: "aiRecommendation:rec-2",
        supersededByVersion: null,
        supersededAt: null,
      });
      created += 1;
    }
  }

  return { created };
}

function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
