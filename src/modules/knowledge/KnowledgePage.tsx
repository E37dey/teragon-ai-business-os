// /knowledge — מרכז הידע המנוהל (Wave 6, W6-C, Phase 6.10).
// Category nav + deterministic full-text search + state/category/review-due
// filters; article viewer (ESCAPED rendering — React text nodes only; the full
// markdown sanitizer is W6-B's seam, see docs/integration-requests-w6c.md);
// draft create/edit (zod); submit-for-review → approve/reject/request-changes
// through the ONE canonical ApprovalEngine ('עדכון קבוע במאגר הידע'); archive;
// immutable version comparison; related printers/service-cases/courses joins;
// unresolved questions queue (Wiki agent answers from approved sources ONLY);
// contradiction panel; PageRail "איכות הידע" — all derived, "טרם נמדד" where
// honest.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type DataTableColumn,
  type OsStatus,
} from "@/design-system";
import type { Course, PrinterModel, ServiceTicket } from "@/domain/types";
import type {
  KnowledgeArticleV2,
  KnowledgeConflict,
  KnowledgeDraftInput,
  KnowledgeQuestion,
  KnowledgeReview,
  KnowledgeSource,
  KnowledgeState,
  KnowledgeUsage,
  KnowledgeVersion,
} from "@/domain/knowledge";
import {
  KNOWLEDGE_CATEGORIES,
  KNOWLEDGE_STATES,
  isAuthoritative,
  knowledgeDraftInputSchema,
  nonAuthoritativeReasonHe,
} from "@/domain/knowledge";
import { ApprovalEngine } from "@/agents/approvalEngine";
import { agentStores } from "@/repositories/agentStores";
import type { CollectionKey } from "@/repositories/collections";
import { CEO_USER_ID, DEMO_DATA_LABEL } from "@/repositories/seed";
import { WikiAgent, type WikiAnswer } from "@/agents/wiki";
import { KnowledgeGovernanceService } from "@/knowledge/governance";
import { ensureKnowledgeSeed } from "@/knowledge/seedBridge";
import { searchArticles, RETRIEVAL_METHOD_HE } from "@/knowledge/search";
import { compareVersions, knowledgeStores } from "@/knowledge/stores";
import {
  evidenceCoveragePercent,
  expiredArticles,
  filterArticles,
  oldSources,
  openConflicts,
  openQuestions,
  ownerlessSources,
  pendingReviews,
  relatedCourses,
  relatedPrinterModels,
  relatedServiceTickets,
  upcomingReviews,
  usageStats,
  RELATED_METHOD_HE,
  type ReviewDueFilter,
} from "./lib";

// collections the page mutates (directly or through the engine)
const INVALIDATE_KEYS: CollectionKey[] = [
  "knowledgeArticles",
  "knowledgeSources",
  "knowledgeVersions",
  "knowledgeUsage",
  "knowledgeConflicts",
  "knowledgeQuestions",
  "knowledgeReviews",
  "approvals",
  "auditEvents",
  "agentEvents",
];

// Module-level single-flight guard for the idempotent seed bridge (W6-F defect #1).
let knowledgeSeedOnce: ReturnType<typeof ensureKnowledgeSeed> | null = null;

const STATE_CHIP: Record<KnowledgeState, OsStatus> = {
  טיוטה: "מושבת",
  "ממתין לבדיקה": "דורש אישור",
  מאושר: "פעיל",
  "דורש עדכון": "אזהרה",
  "שנוי במחלוקת": "אזהרה",
  נדחה: "חסום",
  בארכיון: "מושבת",
};

function governance(): KnowledgeGovernanceService {
  return new KnowledgeGovernanceService({
    stores: knowledgeStores(),
    engine: new ApprovalEngine({ stores: agentStores() }),
  });
}

function busyDisabled(
  busy: boolean,
  reason = "פעולה קודמת עדיין רצה",
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: reason } : {};
}

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

export default function KnowledgePage(): ReactElement {
  const invalidate = useInvalidateCollections();
  const articlesQ = useCollection<KnowledgeArticleV2>("knowledgeArticles");
  const sourcesQ = useCollection<KnowledgeSource>("knowledgeSources");
  const versionsQ = useCollection<KnowledgeVersion>("knowledgeVersions");
  const usageQ = useCollection<KnowledgeUsage>("knowledgeUsage");
  const conflictsQ = useCollection<KnowledgeConflict>("knowledgeConflicts");
  const questionsQ = useCollection<KnowledgeQuestion>("knowledgeQuestions");
  const reviewsQ = useCollection<KnowledgeReview>("knowledgeReviews");
  const printersQ = useCollection<PrinterModel>("printerModels");
  const ticketsQ = useCollection<ServiceTicket>("serviceTickets");
  const coursesQ = useCollection<Course>("courses");

  // idempotent seed bridge — Wave-1 notes → governed articles ("נתוני הדגמה").
  // Module-level single-flight guard prevents concurrent seeding races (W6-F defect #1).
  useEffect(() => {
    let cancelled = false;
    knowledgeSeedOnce ??= ensureKnowledgeSeed(knowledgeStores());
    knowledgeSeedOnce
      .then(({ created }) => {
        if (!cancelled && created > 0) void invalidate(INVALIDATE_KEYS);
      })
      .catch(() => {
        // seed is idempotent; a transient failure retries on next mount
        knowledgeSeedOnce = null;
      });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const articles = useMemo(() => articlesQ.data ?? [], [articlesQ.data]);
  const sources = useMemo(() => sourcesQ.data ?? [], [sourcesQ.data]);
  const versions = useMemo(() => versionsQ.data ?? [], [versionsQ.data]);
  const usage = useMemo(() => usageQ.data ?? [], [usageQ.data]);
  const conflicts = useMemo(() => conflictsQ.data ?? [], [conflictsQ.data]);
  const questions = useMemo(() => questionsQ.data ?? [], [questionsQ.data]);
  const reviews = useMemo(() => reviewsQ.data ?? [], [reviewsQ.data]);
  const printers = useMemo(() => printersQ.data ?? [], [printersQ.data]);
  const tickets = useMemo(() => ticketsQ.data ?? [], [ticketsQ.data]);
  const courses = useMemo(() => coursesQ.data ?? [], [coursesQ.data]);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [stateFilter, setStateFilter] = useState("");
  const [reviewDue, setReviewDue] = useState<ReviewDueFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editorFor, setEditorFor] = useState<"new" | string | null>(null);

  const nowISO = new Date().toISOString();

  const filtered = useMemo(() => {
    const base = filterArticles(articles, { category, state: stateFilter, reviewDue, nowISO });
    if (!query.trim()) return base;
    const hits = searchArticles(base, query);
    return hits.map((h) => h.article);
  }, [articles, category, stateFilter, reviewDue, query, nowISO]);

  const authoritativeCount = articles.filter((a) => isAuthoritative(a, nowISO)).length;
  const pendingCount = articles.filter((a) => a.approval.state === "ממתין לבדיקה").length;
  const conflictsOpen = openConflicts(conflicts);
  const questionsOpen = openQuestions(questions);
  const selected = articles.find((a) => a.id === selectedId) ?? null;

  if (articlesQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת מאגר הידע"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (articlesQ.isLoading) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען את מאגר הידע…
      </Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <KnowledgeRail
          articles={articles}
          sources={sources}
          conflicts={conflicts}
          questions={questions}
          reviews={reviews}
          usage={usage}
          nowISO={nowISO}
        />
      </PageRail>

      <SectionTitle
        icon="book"
        title="מאגר ידע מנוהל"
        subtitle={DEMO_DATA_LABEL}
        action={
          <OsButton icon="plus" onClick={() => setEditorFor("new")}>
            טיוטת מאמר חדשה
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="מאמרים" value={articles.length} accent="blue" icon="book" />
        <KpiCard title="מאושרים ותקפים" value={authoritativeCount} accent="success" icon="check" />
        <KpiCard title="ממתינים לבדיקה" value={pendingCount} accent="violet" icon="clock" />
        <KpiCard
          title="סתירות פתוחות"
          value={conflictsOpen.length}
          accent="warning"
          icon="alert"
          glow={conflictsOpen.length > 0}
        />
        <KpiCard title="שאלות פתוחות" value={questionsOpen.length} accent="cyan" icon="mic" />
      </div>

      {/* category nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <CategoryChip label="הכול" active={category === ""} onClick={() => setCategory("")} />
        {KNOWLEDGE_CATEGORIES.map((c) => (
          <CategoryChip
            key={c}
            label={c}
            active={category === c}
            onClick={() => setCategory(category === c ? "" : c)}
          />
        ))}
      </div>

      {/* search + filters */}
      <Panel
        variant="raised"
        style={{ padding: "var(--os-space-4)", display: "flex", gap: 8, flexWrap: "wrap" }}
      >
        <input
          className="os-qc-input"
          style={{ flex: "1 1 220px" }}
          aria-label="חיפוש טקסטואלי במאגר הידע"
          placeholder={`חיפוש… (${RETRIEVAL_METHOD_HE})`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="os-qc-input"
          style={{ maxInlineSize: 170 }}
          aria-label="סינון לפי מצב"
          value={stateFilter}
          onChange={(e) => setStateFilter(e.target.value)}
        >
          <option value="">כל המצבים</option>
          {KNOWLEDGE_STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <select
          className="os-qc-input"
          style={{ maxInlineSize: 190 }}
          aria-label="סינון לפי מועד בדיקה"
          value={reviewDue}
          onChange={(e) => setReviewDue(e.target.value as ReviewDueFilter)}
        >
          <option value="all">כל מועדי הבדיקה</option>
          <option value="due-soon">בדיקה בקרוב (30 יום)</option>
          <option value="expired">פג תוקף הבדיקה</option>
        </select>
      </Panel>

      <ArticlesTable articles={filtered} nowISO={nowISO} onSelect={setSelectedId} />

      <QuestionsPanel questions={questionsOpen} articles={articles} />

      <ContradictionPanel conflicts={conflictsOpen} articles={articles} />

      {selected && (
        <ArticleDrawer
          key={selected.id}
          article={selected}
          sources={sources}
          versions={versions}
          usage={usage}
          printers={printers}
          tickets={tickets}
          courses={courses}
          nowISO={nowISO}
          onClose={() => setSelectedId(null)}
          onEdit={() => setEditorFor(selected.id)}
        />
      )}

      {editorFor && (
        <DraftEditorModal
          article={editorFor === "new" ? null : (articles.find((a) => a.id === editorFor) ?? null)}
          printers={printers}
          onClose={() => setEditorFor(null)}
        />
      )}
    </div>
  );
}

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`os-chip ${active ? "os-chip--cyan" : "os-chip--muted"}`}
      style={{ cursor: "pointer" }}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

// ── articles table ──────────────────────────────────────────────────────────
function ArticlesTable({
  articles,
  nowISO,
  onSelect,
}: {
  articles: readonly KnowledgeArticleV2[];
  nowISO: string;
  onSelect: (id: string) => void;
}): ReactElement {
  const columns: DataTableColumn<KnowledgeArticleV2>[] = [
    { key: "title", header: "כותרת", render: (a) => <b>{a.title}</b> },
    { key: "category", header: "קטגוריה" },
    {
      key: "state",
      header: "מצב",
      render: (a) => <StatusChip status={STATE_CHIP[a.approval.state]} label={a.approval.state} />,
    },
    {
      key: "authoritative",
      header: "תוקף",
      render: (a) =>
        isAuthoritative(a, nowISO) ? (
          <span style={{ color: "var(--os-success)", fontSize: "var(--os-text-xs)" }}>תקף</span>
        ) : (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            {nonAuthoritativeReasonHe(a, nowISO)}
          </span>
        ),
    },
    {
      key: "version",
      header: "גרסה",
      render: (a) => <span className="os-num">v{a.version}</span>,
    },
    {
      key: "effective",
      header: "בתוקף מ-",
      render: (a) => <span className="os-num">{a.effectiveDate ?? "—"}</span>,
    },
    {
      key: "review",
      header: "בדיקה הבאה",
      render: (a) => <span className="os-num">{a.reviewDate ?? "—"}</span>,
    },
    {
      key: "sources",
      header: "מקורות",
      render: (a) => <span className="os-num">{a.sourceIds.length}</span>,
    },
  ];
  return (
    <DataTable
      columns={columns}
      rows={articles}
      rowKey="id"
      onRowClick={(a) => onSelect(a.id)}
      emptyText="אין מאמרים"
      emptyReason="לא נמצאו מאמרים בסינון הנוכחי — נקו את הסינון או צרו טיוטה חדשה."
    />
  );
}

// ── article drawer ──────────────────────────────────────────────────────────
function ArticleDrawer({
  article,
  sources,
  versions,
  usage,
  printers,
  tickets,
  courses,
  nowISO,
  onClose,
  onEdit,
}: {
  article: KnowledgeArticleV2;
  sources: readonly KnowledgeSource[];
  versions: readonly KnowledgeVersion[];
  usage: readonly KnowledgeUsage[];
  printers: readonly PrinterModel[];
  tickets: readonly ServiceTicket[];
  courses: readonly Course[];
  nowISO: string;
  onClose: () => void;
  onEdit: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busy, setBusy] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [cmpA, setCmpA] = useState("");
  const [cmpB, setCmpB] = useState("");

  const articleSources = sources.filter((s) => s.articleId === article.id);
  const articleVersions = [...versions.filter((v) => v.articleId === article.id)].sort(
    (a, b) => a.version - b.version,
  );
  const articleUsage = usage.filter((u) => u.articleId === article.id);
  const relPrinters = relatedPrinterModels(article, printers);
  const relTickets = relatedServiceTickets(article, tickets, printers);
  const relCourses = relatedCourses(article, courses);
  const state = article.approval.state;
  const authoritative = isAuthoritative(article, nowISO);

  async function run(fn: () => Promise<unknown>, successMsg: string): Promise<void> {
    setBusy(true);
    try {
      await fn();
      await invalidate(INVALIDATE_KEYS);
      toast(successMsg, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "שגיאה לא מזוהה", "warning");
    } finally {
      setBusy(false);
    }
  }

  const va = articleVersions.find((v) => v.id === cmpA) ?? null;
  const vb = articleVersions.find((v) => v.id === cmpB) ?? null;
  const diffs = va && vb ? compareVersions(va, vb) : null;

  return (
    <Drawer open onClose={onClose} title={article.title}>
      <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
          <StatusChip status={STATE_CHIP[state]} label={state} />
          <span className="os-chip os-chip--muted">{article.category}</span>
          <span className="os-chip os-chip--blue os-num">גרסה {article.version}</span>
          {article.demo && <span className="os-chip os-chip--muted">{DEMO_DATA_LABEL}</span>}
          {authoritative ? (
            <span style={{ color: "var(--os-success)", fontSize: "var(--os-text-xs)" }}>
              מקור מוסמך — כשיר כראיה
            </span>
          ) : (
            <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
              אינו מוסמך: {nonAuthoritativeReasonHe(article, nowISO)}
            </span>
          )}
        </div>

        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          {article.summary}
        </div>

        {/* escaped viewer — React text nodes only. Full markdown rendering is
            gated on W6-B's sanitizer (integration request filed). */}
        <Panel
          variant="raised"
          style={{
            padding: "var(--os-space-4)",
            whiteSpace: "pre-wrap",
            fontSize: "var(--os-text-sm)",
            lineHeight: 1.7,
          }}
        >
          {article.content}
        </Panel>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          תצוגת טקסט מוגן (escaped) — עיבוד markdown מלא ימתין ל-sanitizer של W6-B.
        </div>

        {article.safetyNotes.length > 0 && (
          <Panel
            variant="raised"
            style={{
              padding: "var(--os-space-4)",
              borderInlineStart: "3px solid var(--os-warning)",
            }}
          >
            <b style={{ fontSize: "var(--os-text-sm)" }}>הערות בטיחות</b>
            {article.safetyNotes.map((n) => (
              <div key={n} style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
                ⚠ {n}
              </div>
            ))}
          </Panel>
        )}

        {/* governance actions */}
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
          <b style={{ fontSize: "var(--os-text-sm)" }}>ממשל — כל אישור דרך מנוע האישורים הקנוני</b>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["טיוטה", "דורש עדכון", "נדחה"].includes(state) ? (
              <>
                <OsButton size="sm" icon="doc" {...busyDisabled(busy)} onClick={onEdit}>
                  עריכת טיוטה
                </OsButton>
                <OsButton
                  size="sm"
                  variant="violet"
                  icon="send"
                  {...busyDisabled(busy)}
                  onClick={() =>
                    void run(
                      () => governance().submitForReview(article.id, CEO_USER_ID),
                      "המאמר הוגש לבדיקה — נוצרה בקשת אישור קנונית",
                    )
                  }
                >
                  הגשה לבדיקה
                </OsButton>
              </>
            ) : state === "שנוי במחלוקת" ? (
              <OsButton
                size="sm"
                variant="violet"
                icon="send"
                {...busyDisabled(busy)}
                onClick={() =>
                  void run(
                    () => governance().submitForReview(article.id, CEO_USER_ID),
                    "המאמר הוגש לבדיקה חוזרת לאחר סתירה",
                  )
                }
              >
                הגשה לבדיקה חוזרת
              </OsButton>
            ) : null}

            {state === "ממתין לבדיקה" && (
              <>
                <OsButton
                  size="sm"
                  variant="approve"
                  icon="check"
                  {...busyDisabled(busy)}
                  onClick={() =>
                    void run(
                      () =>
                        governance().approve(article.id, CEO_USER_ID, {
                          noteHe: decisionNote.trim() || undefined,
                        }),
                      "המאמר אושר — נוצרה גרסה חתומה",
                    )
                  }
                >
                  אישור
                </OsButton>
                {decisionNote.trim() ? (
                  <>
                    <OsButton
                      size="sm"
                      variant="reject"
                      icon="x"
                      {...busyDisabled(busy)}
                      onClick={() =>
                        void run(
                          () => governance().reject(article.id, CEO_USER_ID, decisionNote.trim()),
                          "המאמר נדחה",
                        )
                      }
                    >
                      דחייה
                    </OsButton>
                    <OsButton
                      size="sm"
                      variant="ghost"
                      icon="alert"
                      {...busyDisabled(busy)}
                      onClick={() =>
                        void run(
                          () =>
                            governance().requestChanges(
                              article.id,
                              CEO_USER_ID,
                              decisionNote.trim(),
                            ),
                          "הוחזר למחבר עם בקשת שינויים",
                        )
                      }
                    >
                      בקשת שינויים
                    </OsButton>
                  </>
                ) : (
                  <>
                    <OsButton
                      size="sm"
                      variant="reject"
                      icon="x"
                      disabled
                      disabledReason="דחייה מחייבת נימוק — כתבו אותו בשדה ההערה"
                    >
                      דחייה
                    </OsButton>
                    <OsButton
                      size="sm"
                      variant="ghost"
                      icon="alert"
                      disabled
                      disabledReason="בקשת שינויים מחייבת נימוק — כתבו אותו בשדה ההערה"
                    >
                      בקשת שינויים
                    </OsButton>
                  </>
                )}
              </>
            )}

            {state === "מאושר" &&
              (decisionNote.trim() ? (
                <OsButton
                  size="sm"
                  variant="ghost"
                  icon="alert"
                  {...busyDisabled(busy)}
                  onClick={() =>
                    void run(
                      () =>
                        governance().markNeedsUpdate(article.id, CEO_USER_ID, decisionNote.trim()),
                      "המאמר סומן «דורש עדכון» — התוקף הוסר עד בדיקה חוזרת",
                    )
                  }
                >
                  סימון דורש עדכון
                </OsButton>
              ) : (
                <OsButton
                  size="sm"
                  variant="ghost"
                  icon="alert"
                  disabled
                  disabledReason="סימון «דורש עדכון» מחייב נימוק — כתבו אותו בשדה ההערה"
                >
                  סימון דורש עדכון
                </OsButton>
              ))}

            {state !== "בארכיון" ? (
              <OsButton
                size="sm"
                variant="ghost"
                icon="inbox"
                {...busyDisabled(busy)}
                onClick={() =>
                  void run(
                    () => governance().archive(article.id, CEO_USER_ID),
                    "המאמר הועבר לארכיון",
                  )
                }
              >
                העברה לארכיון
              </OsButton>
            ) : (
              <OsButton
                size="sm"
                variant="ghost"
                icon="inbox"
                disabled
                disabledReason="המאמר כבר בארכיון"
              >
                העברה לארכיון
              </OsButton>
            )}
          </div>
          {(state === "ממתין לבדיקה" || state === "מאושר") && (
            <textarea
              className="os-qc-input os-qc-input--area"
              rows={2}
              aria-label="הערת החלטה"
              placeholder="הערת החלטה (חובה לדחייה / בקשת שינויים)"
              value={decisionNote}
              onChange={(e) => setDecisionNote(e.target.value)}
            />
          )}
          {article.approval.noteHe && (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              הערת החלטה אחרונה: {article.approval.noteHe}
            </div>
          )}
        </Panel>

        {/* sources */}
        <div>
          <SectionTitle icon="evidence" title={`מקורות (${articleSources.length})`} />
          {articleSources.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              למאמר אין רשומות מקור — כיסוי ראיות חסר.
            </div>
          ) : (
            articleSources.map((s) => (
              <div key={s.id} style={{ fontSize: "var(--os-text-sm)", marginBlockEnd: 4 }}>
                📎 {s.titleHe}{" "}
                <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                  ({s.kind}
                  {s.ref ? ` · ${s.ref}` : ""} · נלכד {s.capturedAt.slice(0, 10)}
                  {s.ownerId === null ? " · ללא בעלים" : ""})
                </span>
              </div>
            ))
          )}
        </div>

        {/* versions + comparison */}
        <div>
          <SectionTitle
            icon="doc"
            title={`גרסאות (${articleVersions.length}) — בלתי ניתנות לשינוי`}
          />
          {articleVersions.length === 0 && (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              עדיין אין גרסה חתומה — גרסה נוצרת באישור הראשון.
            </div>
          )}
          {articleVersions.map((v) => (
            <div key={v.id} style={{ fontSize: "var(--os-text-sm)", marginBlockEnd: 4 }}>
              <span className="os-num">v{v.version}</span> · {v.createdAt.slice(0, 10)} ·{" "}
              <span style={{ color: "var(--os-muted)" }}>{v.changeNoteHe}</span>
            </div>
          ))}
          {articleVersions.length >= 2 && (
            <div style={{ display: "grid", gap: 6, marginBlockStart: 8 }}>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  className="os-qc-input"
                  aria-label="גרסה להשוואה — לפני"
                  value={cmpA}
                  onChange={(e) => setCmpA(e.target.value)}
                >
                  <option value="">גרסה א'…</option>
                  {articleVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                    </option>
                  ))}
                </select>
                <select
                  className="os-qc-input"
                  aria-label="גרסה להשוואה — אחרי"
                  value={cmpB}
                  onChange={(e) => setCmpB(e.target.value)}
                >
                  <option value="">גרסה ב'…</option>
                  {articleVersions.map((v) => (
                    <option key={v.id} value={v.id}>
                      v{v.version}
                    </option>
                  ))}
                </select>
              </div>
              {diffs &&
                (diffs.length === 0 ? (
                  <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                    אין הבדלים בין הגרסאות שנבחרו.
                  </div>
                ) : (
                  diffs.map((d) => (
                    <Panel key={d.field} variant="raised" style={{ padding: "var(--os-space-3)" }}>
                      <b style={{ fontSize: "var(--os-text-xs)" }}>{d.labelHe}</b>
                      <div style={{ fontSize: "var(--os-text-xs)", color: "var(--os-danger)" }}>
                        − {d.before}
                      </div>
                      <div style={{ fontSize: "var(--os-text-xs)", color: "var(--os-success)" }}>
                        + {d.after}
                      </div>
                    </Panel>
                  ))
                ))}
            </div>
          )}
        </div>

        {/* AI usage */}
        <div>
          <SectionTitle icon="bot" title={`שימושי AI במאמר (${articleUsage.length})`} />
          {articleUsage.length === 0 ? (
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
              טרם נרשם שימוש במאמר כראיה בהמלצות.
            </div>
          ) : (
            articleUsage.map((u) => (
              <div key={u.id} style={{ fontSize: "var(--os-text-sm)", marginBlockEnd: 4 }}>
                🤖 {u.byAgent} · <span className="os-num">v{u.articleVersion}</span> ·{" "}
                {u.inRecommendation}
                {u.supersededByVersion !== null && (
                  <span style={{ color: "var(--os-warning)", fontSize: "var(--os-text-2xs)" }}>
                    {" "}
                    · הוחלף בגרסה v{u.supersededByVersion}
                  </span>
                )}
              </div>
            ))
          )}
        </div>

        {/* related records */}
        <div>
          <SectionTitle icon="network" title="קשור במערכת" subtitle={RELATED_METHOD_HE} />
          <RelatedList
            title={`דגמי מדפסות (${relPrinters.length})`}
            items={relPrinters.map((p) => `${p.name} (${p.manufacturer})`)}
            emptyHe="לא צוינו דגמים נתמכים."
          />
          <RelatedList
            title={`קריאות שירות (${relTickets.length})`}
            items={relTickets.map((t) => `${t.issue} — ${t.printer} (${t.status})`)}
            emptyHe="אין קריאות שירות תואמות."
          />
          <RelatedList
            title={`קורסים (${relCourses.length})`}
            items={relCourses.map((c) => `${c.name} (${c.status})`)}
            emptyHe="אין קורסים תואמים."
          />
        </div>
      </div>
    </Drawer>
  );
}

function RelatedList({
  title,
  items,
  emptyHe,
}: {
  title: string;
  items: readonly string[];
  emptyHe: string;
}): ReactElement {
  return (
    <div style={{ marginBlockEnd: 8 }}>
      <b style={{ fontSize: "var(--os-text-xs)" }}>{title}</b>
      {items.length === 0 ? (
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{emptyHe}</div>
      ) : (
        items.map((it) => (
          <div key={it} style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}>
            • {it}
          </div>
        ))
      )}
    </div>
  );
}

// ── questions queue + ask-wiki ──────────────────────────────────────────────
function QuestionsPanel({
  questions,
  articles,
}: {
  questions: readonly KnowledgeQuestion[];
  articles: readonly KnowledgeArticleV2[];
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [freeQuestion, setFreeQuestion] = useState("");
  const [answer, setAnswer] = useState<WikiAnswer | null>(null);
  const [answeredFor, setAnsweredFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function ask(questionText: string, questionId: string | null): Promise<void> {
    setBusy(true);
    try {
      const agent = new WikiAgent({ stores: knowledgeStores() });
      const result = await agent.answerQuestion(questionText);
      setAnswer(result);
      setAnsweredFor(questionId);
    } finally {
      setBusy(false);
    }
  }

  async function saveQuestion(): Promise<void> {
    const text = freeQuestion.trim();
    if (text.length < 3) {
      toast("שאלה קצרה מדי (לפחות 3 תווים)", "warning");
      return;
    }
    setBusy(true);
    try {
      const stores = knowledgeStores();
      const all = await stores.questions.list();
      const ts = new Date().toISOString();
      await stores.questions.create({
        id: `kq-${all.length + 1}`,
        createdAt: ts,
        updatedAt: ts,
        questionHe: text,
        askedById: CEO_USER_ID,
        askedAt: ts,
        status: "פתוחה",
        answeredByArticleId: null,
        answerHe: null,
      });
      await invalidate(["knowledgeQuestions"]);
      setFreeQuestion("");
      toast("השאלה נוספה לתור השאלות הפתוחות", "success");
    } finally {
      setBusy(false);
    }
  }

  async function markAnswered(q: KnowledgeQuestion, a: WikiAnswer): Promise<void> {
    const top = a.sources[0];
    if (!top) return;
    setBusy(true);
    try {
      const stores = knowledgeStores();
      const ts = new Date().toISOString();
      await stores.questions.update(q.id, {
        status: "נענתה",
        answeredByArticleId: top.articleId,
        answerHe: a.answer,
        updatedAt: ts,
      });
      await invalidate(["knowledgeQuestions"]);
      setAnswer(null);
      setAnsweredFor(null);
      toast("השאלה סומנה כנענתה עם המקור המצוטט", "success");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle
        icon="mic"
        title={`שאלות ללא מענה (${questions.length})`}
        subtitle="סוכן הידע עונה אך ורק ממקורות מאושרים"
      />
      <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 8 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <input
            className="os-qc-input"
            style={{ flex: "1 1 220px" }}
            aria-label="שאלה חדשה לסוכן הידע"
            placeholder="שאלה חדשה…"
            value={freeQuestion}
            onChange={(e) => setFreeQuestion(e.target.value)}
          />
          <OsButton
            size="sm"
            icon="sparkle"
            {...busyDisabled(busy)}
            onClick={() => void ask(freeQuestion, null)}
          >
            שאל את סוכן הידע
          </OsButton>
          <OsButton
            size="sm"
            variant="ghost"
            icon="plus"
            {...busyDisabled(busy)}
            onClick={() => void saveQuestion()}
          >
            הוספה לתור
          </OsButton>
        </div>

        {questions.map((q) => (
          <div
            key={q.id}
            style={{
              display: "flex",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              fontSize: "var(--os-text-sm)",
            }}
          >
            <span>❓ {q.questionHe}</span>
            <OsButton
              size="sm"
              variant="ghost"
              icon="sparkle"
              {...busyDisabled(busy)}
              onClick={() => void ask(q.questionHe, q.id)}
            >
              נסה מענה מהידע המאושר
            </OsButton>
          </div>
        ))}
        {questions.length === 0 && (
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
            אין שאלות פתוחות בתור.
          </div>
        )}

        {answer && (
          <Panel style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
            <b style={{ fontSize: "var(--os-text-sm)" }}>תשובת סוכן הידע</b>
            <div style={{ fontSize: "var(--os-text-sm)", whiteSpace: "pre-wrap" }}>
              {answer.answer}
            </div>
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              שיטת אחזור: {answer.retrievalMethod}
            </div>
            {answer.sources.length > 0 && (
              <div style={{ fontSize: "var(--os-text-xs)" }}>
                מקורות:{" "}
                {answer.sources.map((s) => (
                  <span
                    key={s.articleId}
                    className="os-chip os-chip--blue"
                    style={{ marginInlineEnd: 4 }}
                  >
                    {s.titleHe} · v{s.version}
                  </span>
                ))}
              </div>
            )}
            {answer.limitations.map((l) => (
              <div key={l} style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                ⚠ {l}
              </div>
            ))}
            {answeredFor &&
              answer.sources.length > 0 &&
              (() => {
                const q = questions.find((x) => x.id === answeredFor);
                return q ? (
                  <OsButton
                    size="sm"
                    variant="approve"
                    icon="check"
                    {...busyDisabled(busy)}
                    onClick={() => void markAnswered(q, answer)}
                  >
                    סמן כנענתה עם המקור המצוטט
                  </OsButton>
                ) : null;
              })()}
            {answer.sources.length === 0 && (
              <div style={{ color: "var(--os-warning)", fontSize: "var(--os-text-xs)" }}>
                אין מקור מאושר — אפשר להציע טיוטת מאמר חדשה (מחייבת אישור אנושי).
              </div>
            )}
          </Panel>
        )}
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          {articles.length === 0
            ? "מאגר הידע ריק — אין ממה לענות."
            : "תשובה ללא מקור מאושר תוחזר כ«לא נמצא מקור מאושר שמספיק למענה» — לעולם לא ניחוש."}
        </div>
      </Panel>
    </div>
  );
}

// ── contradiction panel ─────────────────────────────────────────────────────
function ContradictionPanel({
  conflicts,
  articles,
}: {
  conflicts: readonly KnowledgeConflict[];
  articles: readonly KnowledgeArticleV2[];
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [busy, setBusy] = useState(false);
  const [resolveNote, setResolveNote] = useState("");
  const [resolvingId, setResolvingId] = useState<string | null>(null);

  const titleOf = (id: string): string => articles.find((a) => a.id === id)?.title ?? id;

  async function scan(): Promise<void> {
    setBusy(true);
    try {
      const agent = new WikiAgent({ stores: knowledgeStores(), governance: governance() });
      const created = await agent.flagContradictions();
      await invalidate(INVALIDATE_KEYS);
      toast(
        created.length === 0
          ? "לא נמצאו סתירות חדשות בסריקה הדטרמיניסטית"
          : `נמצאו ${created.length} סתירות חדשות — המאמרים סומנו «שנוי במחלוקת»`,
        created.length === 0 ? "success" : "warning",
      );
    } finally {
      setBusy(false);
    }
  }

  async function resolve(conflictId: string): Promise<void> {
    if (!resolveNote.trim()) return;
    setBusy(true);
    try {
      await governance().resolveConflict(conflictId, resolveNote.trim());
      await invalidate(INVALIDATE_KEYS);
      setResolvingId(null);
      setResolveNote("");
      toast("הסתירה נסגרה — המאמרים יחזרו לתוקף רק דרך בדיקה חוזרת", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "שגיאה לא מזוהה", "warning");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SectionTitle
        icon="alert"
        title={`סתירות בידע (${conflicts.length})`}
        subtitle="חפיפת טענות דטרמיניסטית — לא מודל"
        action={
          <OsButton size="sm" icon="search" {...busyDisabled(busy)} onClick={() => void scan()}>
            סריקת סתירות
          </OsButton>
        }
      />
      {conflicts.length === 0 ? (
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>
          אין סתירות פתוחות.
        </div>
      ) : (
        conflicts.map((c) => (
          <Panel
            key={c.id}
            variant="raised"
            style={{ padding: "var(--os-space-4)", display: "grid", gap: 6, marginBlockEnd: 8 }}
          >
            <b style={{ fontSize: "var(--os-text-sm)" }}>
              ⚡ {c.overlapKeyHe} — {c.articleIds.map(titleOf).join(" ↔ ")}
            </b>
            {c.claims.map((cl) => (
              <div
                key={cl.articleId}
                style={{ fontSize: "var(--os-text-xs)", color: "var(--os-text-2)" }}
              >
                «{titleOf(cl.articleId)}» (v{cl.articleVersion}): {cl.claimHe}
              </div>
            ))}
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
              {c.detectionMethodHe} · זוהה {c.detectedAt.slice(0, 10)}
            </div>
            {resolvingId === c.id ? (
              <div style={{ display: "grid", gap: 6 }}>
                <textarea
                  className="os-qc-input os-qc-input--area"
                  rows={2}
                  aria-label="נימוק סגירת הסתירה"
                  placeholder="נימוק ההכרעה (חובה)"
                  value={resolveNote}
                  onChange={(e) => setResolveNote(e.target.value)}
                />
                {resolveNote.trim() ? (
                  <OsButton
                    size="sm"
                    variant="approve"
                    icon="check"
                    {...busyDisabled(busy)}
                    onClick={() => void resolve(c.id)}
                  >
                    סגירת הסתירה עם נימוק
                  </OsButton>
                ) : (
                  <OsButton
                    size="sm"
                    variant="approve"
                    icon="check"
                    disabled
                    disabledReason="סגירת סתירה מחייבת נימוק"
                  >
                    סגירת הסתירה עם נימוק
                  </OsButton>
                )}
              </div>
            ) : (
              <OsButton
                size="sm"
                variant="ghost"
                icon="check"
                {...busyDisabled(busy)}
                onClick={() => setResolvingId(c.id)}
              >
                הכרעה…
              </OsButton>
            )}
          </Panel>
        ))
      )}
    </div>
  );
}

// ── draft editor ────────────────────────────────────────────────────────────
function DraftEditorModal({
  article,
  printers,
  onClose,
}: {
  article: KnowledgeArticleV2 | null;
  printers: readonly PrinterModel[];
  onClose: () => void;
}): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [title, setTitle] = useState(article?.title ?? "");
  const [category, setCategory] = useState<string>(article?.category ?? "פתרון תקלות");
  const [summary, setSummary] = useState(article?.summary ?? "");
  const [content, setContent] = useState(article?.content ?? "");
  const [models, setModels] = useState<string[]>(article?.supportedPrinterModels ?? []);
  const [materials, setMaterials] = useState((article?.supportedMaterials ?? []).join(", "));
  const [troubleshooting, setTroubleshooting] = useState(
    (article?.troubleshootingCategories ?? []).join(", "),
  );
  const [safety, setSafety] = useState((article?.safetyNotes ?? []).join(", "));
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const splitList = (s: string): string[] =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter((x) => x.length > 0);

  function submit(): void {
    const input: KnowledgeDraftInput = {
      title: title.trim(),
      category: category as KnowledgeDraftInput["category"],
      summary: summary.trim(),
      content: content.trim(),
      supportedPrinterModels: models,
      supportedMaterials: splitList(materials),
      troubleshootingCategories: splitList(troubleshooting),
      safetyNotes: splitList(safety),
    };
    const parsed = knowledgeDraftInputSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(parsed.error.issues.map((i) => i.message));
      return;
    }
    setBusy(true);
    const svc = governance();
    const op = article
      ? svc.updateDraft(article.id, parsed.data, CEO_USER_ID)
      : svc.createDraft(parsed.data, CEO_USER_ID);
    void op
      .then(async () => {
        await invalidate(INVALIDATE_KEYS);
        toast(article ? "הטיוטה עודכנה" : "טיוטה חדשה נוצרה", "success");
        onClose();
      })
      .catch((err: unknown) => {
        setErrors([err instanceof Error ? err.message : "שגיאה לא מזוהה"]);
      })
      .finally(() => setBusy(false));
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={article ? `עריכת טיוטה — ${article.title}` : "טיוטת מאמר חדשה"}
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton icon="check" {...busyDisabled(busy)} onClick={submit}>
            {article ? "שמירת טיוטה" : "יצירת טיוטה"}
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div className="os-qc-form">
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-title">
            כותרת
          </label>
          <input
            id="kd-title"
            className="os-qc-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-category">
            קטגוריה
          </label>
          <select
            id="kd-category"
            className="os-qc-input"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {KNOWLEDGE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-summary">
            תקציר
          </label>
          <input
            id="kd-summary"
            className="os-qc-input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-content">
            תוכן (markdown — יוצג כטקסט מוגן עד ה-sanitizer של W6-B)
          </label>
          <textarea
            id="kd-content"
            className="os-qc-input os-qc-input--area"
            rows={5}
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <span className="os-qc-label">דגמי מדפסות נתמכים</span>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {printers.map((p) => {
              const active = models.includes(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  className={`os-chip ${active ? "os-chip--cyan" : "os-chip--muted"}`}
                  style={{ cursor: "pointer" }}
                  aria-pressed={active}
                  onClick={() =>
                    setModels(active ? models.filter((m) => m !== p.id) : [...models, p.id])
                  }
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-materials">
            חומרים נתמכים (מופרדים בפסיק)
          </label>
          <input
            id="kd-materials"
            className="os-qc-input"
            value={materials}
            onChange={(e) => setMaterials(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-troubleshooting">
            קטגוריות פתרון תקלות (מופרדות בפסיק)
          </label>
          <input
            id="kd-troubleshooting"
            className="os-qc-input"
            value={troubleshooting}
            onChange={(e) => setTroubleshooting(e.target.value)}
          />
        </div>
        <div className="os-qc-field">
          <label className="os-qc-label" htmlFor="kd-safety">
            הערות בטיחות (מופרדות בפסיק)
          </label>
          <input
            id="kd-safety"
            className="os-qc-input"
            value={safety}
            onChange={(e) => setSafety(e.target.value)}
          />
        </div>
        {errors.map((e) => (
          <div key={e} className="os-qc-error">
            {e}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ── rail: "איכות הידע" ──────────────────────────────────────────────────────
function KnowledgeRail({
  articles,
  sources,
  conflicts,
  questions,
  reviews,
  usage,
  nowISO,
}: {
  articles: readonly KnowledgeArticleV2[];
  sources: readonly KnowledgeSource[];
  conflicts: readonly KnowledgeConflict[];
  questions: readonly KnowledgeQuestion[];
  reviews: readonly KnowledgeReview[];
  usage: readonly KnowledgeUsage[];
  nowISO: string;
}): ReactElement {
  const old = oldSources(sources, nowISO);
  const ownerless = ownerlessSources(sources);
  const upcoming = upcomingReviews(articles, nowISO);
  const expired = expiredArticles(articles, nowISO);
  const conflictsN = openConflicts(conflicts).length;
  const questionsN = openQuestions(questions).length;
  const proposed = pendingReviews(reviews).length;
  const stats = usageStats(usage);
  const coverage = evidenceCoveragePercent(articles, nowISO);

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)", fontSize: "var(--os-text-sm)" }}>
      <div style={railTitle}>איכות הידע</div>
      <RailRow label="מקורות ישנים (מעל 180 יום)" value={old.length} warn={old.length > 0} />
      <RailRow label="מקורות ללא בעלים" value={ownerless.length} warn={ownerless.length > 0} />
      <RailRow label="בדיקות קרובות (30 יום)" value={upcoming.length} warn={false} />
      <RailRow label="פג תוקף הבדיקה" value={expired.length} warn={expired.length > 0} />
      <RailRow label="מאמרים סותרים" value={conflictsN} warn={conflictsN > 0} />
      <RailRow label="שאלות ללא מענה" value={questionsN} warn={questionsN > 0} />
      <RailRow label="עדכונים מוצעים (ממתינים)" value={proposed} warn={false} />
      <div>
        <div style={railSub}>שימושי AI (רשומות אמת)</div>
        <RailRow label="סה״כ שימושים" value={stats.total} warn={false} />
        <RailRow label="שימושים שהוחלפו בגרסה חדשה" value={stats.superseded} warn={false} />
        {[...stats.byAgent.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([agent, n]) => (
            <RailRow key={agent} label={agent} value={n} warn={false} />
          ))}
      </div>
      <div>
        <div style={railSub}>כיסוי ראיות (מאמרים תקפים עם מקור)</div>
        <div className="os-num" style={{ color: "var(--os-text)" }}>
          {coverage === null ? "טרם נמדד" : `${coverage}%`}
        </div>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          נגזר מרשומות בלבד — לא הערכה.
        </div>
      </div>
    </div>
  );
}

function RailRow({
  label,
  value,
  warn,
}: {
  label: string;
  value: number;
  warn: boolean;
}): ReactElement {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: "var(--os-space-3)",
        marginBlockEnd: 4,
      }}
    >
      <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>{label}</span>
      <span className="os-num" style={{ color: warn ? "var(--os-warning)" : "var(--os-text)" }}>
        {value}
      </span>
    </div>
  );
}

const railTitle: CSSProperties = { color: "var(--os-text)", fontWeight: 600 };
const railSub: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 600,
  fontSize: "var(--os-text-xs)",
  marginBlockEnd: 4,
};
