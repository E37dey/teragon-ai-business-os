// S17 Phase 7 — the executive "Daily Operations Brief" + "Action Inbox" for the AI-operations
// layer, shown on the existing Command Center (no second dashboard). Every count/card/badge derives
// from REAL Phase-5/6 workflow events + live Obsidian connectivity via deriveBusinessSignals — no
// fabricated urgency, risk, or activity. Honest empty states. The workflow/proposal signals are
// RUNTIME-ONLY (current session) — stated in the UI; Obsidian connectivity is live (one check on
// mount + explicit Refresh, no polling). Signals never auto-start a workflow: each CTA is an
// explicit human navigation into the deep context.
import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Panel, SectionTitle, StatusChip, OsButton, EmptyState } from "@/design-system";
import type { OsStatus } from "@/design-system";
import { getAllWorkflowEvents, subscribeWorkflowEvents } from "@/agents/workflow/workflowEvents";
import { getConnectionInfo } from "@/integration/obsidian/vaultBridgeClient";
import { getObsidianToken } from "@/integration/obsidian/obsidianCredential";
import {
  actionableSignals,
  countSignals,
  deriveBusinessSignals,
  infoSignals,
  type BusinessSignal,
  type SignalPriority,
} from "@/integration/command-center/businessSignals";
import { GovernedFollowUpTaskModal } from "./GovernedFollowUpTaskModal";

const PRIORITY_CHIP: Record<SignalPriority, OsStatus> = { דחוף: "חסום", אזהרה: "אזהרה", מידע: "מושבת" };
const row: CSSProperties = { display: "flex", gap: "var(--os-space-2)", alignItems: "center", flexWrap: "wrap" };
const muted: CSSProperties = { color: "var(--os-text-2)" };
const code2xs: CSSProperties = { fontFamily: "var(--os-font-mono, monospace)", direction: "ltr", unicodeBidi: "isolate", fontSize: "var(--os-text-2xs, 11px)" };

type Filter = "all" | "awaiting" | "failed";

function useObsidianConnected(): { connected: boolean | null; recheck: () => void; checking: boolean } {
  const [connected, setConnected] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const recheck = useCallback(() => {
    const token = getObsidianToken();
    if (!token) {
      setConnected(null); // never paired → unknown; we do not invent a "disconnected" alarm
      return;
    }
    setChecking(true);
    getConnectionInfo(token)
      .then((r) => setConnected(r.ok && !!r.data?.connected))
      .catch(() => setConnected(false))
      .finally(() => setChecking(false));
  }, []);
  useEffect(() => {
    recheck();
  }, [recheck]); // single check on mount (no polling)
  return { connected, recheck, checking };
}

export function OperationsBrief(): ReactElement {
  const navigate = useNavigate();
  const [version, bump] = useReducer((x: number) => x + 1, 0);
  const { connected, recheck, checking } = useObsidianConnected();
  const [filter, setFilter] = useState<Filter>("all");

  // Re-derive whenever a real workflow event is recorded this session (reactive, no polling).
  useEffect(() => subscribeWorkflowEvents(() => bump()), []);

  const signals = useMemo(
    () => deriveBusinessSignals({ events: getAllWorkflowEvents(), obsidian: connected == null ? null : { connected }, now: Date.now() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `version` intentionally forces a re-derive when a real workflow event is recorded (via subscribeWorkflowEvents)
    [connected, version],
  );
  const counts = useMemo(() => countSignals(signals), [signals]);
  const inbox = useMemo(() => {
    const items = actionableSignals(signals);
    if (filter === "awaiting") return items.filter((s) => s.type === "workflow_waiting_for_user" || s.type === "proposal_pending");
    if (filter === "failed") return items.filter((s) => s.type === "workflow_failed" || s.type === "proposal_conflict" || s.type === "obsidian_unavailable");
    return items;
  }, [signals, filter]);
  const recent = useMemo(() => infoSignals(signals), [signals]);

  const open = useCallback((s: BusinessSignal) => navigate(s.deepLink), [navigate]);
  // Phase-9 Governed Follow-up Task — an explicit per-signal capability (no auto-proposal).
  const [followUpSignal, setFollowUpSignal] = useState<BusinessSignal | null>(null);

  return (
    <Panel variant="raised" style={{ padding: "var(--os-space-5)" }} data-testid="operations-brief">
      <div style={{ ...row, justifyContent: "space-between" }}>
        <SectionTitle title="מרכז תפעול — מה דורש טיפול עכשיו?" subtitle="אותות תפעול חיים מתהליכי ה-AI · תצוגת הפעלה נוכחית" icon="sparkle" />
        <div style={{ display: "flex", gap: "var(--os-space-2)", alignItems: "center", flexWrap: "wrap" }}>
          {/* Phase-8 launch CTA — opens the workflow pack (does NOT auto-start it). */}
          <OsButton variant="cyan" size="sm" onClick={() => navigate("/ai-workspace?pack=governed-knowledge-capture")} data-testid="ops-launch-pack">
            תעד ידע מבוקר
          </OsButton>
          <OsButton variant="ghost" size="sm" onClick={recheck} data-testid="ops-refresh" aria-label="רענון">
            {checking ? "בודק…" : "רענון"}
          </OsButton>
        </div>
      </div>

      {/* Counts — derived from the SAME signals below; click to filter to exactly those records. */}
      <div style={{ ...row, gap: "var(--os-space-2)", marginBlock: "var(--os-space-3)" }} data-testid="ops-counts">
        <CountChip label="ממתין להחלטה" value={counts.awaitingDecision} active={filter === "awaiting"} onClick={() => setFilter(filter === "awaiting" ? "all" : "awaiting")} testid="count-awaiting" />
        <CountChip label="נכשל / התנגשות" value={counts.failed} active={filter === "failed"} onClick={() => setFilter(filter === "failed" ? "all" : "failed")} testid="count-failed" />
        <CountChip label="הושלם לאחרונה" value={counts.recentlyCompleted} testid="count-completed" />
        <CountChip label="דורש חיבור מחדש" value={counts.needsReconnect} testid="count-reconnect" />
      </div>

      {/* Action Inbox — only items where a human decision/step is genuinely valid. The heading and
          empty state live OUTSIDE role="list" (a list must contain only listitem children). */}
      <div data-testid="action-inbox" style={{ display: "grid", gap: "var(--os-space-2)" }}>
        <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>תיבת פעולות ({inbox.length})</b>
        {inbox.length === 0 ? (
          <EmptyState icon="check" title="אין כרגע פריטים הדורשים החלטה" reason="כאשר תהליך ימתין להחלטה, הצעה תמתין לאישור או תהליך ייכשל — הם יופיעו כאן." />
        ) : (
          <div role="list" aria-label="תיבת פעולות" style={{ display: "grid", gap: "var(--os-space-2)" }}>
            {inbox.map((s) => (
              <div key={s.id} role="listitem" data-testid="inbox-item" data-type={s.type} style={cardStyle(s.priority)}>
                <div style={{ ...row, justifyContent: "space-between" }}>
                  <span style={{ fontWeight: 700, fontSize: "var(--os-text-sm, 13px)" }}>{s.titleHe}</span>
                  <StatusChip status={PRIORITY_CHIP[s.priority]} label={s.priority} />
                </div>
                <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>{s.detailHe}</div>
                <div style={{ ...muted, ...code2xs }}>
                  {s.workflowRunId ? <>run={s.workflowRunId} </> : null}
                  {s.proposalId ? <>· proposal={s.proposalId} </> : null}
                  {s.agentId ? <>· agent={s.agentId} </> : null}
                  {s.notePath ? <>· note={s.notePath}</> : null}
                </div>
                <div style={row}>
                  <OsButton variant="cyan" size="sm" onClick={() => open(s)} data-testid="inbox-cta">
                    {s.recommendedNextStepHe}
                  </OsButton>
                  {/* Governed Follow-up Task: explicit human capability — does NOT auto-create a proposal. */}
                  <OsButton variant="ghost" size="sm" onClick={() => setFollowUpSignal(s)} data-testid="inbox-followup-cta">
                    צור משימת מעקב
                  </OsButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {followUpSignal && <GovernedFollowUpTaskModal signal={followUpSignal} onClose={() => setFollowUpSignal(null)} onChanged={() => bump()} />}

      {/* Recent verified activity — informational, NOT the inbox. */}
      <div data-testid="recent-activity" style={{ marginTop: "var(--os-space-4)", display: "grid", gap: "var(--os-space-2)" }}>
        <b style={{ fontSize: "var(--os-text-sm, 13px)" }}>פעילות מאומתת לאחרונה ({recent.length})</b>
        {recent.length === 0 ? (
          <div style={{ ...muted, fontSize: "var(--os-text-2xs, 12px)" }}>אין פעילות מאומתת בחלון הזמן הנוכחי.</div>
        ) : (
          <ul style={{ margin: 0, paddingInlineStart: "var(--os-space-4)", display: "grid", gap: 4 }}>
            {recent.map((s) => (
              <li key={s.id} data-testid="recent-item">
                <button type="button" onClick={() => open(s)} style={{ background: "none", border: "none", padding: 0, textAlign: "start", cursor: "pointer", color: "var(--os-text)", font: "inherit" }}>
                  <span style={{ fontSize: "var(--os-text-2xs, 12px)" }}>{s.titleHe} — </span>
                  <span style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)" }}>{s.detailHe}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Persistence-truth footnote — no pretending runtime-only data is a historical report. */}
      <div style={{ ...muted, fontSize: "var(--os-text-2xs, 11px)", marginTop: "var(--os-space-3)" }}>
        אותות התהליכים הם תצוגה חיה של ההפעלה הנוכחית (עד 20 הרצות אחרונות, נמחקות ברענון הדף) — אינם דוח היסטורי קבוע. חיבור Obsidian נבדק בכניסה ובלחיצת רענון בלבד.
      </div>
    </Panel>
  );
}

function CountChip({ label, value, active, onClick, testid }: { label: string; value: number; active?: boolean; onClick?: () => void; testid: string }): ReactElement {
  const zero = value === 0;
  const content = (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
      <span className="os-num" style={{ fontWeight: 700, fontSize: "var(--os-text-lg, 18px)", color: zero ? "var(--os-text-2)" : "var(--os-text)" }}>{value}</span>
      <span style={{ fontSize: "var(--os-text-2xs, 11px)", ...muted }}>{label}</span>
    </span>
  );
  const style: CSSProperties = { padding: "var(--os-space-2) var(--os-space-3)", borderRadius: "var(--os-radius-sm, 8px)", border: `1px solid ${active ? "var(--os-highlight, var(--os-cyan-text))" : "var(--os-border)"}`, background: active ? "var(--os-bg-2)" : "transparent" };
  return onClick ? (
    <button type="button" onClick={onClick} data-testid={testid} aria-pressed={!!active} style={{ ...style, cursor: "pointer", font: "inherit" }}>
      {content}
    </button>
  ) : (
    <div data-testid={testid} style={style}>{content}</div>
  );
}

function cardStyle(priority: SignalPriority): CSSProperties {
  const border = priority === "דחוף" ? "var(--os-danger, #c0392b)" : priority === "אזהרה" ? "var(--os-warning, #E5A93D)" : "var(--os-border)";
  return { display: "grid", gap: 4, border: `1px solid ${border}`, borderRadius: "var(--os-radius-sm, 8px)", padding: "var(--os-space-3)", background: "var(--os-surface-1, transparent)" };
}
