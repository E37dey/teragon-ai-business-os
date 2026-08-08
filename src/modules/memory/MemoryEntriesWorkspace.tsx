// S13.4 (PR D) — the real local-memory CRUD workspace (primary /memory content).
// Durable IndexedDB persistence via the org-scoped MemoryEntryRepository. Light:
// one status notice, ≤3 indicators, one compact toolbar, one list, one editor.
// Synthetic/local only — no Obsidian, no cloud, no remote model.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { EmptyState, KpiCard, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import { useCollection } from "@/app/data/hooks";
import { useAuth } from "@/auth/useAuth";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS_HE,
  type MemoryCategory,
  type MemoryEntry,
} from "@/domain/memory/entry";
import {
  archiveMemoryEntry,
  createMemoryEntry,
  restoreMemoryEntry,
  updateMemoryEntry,
} from "@/memory/entries/memoryEntryRepository";

/** LOCAL demo active-org: identity org when present, else a stable demo org.
 *  Isolation is enforced in the repository; the UI operates in one org context. */
function useActiveMemoryOrg(): string {
  const { identity } = useAuth();
  return identity?.organizationId?.trim() || "org-1";
}

type EditorState =
  | { mode: "closed" }
  | { mode: "new" }
  | { mode: "edit"; id: string };

interface FormState {
  title: string;
  content: string;
  category: MemoryCategory;
  tags: string; // comma-separated in the field
}
const EMPTY_FORM: FormState = { title: "", content: "", category: "NOTE", tags: "" };

function parseTags(raw: string): string[] {
  return raw.split(",").map((t) => t.trim()).filter((t) => t.length > 0).slice(0, 20);
}

export function MemoryEntriesWorkspace(): ReactElement {
  const org = useActiveMemoryOrg();
  const all = useCollection<MemoryEntry>("memoryEntries");

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<MemoryCategory | "ALL">("ALL");
  const [showArchived, setShowArchived] = useState(false);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Client-side view over the active org's entries (mirrors the repo search).
  const orgEntries = useMemo(
    () => (all.data ?? []).filter((e) => e.organizationId === org),
    [all.data, org],
  );
  const activeCount = orgEntries.filter((e) => e.status === "ACTIVE").length;
  const archivedCount = orgEntries.filter((e) => e.status === "ARCHIVED").length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return orgEntries
      .filter((e) => (showArchived ? true : e.status === "ACTIVE"))
      .filter((e) => category === "ALL" || e.category === category)
      .filter((e) =>
        !q
          ? true
          : e.title.toLowerCase().includes(q) ||
            e.content.toLowerCase().includes(q) ||
            e.tags.some((t) => t.toLowerCase().includes(q)),
      )
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [orgEntries, query, category, showArchived]);

  function openNew(): void {
    setError(null);
    setForm(EMPTY_FORM);
    setEditor({ mode: "new" });
  }
  function openEdit(e: MemoryEntry): void {
    setError(null);
    setForm({ title: e.title, content: e.content, category: e.category, tags: e.tags.join(", ") });
    setEditor({ mode: "edit", id: e.id });
  }
  function closeEditor(): void {
    setEditor({ mode: "closed" });
    setError(null);
  }

  async function save(): Promise<void> {
    if (busy || editor.mode === "closed") return;
    setBusy(true);
    setError(null);
    const input = {
      title: form.title,
      content: form.content,
      category: form.category,
      tags: parseTags(form.tags),
      source: "user",
    };
    try {
      if (editor.mode === "new") await createMemoryEntry(org, input);
      else await updateMemoryEntry(org, editor.id, input);
      closeEditor();
    } catch (e) {
      // fail closed — never show a false success
      setError(e instanceof Error ? e.message : "השמירה נכשלה — לא בוצע שינוי.");
    } finally {
      setBusy(false);
    }
  }

  async function setArchived(e: MemoryEntry, archived: boolean): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (archived) await archiveMemoryEntry(org, e.id);
      else await restoreMemoryEntry(org, e.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "הפעולה נכשלה.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }} data-testid="memory-entries-workspace">
      <SectionTitle
        icon="memory"
        title="רשומות הזיכרון"
        subtitle="הערות, החלטות, תהליכים ולקחים — נשמרים במכשיר זה"
      />
      <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        זיכרון מקומי במכשיר זה — ללא Obsidian או שירות ענן.
      </div>

      {/* ≤3 indicators */}
      <div
        style={{ display: "grid", gap: "var(--os-space-4)", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))" }}
        data-testid="memory-entries-indicators"
      >
        <KpiCard title="זיכרונות פעילים" value={activeCount} accent="cyan" icon="memory" muted={activeCount === 0} />
        <KpiCard title="בארכיון" value={archivedCount} accent="blue" icon="doc" muted={archivedCount === 0} />
        <KpiCard title="מוצגים כעת" value={visible.length} accent="blue" icon="search" muted={visible.length === 0} />
      </div>

      {/* one compact toolbar */}
      <Panel style={{ padding: "var(--os-space-3)", display: "flex", gap: "var(--os-space-2)", flexWrap: "wrap", alignItems: "center" }}>
        <input
          className="os-qc-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="חיפוש בכותרת, תוכן ותגיות…"
          aria-label="חיפוש בזיכרון המקומי"
          style={{ flex: "1 1 12rem", minWidth: "10rem" }}
        />
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "var(--os-text-sm)" }}>
          <span className="os-visually-hidden">סינון לפי קטגוריה</span>
          <select
            className="os-qc-input"
            value={category}
            onChange={(e) => setCategory(e.target.value as MemoryCategory | "ALL")}
            aria-label="סינון לפי קטגוריה"
          >
            <option value="ALL">כל הקטגוריות</option>
            {MEMORY_CATEGORIES.map((c) => (
              <option key={c} value={c}>{MEMORY_CATEGORY_LABELS_HE[c]}</option>
            ))}
          </select>
        </label>
        <label style={{ display: "flex", gap: 4, alignItems: "center", fontSize: "var(--os-text-sm)" }}>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} aria-label="הצגת פריטים בארכיון" />
          כולל ארכיון
        </label>
        <OsButton size="sm" variant="primary" icon="sparkle" onClick={openNew} data-testid="memory-new">
          זיכרון חדש
        </OsButton>
      </Panel>

      {/* editor (inline; stacks under the toolbar at 390) */}
      {editor.mode !== "closed" && (
        <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)" }} data-testid="memory-editor">
          <strong>{editor.mode === "new" ? "זיכרון חדש" : "עריכת זיכרון"}</strong>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>כותרת</span>
            <input className="os-qc-input" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} aria-label="כותרת הזיכרון" />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>תוכן</span>
            <textarea className="os-qc-input" value={form.content} onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))} rows={4} aria-label="תוכן הזיכרון" />
          </label>
          <div style={{ display: "flex", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
            <label style={{ display: "grid", gap: 4, flex: "1 1 10rem" }}>
              <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>קטגוריה</span>
              <select className="os-qc-input" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as MemoryCategory }))} aria-label="קטגוריית הזיכרון">
                {MEMORY_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{MEMORY_CATEGORY_LABELS_HE[c]}</option>
                ))}
              </select>
            </label>
            <label style={{ display: "grid", gap: 4, flex: "1 1 12rem" }}>
              <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>תגיות (מופרדות בפסיק)</span>
              <input className="os-qc-input" value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} aria-label="תגיות הזיכרון" placeholder="לדוגמה: ממשל, לקוחות" />
            </label>
          </div>
          {error && <div role="alert" style={{ color: "var(--danger-text, #c0392b)", fontSize: "var(--os-text-sm)" }}>{error}</div>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {busy ? (
              <OsButton size="sm" variant="primary" disabled disabledReason="שומר…">שומר…</OsButton>
            ) : (
              <OsButton size="sm" variant="primary" icon="check" onClick={() => void save()} data-testid="memory-save">שמירה</OsButton>
            )}
            <OsButton size="sm" variant="ghost" onClick={closeEditor}>ביטול</OsButton>
          </div>
        </Panel>
      )}

      {/* one list */}
      <Panel style={{ padding: "var(--os-space-4)" }} data-testid="memory-entries-list">
        {all.isLoading ? (
          <div role="status" style={{ color: "var(--os-muted)", fontSize: "var(--os-text-sm)" }}>טוען זיכרון מקומי…</div>
        ) : visible.length === 0 ? (
          <EmptyState icon="memory" title="אין זיכרונות להצגה" reason={query || category !== "ALL" ? "אין תוצאות לסינון הנוכחי." : 'צרו זיכרון חדש עם הכפתור "זיכרון חדש".'} />
        ) : (
          <div style={{ display: "grid", gap: "var(--os-space-2)" }}>
            {visible.map((e) => (
              <div
                key={e.id}
                data-testid="memory-entry-row"
                style={{ display: "flex", gap: "var(--os-space-3)", justifyContent: "space-between", alignItems: "start", flexWrap: "wrap", borderBlockEnd: "1px solid var(--os-border)", paddingBlockEnd: "var(--os-space-2)" }}
              >
                <div style={{ display: "grid", gap: 2, flex: "1 1 16rem", minWidth: "12rem" }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <StatusChip status={e.status === "ACTIVE" ? "פעיל" : "מושבת"} label={MEMORY_CATEGORY_LABELS_HE[e.category]} />
                    <span style={{ fontWeight: "var(--os-weight-semibold)", fontSize: "var(--os-text-sm)" }}>{e.title}</span>
                  </div>
                  <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-text-2)" }}>
                    {e.content.length > 90 ? `${e.content.slice(0, 90)}…` : e.content}
                    {e.tags.length > 0 ? <span style={{ color: "var(--os-muted)" }}> · {e.tags.map((t) => `#${t}`).join(" ")}</span> : null}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <OsButton size="sm" variant="ghost" onClick={() => openEdit(e)} data-testid="memory-edit">עריכה</OsButton>
                  {e.status === "ACTIVE" ? (
                    <OsButton size="sm" variant="ghost" onClick={() => void setArchived(e, true)} data-testid="memory-archive">ארכוב</OsButton>
                  ) : (
                    <OsButton size="sm" variant="ghost" onClick={() => void setArchived(e, false)} data-testid="memory-restore">שחזור</OsButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
