// /settings — הגדרות (Wave 8, W8-D, Phase 8.11).
// Seven controlled groups. Every control is honest: editable settings apply
// for real; anything unimplemented is disabled WITH its reason; RTL cannot be
// toggled; there is NO API-key / password input anywhere in this page —
// provider secrets live server-side only (docs/AI_PROVIDER_SETUP.md).
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  KpiCard,
  Modal,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  Tabs,
  useToast,
} from "@/design-system";
import type { AuditEvent } from "@/domain/types";
import { useDemoModeGuard, resetDeterministicData, setDemoModeActive } from "@/presentation/demoMode";
import { presentationStores } from "@/presentation/stores";
import {
  SETTING_DEFINITIONS,
  SETTING_GROUPS,
  SETTING_GROUP_LABELS_HE,
  SettingChangeError,
  applyDecidedSettingApprovals,
  applyUiSettings,
  definitionsForGroup,
  effectiveValue,
  productionSettingsStores,
  readSettingsRecord,
  setSetting,
  settingDefinition,
  type SettingDefinition,
  type SettingGroupId,
  type SettingValue,
  type SettingsRecord,
} from "./settingsStore";

const ACTOR = "צחי זוסטייהם";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

function fmtTs(iso: string | null | undefined): string {
  if (!iso) return "מעולם לא שונה";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("he-IL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function lockProps(
  locked: boolean,
  reason: string,
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return locked ? { disabled: true, disabledReason: reason } : {};
}

export default function SettingsPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const { active: demoActive, guard } = useDemoModeGuard();
  const auditQ = useCollection<AuditEvent>("auditEvents");

  const [record, setRecord] = useState<SettingsRecord | null>(null);
  const [group, setGroup] = useState<SettingGroupId>("business");
  const [busy, setBusy] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  // load + reconcile decided approvals + apply real UI settings on mount
  useEffect(() => {
    void (async () => {
      const stores = productionSettingsStores();
      const sync = await applyDecidedSettingApprovals(stores);
      const rec = await readSettingsRecord(stores);
      setRecord(rec);
      applyUiSettings(rec);
      if (sync.applied.length > 0) {
        toast(`הוחלו ${sync.applied.length} שינויים שאושרו במרכז האישורים`, "success");
        await invalidate(["meta", "auditEvents"]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settingAudit = useMemo(
    () =>
      (auditQ.data ?? [])
        .filter((a) => a.action.startsWith("setting-change:"))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 8),
    [auditQ.data],
  );

  const pendingCount = record ? Object.keys(record.pending).length : 0;
  const editableCount = SETTING_DEFINITIONS.filter((d) => d.editable).length;

  const change = (def: SettingDefinition, value: SettingValue): void => {
    if (!record) return;
    const verdict = guard(`שינוי ההגדרה «${def.labelHe}»`);
    if (!verdict.allowed && def.key !== "demo.destructiveProtection") {
      toast(verdict.reasonHe, "warning");
      return;
    }
    setBusy(true);
    void (async () => {
      try {
        const stores = productionSettingsStores();
        const result = await setSetting(stores, def.key, value, ACTOR);
        const rec = await readSettingsRecord(stores);
        setRecord(rec);
        applyUiSettings(rec);
        if (def.key === "demo.destructiveProtection") {
          setDemoModeActive(Boolean(value));
        }
        await invalidate(["meta", "auditEvents", "approvals"]);
        toast(
          result.status === "applied"
            ? `«${def.labelHe}» עודכן`
            : `«${def.labelHe}» ממתין לאישור במרכז האישורים (${result.approvalId})`,
          result.status === "applied" ? "success" : "info",
        );
      } catch (err) {
        toast(err instanceof SettingChangeError ? err.reasonHe : "שינוי ההגדרה נכשל", "danger");
      } finally {
        setBusy(false);
      }
    })();
  };

  const runReset = (): void => {
    setResetOpen(false);
    setBusy(true);
    void (async () => {
      try {
        const result = await resetDeterministicData(presentationStores());
        await invalidate([
          "customers",
          "leads",
          "tasks",
          "meta",
          "auditEvents",
          "healthSnapshots",
          "demoSteps",
        ]);
        const stores = productionSettingsStores();
        const rec = await readSettingsRecord(stores);
        setRecord(rec);
        toast(
          `נתוני ההדגמה אופסו — נוקו ${result.clearedCollections} אוספים, נזרעו מחדש ${result.reseededCollections}`,
          "success",
        );
      } catch {
        toast("איפוס נתוני ההדגמה נכשל", "danger");
      } finally {
        setBusy(false);
      }
    })();
  };

  const requestReset = (): void => {
    const verdict = guard("איפוס נתוני ההדגמה");
    if (!verdict.allowed) {
      toast(verdict.reasonHe, "warning");
      return;
    }
    if (!record) return;
    const needConfirm = effectiveValue(record, settingDefinition("security.destructiveConfirm"));
    if (needConfirm === true) setResetOpen(true);
    else runReset();
  };

  if (!record) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>טוען הגדרות…</Panel>
    );
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <SettingsRail record={record} pendingCount={pendingCount} audit={settingAudit} />
      </PageRail>

      <SectionTitle
        icon="gear"
        title="הגדרות"
        subtitle="כל הגדרה מוקלדת ומאומתת (zod) · הגדרה לא ממומשת מושבתת עם סיבה — אין מתגים מתים · אין קלט מפתחות בדפדפן"
      />

      <div style={kpiRowStyle}>
        <KpiCard title="הגדרות מנוהלות" value={SETTING_DEFINITIONS.length} accent="cyan" icon="gear" />
        <KpiCard title="ניתנות לעריכה" value={editableCount} accent="blue" icon="check" />
        <KpiCard
          title="ממתינות לאישור"
          value={pendingCount}
          accent="warning"
          icon="clock"
          glow={pendingCount > 0}
        />
        <KpiCard
          title="מצב הדגמה"
          value={demoActive ? "פעיל" : "כבוי"}
          accent={demoActive ? "warning" : "success"}
          icon="shield"
        />
      </div>

      <Tabs
        ariaLabel="קבוצות ההגדרות"
        items={SETTING_GROUPS.map((g) => ({
          id: g,
          label: SETTING_GROUP_LABELS_HE[g],
          badge: definitionsForGroup(g).length,
        }))}
        activeId={group}
        onChange={(id) => setGroup(id as SettingGroupId)}
      />

      {group === "ai" && (
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          הגדרת ספק מרוחק (מפתחות, מודל, תקציב) נעשית אך ורק בצד השרת — אין ולא יהיה שדה מפתח
          בדפדפן. ההוראות המלאות: <code dir="ltr">docs/AI_PROVIDER_SETUP.md</code>.
        </Panel>
      )}

      {group === "demo" && (
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: "var(--os-space-4)" }}>
          <div style={{ color: "var(--os-warning)", fontSize: "var(--os-text-sm)" }}>
            כל הנתונים במערכת הם נתוני הדגמה סינתטיים ודטרמיניסטיים — אין כאן נתוני לקוחות אמיתיים.
          </div>
          <div style={{ display: "flex", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
            <OsButton
              variant="danger"
              icon="alert"
              {...lockProps(busy, "פעולה קודמת עדיין רצה")}
              onClick={requestReset}
            >
              איפוס נתוני הדגמה דטרמיניסטי
            </OsButton>
            <Link to="/submission/presentation" style={{ textDecoration: "none" }}>
              <OsButton variant="cyan" icon="sparkle">
                מצב הדגמה לבוחן (מצגת)
              </OsButton>
            </Link>
          </div>
        </Panel>
      )}

      <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
        {definitionsForGroup(group).map((def) => (
          <SettingRow
            key={def.key}
            def={def}
            record={record}
            busy={busy}
            onChange={(v) => change(def, v)}
          />
        ))}
      </div>

      {resetOpen && (
        <ResetConfirmModal onConfirm={runReset} onClose={() => setResetOpen(false)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// setting row
// ---------------------------------------------------------------------------

function SettingRow({
  def,
  record,
  busy,
  onChange,
}: {
  def: SettingDefinition;
  record: SettingsRecord;
  busy: boolean;
  onChange: (value: SettingValue) => void;
}): ReactElement {
  const value = effectiveValue(record, def);
  const pending = record.pending[def.key];
  const changed = record.lastChanged[def.key];
  const [draft, setDraft] = useState<string>(String(value));
  const controlId = `set-${def.key.replace(/\./g, "-")}`;
  const locked = !def.editable || busy || pending !== undefined;
  const lockReason = !def.editable
    ? (def.readOnlyReasonHe ?? "הגדרה לתצוגה בלבד")
    : pending !== undefined
      ? `שינוי ממתין לאישור (${pending.approvalId}) — עד להחלטה אין שינוי נוסף`
      : "פעולה קודמת עדיין רצה";

  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-3)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
        <div style={{ fontWeight: 600 }}>
          {def.labelHe}
          {def.sensitive && (
            <span style={{ marginInlineStart: 8 }}>
              <StatusChip status="דורש אישור" label="רגיש — עם ביקורת" />
            </span>
          )}
          {pending && (
            <span style={{ marginInlineStart: 8 }}>
              <StatusChip status="ממתין" label={`ממתין לאישור: ${String(pending.requestedValue)}`} />
            </span>
          )}
        </div>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          בעלים: {def.owner} · שונה לאחרונה: <span className="os-num">{fmtTs(changed?.at)}</span>
        </div>
      </div>
      <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>{def.explanationHe}</div>
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>טווח מותר: {def.allowedHe}</div>

      <div style={{ display: "flex", gap: "var(--os-space-3)", alignItems: "center", flexWrap: "wrap" }}>
        {def.control === "toggle" && (
          <label
            htmlFor={controlId}
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "var(--os-text-sm)" }}
            title={locked ? lockReason : undefined}
          >
            <input
              id={controlId}
              type="checkbox"
              checked={Boolean(value)}
              disabled={locked}
              aria-label={def.labelHe}
              onChange={(e) => onChange(e.target.checked)}
            />
            {value === true ? "פעיל" : "כבוי"}
          </label>
        )}
        {def.control === "select" && (
          <select
            id={controlId}
            className="os-qc-input"
            style={{ maxInlineSize: 200 }}
            value={String(value)}
            disabled={locked}
            aria-label={def.labelHe}
            title={locked ? lockReason : undefined}
            onChange={(e) => onChange(e.target.value)}
          >
            {(def.options ?? [String(value)]).map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        )}
        {(def.control === "text" || def.control === "number") &&
          (def.editable ? (
            <>
              <input
                id={controlId}
                className="os-qc-input"
                style={{ maxInlineSize: 240 }}
                type="text"
                inputMode={def.control === "number" ? "numeric" : undefined}
                value={draft}
                disabled={locked}
                aria-label={def.labelHe}
                title={locked ? lockReason : undefined}
                onChange={(e) => setDraft(e.target.value)}
              />
              <OsButton
                size="sm"
                icon="check"
                {...lockProps(locked, lockReason)}
                onClick={() =>
                  onChange(def.control === "number" ? Number(draft.trim()) : draft.trim())
                }
              >
                שמירה
              </OsButton>
            </>
          ) : (
            <span className="os-num" style={{ fontSize: "var(--os-text-sm)" }}>
              {String(value)}
            </span>
          ))}
        {!def.editable && (
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            {def.readOnlyReasonHe}
          </span>
        )}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------
// destructive reset confirm (consumer of security.destructiveConfirm)
// ---------------------------------------------------------------------------

const RESET_CONFIRM_WORD = "אפס";

function ResetConfirmModal({
  onConfirm,
  onClose,
}: {
  onConfirm: () => void;
  onClose: () => void;
}): ReactElement {
  const [typed, setTyped] = useState("");
  const match = typed.trim() === RESET_CONFIRM_WORD;
  return (
    <Modal
      open
      onClose={onClose}
      title="אישור כפול — איפוס נתוני הדגמה"
      footer={
        <div style={{ display: "flex", gap: "var(--os-space-3)" }}>
          <OsButton
            variant="danger"
            icon="alert"
            {...lockProps(!match, `יש להקליד «${RESET_CONFIRM_WORD}» כדי לאשר`)}
            onClick={onConfirm}
          >
            איפוס עכשיו
          </OsButton>
          <OsButton variant="ghost" onClick={onClose}>
            ביטול
          </OsButton>
        </div>
      }
    >
      <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
          הפעולה מוחקת את כל האוספים וזורעת מחדש את נתוני ההדגמה הדטרמיניסטיים. הגנת האישור הכפול
          פעילה (security.destructiveConfirm). להמשך הקלידו: <b>{RESET_CONFIRM_WORD}</b>
        </div>
        <input
          className="os-qc-input"
          aria-label="מילת אישור"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </div>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// rail
// ---------------------------------------------------------------------------

function SettingsRail({
  record,
  pendingCount,
  audit,
}: {
  record: SettingsRecord;
  pendingCount: number;
  audit: readonly AuditEvent[];
}): ReactElement {
  const changedKeys = Object.keys(record.lastChanged);
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>מצב ההגדרות</div>
        <div style={railRow}>
          <span>שונו מברירת המחדל</span>
          <span className="os-num">{changedKeys.length}</span>
        </div>
        <div style={railRow}>
          <span>ממתינות לאישור</span>
          <span className="os-num" style={{ color: pendingCount > 0 ? "var(--os-warning)" : "var(--os-muted)" }}>
            {pendingCount}
          </span>
        </div>
      </div>
      <div>
        <div style={railTitle}>ביקורת הגדרות אחרונה</div>
        {audit.length === 0 ? (
          <div style={{ color: "var(--os-muted)" }}>אין רישומי ביקורת הגדרות עדיין</div>
        ) : (
          audit.map((a) => (
            <div key={a.id} style={{ marginBlockEnd: "var(--os-space-3)", color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>
              <span className="os-num" style={{ color: "var(--os-muted)" }}>
                {fmtTs(a.at)}
              </span>{" "}
              · {a.details}
            </div>
          ))
        )}
      </div>
      <div>
        <div style={railTitle}>אבטחת מפתחות</div>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          מפתחות ספקים נשמרים בצד השרת בלבד. אין שדה מפתח או סיסמה בעמוד זה — בכוונה.
        </div>
      </div>
    </div>
  );
}

const railTitle: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 600,
  marginBlockEnd: "var(--os-space-3)",
};
const railRow: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  gap: "var(--os-space-3)",
  marginBlockEnd: "var(--os-space-3)",
};
