// W7-D — presenter preview for the Microlearning CONCEPT (7.13).
// Renders the storyboard, narration, on-screen text, screen action and the
// success question per timed segment + the HTML thumbnail frame + the full
// accessibility transcript. Honest: labeled a concept — never a video player.
import { useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import { OsButton, Panel, SectionTitle, StatusChip } from "@/design-system";
import type { MicrolearningConcept } from "@/domain/training-materials";

function fmtSec(sec: number): string {
  return `0:${String(sec).padStart(2, "0")}`;
}

const fieldLabel: CSSProperties = {
  color: "var(--os-muted)",
  fontSize: "var(--os-text-2xs)",
  fontWeight: 600,
};
const fieldText: CSSProperties = {
  color: "var(--os-text-2)",
  fontSize: "var(--os-text-sm)",
  lineHeight: 1.6,
};

export function MicrolearningPreview({
  concept,
}: {
  concept: MicrolearningConcept;
}): ReactElement {
  const [activeIdx, setActiveIdx] = useState(0);
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const active = concept.segments[activeIdx] ?? concept.segments[0];

  return (
    <div style={{ display: "grid", gap: "var(--os-space-5)" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <StatusChip status="ממתין" label={concept.label} />
        <span style={{ color: "var(--warning-text)", fontSize: "var(--os-text-xs)" }}>
          {concept.productionStatus}
        </span>
      </div>

      {/* thumbnail frame — rendered HTML, honestly not a video still */}
      <div
        aria-label="פריים תמונה ממוזערת (HTML)"
        style={{
          aspectRatio: "16 / 9",
          maxInlineSize: 420,
          display: "grid",
          placeItems: "center",
          textAlign: "center",
          borderRadius: "var(--os-radius-md)",
          border: "1px solid var(--os-border)",
          background:
            "radial-gradient(120% 120% at 80% 0%, rgba(32,196,232,0.25), transparent), var(--os-panel)",
          padding: "var(--os-space-5)",
        }}
      >
        <div>
          <div style={{ color: "var(--os-text)", fontSize: "var(--os-text-xl)", fontWeight: 800 }}>
            {concept.thumbnail.titleHe}
          </div>
          <div style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)", marginBlockStart: 6 }}>
            {concept.thumbnail.subtitleHe}
          </div>
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)", marginBlockStart: 10 }}>
            פריים HTML — לא צילום מסך מווידאו
          </div>
        </div>
      </div>

      {/* segment timeline */}
      <div>
        <SectionTitle icon="clock" title={`ציר המקטעים (${concept.totalSec} שניות)`} />
        <div style={{ display: "flex", gap: 4 }} role="tablist" aria-label="מקטעי התסריט">
          {concept.segments.map((seg, i) => (
            <button
              key={seg.fromSec}
              type="button"
              role="tab"
              aria-selected={i === activeIdx}
              onClick={() => setActiveIdx(i)}
              className="os-num"
              style={{
                flex: seg.toSec - seg.fromSec,
                padding: "6px 4px",
                fontSize: "var(--os-text-2xs)",
                color: i === activeIdx ? "var(--os-bg)" : "var(--os-text-2)",
                background: i === activeIdx ? "var(--os-cyan-text)" : "var(--os-panel)",
                border: "1px solid var(--os-border)",
                borderRadius: 6,
                cursor: "pointer",
              }}
              dir="ltr"
            >
              {fmtSec(seg.fromSec)}–{fmtSec(seg.toSec)}
            </button>
          ))}
        </div>
      </div>

      {/* active segment card */}
      {active && (
        <Panel variant="raised" style={{ padding: "var(--os-space-5)", display: "grid", gap: "var(--os-space-4)" }}>
          <div style={{ color: "var(--os-text)", fontWeight: 700 }}>
            מקטע{" "}
            <span className="os-num" dir="ltr">
              {fmtSec(active.fromSec)}–{fmtSec(active.toSec)}
            </span>
          </div>
          <div>
            <div style={fieldLabel}>סטוריבורד</div>
            <div style={fieldText}>{active.storyboard}</div>
          </div>
          <div>
            <div style={fieldLabel}>קריינות</div>
            <div style={fieldText}>{active.narration}</div>
          </div>
          <div>
            <div style={fieldLabel}>טקסט על המסך</div>
            <div style={{ ...fieldText, color: "var(--os-cyan-text)", fontWeight: 600 }}>{active.onScreenText}</div>
          </div>
          <div>
            <div style={fieldLabel}>פעולת מסך</div>
            <div style={fieldText}>{active.screenAction}</div>
          </div>
          <div>
            <div style={fieldLabel}>שאלת הצלחה</div>
            <div style={fieldText}>{active.successQuestion}</div>
          </div>
        </Panel>
      )}

      {/* accessibility transcript */}
      <div>
        <OsButton
          size="sm"
          variant="ghost"
          icon="doc"
          onClick={() => setTranscriptOpen((v) => !v)}
        >
          {transcriptOpen ? "הסתרת תמליל הנגישות" : "תמליל נגישות מלא"}
        </OsButton>
        {transcriptOpen && (
          <p
            style={{
              marginBlockStart: "var(--os-space-3)",
              color: "var(--os-text-2)",
              fontSize: "var(--os-text-xs)",
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
            }}
          >
            {concept.accessibilityTranscript}
          </p>
        )}
      </div>
    </div>
  );
}
