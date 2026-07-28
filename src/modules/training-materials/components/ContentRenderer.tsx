// W7-D — safe structured-content renderer: typed blocks only, no HTML strings.
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import type { ContentBlock, MaterialContentSection } from "@/domain/training-materials";

const toneColor: Record<"info" | "warning" | "success" | "danger", string> = {
  info: "var(--os-cyan-text)",
  warning: "var(--warning-text)",
  success: "var(--success-text)",
  danger: "var(--danger-text)",
};

const headingStyle: CSSProperties = {
  color: "var(--os-text)",
  fontWeight: 700,
  fontSize: "var(--os-text-md)",
  marginBlock: "var(--os-space-4) var(--os-space-3)",
};

const listStyle: CSSProperties = {
  margin: 0,
  paddingInlineStart: "1.25rem",
  display: "grid",
  gap: 6,
  color: "var(--os-text-2)",
  fontSize: "var(--os-text-sm)",
};

function fmtSec(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function BlockView({ block }: { block: ContentBlock }): ReactElement {
  switch (block.kind) {
    case "paragraph":
      return (
        <p style={{ margin: 0, color: "var(--os-text-2)", fontSize: "var(--os-text-sm)", lineHeight: 1.7 }}>
          {block.text}
        </p>
      );
    case "bullets":
    case "steps": {
      const items = block.items.map((item, i) => <li key={i}>{item}</li>);
      return (
        <div>
          {block.title && (
            <div style={{ color: "var(--os-text)", fontWeight: 600, fontSize: "var(--os-text-sm)", marginBlockEnd: 6 }}>
              {block.title}
            </div>
          )}
          {block.kind === "steps" ? <ol style={listStyle}>{items}</ol> : <ul style={listStyle}>{items}</ul>}
        </div>
      );
    }
    case "note":
      return (
        <div
          style={{
            borderInlineStart: `3px solid ${toneColor[block.tone]}`,
            paddingInlineStart: "var(--os-space-4)",
            paddingBlock: 6,
            color: "var(--os-text-2)",
            fontSize: "var(--os-text-sm)",
            background: "var(--os-panel)",
            borderRadius: "var(--os-radius-sm)",
          }}
        >
          {block.text}
        </div>
      );
    case "timed":
      return (
        <div style={{ display: "grid", gap: 4 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span className="os-num" style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-xs)" }} dir="ltr">
              {fmtSec(block.fromSec)}–{fmtSec(block.toSec)}
            </span>
            <span style={{ color: "var(--os-text)", fontWeight: 600, fontSize: "var(--os-text-sm)" }}>
              {block.label}
            </span>
          </div>
          <p style={{ margin: 0, color: "var(--os-text-2)", fontSize: "var(--os-text-sm)", lineHeight: 1.7 }}>
            {block.text}
          </p>
        </div>
      );
    case "routeRef":
      return (
        <div
          style={{
            display: "grid",
            gap: 4,
            padding: "var(--os-space-3) var(--os-space-4)",
            background: "var(--os-panel)",
            borderRadius: "var(--os-radius-sm)",
          }}
        >
          <Link to={block.route} style={{ color: "var(--os-cyan-text)", fontSize: "var(--os-text-sm)", fontWeight: 600 }}>
            ← {block.label} <span dir="ltr">({block.route})</span>
          </Link>
          <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>{block.note}</span>
        </div>
      );
    case "prompt":
      return (
        <div
          style={{
            display: "grid",
            gap: 6,
            padding: "var(--os-space-4)",
            background: "var(--os-panel)",
            borderRadius: "var(--os-radius-sm)",
            fontSize: "var(--os-text-sm)",
          }}
        >
          <div style={{ color: "var(--os-text)", fontWeight: 600 }}>{block.scenario}</div>
          <div style={{ color: "var(--os-cyan-text)" }}>«{block.promptHe}»</div>
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
            פעולה: <span dir="ltr">{block.operation}</span>
          </div>
          <div style={{ color: "var(--os-text-2)" }}>צפוי: {block.expectedOutcome}</div>
          <div style={{ color: "var(--warning-text)", fontSize: "var(--os-text-xs)" }}>⚠ {block.caution}</div>
        </div>
      );
  }
}

export function ContentSections({
  sections,
}: {
  sections: readonly MaterialContentSection[];
}): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-4)" }}>
      {sections.map((section) => (
        <section key={section.heading}>
          <h3 style={headingStyle}>{section.heading}</h3>
          <div style={{ display: "grid", gap: "var(--os-space-3)" }}>
            {section.blocks.map((block, i) => (
              <BlockView key={i} block={block} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
