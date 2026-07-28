// /faq — FAQ והתנגדויות (Wave 7, W7-D, spec chapter 17).
// Objections workspace: the 7 mandated objections (bridged idempotently into
// the canonical `objections` collection), full LACE response per objection,
// and the deterministic conversation simulator in the rail — honestly labeled
// "הערכה דטרמיניסטית מבוססת כללים — טרם נמדד", envelope-honest, no fake score.
import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { PageRail } from "@/app/rail";
import { EmptyState, KpiCard, OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import type { Persona, User } from "@/domain/types";
import type { AIResponseEnvelopeV2 } from "@/domain/ai/envelope";
import { confidenceDisplayHe } from "@/domain/ai/envelope";
import { DEMO_DATA_LABEL } from "@/repositories/seed";
import { useCollection, useInvalidateCollections } from "@/app/data/hooks";
import {
  ensureCanonicalObjections,
  evaluateLaceResponse,
  LACE_SIMULATOR_HONESTY_LABEL,
  laceEnvelope,
  type LaceEvaluation,
  type ObjectionRecord,
} from "@/domain/training-materials";

const kpiRowStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
  gap: "var(--os-space-5)",
};

const fieldLabel: CSSProperties = {
  color: "var(--os-muted)",
  fontSize: "var(--os-text-2xs)",
  fontWeight: 600,
};
const fieldText: CSSProperties = {
  color: "var(--os-text-2)",
  fontSize: "var(--os-text-sm)",
  lineHeight: 1.7,
};

export default function FaqPage(): ReactElement {
  const objectionsQ = useCollection<ObjectionRecord>("objections");
  const personasQ = useCollection<Persona>("personas");
  const usersQ = useCollection<User>("users");
  const invalidate = useInvalidateCollections();
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bridged, setBridged] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void ensureCanonicalObjections().then((result) => {
      if (cancelled) return;
      setBridged(true);
      if (result.createdKeys.length > 0 || result.updatedKeys.length > 0) {
        void invalidate(["objections"]);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [invalidate]);

  const objections = useMemo(() => objectionsQ.data ?? [], [objectionsQ.data]);
  const personas = personasQ.data ?? [];
  const users = usersQ.data ?? [];
  const selected =
    objections.find((o) => o.key === selectedKey) ?? objections[0] ?? null;

  if (objectionsQ.isError) {
    return (
      <EmptyState
        icon="alert"
        title="שגיאה בטעינת ההתנגדויות"
        reason="קריאת ה-repositories נכשלה — נסו לרענן את הדף."
      />
    );
  }
  if (objectionsQ.isLoading || !bridged) {
    return (
      <Panel style={{ padding: "var(--os-space-8)", color: "var(--os-text-2)" }}>
        טוען את סביבת ההתנגדויות…
      </Panel>
    );
  }

  const reviewed = objections.filter((o) => o.reviewStatus === "נבדק בשיחה אמיתית").length;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-6)" }}>
      <PageRail>
        <SimulatorRail objections={objections} personas={personas} selected={selected} />
      </PageRail>

      <SectionTitle icon="users" title="FAQ והתנגדויות" subtitle={DEMO_DATA_LABEL} />

      <div style={kpiRowStyle}>
        <KpiCard title="התנגדויות מתועדות" value={objections.length} accent="cyan" icon="users" />
        <KpiCard
          title="עם מענה LACE מלא"
          value={objections.filter((o) => hasFullLace(o)).length}
          accent="success"
          icon="check"
        />
        <KpiCard title="נבדקו בשיחה אמיתית" value={reviewed} accent="blue" icon="mic" />
        <KpiCard
          title="ממתינות לבדיקת שטח"
          value={objections.filter((o) => o.reviewStatus === "טרם נבדק בשטח").length}
          accent="warning"
          icon="clock"
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 2.4fr)",
          gap: "var(--os-space-6)",
          alignItems: "start",
        }}
      >
        {/* objection list */}
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          <SectionTitle icon="inbox" title="התנגדויות נפוצות" />
          {objections.map((o) => {
            const active = selected?.key === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setSelectedKey(o.key)}
                className="os-panel"
                style={{
                  textAlign: "start",
                  padding: "var(--os-space-4)",
                  cursor: "pointer",
                  border: active ? "1px solid var(--os-cyan)" : "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-md)",
                  background: active ? "rgba(32,196,232,0.08)" : "var(--os-panel)",
                  color: "var(--os-text)",
                  fontSize: "var(--os-text-sm)",
                  fontWeight: active ? 700 : 500,
                }}
              >
                ״{o.surfaceStatement}״
                <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", marginBlockStart: 4 }}>
                  {personas.find((p) => p.id === o.personaId)?.name ?? o.personaId} · {o.reviewStatus}
                </div>
              </button>
            );
          })}
        </div>

        {/* selected objection detail */}
        {selected ? (
          <ObjectionDetail objection={selected} personas={personas} users={users} />
        ) : (
          <EmptyState icon="inbox" title="אין התנגדויות" reason="רשומות ההתנגדות טרם נטענו." />
        )}
      </div>
    </div>
  );
}

function hasFullLace(o: ObjectionRecord): boolean {
  return (
    o.lace.listenHe.length > 0 &&
    o.lace.acknowledgeHe.length > 0 &&
    o.lace.confirmHe.length > 0 &&
    o.lace.exploreHe.length > 0
  );
}

// ── objection detail (center column) ────────────────────────────────────────
function ObjectionDetail({
  objection,
  personas,
  users,
}: {
  objection: ObjectionRecord;
  personas: readonly Persona[];
  users: readonly User[];
}): ReactElement {
  const persona = personas.find((p) => p.id === objection.personaId);
  const owner = users.find((u) => u.id === objection.ownerId)?.name ?? "לא הוקצה אחראי";
  const laceSteps: { en: string; he: string; sentence: string }[] = [
    { en: "Listen", he: "הקשבה", sentence: objection.lace.listenHe },
    { en: "Acknowledge", he: "הכרה בחשש", sentence: objection.lace.acknowledgeHe },
    { en: "Confirm", he: "וידוא הבנה", sentence: objection.lace.confirmHe },
    { en: "Explore", he: "חקירה משותפת", sentence: objection.lace.exploreHe },
  ];
  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <Panel variant="raised" style={{ padding: "var(--os-space-6)", display: "grid", gap: "var(--os-space-4)" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <b style={{ color: "var(--os-text)", fontSize: "var(--os-text-xl)" }}>
            ״{objection.surfaceStatement}״
          </b>
          <StatusChip
            status={objection.reviewStatus === "נבדק בשיחה אמיתית" ? "הושלם" : "ממתין"}
            label={objection.reviewStatus}
          />
        </div>
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          <div>
            <div style={fieldLabel}>מה נאמר</div>
            <div style={fieldText}>״{objection.surfaceStatement}״</div>
          </div>
          <div>
            <div style={fieldLabel}>החשש שמתחת</div>
            <div style={fieldText}>{objection.underlyingConcern}</div>
          </div>
          <div>
            <div style={fieldLabel}>פרסונה מושפעת</div>
            <div style={fieldText}>{persona?.name ?? objection.personaId}</div>
          </div>
          <div>
            <div style={fieldLabel}>סיכון קשור</div>
            <div style={fieldText}>{objection.relatedRisk}</div>
          </div>
          <div>
            <div style={fieldLabel}>אחראי/ת</div>
            <div style={fieldText}>{owner}</div>
          </div>
        </div>
      </Panel>

      {/* LACE */}
      <div>
        <SectionTitle icon="mic" title="מענה LACE — משפט מוצע לכל שלב" />
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          {laceSteps.map((step, i) => (
            <Panel key={step.en} style={{ padding: "var(--os-space-4)", display: "grid", gap: 4 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span className="os-chip os-chip--cyan">
                  {i + 1} · {step.en}
                </span>
                <span style={{ color: "var(--os-text)", fontWeight: 600, fontSize: "var(--os-text-sm)" }}>
                  {step.he}
                </span>
              </div>
              <div style={fieldText}>{step.sentence}</div>
            </Panel>
          ))}
        </div>
      </div>

      {/* evidence + follow-up */}
      <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
        <SectionTitle icon="evidence" title="ראיות תומכות" />
        {objection.supportingEvidence.map((ev) => (
          <div key={ev.label} style={{ fontSize: "var(--os-text-sm)" }}>
            {ev.route ? (
              <Link to={ev.route} style={{ color: "var(--os-cyan-text)", fontWeight: 600 }}>
                ← {ev.label} <span dir="ltr">({ev.route})</span>
              </Link>
            ) : (
              <span style={{ color: "var(--os-text)" }}>{ev.label}</span>
            )}
            <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{ev.note}</div>
          </div>
        ))}
        <div>
          <div style={fieldLabel}>חומר הדרכה קשור</div>
          <div style={fieldText}>
            {objection.relatedMaterialId ? (
              <Link to="/training-materials" style={{ color: "var(--os-cyan-text)" }}>
                {objection.relatedMaterialId} — במרכז חומרי ההדרכה
              </Link>
            ) : (
              "לא קושר חומר"
            )}
          </div>
        </div>
        <div>
          <div style={fieldLabel}>שאלת המשך מומלצת</div>
          <div style={{ ...fieldText, color: "var(--os-cyan-text)" }}>{objection.followUpQuestion}</div>
        </div>
      </div>
    </div>
  );
}

// ── rail: conversation simulator ────────────────────────────────────────────
function SimulatorRail({
  objections,
  personas,
  selected,
}: {
  objections: readonly ObjectionRecord[];
  personas: readonly Persona[];
  selected: ObjectionRecord | null;
}): ReactElement {
  const [objectionKey, setObjectionKey] = useState<string | null>(null);
  const [response, setResponse] = useState("");
  const [result, setResult] = useState<{
    evaluation: LaceEvaluation;
    envelope: AIResponseEnvelopeV2;
  } | null>(null);

  const objection =
    objections.find((o) => o.key === objectionKey) ?? selected ?? objections[0] ?? null;
  const persona = objection ? personas.find((p) => p.id === objection.personaId) : undefined;

  function runSimulation(): void {
    if (!objection) return;
    const evaluation = evaluateLaceResponse(objection, response);
    setResult({ evaluation, envelope: laceEnvelope(objection, evaluation) });
  }

  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)", fontSize: "var(--os-text-sm)" }}>
      <div style={{ color: "var(--os-text)", fontWeight: 700 }}>סימולטור שיחה</div>
      <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
        {LACE_SIMULATOR_HONESTY_LABEL}
      </div>

      <div style={{ display: "grid", gap: 6 }}>
        <label className="os-qc-label" htmlFor="sim-objection">
          פרסונה והתנגדות
        </label>
        <select
          id="sim-objection"
          className="os-qc-input"
          value={objection?.key ?? ""}
          onChange={(e) => {
            setObjectionKey(e.target.value);
            setResult(null);
          }}
        >
          {objections.map((o) => (
            <option key={o.key} value={o.key}>
              {personas.find((p) => p.id === o.personaId)?.name ?? o.personaId} · ״{o.surfaceStatement}״
            </option>
          ))}
        </select>
      </div>

      {objection && (
        <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-xs)", lineHeight: 1.6 }}>
          <b style={{ color: "var(--os-text)" }}>{persona?.name ?? objection.personaId}:</b> ״
          {objection.surfaceStatement}״
          <div style={{ color: "var(--os-muted)", marginBlockStart: 2 }}>
            החשש שמתחת: {objection.underlyingConcern}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 6 }}>
        <label className="os-qc-label" htmlFor="sim-response">
          מה תענו? (כתבו את המענה שלכם)
        </label>
        <textarea
          id="sim-response"
          className="os-qc-input os-qc-input--area"
          rows={3}
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          placeholder="למשל: אני מבין למה זה מדאיג — בוא נבדוק יחד…"
        />
        {response.trim().length > 0 ? (
          <OsButton size="sm" icon="mic" onClick={runSimulation}>
            בדיקת הנוסח
          </OsButton>
        ) : (
          <OsButton size="sm" icon="mic" disabled disabledReason="כתבו מענה כדי לבדוק אותו">
            בדיקת הנוסח
          </OsButton>
        )}
      </div>

      {result && (
        <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
          {result.evaluation.warnings.length > 0 ? (
            <div>
              <div style={{ color: "var(--danger-text)", fontWeight: 700, fontSize: "var(--os-text-xs)" }}>
                אזהרות ניסוח ({result.evaluation.warnings.length})
              </div>
              {result.evaluation.warnings.map((w) => (
                <div key={w.rule} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs)", marginBlockStart: 4, lineHeight: 1.6 }}>
                  <b style={{ color: "var(--warning-text)" }}>{w.rule}</b> — «{w.matchedText}»:{" "}
                  {w.explanationHe}
                </div>
              ))}
            </div>
          ) : (
            <div style={{ color: "var(--success-text)", fontSize: "var(--os-text-xs)" }}>
              לא זוהו דפוסי ניסוח בעייתיים על ידי הכללים.
            </div>
          )}

          {result.evaluation.strengths.length > 0 && (
            <div>
              <div style={{ color: "var(--success-text)", fontWeight: 700, fontSize: "var(--os-text-xs)" }}>
                חוזקות שזוהו
              </div>
              {result.evaluation.strengths.map((s) => (
                <div key={s} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs)", marginBlockStart: 2 }}>
                  ✓ {s}
                </div>
              ))}
            </div>
          )}

          {result.evaluation.suggestions.length > 0 && (
            <div>
              <div style={{ color: "var(--os-cyan-text)", fontWeight: 700, fontSize: "var(--os-text-xs)" }}>
                הצעות לשיפור
              </div>
              {result.evaluation.suggestions.map((s) => (
                <div key={s} style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-2xs)", marginBlockStart: 2, lineHeight: 1.6 }}>
                  • {s}
                </div>
              ))}
            </div>
          )}

          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", lineHeight: 1.6 }}>
            רמת ביטחון: {confidenceDisplayHe(result.envelope.confidence)} · מנוע:{" "}
            {result.envelope.provider} · {result.evaluation.honestyLabel}
          </div>
        </div>
      )}
    </div>
  );
}
