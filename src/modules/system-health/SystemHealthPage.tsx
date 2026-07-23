// /system-health — בריאות המערכת (Wave 8, W8-D, Phase 8.10).
// All 15 components with their REAL check results. No fake green: before a
// check runs every component is honestly "טרם נבדק". Snapshots persist to the
// healthSnapshots collection; the diagnostic export is REDACTED JSON.
import { useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { PageRail } from "@/app/rail";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  DataTable,
  Drawer,
  EmptyState,
  KpiCard,
  OsButton,
  Panel,
  SectionTitle,
  StatusChip,
  useToast,
  type DataTableColumn,
} from "@/design-system";
import type { OsStatus } from "@/design-system/types";
import type { AgentTask, Approval } from "@/domain/types";
import {
  HEALTH_COMPONENT_IDS,
  type ComponentState,
  type SystemComponentHealth,
  type SystemHealthSnapshot,
} from "@/domain/system-health";
import {
  buildDiagnosticReport,
  checkMigrations,
  checkRepositories,
  checkSearchIndex,
  collectBuildInformation,
  diagnosticFileName,
  incidentJustified,
  openHealthIncident,
  productionHealthCheckEnv,
  takeAndPersistSnapshot,
  uncheckedComponent,
} from "@/system-health";
import { pendingApprovals } from "@/agents/selectors";
import {
  effectiveValue,
  productionSettingsStores,
  readSettingsRecord,
  settingDefinition,
} from "@/modules/settings/settingsStore";

// ---------------------------------------------------------------------------
// state → chip mapping (one honest color per state)
// ---------------------------------------------------------------------------

const STATE_CHIP: Record<ComponentState, OsStatus> = {
  תקין: "פעיל",
  מוגבל: "אזהרה",
  "דורש תשומת לב": "מושהה",
  "לא זמין": "חסום",
  "לא הוגדר": "מושבת",
  "לא ניתן למדידה": "מושבת",
  "טרם נבדק": "ממתין",
};

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

function fmtTs(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString("he-IL", {
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
}

function busyProps(busy: boolean): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: "בדיקה קודמת עדיין רצה" } : {};
}

function busyProps2(
  locked: boolean,
  reason: string,
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return locked ? { disabled: true, disabledReason: reason } : {};
}

/** browser download of the redacted JSON (no-op outside a real browser) */
function downloadJson(json: string, fileName: string): boolean {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") return false;
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
  return true;
}

const INITIAL_COMPONENTS: SystemComponentHealth[] = HEALTH_COMPONENT_IDS.map((id) =>
  uncheckedComponent(id),
);

// ---------------------------------------------------------------------------
// page
// ---------------------------------------------------------------------------

export default function SystemHealthPage(): ReactElement {
  const { toast } = useToast();
  const invalidate = useInvalidateCollections();
  const snapshotsQ = useCollection<SystemHealthSnapshot>("healthSnapshots");
  const approvalsQ = useCollection<Approval>("approvals");
  const agentTasksQ = useCollection<AgentTask>("agentTasks");

  const [components, setComponents] = useState<SystemComponentHealth[]>(INITIAL_COMPONENTS);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const build = useMemo(() => collectBuildInformation(), []);
  const snapshots = useMemo(
    () => [...(snapshotsQ.data ?? [])].sort((a, b) => b.takenAt.localeCompare(a.takenAt)),
    [snapshotsQ.data],
  );
  const lastSnapshot = snapshots[0] ?? null;
  const pending = useMemo(() => pendingApprovals(approvalsQ.data ?? []), [approvalsQ.data]);
  const blockedTasks = useMemo(
    () => (agentTasksQ.data ?? []).filter((t) => t.status === "ממתין לאישור"),
    [agentTasksQ.data],
  );

  const attention = components.filter(
    (c) => c.state === "דורש תשומת לב" || c.state === "מוגבל",
  );
  const failed = components.filter((c) => c.state === "לא זמין");
  const unchecked = components.filter(
    (c) => c.state === "טרם נבדק" || c.state === "לא הוגדר" || c.state === "לא ניתן למדידה",
  );
  const ok = components.filter((c) => c.state === "תקין");

  const selected = components.find((c) => c.componentId === selectedId) ?? null;

  // ── actions ──────────────────────────────────────────────────────────────
  const runAll = (): void => {
    setBusy(true);
    void (async () => {
      try {
        const settings = await readSettingsRecord(productionSettingsStores());
        const size = effectiveValue(settings, settingDefinition("interface.tablePageSize"));
        if (typeof size === "number") setPageSize(size);
        const snapshot = await takeAndPersistSnapshot(productionHealthCheckEnv());
        setComponents(snapshot.components);
        setHistoryPage(0);
        await invalidate(["healthSnapshots", "meta", "auditEvents"]);
        toast(
          `בדיקת הבריאות הושלמה — ${snapshot.okCount} תקינים, ${snapshot.attentionCount} דורשים תשומת לב`,
          snapshot.attentionCount + snapshot.unavailableCount > 0 ? "warning" : "success",
        );
      } catch {
        toast("בדיקת הבריאות נכשלה — נסו שוב", "danger");
      } finally {
        setBusy(false);
      }
    })();
  };

  const runSingle = (
    label: string,
    run: (env: ReturnType<typeof productionHealthCheckEnv>) => Promise<SystemComponentHealth>,
  ): void => {
    setBusy(true);
    void (async () => {
      try {
        const result = await run(productionHealthCheckEnv());
        setComponents((prev) => prev.map((c) => (c.componentId === result.componentId ? result : c)));
        await invalidate(["meta"]);
        toast(`${label}: ${result.state}`, result.state === "תקין" ? "success" : "warning");
      } catch {
        toast(`${label} — הבדיקה נכשלה`, "danger");
      } finally {
        setBusy(false);
      }
    })();
  };

  const exportDiagnostics = (): void => {
    if (!lastSnapshot) return;
    const { report, json } = buildDiagnosticReport(lastSnapshot, "צחי זוסטייהם");
    const okDownload = downloadJson(json, diagnosticFileName());
    toast(
      okDownload
        ? `דוח אבחון מושמט-סודות הורד (${report.redactionCount} השמטות)`
        : "הורדה אינה זמינה בסביבה זו",
      okDownload ? "success" : "warning",
    );
  };

  const openIncident = (component: SystemComponentHealth): void => {
    void (async () => {
      try {
        const incident = await openHealthIncident(
          { collection: (key) => productionHealthCheckEnv().collection(key) },
          component,
          "צחי זוסטייהם",
        );
        await invalidate(["governanceIncidents"]);
        toast(`נפתח אירוע ${incident.id} — יטופל בעמוד הממשל`, "success");
      } catch (err) {
        toast(err instanceof Error ? err.message : "פתיחת האירוע נכשלה", "danger");
      }
    })();
  };

  // ── table ────────────────────────────────────────────────────────────────
  const columns: DataTableColumn<SystemComponentHealth>[] = [
    { key: "name", header: "רכיב", render: (c) => <b>{c.nameHe}</b> },
    {
      key: "state",
      header: "מצב",
      render: (c) => <StatusChip status={STATE_CHIP[c.state]} label={c.state} />,
    },
    {
      key: "lastCheck",
      header: "בדיקה אחרונה",
      render: (c) => <span className="os-num">{fmtTs(c.lastCheck)}</span>,
    },
    {
      key: "rt",
      header: "זמן תגובה",
      numeric: true,
      render: (c) =>
        c.responseTimeMs === null ? (
          <span style={{ color: "var(--os-muted)" }}>לא נמדד</span>
        ) : (
          <span className="os-table__num">{c.responseTimeMs}ms</span>
        ),
    },
    {
      key: "detail",
      header: "ממצא",
      render: (c) => (
        <span style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)" }}>{c.detailHe}</span>
      ),
    },
  ];

  const historyRows = snapshots.slice(historyPage * pageSize, (historyPage + 1) * pageSize);
  const historyPages = Math.max(1, Math.ceil(snapshots.length / pageSize));

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <HealthRail
          attention={attention}
          failed={failed}
          pendingApprovals={pending.length}
          blockedQueues={blockedTasks.length}
          lastSnapshotAt={lastSnapshot?.takenAt ?? null}
        />
      </PageRail>

      <SectionTitle
        icon="gauge"
        title="בריאות המערכת"
        subtitle="כל מצב נובע מבדיקה אמיתית שרצה — רכיב שלא נבדק מוצג ״טרם נבדק״, לעולם לא ירוק מזויף"
        action={
          <OsButton icon="gauge" {...busyProps(busy)} onClick={runAll}>
            הרצת בדיקת בריאות מקומית
          </OsButton>
        }
      />

      <div style={kpiRowStyle}>
        <KpiCard title="תקינים (נמדדו)" value={ok.length} accent="success" icon="check" />
        <KpiCard
          title="דורשים תשומת לב"
          value={attention.length}
          accent="warning"
          icon="alert"
          glow={attention.length > 0}
        />
        <KpiCard title="לא זמינים" value={failed.length} accent="danger" icon="x" />
        <KpiCard title="טרם נבדקו / לא נמדדים" value={unchecked.length} accent="blue" icon="clock" />
      </div>

      <div style={{ display: "flex", gap: "var(--os-space-3)", flexWrap: "wrap" }}>
        <OsButton
          variant="ghost"
          icon="check"
          {...busyProps(busy)}
          onClick={() => runSingle("אימות repositories", checkRepositories)}
        >
          אימות Repositories
        </OsButton>
        <OsButton
          variant="ghost"
          icon="check"
          {...busyProps(busy)}
          onClick={() => runSingle("אימות מיגרציות", checkMigrations)}
        >
          אימות מיגרציות
        </OsButton>
        <OsButton
          variant="ghost"
          icon="search"
          {...busyProps(busy)}
          onClick={() => runSingle("אימות אינדקס החיפוש", checkSearchIndex)}
        >
          אימות אינדקס החיפוש
        </OsButton>
        {lastSnapshot ? (
          <OsButton variant="cyan" icon="doc" onClick={exportDiagnostics}>
            ייצוא דוח אבחון (מושמט-סודות)
          </OsButton>
        ) : (
          <OsButton
            variant="cyan"
            icon="doc"
            disabled
            disabledReason="אין עדיין תצלום בריאות — הריצו בדיקת בריאות תחילה"
          >
            ייצוא דוח אבחון (מושמט-סודות)
          </OsButton>
        )}
      </div>

      <DataTable
        columns={columns}
        rows={components}
        rowKey={(c) => c.componentId}
        onRowClick={(c) => setSelectedId(c.componentId)}
        emptyText="אין רכיבים"
        emptyReason="רשימת הרכיבים לא נטענה."
      />

      <div
        style={{
          display: "grid",
          gap: "var(--os-space-5)",
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
        }}
      >
        <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle icon="memory" title="אחסון" />
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
            {lastSnapshot ? lastSnapshot.storage.detailHe : "טרם נמדד — הריצו בדיקת בריאות"}
            {lastSnapshot?.storage.measured && lastSnapshot.storage.usageBytes !== null && (
              <div className="os-num" style={{ marginBlockStart: "var(--os-space-2)" }}>
                {(lastSnapshot.storage.usageBytes / (1024 * 1024)).toFixed(1)}MB בשימוש
                {lastSnapshot.storage.quotaBytes !== null &&
                  ` מתוך ${(lastSnapshot.storage.quotaBytes / (1024 * 1024)).toFixed(0)}MB`}
              </div>
            )}
          </div>
        </Panel>
        <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle icon="network" title="מיגרציות" />
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
            {lastSnapshot ? (
              <>
                {lastSnapshot.migration.detailHe}
                <div style={{ marginBlockStart: "var(--os-space-2)" }}>
                  הוחלו{" "}
                  <span className="os-num">
                    {lastSnapshot.migration.appliedMigrations}/
                    {lastSnapshot.migration.registeredMigrations}
                  </span>
                  {lastSnapshot.migration.pendingMigrations.length > 0 &&
                    ` · ממתינות: ${lastSnapshot.migration.pendingMigrations.join(", ")}`}
                </div>
              </>
            ) : (
              "טרם נבדק — הריצו בדיקת בריאות"
            )}
          </div>
        </Panel>
        <Panel variant="raised" style={{ padding: "var(--os-space-5)" }}>
          <SectionTitle icon="doc" title="מידע Build" />
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)", display: "grid", gap: 4 }}>
            <div>
              מצב: <span className="os-num">{build.mode}</span>
            </div>
            <div>גרסה: {build.appVersion}</div>
            <div>קומיט: {build.commit}</div>
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{build.detailHe}</div>
          </div>
        </Panel>
      </div>

      <div>
        <SectionTitle
          icon="clock"
          title="היסטוריית תצלומי בריאות"
          subtitle={`${snapshots.length} תצלומים שמורים · ${pageSize} לעמוד (מהגדרות הממשק)`}
        />
        {snapshots.length === 0 ? (
          <EmptyState
            title="אין תצלומים"
            reason="טרם הורצה בדיקת בריאות — התצלום הראשון יישמר אחרי ההרצה הראשונה."
          />
        ) : (
          <>
            <DataTable
              columns={historyColumns}
              rows={historyRows}
              rowKey={(s) => s.id}
              emptyText="אין תצלומים"
              emptyReason="אין תצלומים בעמוד זה."
            />
            {historyPages > 1 && (
              <div style={{ display: "flex", gap: "var(--os-space-3)", marginBlockStart: "var(--os-space-3)" }}>
                <OsButton
                  variant="ghost"
                  size="sm"
                  {...busyProps2(historyPage === 0, "זהו העמוד הראשון")}
                  onClick={() => setHistoryPage((p) => Math.max(0, p - 1))}
                >
                  הקודם
                </OsButton>
                <span className="os-num" style={{ color: "var(--os-muted)", alignSelf: "center" }}>
                  {historyPage + 1}/{historyPages}
                </span>
                <OsButton
                  variant="ghost"
                  size="sm"
                  {...busyProps2(historyPage >= historyPages - 1, "זהו העמוד האחרון")}
                  onClick={() => setHistoryPage((p) => Math.min(historyPages - 1, p + 1))}
                >
                  הבא
                </OsButton>
              </div>
            )}
          </>
        )}
      </div>

      {selected && (
        <ComponentDrawer component={selected} onClose={() => setSelectedId(null)} onOpenIncident={openIncident} />
      )}
    </div>
  );
}

const historyColumns: DataTableColumn<SystemHealthSnapshot>[] = [
  {
    key: "at",
    header: "מועד",
    render: (s) => <span className="os-num">{fmtTs(s.takenAt)}</span>,
  },
  { key: "ok", header: "תקינים", numeric: true, render: (s) => <span className="os-table__num">{s.okCount}</span> },
  {
    key: "attention",
    header: "דורשים תשומת לב",
    numeric: true,
    render: (s) => <span className="os-table__num">{s.attentionCount}</span>,
  },
  {
    key: "unavailable",
    header: "לא זמינים",
    numeric: true,
    render: (s) => <span className="os-table__num">{s.unavailableCount}</span>,
  },
  {
    key: "unchecked",
    header: "לא נמדדו",
    numeric: true,
    render: (s) => <span className="os-table__num">{s.uncheckedCount}</span>,
  },
];

// ---------------------------------------------------------------------------
// component drawer — the full per-component contract fields
// ---------------------------------------------------------------------------

function ComponentDrawer({
  component,
  onClose,
  onOpenIncident,
}: {
  component: SystemComponentHealth;
  onClose: () => void;
  onOpenIncident: (c: SystemComponentHealth) => void;
}): ReactElement {
  const rows: readonly [string, string][] = [
    ["מצב", component.state],
    ["שיטת הבדיקה", component.checkMethodHe],
    ["בדיקה אחרונה", fmtTs(component.lastCheck)],
    ["זמן תגובה", component.responseTimeMs === null ? "לא נמדד" : `${component.responseTimeMs}ms`],
    ["הצלחה אחרונה", fmtTs(component.lastSuccess)],
    ["כשל אחרון", fmtTs(component.lastFailure)],
    ["מגבלה", component.limitationHe ?? "—"],
    ["פעולה מומלצת", component.recommendedActionHe ?? "—"],
    ["ממצא", component.detailHe],
  ];
  return (
    <Drawer open onClose={onClose} title={component.nameHe}>
      <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
        <StatusChip status={STATE_CHIP[component.state]} label={component.state} />
        <Panel variant="raised" style={{ padding: "var(--os-space-4)", display: "grid", gap: 6 }}>
          {rows.map(([label, value]) => (
            <div key={label} style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: 8 }}>
              <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{label}</span>
              <span style={{ fontSize: "var(--os-text-sm)", color: "var(--os-text-2)" }}>{value}</span>
            </div>
          ))}
        </Panel>
        {incidentJustified(component) ? (
          <OsButton variant="danger" icon="alert" onClick={() => onOpenIncident(component)}>
            פתיחת אירוע ממשל מקושר
          </OsButton>
        ) : (
          <OsButton
            variant="ghost"
            icon="alert"
            disabled
            disabledReason={`אירוע נפתח רק ממצב הדורש טיפול — המצב הנוכחי «${component.state}» אינו מצדיק אירוע`}
          >
            פתיחת אירוע ממשל מקושר
          </OsButton>
        )}
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
          אירועים נכתבים לאוסף governanceIncidents ומטופלים בעמוד הממשל (/governance).
        </div>
      </div>
    </Drawer>
  );
}

// ---------------------------------------------------------------------------
// rail
// ---------------------------------------------------------------------------

function HealthRail({
  attention,
  failed,
  pendingApprovals: pendingCount,
  blockedQueues,
  lastSnapshotAt,
}: {
  attention: readonly SystemComponentHealth[];
  failed: readonly SystemComponentHealth[];
  pendingApprovals: number;
  blockedQueues: number;
  lastSnapshotAt: string | null;
}): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)", fontSize: "var(--os-text-sm)" }}>
      <div>
        <div style={railTitle}>רכיבים הדורשים תשומת לב</div>
        {attention.length === 0 ? (
          <div style={{ color: "var(--os-muted)" }}>אין — לפי הבדיקות שרצו</div>
        ) : (
          attention.map((c) => (
            <div key={c.componentId} style={railRow}>
              <span>{c.nameHe}</span>
              <span style={{ color: "var(--os-warning)" }}>{c.state}</span>
            </div>
          ))
        )}
      </div>
      <div>
        <div style={railTitle}>בדיקות שנכשלו</div>
        {failed.length === 0 ? (
          <div style={{ color: "var(--os-muted)" }}>אין בדיקות שנכשלו</div>
        ) : (
          failed.map((c) => (
            <div key={c.componentId} style={railRow}>
              <span>{c.nameHe}</span>
              <span style={{ color: "var(--os-danger)" }}>{c.state}</span>
            </div>
          ))
        )}
      </div>
      <div>
        <div style={railTitle}>ממשל</div>
        <div style={railRow}>
          <span>אישורים ממתינים</span>
          <span className="os-num" style={{ color: pendingCount > 0 ? "var(--os-warning)" : "var(--os-muted)" }}>
            {pendingCount}
          </span>
        </div>
        <div style={railRow}>
          <span>תורים חסומים לאישור</span>
          <span className="os-num" style={{ color: blockedQueues > 0 ? "var(--os-warning)" : "var(--os-muted)" }}>
            {blockedQueues}
          </span>
        </div>
      </div>
      <div>
        <div style={railTitle}>גיבוי</div>
        <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
          תצלום בריאות אחרון: <span className="os-num">{lastSnapshotAt ? fmtTs(lastSnapshotAt) : "טרם נשמר"}</span>
          <br />
          גיבוי חיצוני אוטומטי לא הוגדר — הייצוא הידני (זיכרון/אבחון) הוא מנגנון הגיבוי הקיים.
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
