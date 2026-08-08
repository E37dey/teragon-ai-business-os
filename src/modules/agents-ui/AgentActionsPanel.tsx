// S11.3 — the per-agent business-actions panel (progressive disclosure):
// one selected agent · one primary + one secondary action · one result panel.
// Deterministic local rules only — the honest engine label is always shown.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link } from "react-router-dom";
import { EmptyState, OsButton, OsIcon, Panel, StatusChip, type OsStatus } from "@/design-system";
import {
  getActionsForAgent,
  runAgentAction,
  LOCAL_ENGINE_LABEL,
  type AgentActionDefinition,
  type AgentActionResult,
} from "@/agents/actions";

const STATUS_CHIP: Record<AgentActionResult["status"], { label: string; status: OsStatus }> = {
  ok: { label: "הושלם", status: "פעיל" },
  applied: { label: "הוחל", status: "פעיל" },
  empty: { label: "אין ממצאים", status: "ממתין" },
  awaiting_approval: { label: "ממתין לאישור", status: "ממתין" },
  validation_error: { label: "קלט לא תקין", status: "מושבת" },
  execution_error: { label: "תקלה", status: "מושבת" },
};

function InputField({
  spec,
  value,
  onChange,
}: {
  spec: AgentActionDefinition["requiredInputs"][number];
  value: string;
  onChange: (v: string) => void;
}): ReactElement {
  const id = `aa-${spec.id}`;
  return (
    <label htmlFor={id} style={{ display: "grid", gap: 4 }}>
      <span style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>{spec.labelHe}</span>
      {spec.kind === "select" ? (
        <select id={id} className="os-qc-input" value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">— בחירה —</option>
          {(spec.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.labelHe}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={id}
          className="os-qc-input"
          value={value}
          placeholder={spec.placeholderHe ?? ""}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

export function AgentActionsPanel({
  agentId,
  initialInputs,
  onResult,
}: {
  agentId: string;
  /** S13.3: optional pre-filled inputs (used by AI Workspace user-triggered handoff). */
  initialInputs?: Readonly<Record<string, string>>;
  /** S13.3: optional callback invoked with each engine result (recent-activity feed). */
  onResult?: (result: AgentActionResult, actionId: string) => void;
}): ReactElement {
  const actions = useMemo(() => getActionsForAgent(agentId), [agentId]);
  const [activeId, setActiveId] = useState<string>(actions[0]?.id ?? "");
  const [inputs, setInputs] = useState<Record<string, string>>(initialInputs ? { ...initialInputs } : {});
  const [result, setResult] = useState<AgentActionResult | null>(null);
  const [running, setRunning] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showWhy, setShowWhy] = useState(true);
  const [done, setDone] = useState<Set<string>>(new Set()); // local completion tracking

  const active = actions.find((a) => a.id === activeId) ?? actions[0];

  function selectAction(id: string): void {
    setActiveId(id);
    setInputs({});
    setResult(null);
    setShowEvidence(false);
  }

  function run(approved = false): void {
    if (!active || running) return;
    setRunning(true);
    // deterministic + synchronous; defer once so the loading state paints + is testable
    queueMicrotask(() => {
      const r = runAgentAction(active.id, inputs, approved ? { approved: true } : {});
      setResult(r);
      setRunning(false);
      onResult?.(r, active.id);
    });
  }

  if (!active) return <EmptyState title="לסוכן זה אין פעולות עסקיות מוגדרות" />;

  const chip = result ? STATUS_CHIP[result.status] : null;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }} data-testid="agent-actions-panel">
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status="ממתין" label="דמו מקומי" />
        <span className="os-ltr" style={{ fontSize: "var(--os-text-2xs)", color: "var(--os-muted)" }}>
          {LOCAL_ENGINE_LABEL}
        </span>
      </div>

      {/* one primary + one secondary action */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {actions.map((a, i) => (
          <OsButton
            key={a.id}
            variant={a.id === active.id ? (i === 0 ? "primary" : "cyan") : "ghost"}
            size="sm"
            onClick={() => selectAction(a.id)}
            aria-pressed={a.id === active.id}
          >
            {a.titleHe}
          </OsButton>
        ))}
      </div>

      <p style={{ margin: 0, fontSize: "var(--os-text-sm)", color: "var(--os-muted)" }}>
        {active.descriptionHe}
      </p>

      {active.requiredInputs.length > 0 && (
        <div style={{ display: "grid", gap: 8 }}>
          {active.requiredInputs.map((spec) => (
            <InputField
              key={spec.id}
              spec={spec}
              value={inputs[spec.id] ?? ""}
              onChange={(v) => setInputs((p) => ({ ...p, [spec.id]: v }))}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {running ? (
          <OsButton variant="primary" size="sm" disabled disabledReason="מריץ…" icon="sparkle">
            מריץ…
          </OsButton>
        ) : (
          <OsButton variant="primary" size="sm" onClick={() => run(false)} icon="sparkle">
            הרצה
          </OsButton>
        )}
        {result && !running && (
          <OsButton variant="ghost" size="sm" onClick={() => run(false)}>
            הרצה חוזרת
          </OsButton>
        )}
      </div>

      {running && (
        <div role="status" style={{ fontSize: "var(--os-text-sm)", color: "var(--os-muted)" }}>
          מריץ מנוע חוקים מקומי…
        </div>
      )}

      {result && !running && (
        <Panel variant="raised" style={{ display: "grid", gap: "var(--os-space-3)", padding: "var(--os-space-4)" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {chip && <StatusChip status={chip.status} label={chip.label} />}
            {result.why.isProposalOnly && <StatusChip status="ממתין" label="הצעה בלבד" />}
          </div>
          <p style={{ margin: 0, fontWeight: "var(--os-weight-semibold)" }}>{result.summary}</p>

          {result.status === "empty" && <EmptyState title="לא נמצאו ממצאים רלוונטיים" />}

          {result.findings.length > 0 && (
            <ul style={{ margin: 0, paddingInlineStart: "1.1rem", display: "grid", gap: 4 }}>
              {result.findings.map((f) => (
                <li key={f.id} style={{ fontSize: "var(--os-text-sm)" }}>{f.textHe}</li>
              ))}
            </ul>
          )}

          {result.recommendations.length > 0 && (
            <div style={{ display: "grid", gap: 4 }}>
              {result.recommendations.map((r) => (
                <label key={r.id} style={{ display: "flex", gap: 8, alignItems: "start", fontSize: "var(--os-text-sm)" }}>
                  <input
                    type="checkbox"
                    checked={done.has(r.id)}
                    onChange={(e) =>
                      setDone((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) next.add(r.id);
                        else next.delete(r.id);
                        return next;
                      })
                    }
                    aria-label={`סימון הושלם: ${r.textHe}`}
                  />
                  <span>
                    {r.textHe}
                    {r.ownerHe ? <span style={{ color: "var(--os-muted)" }}> · {r.ownerHe}</span> : null}
                    {r.navigationTarget ? (
                      <>
                        {" "}
                        <Link to={r.navigationTarget}>מעבר →</Link>
                      </>
                    ) : null}
                  </span>
                </label>
              ))}
            </div>
          )}

          {/* approval gate for local-demo mutations */}
          {result.status === "awaiting_approval" && (
            <OsButton variant="approve" size="sm" icon="check" onClick={() => run(true)}>
              אישור והחלה (דמו מקומי)
            </OsButton>
          )}

          {/* "why" — the five mandatory explanations */}
          <details open={showWhy} onToggle={(e) => setShowWhy((e.target as HTMLDetailsElement).open)}>
            <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm)" }}>למה התקבלה ההמלצה?</summary>
            <dl style={{ margin: "6px 0 0", display: "grid", gap: 4, fontSize: "var(--os-text-sm)" }}>
              <WhyRow label="מה נמצא" value={result.why.foundHe} />
              <WhyRow label="למה זה חשוב" value={result.why.importanceHe} />
              <WhyRow label="על סמך אילו נתונים" value={result.why.basedOnHe} />
              <WhyRow label="מה מומלץ" value={result.why.recommendedHe} />
              <WhyRow label="האם זו הצעה בלבד" value={result.why.isProposalOnly ? "כן — הצעה בלבד" : "לא"} />
            </dl>
          </details>

          {/* evidence — progressive disclosure */}
          {result.evidence.length > 0 && (
            <details open={showEvidence} onToggle={(e) => setShowEvidence((e.target as HTMLDetailsElement).open)}>
              <summary style={{ cursor: "pointer", fontSize: "var(--os-text-sm)" }}>
                ראיות ({result.evidence.length})
              </summary>
              <ul style={{ margin: "6px 0 0", paddingInlineStart: "1.1rem", display: "grid", gap: 2 }}>
                {result.evidence.map((e) => (
                  <li key={`${e.kind}-${e.refId}`} style={{ fontSize: "var(--os-text-xs)", color: "var(--os-muted)" }}>
                    {e.labelHe} <span className="os-ltr">({e.kind})</span>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {result.navigationTarget && (
            <Link to={result.navigationTarget} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
              <OsIcon name="chevron-forward" size={12} aria-hidden="true" />
              מעבר למסך הרלוונטי
            </Link>
          )}
        </Panel>
      )}
    </div>
  );
}

function WhyRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 8rem) minmax(0, 1fr)", gap: 6 }}>
      <dt style={{ color: "var(--os-muted)" }}>{label}</dt>
      <dd style={{ margin: 0 }}>{value}</dd>
    </div>
  );
}
