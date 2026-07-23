// W6-A — /memory (Phase 6.8): the operational organizational-memory page.
// Everything on screen is DERIVED from repositories (zero-data ⇒ honest 0 /
// "טרם נמדד"); every write flows through MemoryProposalWorkflow → the
// canonical Wave-5 ApprovalEngine. Import/export are honestly disabled until
// W6-B lands its Markdown/ZIP component.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SearchInput,
  SectionTitle,
  useToast,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import type { AuditEvent, Customer, MemoryRecord } from "@/domain/types";
import type {
  MemoryConflict,
  MemoryImportJob,
  MemoryLayer,
  MemoryLink,
  MemoryProposal,
  MemoryRecordV2,
  MemorySensitivity,
  MemorySource,
  MemoryUsage,
  MemoryVersion,
} from "@/domain/memory";
import { MEMORY_LAYERS, MEMORY_LAYER_LABELS_HE } from "@/domain/memory";
import { getMemoryEngine } from "@/memory/core/engine";
import { CEO_NAME_HE } from "@/memory/adapters/legacyBridge";
import { CEO_USER_ID } from "@/repositories/seed";
import {
  bridgeRecords,
  buildLinkGraph,
  computeMemoryMetrics,
  countByLayer,
  filterRecords,
  foldersForLayer,
  pendingProposals,
} from "./selectors";
import { ImportPanel } from "@/memory/import/ui/ImportPanel";
import { ExportPanel } from "@/memory/export/ui/ExportPanel";
import { obsidianStatus } from "@/memory/export/status";
import { recomputeBacklinks } from "@/memory/markdown/wikilinks";
import { LinkGraphView } from "./components/LinkGraph";
import { NoteView } from "./components/NoteView";
import { ProposalQueue, type ProposalControls } from "./components/ProposalQueue";

const stack = (gap = "var(--os-space-4)"): CSSProperties => ({ display: "grid", gap });

const MEMORY_COLLECTIONS = [
  "memoryRecords",
  "memoryProposals",
  "memorySources",
  "memoryLinks",
  "memoryVersions",
  "memoryUsage",
  "memoryConflicts",
  "memoryImportJobs",
  "memoryExportJobs",
  "approvals",
  "agentEvents",
  "auditEvents",
] as const;

const inputStyle: CSSProperties = {
  font: "inherit",
  fontSize: "var(--os-text-sm, 13px)",
  background: "var(--os-bg-2, transparent)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: 6,
  paddingInline: 10,
};

/** small governed form: observation → source (real entity) → proposal */
function NewProposalForm({
  customers,
  onSubmitted,
}: {
  customers: readonly Customer[];
  onSubmitted: () => void;
}): ReactElement {
  const { toast } = useToast();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [layer, setLayer] = useState<MemoryLayer>("business");
  const [customerId, setCustomerId] = useState("");
  const [busy, setBusy] = useState(false);
  const canSubmit = title.trim().length > 0 && body.trim().length > 0 && customerId !== "";

  const submit = async (): Promise<void> => {
    const customer = customers.find((c) => c.id === customerId);
    if (!customer) return;
    setBusy(true);
    try {
      const { stores, workflow } = getMemoryEngine();
      const now = new Date().toISOString();
      const existing = await stores.sources.list();
      const source: MemorySource = {
        id: `msrc-${existing.length + 1}`,
        createdAt: now,
        updatedAt: now,
        kind: "entity",
        refId: `customers:${customer.id}`,
        titleHe: `לקוח: ${customer.name}`,
        excerpt: `תצפית שנרשמה ידנית מתוך הקשר הלקוח «${customer.name}»`,
        capturedAt: now,
        verified: true, // the customer record was loaded from the repository just now
      };
      await stores.sources.create(source);
      await workflow.submitProposal({
        observationHe: `תצפית ידנית של ${CEO_NAME_HE} בהקשר «${customer.name}»`,
        proposedById: CEO_USER_ID,
        proposedByName: CEO_NAME_HE,
        draft: {
          title: title.trim(),
          bodyMarkdown: body.trim(),
          memoryLayer: layer,
          folder: layer === "customer" ? "לקוחות" : "כללי",
          entityLinks: [{ collection: "customers", entityId: customer.id, label: customer.name }],
          tags: [],
          sourceIds: [source.id],
          sensitivity: "פנימי",
          retentionPolicy: "קבוע",
          reviewDate: null,
        },
      });
      setTitle("");
      setBody("");
      toast("נוצרה הצעת זיכרון — ממתינה לאישור אנושי בתור", "info");
      onSubmitted();
    } catch (err) {
      toast(err instanceof Error ? err.message : "יצירת ההצעה נכשלה", "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
      <SectionTitle
        title="הצעת זיכרון חדשה"
        subtitle="תצפית + מקור אמיתי (ישות מהמאגר) — נכנסת לתור האישורים; שום דבר לא נכתב ישירות"
        icon="plus"
      />
      <div style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}>
        <input
          aria-label="כותרת"
          placeholder="כותרת"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={inputStyle}
        />
        <textarea
          aria-label="תוכן (Markdown)"
          placeholder="תוכן ההצעה (Markdown, [[קישורי-ויקי]] נתמכים)"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
          style={{ ...inputStyle, resize: "vertical" }}
        />
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <select
            aria-label="שכבת זיכרון"
            value={layer}
            onChange={(e) => setLayer(e.target.value as MemoryLayer)}
            style={inputStyle}
          >
            {MEMORY_LAYERS.map((l) => (
              <option key={l} value={l}>
                {MEMORY_LAYER_LABELS_HE[l]}
              </option>
            ))}
          </select>
          <select
            aria-label="מקור: לקוח"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
            style={inputStyle}
          >
            <option value="">מקור: בחרו לקוח מהמאגר…</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          {canSubmit && !busy ? (
            <OsButton
              variant="primary"
              size="sm"
              icon="plus"
              onClick={() => void submit()}
              data-testid="submit-proposal"
            >
              שלח לתור האישורים
            </OsButton>
          ) : (
            <OsButton
              variant="primary"
              size="sm"
              disabled
              disabledReason={
                busy ? "ההצעה נשלחת…" : "נדרשים כותרת, תוכן ומקור (לקוח) — זיכרון קבוע מחייב מקור"
              }
            >
              שלח לתור האישורים
            </OsButton>
          )}
        </div>
      </div>
    </Panel>
  );
}

export default function MemoryPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const [query, setQuery] = useState("");
  const [layer, setLayer] = useState<MemoryLayer | null>(null);
  const [folder, setFolder] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const recordsQ = useCollection<MemoryRecord | MemoryRecordV2>("memoryRecords");
  const proposalsQ = useCollection<MemoryProposal>("memoryProposals");
  const linksQ = useCollection<MemoryLink>("memoryLinks");
  const versionsQ = useCollection<MemoryVersion>("memoryVersions");
  const usageQ = useCollection<MemoryUsage>("memoryUsage");
  const conflictsQ = useCollection<MemoryConflict>("memoryConflicts");
  const importJobsQ = useCollection<MemoryImportJob>("memoryImportJobs");
  const auditQ = useCollection<AuditEvent>("auditEvents");
  const customersQ = useCollection<Customer>("customers");

  const queries = [
    recordsQ,
    proposalsQ,
    linksQ,
    versionsQ,
    usageQ,
    conflictsQ,
    importJobsQ,
    auditQ,
    customersQ,
  ];
  const isLoading = queries.some((q) => q.isLoading);
  const isError = queries.some((q) => q.isError);

  const records = useMemo(() => bridgeRecords(recordsQ.data ?? []), [recordsQ.data]);
  const proposals = proposalsQ.data ?? [];
  const links = linksQ.data ?? [];
  const versions = versionsQ.data ?? [];
  const usage = usageQ.data ?? [];
  const conflicts = conflictsQ.data ?? [];
  const importJobs = importJobsQ.data ?? [];
  const audit = auditQ.data ?? [];

  const todayISO = new Date().toISOString();
  const metrics = computeMemoryMetrics(
    { records, proposals, links, conflicts, usage, importJobs },
    todayISO,
  );
  const layerCounts = countByLayer(records);
  const visible = filterRecords(records, { query, layer, folder });
  const graph = useMemo(() => buildLinkGraph(records, linksQ.data ?? []), [records, linksQ.data]);
  const selected = records.find((r) => r.id === selectedId) ?? visible[0] ?? null;
  const queue = pendingProposals(proposals);

  const refresh = (): void => {
    void invalidate([...MEMORY_COLLECTIONS]);
  };

  const [obsLine1, obsLine2] = obsidianStatus();
  const refreshAfterJobs = (): void => {
    void recomputeBacklinks(getMemoryEngine().stores).finally(refresh);
  };

  const runControl = async (fn: () => Promise<unknown>, okHe: string): Promise<void> => {
    setBusy(true);
    try {
      await fn();
      refresh();
      toast(okHe, "info");
    } catch (err) {
      toast(err instanceof Error ? err.message : "הפעולה נכשלה", "danger");
    } finally {
      setBusy(false);
    }
  };

  const who = { deciderId: CEO_USER_ID, deciderName: CEO_NAME_HE };
  const controls: ProposalControls = {
    approve: (id) =>
      runControl(
        () => getMemoryEngine().workflow.approve(id, who),
        "ההצעה אושרה ונכתבה לזיכרון (גרסה חתומה)",
      ),
    editAndApprove: async (id, editedBody) => {
      const proposal = await getMemoryEngine().stores.proposals.get(id);
      if (!proposal) return;
      await runControl(
        () =>
          getMemoryEngine().workflow.editAndApprove(id, who, {
            ...proposal.draft,
            bodyMarkdown: editedBody,
          }),
        "ההצעה אושרה עם עריכה אנושית",
      );
    },
    requestMoreSources: (id, requestHe) =>
      runControl(
        () => getMemoryEngine().workflow.requestMoreSources(id, CEO_USER_ID, requestHe),
        "בקשת מקור נוסף נרשמה — ההצעה נותרה ממתינה",
      ),
    merge: (id, targetId) =>
      runControl(
        () => getMemoryEngine().workflow.mergeWithExisting(id, targetId, who),
        "ההצעה מוזגה — נוצרה גרסה חדשה על הפריט הקיים",
      ),
    reject: (id, reasonHe) =>
      runControl(
        () => getMemoryEngine().workflow.reject(id, who, reasonHe),
        "ההצעה נדחתה עם נימוק",
      ),
    markSensitive: (id, sensitivity: MemorySensitivity) =>
      runControl(
        () => getMemoryEngine().workflow.markSensitive(id, CEO_USER_ID, sensitivity),
        "הרגישות עודכנה בהצעה",
      ),
    cancel: (id) =>
      runControl(() => getMemoryEngine().workflow.cancelProposal(id, CEO_USER_ID), "ההצעה בוטלה"),
  };

  if (isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת הזיכרון נכשלה"
        reason="קריאת הנתונים מהמאגר המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען את הזיכרון הארגוני מהמאגר המקומי…
      </div>
    );
  }

  return (
    <div style={stack("var(--os-space-5)")} data-testid="memory-page">
      <PageRail>
        <div style={stack("var(--os-space-4)")}>
          <div style={stack("var(--os-space-2)")}>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                fontWeight: 600,
                color: "var(--os-text-2)",
              }}
            >
              מצב סנכרון
            </div>
            <div
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
                display: "grid",
                gap: 3,
              }}
            >
              <div>מאגר מקומי (IndexedDB) — פעיל</div>
              <div>{obsLine1}</div>
              <div>{obsLine2}</div>
              <div>ענן: לא זמין במצב הדגמה המקומי</div>
            </div>
          </div>
          <div style={stack("var(--os-space-2)")}>
            <ImportPanel onImported={refreshAfterJobs} />
            <ExportPanel onExported={refreshAfterJobs} />
          </div>
          <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
            כל כתיבה לזיכרון הקבוע מחייבת אישור אנושי בשם ({CEO_NAME_HE}) דרך מנוע האישורים. אין
            אנימציית סנכרון מדומה — הסטטוסים למעלה משקפים מצב אמיתי.
          </div>
        </div>
      </PageRail>

      <div>
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>זיכרון ארגוני</h1>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm, 13px)" }}>
          ארבע שכבות זיכרון · הצעות באישור אנושי · גרסאות בלתי-ניתנות-לשינוי · מצב הדגמה מקומי
        </div>
      </div>

      {/* metrics — ALL derived */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "var(--os-space-3)",
        }}
        data-testid="memory-metrics"
      >
        <KpiCard
          title="פריטים מאושרים"
          value={metrics.approvedRecords}
          accent="cyan"
          icon="memory"
        />
        <KpiCard
          title="הצעות ממתינות"
          value={metrics.pendingProposals}
          accent="violet"
          icon="shield"
        />
        <KpiCard title="קישורים" value={metrics.totalLinks} accent="blue" icon="network" />
        <KpiCard
          title="קישורים לא פתורים"
          value={metrics.unresolvedLinks}
          accent={metrics.unresolvedLinks > 0 ? "warning" : "success"}
          icon="alert"
        />
        <KpiCard
          title="סתירות פתוחות"
          value={metrics.openConflicts}
          accent={metrics.openConflicts > 0 ? "danger" : "success"}
          icon="alert"
        />
        <KpiCard
          title="סקירות שהגיע זמנן"
          value={metrics.reviewsDue}
          accent="warning"
          icon="clock"
        />
        <KpiCard title="ייבואים היום" value={metrics.importsToday} accent="blue" icon="inbox" />
        <KpiCard title="שימושי AI היום" value={metrics.aiUsesToday} accent="success" icon="brain" />
      </div>

      {/* workspace: browser (right) · list+graph (center) · note (left) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(180px, 0.6fr) minmax(0, 1fr) minmax(0, 1.3fr)",
          gap: "var(--os-space-4)",
          alignItems: "start",
        }}
      >
        {/* browser */}
        <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
          <SectionTitle title="שכבות ותיקיות" icon="book" />
          <div
            style={{ ...stack("var(--os-space-2)"), marginBlockStart: "var(--os-space-3)" }}
            data-testid="memory-layer-browser"
          >
            <button
              type="button"
              onClick={() => {
                setLayer(null);
                setFolder(null);
              }}
              style={{
                font: "inherit",
                textAlign: "start",
                background: layer === null ? "var(--os-highlight)" : "transparent",
                color: "var(--os-text)",
                border: "1px solid var(--os-border)",
                borderRadius: "var(--os-radius-sm, 6px)",
                paddingBlock: 5,
                paddingInline: 8,
                cursor: "pointer",
                fontSize: "var(--os-text-sm, 13px)",
              }}
            >
              כל השכבות{" "}
              <span className="os-num">
                ({records.filter((r) => r.archivedAt === null).length})
              </span>
            </button>
            {MEMORY_LAYERS.map((l) => (
              <div key={l} style={{ display: "grid", gap: 2 }}>
                <button
                  type="button"
                  onClick={() => {
                    setLayer(l);
                    setFolder(null);
                  }}
                  aria-pressed={layer === l}
                  style={{
                    font: "inherit",
                    textAlign: "start",
                    background: layer === l ? "var(--os-highlight)" : "transparent",
                    color: "var(--os-text)",
                    border: "1px solid var(--os-border)",
                    borderRadius: "var(--os-radius-sm, 6px)",
                    paddingBlock: 5,
                    paddingInline: 8,
                    cursor: "pointer",
                    fontSize: "var(--os-text-sm, 13px)",
                  }}
                >
                  {MEMORY_LAYER_LABELS_HE[l]} <span className="os-num">({layerCounts[l]})</span>
                </button>
                {layer === l &&
                  foldersForLayer(records, l).map(({ folder: f, count }) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFolder(folder === f ? null : f)}
                      aria-pressed={folder === f}
                      style={{
                        font: "inherit",
                        textAlign: "start",
                        marginInlineStart: "var(--os-space-3)",
                        background: folder === f ? "var(--os-highlight)" : "transparent",
                        color: "var(--os-text-2)",
                        border: "none",
                        cursor: "pointer",
                        fontSize: "var(--os-text-2xs, 11px)",
                        paddingBlock: 2,
                      }}
                    >
                      📁 {f} <span className="os-num">({count})</span>
                    </button>
                  ))}
              </div>
            ))}
          </div>
        </Panel>

        {/* list + graph */}
        <div style={stack("var(--os-space-4)")}>
          <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
            <SectionTitle title={`פריטי זיכרון (${visible.length})`} icon="memory" />
            <div style={{ marginBlockStart: "var(--os-space-3)", ...stack("var(--os-space-2)") }}>
              <SearchInput
                value={query}
                onChange={setQuery}
                placeholder="חיפוש בכותרת, בתוכן ובתגיות…"
              />
              <div style={stack("var(--os-space-1, 4px)")} data-testid="memory-note-list">
                {visible.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    aria-pressed={selected?.id === r.id}
                    style={{
                      font: "inherit",
                      textAlign: "start",
                      display: "grid",
                      gap: 2,
                      background: selected?.id === r.id ? "var(--os-highlight)" : "transparent",
                      color: "var(--os-text)",
                      border: `1px solid ${selected?.id === r.id ? "var(--os-border-strong)" : "var(--os-border)"}`,
                      borderRadius: "var(--os-radius-sm, 6px)",
                      paddingBlock: 6,
                      paddingInline: 10,
                      cursor: "pointer",
                    }}
                  >
                    <span style={{ fontWeight: 600, fontSize: "var(--os-text-sm, 13px)" }}>
                      {r.title}
                    </span>
                    <span
                      style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}
                    >
                      {MEMORY_LAYER_LABELS_HE[r.memoryLayer]} · {r.folder} · גרסה{" "}
                      <span className="os-num">{r.version}</span>
                    </span>
                  </button>
                ))}
                {visible.length === 0 && (
                  <EmptyState
                    icon="search"
                    title="אין פריטים"
                    reason="אין פריטי זיכרון שתואמים לסינון הנוכחי."
                  />
                )}
              </div>
            </div>
          </Panel>

          <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
            <SectionTitle
              title="גרף קישורים"
              subtitle={`${graph.edges.length} קישורים פתורים · ${graph.unresolvedCount} לא פתורים`}
              icon="network"
            />
            <div style={{ marginBlockStart: "var(--os-space-3)" }}>
              <LinkGraphView
                graph={graph}
                selectedId={selected?.id ?? null}
                onSelect={setSelectedId}
              />
            </div>
          </Panel>
        </div>

        {/* selected note */}
        <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
          {selected ? (
            <NoteView record={selected} versions={versions} usage={usage} audit={audit} />
          ) : (
            <EmptyState
              icon="memory"
              title="לא נבחר פריט"
              reason="בחרו פריט זיכרון מהרשימה או מהגרף."
            />
          )}
        </Panel>
      </div>

      {/* proposal queue + new proposal */}
      <Panel variant="panel" style={{ padding: "var(--os-space-4)" }}>
        <ProposalQueue proposals={queue} records={records} controls={controls} busy={busy} />
      </Panel>

      <NewProposalForm customers={customersQ.data ?? []} onSubmitted={refresh} />
    </div>
  );
}
