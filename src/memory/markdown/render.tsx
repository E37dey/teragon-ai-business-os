// TERAGON AI BUSINESS OS — safe React renderer for the Obsidian subset
// (Wave 6, W6-B). React elements ONLY — no dangerouslySetInnerHTML, no HTML
// string assembly. External links get rel="noopener noreferrer" + an explicit
// marker; neutralized links and raw HTML render as inert text; images are
// placeholders (never fetched).
import type { CSSProperties, ReactElement } from "react";
import type { ObsidianBlock, ObsidianInline } from "./types";

const textSm: CSSProperties = { fontSize: "var(--os-text-sm, 13px)", color: "var(--os-text-2)" };
const mono: CSSProperties = {
  fontFamily: "ui-monospace, monospace",
  fontSize: "var(--os-text-2xs, 11px)",
  direction: "ltr",
  unicodeBidi: "isolate",
};

export function InlineView({ segments }: { segments: readonly ObsidianInline[] }): ReactElement {
  return (
    <>
      {segments.map((s, i) => {
        switch (s.kind) {
          case "strong":
            return <strong key={i}>{s.value}</strong>;
          case "em":
            return <em key={i}>{s.value}</em>;
          case "code":
            return (
              <code key={i} style={{ ...mono, background: "var(--os-raised, #0A1627)", borderRadius: 4, paddingInline: 4 }}>
                {s.value}
              </code>
            );
          case "tag":
            return (
              <span key={i} style={{ color: "var(--os-violet, #7655FF)" }} data-testid="md-tag">
                #{s.value}
              </span>
            );
          case "wikilink":
            return (
              <span
                key={i}
                data-testid="md-wikilink"
                style={{ color: "var(--os-cyan, #20C4E8)", borderBlockEnd: "1px dashed var(--os-cyan, #20C4E8)" }}
              >
                {s.display}
                {s.section ? ` › ${s.section}` : ""}
              </span>
            );
          case "link":
            if (s.neutralized) {
              // dangerous scheme — inert text, never an anchor
              return (
                <span key={i} data-testid="md-link-neutralized" style={{ color: "var(--os-muted)" }}>
                  {s.label} (קישור נוטרל)
                </span>
              );
            }
            if (s.external) {
              return (
                <a
                  key={i}
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="md-link-external"
                  data-external="true"
                  style={{ color: "var(--os-blue, #287BFF)" }}
                >
                  {s.label} ↗
                </a>
              );
            }
            // vault-internal / relative reference — no navigation
            return (
              <span key={i} data-testid="md-link-internal" style={{ color: "var(--os-text-2)" }}>
                {s.label}
              </span>
            );
          case "image-placeholder":
            // NEVER an <img> — tracking pixels stay blind
            return (
              <span key={i} data-testid="md-image-placeholder" style={{ color: "var(--os-muted)" }}>
                [תמונה: {s.alt || s.src || "ללא תיאור"} — לא נטענה]
              </span>
            );
          case "escaped-html":
            // literal text; React escapes it — the tag is never interpreted
            return (
              <span key={i} data-testid="md-escaped-html" style={{ color: "var(--os-muted)" }}>
                {s.value}
              </span>
            );
          default:
            return <span key={i}>{s.value}</span>;
        }
      })}
    </>
  );
}

export function ObsidianBlocksView({ blocks }: { blocks: readonly ObsidianBlock[] }): ReactElement {
  return (
    <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="obsidian-markdown">
      {blocks.map((b, i) => {
        switch (b.kind) {
          case "divider":
            return <hr key={i} style={{ borderColor: "var(--os-border)", inlineSize: "100%" }} />;
          case "heading":
            return (
              <div
                key={i}
                style={{
                  fontWeight: 700,
                  fontSize: b.level <= 1 ? "var(--os-text-lg, 17px)" : "var(--os-text-md, 15px)",
                  color: "var(--os-text)",
                }}
              >
                <InlineView segments={b.inline} />
              </div>
            );
          case "code":
            return (
              <pre
                key={i}
                style={{
                  ...mono,
                  margin: 0,
                  padding: "var(--os-space-2)",
                  background: "var(--os-raised, #0A1627)",
                  border: "1px solid var(--os-border)",
                  borderRadius: "var(--os-radius-sm, 6px)",
                  overflowX: "auto",
                  whiteSpace: "pre-wrap",
                }}
                data-testid="md-code"
              >
                {b.code}
              </pre>
            );
          case "blockquote":
            return (
              <blockquote
                key={i}
                style={{
                  margin: 0,
                  paddingInlineStart: "var(--os-space-3)",
                  borderInlineStart: "2px solid var(--os-border-strong, var(--os-border))",
                  ...textSm,
                }}
              >
                {b.lines.map((line, j) => (
                  <p key={j} style={{ margin: 0 }}>
                    <InlineView segments={line} />
                  </p>
                ))}
              </blockquote>
            );
          case "table":
            return (
              <div key={i} style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", ...textSm }} data-testid="md-table">
                  <thead>
                    <tr>
                      {b.header.map((cell, j) => (
                        <th
                          key={j}
                          style={{ border: "1px solid var(--os-border)", paddingBlock: 3, paddingInline: 8, textAlign: "start" }}
                        >
                          <InlineView segments={cell} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((row, j) => (
                      <tr key={j}>
                        {row.map((cell, k) => (
                          <td key={k} style={{ border: "1px solid var(--os-border)", paddingBlock: 3, paddingInline: 8 }}>
                            <InlineView segments={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          case "list":
            if (b.ordered) {
              return (
                <ol key={i} style={{ margin: 0, paddingInlineStart: "1.4em", display: "grid", gap: 3 }}>
                  {b.items.map((item, j) => (
                    <li key={j} style={textSm}>
                      <InlineView segments={item.inline} />
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={i} style={{ margin: 0, paddingInlineStart: "1.2em", display: "grid", gap: 3 }}>
                {b.items.map((item, j) => (
                  <li key={j} style={{ ...textSm, listStyle: item.checked === null ? undefined : "none" }}>
                    {item.checked !== null && (
                      <span data-testid="md-checkbox" style={{ marginInlineEnd: 6 }}>
                        {item.checked ? "☑" : "☐"}
                      </span>
                    )}
                    <InlineView segments={item.inline} />
                  </li>
                ))}
              </ul>
            );
          default:
            return (
              <p key={i} style={{ margin: 0, ...textSm }}>
                <InlineView segments={b.inline} />
              </p>
            );
        }
      })}
    </div>
  );
}
