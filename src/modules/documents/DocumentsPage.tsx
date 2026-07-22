// Wave 3 — מסמכים והצעות מחיר (/documents): quotation lifecycle (editor,
// discount+VAT math, approval flow, expiry, print view) + the general
// documents list. Print view escapes every field (the donor had an XSS here).
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  DataTable,
  EmptyState,
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
  useToast,
  type OsStatus,
} from "@/design-system";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import { getRepository, nextId } from "@/repositories";
import { CEO_USER_ID } from "@/repositories/seed";
import type {
  Document,
  Product,
  Quotation,
  QuotationLine,
  QuotationStatus,
  Task,
  User,
} from "@/domain/types";
import { quotationSchema, taskSchema } from "@/domain/schemas";
import { revenuePipeline } from "@/domain/selectors";
import {
  expiringSoon,
  isEditable,
  isExpired,
  MAX_DISCOUNT_PERCENT,
  QUOTATION_NEXT_STATUS,
  quoteTotals,
  validateDiscount,
} from "@/modules/quotations/quoteMath";
import { openQuotationPrintView } from "@/modules/quotations/printView";
import { ils, dateHe, todayIso } from "@/modules/quotations/fmt";

const railTitle: CSSProperties = {
  fontSize: "var(--os-text-2xs, 11px)",
  fontWeight: 600,
  color: "var(--os-text-2)",
  marginBlockEnd: 6,
  letterSpacing: "0.04em",
};

const selStyle: CSSProperties = {
  background: "var(--os-raised)",
  color: "var(--os-text)",
  border: "1px solid var(--os-border)",
  borderRadius: "var(--os-radius-sm, 6px)",
  paddingBlock: "4px",
  paddingInline: "8px",
  fontSize: "var(--os-text-sm, 13px)",
};

function statusChip(status: QuotationStatus): ReactElement {
  const map: Record<QuotationStatus, { chip: OsStatus; label: string }> = {
    טיוטה: { chip: "ממתין", label: "טיוטה" },
    נשלחה: { chip: "דורש אישור", label: "נשלחה" },
    אושרה: { chip: "הושלם", label: "אושרה" },
    נדחתה: { chip: "מושהה", label: "נדחתה" },
    "פג תוקף": { chip: "אזהרה", label: "פג תוקף" },
  };
  const m = map[status];
  return <StatusChip status={m.chip} label={m.label} />;
}

// version state — module-local edit counter per quotation (localStorage)
const VERSIONS_KEY = "teragon-w3.quotations.versions";
function loadVersions(): Record<string, number> {
  try {
    const raw = localStorage.getItem(VERSIONS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}
function bumpVersion(id: string): number {
  const versions = loadVersions();
  const next = (versions[id] ?? 1) + 1;
  versions[id] = next;
  try {
    localStorage.setItem(VERSIONS_KEY, JSON.stringify(versions));
  } catch {
    // convenience only
  }
  return next;
}

type StatusFilter = QuotationStatus | "הכול";
type ExpiryFilter = "הכול" | "פג בקרוב" | "פג תוקף";

interface EditorState {
  quotation: Quotation;
  lines: QuotationLine[];
  discount: string;
  title: string;
  customerName: string;
  validUntil: string;
  terms: string;
}

export default function DocumentsPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();

  const quotationsQ = useCollection<Quotation>("quotations");
  const documentsQ = useCollection<Document>("documents");
  const productsQ = useCollection<Product>("products");
  const usersQ = useCollection<User>("users");

  const quotations = useMemo(() => quotationsQ.data ?? [], [quotationsQ.data]);
  const documents = documentsQ.data ?? [];
  const products = productsQ.data ?? [];
  const users = usersQ.data ?? [];
  const today = todayIso();

  const [tab, setTab] = useState<"quotes" | "docs">("quotes");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("הכול");
  const [expiryFilter, setExpiryFilter] = useState<ExpiryFilter>("הכול");
  const [docTypeFilter, setDocTypeFilter] = useState<"הכול" | "קובץ" | "קישור">("הכול");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [versions, setVersions] = useState<Record<string, number>>(() => loadVersions());
  const [busy, setBusy] = useState(false);

  const pipeline = useMemo(() => revenuePipeline(quotations), [quotations]);
  const expSoon = useMemo(() => expiringSoon(quotations, today), [quotations, today]);
  const awaiting = quotations.filter((q) => q.status === "נשלחה");

  const filteredQuotes = useMemo(
    () =>
      quotations.filter((q) => {
        if (statusFilter !== "הכול" && q.status !== statusFilter) return false;
        if (expiryFilter === "פג בקרוב" && !expiringSoon([q], today).length) return false;
        if (expiryFilter === "פג תוקף" && !(isExpired(q, today) || q.status === "פג תוקף"))
          return false;
        return true;
      }),
    [quotations, statusFilter, expiryFilter, today],
  );

  const filteredDocs = documents.filter(
    (d) => docTypeFilter === "הכול" || d.type === docTypeFilter,
  );

  const userName = (id: string): string => users.find((u) => u.id === id)?.name ?? id;

  const openEditor = (q: Quotation): void => {
    setDiscountError(null);
    setEditor({
      quotation: q,
      lines: q.lines.map((l) => ({ ...l })),
      discount: String(q.discountPercent),
      title: q.title,
      customerName: q.customerName,
      validUntil: q.validUntil.slice(0, 10),
      terms: q.terms,
    });
  };

  const newQuotation = async (): Promise<void> => {
    try {
      const repo = getRepository<Quotation>("quotations");
      const existing = await repo.list();
      const id = nextId(
        "q",
        existing.map((q) => q.id),
      );
      const now = new Date().toISOString();
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 14);
      const q = quotationSchema.parse({
        id,
        createdAt: now,
        updatedAt: now,
        customerName: "לקוח חדש",
        customerId: null,
        title: "הצעת מחיר חדשה",
        lines: [
          { id: `${id}-1`, description: "שורה חדשה", quantity: 1, unitPrice: 0, productId: null },
        ],
        discountPercent: 0,
        terms: "",
        validUntil: validUntil.toISOString().slice(0, 10),
        status: "טיוטה",
        ownerId: CEO_USER_ID,
      } satisfies Quotation);
      await repo.create(q);
      await invalidate(["quotations", "notifications"]);
      toast(`נוצרה טיוטה ${id}`, "success");
      openEditor(q);
    } catch {
      toast("יצירת ההצעה נכשלה — נסו שוב", "danger");
    }
  };

  const saveEditor = async (): Promise<void> => {
    if (!editor) return;
    const discountNum = Number(editor.discount);
    const err = validateDiscount(discountNum);
    if (err) {
      setDiscountError(err);
      return;
    }
    if (editor.lines.length === 0) {
      setDiscountError("הצעת מחיר חייבת לכלול לפחות שורה אחת");
      return;
    }
    if (editor.lines.some((l) => !l.description.trim() || l.quantity <= 0 || l.unitPrice < 0)) {
      setDiscountError("כל שורה חייבת תיאור, כמות חיובית ומחיר לא-שלילי");
      return;
    }
    setDiscountError(null);
    setBusy(true);
    try {
      const now = new Date().toISOString();
      await getRepository<Quotation>("quotations").update(editor.quotation.id, {
        title: editor.title.trim() || editor.quotation.title,
        customerName: editor.customerName.trim() || editor.quotation.customerName,
        lines: editor.lines,
        discountPercent: discountNum,
        validUntil: editor.validUntil,
        terms: editor.terms,
        updatedAt: now,
      });
      const v = bumpVersion(editor.quotation.id);
      setVersions(loadVersions());
      await invalidate(["quotations", "notifications"]);
      toast(`ההצעה נשמרה (גרסה ${v})`, "success");
      setEditor(null);
    } catch {
      toast("שמירת ההצעה נכשלה — נסו שוב", "danger");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (q: Quotation, status: QuotationStatus): Promise<void> => {
    try {
      await getRepository<Quotation>("quotations").update(q.id, {
        status,
        updatedAt: new Date().toISOString(),
      });
      await invalidate(["quotations", "notifications"]);
      toast(`הצעה ${q.id} עודכנה לסטטוס «${status}»`, "success");
    } catch {
      toast("עדכון הסטטוס נכשל — נסו שוב", "danger");
    }
  };

  const createFollowUpTask = async (q: Quotation): Promise<void> => {
    try {
      const repo = getRepository<Task>("tasks");
      const existing = await repo.list();
      const id = nextId(
        "task",
        existing.map((t) => t.id),
      );
      const now = new Date().toISOString();
      const task = taskSchema.parse({
        id,
        createdAt: now,
        updatedAt: now,
        title: `מעקב הצעה ${q.id} — ${q.customerName}`,
        description: `ההצעה «${q.title}» בתוקף עד ${dateHe(q.validUntil)} — לחדש או לסגור.`,
        status: "פתוחה",
        priority: "בינונית",
        due: q.validUntil.slice(0, 10),
        ownerId: q.ownerId,
        relatedRef: `quotation:${q.id}`,
      } satisfies Task);
      await repo.create(task);
      await invalidate(["tasks", "notifications"]);
      toast(`נוצרה משימת מעקב להצעה ${q.id}`, "success");
    } catch {
      toast("יצירת משימת המעקב נכשלה — נסו שוב", "danger");
    }
  };

  const printQuote = (q: Quotation): void => {
    const ok = openQuotationPrintView(q, userName(q.ownerId));
    if (!ok) toast("הדפדפן חסם את חלון ההדפסה — אפשרו חלונות קופצים", "warning");
  };

  if (quotationsQ.isError || documentsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="טעינת המסמכים נכשלה"
        reason="קריאת הנתונים מ-IndexedDB המקומי נכשלה. רעננו את הדף."
      />
    );
  }
  if (quotationsQ.isLoading || documentsQ.isLoading) {
    return (
      <div style={{ padding: "var(--os-space-6)", color: "var(--os-text-2)" }} role="status">
        טוען הצעות מחיר ומסמכים מהמאגר המקומי…
      </div>
    );
  }

  const editorTotals = editor
    ? quoteTotals(
        editor.lines,
        Number.isFinite(Number(editor.discount)) ? Number(editor.discount) : 0,
      )
    : null;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="documents-page">
      <PageRail>
        <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
          <div>
            <div style={railTitle}>פג תוקף בקרוב</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {expSoon.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>אין הצעות שפגות בשבוע הקרוב</span>
              ) : (
                expSoon.map((q) => (
                  <div key={q.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{q.customerName}</span>
                    <span className="os-num" style={{ color: "var(--os-warning)" }}>
                      {dateHe(q.validUntil)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div style={railTitle}>ממתינות להחלטת לקוח</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              {awaiting.length === 0 ? (
                <span style={{ color: "var(--os-muted)" }}>אין הצעות שנשלחו וממתינות</span>
              ) : (
                awaiting.map((q) => (
                  <div key={q.id} style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>{q.customerName}</span>
                    <span className="os-num">
                      {ils(quoteTotals(q.lines, q.discountPercent).grandTotal)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
          <div>
            <div style={railTitle}>צבר כספי</div>
            <div style={{ display: "grid", gap: 6, fontSize: "var(--os-text-sm, 12px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>פתוח</span>
                <span className="os-num" style={{ color: "var(--os-cyan)" }}>
                  {ils(pipeline.openValue)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>מאושר</span>
                <span className="os-num" style={{ color: "var(--os-success)" }}>
                  {ils(pipeline.approvedValue)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </PageRail>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--os-space-3)",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "var(--os-text-xl, 20px)" }}>מסמכים והצעות מחיר</h1>
        <OsButton icon="plus" onClick={() => void newQuotation()}>
          הצעת מחיר חדשה
        </OsButton>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
          gap: "var(--os-space-3)",
        }}
      >
        <KpiCard title="הצעות פתוחות" value={pipeline.openCount} accent="blue" icon="doc" />
        <KpiCard
          title="שווי פתוח"
          value={ils(pipeline.openValue)}
          accent="cyan"
          icon="briefcase"
          glow
        />
        <KpiCard title="פג תוקף בקרוב" value={expSoon.length} accent="warning" icon="alert" />
        <KpiCard title="מסמכים" value={documents.length} accent="violet" icon="doc" />
      </div>

      <Tabs
        ariaLabel="הצעות מחיר או מסמכים"
        items={[
          { id: "quotes", label: "הצעות מחיר", badge: quotations.length },
          { id: "docs", label: "מסמכים כלליים", badge: documents.length },
        ]}
        activeId={tab}
        onChange={(id) => setTab(id as "quotes" | "docs")}
      />

      {tab === "quotes" ? (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle
            title="הצעות מחיר"
            subtitle={`זרימת הסטטוסים: טיוטה ← נשלחה ← אושרה/נדחתה · הנחה מוגבלת ל-${MAX_DISCOUNT_PERCENT}% · מע"מ 18%`}
          />
          <div
            style={{
              display: "flex",
              gap: "var(--os-space-2)",
              marginBlock: "var(--os-space-3)",
              flexWrap: "wrap",
            }}
          >
            <select
              style={selStyle}
              aria-label="סינון לפי סטטוס"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            >
              <option value="הכול">כל הסטטוסים</option>
              {(["טיוטה", "נשלחה", "אושרה", "נדחתה", "פג תוקף"] as const).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <select
              style={selStyle}
              aria-label="סינון לפי תוקף"
              value={expiryFilter}
              onChange={(e) => setExpiryFilter(e.target.value as ExpiryFilter)}
            >
              <option value="הכול">כל התוקפים</option>
              <option value="פג בקרוב">פג בקרוב (7 ימים)</option>
              <option value="פג תוקף">פג תוקף</option>
            </select>
          </div>

          <DataTable<Quotation>
            rows={filteredQuotes}
            rowKey="id"
            emptyText="אין הצעות מחיר להצגה"
            emptyReason="הסינון הנוכחי לא תואם אף הצעה — נקו את הסינון או צרו הצעה חדשה."
            columns={[
              {
                key: "id",
                header: "מס'",
                render: (q) => <span className="os-num">{q.id}</span>,
              },
              { key: "customerName", header: "לקוח" },
              { key: "title", header: "כותרת" },
              {
                key: "total",
                header: 'סה"כ כולל מע"מ',
                render: (q) => (
                  <span className="os-num">
                    {ils(quoteTotals(q.lines, q.discountPercent).grandTotal)}
                  </span>
                ),
              },
              {
                key: "validUntil",
                header: "בתוקף עד",
                render: (q) => (
                  <span
                    className="os-num"
                    style={isExpired(q, today) ? { color: "var(--os-danger)" } : undefined}
                  >
                    {dateHe(q.validUntil)}
                  </span>
                ),
              },
              {
                key: "status",
                header: "סטטוס",
                render: (q) => (
                  <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                    {statusChip(q.status)}
                    <span
                      style={{ fontSize: "var(--os-text-2xs, 10px)", color: "var(--os-muted)" }}
                    >
                      גרסה <span className="os-num">{versions[q.id] ?? 1}</span>
                    </span>
                  </span>
                ),
              },
              {
                key: "ownerId",
                header: "בעלים",
                render: (q) => userName(q.ownerId),
              },
              {
                key: "actions",
                header: "פעולות",
                render: (q) => (
                  <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
                    {isEditable(q.status) ? (
                      <OsButton size="sm" variant="ghost" onClick={() => openEditor(q)}>
                        עריכה
                      </OsButton>
                    ) : (
                      <OsButton
                        size="sm"
                        variant="ghost"
                        disabled
                        disabledReason="רק טיוטה ניתנת לעריכה — החזירו לטיוטה כדי לערוך"
                      >
                        עריכה
                      </OsButton>
                    )}
                    {QUOTATION_NEXT_STATUS[q.status].map((s) => (
                      <OsButton
                        key={s}
                        size="sm"
                        variant={s === "אושרה" ? "approve" : s === "נדחתה" ? "reject" : "cyan"}
                        onClick={() => void changeStatus(q, s)}
                      >
                        {s === "נשלחה"
                          ? "שליחה"
                          : s === "אושרה"
                            ? "אישור"
                            : s === "נדחתה"
                              ? "דחייה"
                              : s}
                      </OsButton>
                    ))}
                    <OsButton
                      size="sm"
                      variant="ghost"
                      icon="doc"
                      data-testid={`print-${q.id}`}
                      onClick={() => printQuote(q)}
                    >
                      תצוגת הדפסה
                    </OsButton>
                    <OsButton
                      size="sm"
                      variant="ghost"
                      disabled
                      disabledReason="ייצוא PDF ייתמך בגל עתידי — השתמשו בתצוגת הדפסה"
                    >
                      PDF
                    </OsButton>
                    <OsButton size="sm" variant="ghost" onClick={() => void createFollowUpTask(q)}>
                      משימת מעקב
                    </OsButton>
                  </span>
                ),
              },
            ]}
          />
        </Panel>
      ) : (
        <Panel variant="panel" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle title="מסמכים כלליים" subtitle="מאגר המסמכים של המערכת" />
          <div
            style={{ display: "flex", gap: "var(--os-space-2)", marginBlock: "var(--os-space-3)" }}
          >
            <select
              style={selStyle}
              aria-label="סינון לפי סוג מסמך"
              value={docTypeFilter}
              onChange={(e) => setDocTypeFilter(e.target.value as "הכול" | "קובץ" | "קישור")}
            >
              <option value="הכול">כל הסוגים</option>
              <option value="קובץ">קובץ</option>
              <option value="קישור">קישור</option>
            </select>
          </div>
          <DataTable<Document>
            rows={filteredDocs}
            rowKey="id"
            emptyText="אין מסמכים להצגה"
            emptyReason="הסינון הנוכחי לא תואם אף מסמך."
            columns={[
              { key: "name", header: "שם" },
              { key: "type", header: "סוג" },
              { key: "description", header: "תיאור" },
              {
                key: "visible",
                header: "נראוּת",
                render: (d) =>
                  d.visible ? (
                    <StatusChip status="פעיל" label="גלוי" />
                  ) : (
                    <StatusChip status="מושבת" label="מוסתר" />
                  ),
              },
              {
                key: "url",
                header: "קישור",
                render: (d) =>
                  d.url ? (
                    <a
                      href={d.url}
                      target="_blank"
                      rel="noreferrer"
                      className="os-ltr"
                      style={{ color: "var(--os-cyan)" }}
                    >
                      פתיחה
                    </a>
                  ) : (
                    <span style={{ color: "var(--os-muted)" }}>קובץ מקומי (הדגמה)</span>
                  ),
              },
              {
                key: "ownerId",
                header: "בעלים",
                render: (d) => userName(d.ownerId),
              },
            ]}
          />
        </Panel>
      )}

      {/* quotation editor */}
      {editor && editorTotals && (
        <Modal
          open
          onClose={() => setEditor(null)}
          title={`עריכת הצעה ${editor.quotation.id} (גרסה ${versions[editor.quotation.id] ?? 1})`}
          footer={
            <div style={{ display: "flex", gap: "var(--os-space-2)" }}>
              {busy ? (
                <OsButton disabled disabledReason="שמירה מתבצעת…">
                  שמירה
                </OsButton>
              ) : (
                <OsButton data-testid="save-quote" onClick={() => void saveEditor()}>
                  שמירה
                </OsButton>
              )}
              <OsButton variant="ghost" onClick={() => setEditor(null)}>
                ביטול
              </OsButton>
            </div>
          }
        >
          <div style={{ display: "grid", gap: "var(--os-space-3)", maxInlineSize: 640 }}>
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--os-space-3)" }}
            >
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="qe-title">
                  כותרת
                </label>
                <input
                  id="qe-title"
                  className="os-qc-input"
                  value={editor.title}
                  onChange={(e) => setEditor({ ...editor, title: e.target.value })}
                />
              </div>
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="qe-customer">
                  לקוח
                </label>
                <input
                  id="qe-customer"
                  className="os-qc-input"
                  value={editor.customerName}
                  onChange={(e) => setEditor({ ...editor, customerName: e.target.value })}
                />
              </div>
            </div>

            {/* lines */}
            <div style={{ display: "grid", gap: 6 }}>
              <span className="os-qc-label">שורות ההצעה</span>
              {editor.lines.map((line, i) => (
                <div
                  key={line.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "minmax(0,2fr) 70px 100px auto",
                    gap: 6,
                    alignItems: "center",
                  }}
                >
                  <input
                    className="os-qc-input"
                    aria-label={`תיאור שורה ${i + 1}`}
                    value={line.description}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        lines: editor.lines.map((l, j) =>
                          j === i ? { ...l, description: e.target.value } : l,
                        ),
                      })
                    }
                  />
                  <input
                    className="os-qc-input"
                    type="number"
                    min={1}
                    aria-label={`כמות שורה ${i + 1}`}
                    data-testid={`line-qty-${i}`}
                    value={line.quantity}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        lines: editor.lines.map((l, j) =>
                          j === i ? { ...l, quantity: Number(e.target.value) } : l,
                        ),
                      })
                    }
                  />
                  <input
                    className="os-qc-input"
                    type="number"
                    min={0}
                    aria-label={`מחיר יחידה שורה ${i + 1}`}
                    data-testid={`line-price-${i}`}
                    value={line.unitPrice}
                    onChange={(e) =>
                      setEditor({
                        ...editor,
                        lines: editor.lines.map((l, j) =>
                          j === i ? { ...l, unitPrice: Number(e.target.value) } : l,
                        ),
                      })
                    }
                  />
                  <OsButton
                    size="sm"
                    variant="ghost"
                    icon="x"
                    aria-label={`הסרת שורה ${i + 1}`}
                    onClick={() =>
                      setEditor({ ...editor, lines: editor.lines.filter((_, j) => j !== i) })
                    }
                  >
                    הסרה
                  </OsButton>
                </div>
              ))}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <select
                  style={selStyle}
                  aria-label="הוספת שורה מהקטלוג"
                  value=""
                  onChange={(e) => {
                    const p = products.find((x) => x.id === e.target.value);
                    if (!p) return;
                    setEditor({
                      ...editor,
                      lines: [
                        ...editor.lines,
                        {
                          id: `${editor.quotation.id}-${Date.now()}`,
                          description: p.name,
                          quantity: 1,
                          unitPrice: p.price,
                          productId: p.id,
                        },
                      ],
                    });
                  }}
                >
                  <option value="">+ הוספה מהקטלוג (מוצרים, קורסים ושירותים)…</option>
                  {products
                    .filter((p) => p.active)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.price.toLocaleString("he-IL")} ₪
                      </option>
                    ))}
                </select>
                <OsButton
                  size="sm"
                  variant="ghost"
                  icon="plus"
                  onClick={() =>
                    setEditor({
                      ...editor,
                      lines: [
                        ...editor.lines,
                        {
                          id: `${editor.quotation.id}-${Date.now()}`,
                          description: "",
                          quantity: 1,
                          unitPrice: 0,
                          productId: null,
                        },
                      ],
                    })
                  }
                >
                  שורה חופשית
                </OsButton>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr 1fr",
                gap: "var(--os-space-3)",
              }}
            >
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="qe-discount">
                  הנחה (%)
                </label>
                <input
                  id="qe-discount"
                  className="os-qc-input"
                  type="number"
                  min={0}
                  data-testid="discount-input"
                  value={editor.discount}
                  onChange={(e) => {
                    setEditor({ ...editor, discount: e.target.value });
                    setDiscountError(validateDiscount(Number(e.target.value)));
                  }}
                />
              </div>
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="qe-valid">
                  בתוקף עד
                </label>
                <input
                  id="qe-valid"
                  className="os-qc-input"
                  type="date"
                  value={editor.validUntil}
                  onChange={(e) => setEditor({ ...editor, validUntil: e.target.value })}
                />
              </div>
              <div className="os-qc-field">
                <label className="os-qc-label" htmlFor="qe-terms">
                  תנאים
                </label>
                <input
                  id="qe-terms"
                  className="os-qc-input"
                  value={editor.terms}
                  onChange={(e) => setEditor({ ...editor, terms: e.target.value })}
                />
              </div>
            </div>
            {discountError && (
              <span className="os-qc-error" role="alert" data-testid="discount-error">
                {discountError}
              </span>
            )}

            {/* derived totals */}
            <div
              style={{
                borderBlockStart: "1px solid var(--os-border)",
                paddingBlockStart: "var(--os-space-3)",
                display: "grid",
                gap: 4,
                fontSize: "var(--os-text-sm, 13px)",
              }}
              data-testid="quote-totals"
            >
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>סכום ביניים</span>
                <span className="os-num" data-testid="subtotal">
                  {ils(editorTotals.subtotal)}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>הנחה</span>
                <span className="os-num">-{ils(editorTotals.discountAmount)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span>מע"מ (18%)</span>
                <span className="os-num" data-testid="vat">
                  {ils(editorTotals.vatAmount)}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontWeight: 700,
                  color: "var(--os-cyan)",
                }}
              >
                <span>סה"כ לתשלום</span>
                <span className="os-num" data-testid="grand-total">
                  {ils(editorTotals.grandTotal)}
                </span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
