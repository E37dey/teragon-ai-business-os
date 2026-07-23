// W6 WIRING — the Command-Center memory band (Phase 6.20).
// Replaces the W3-era static "זיכרון ארגוני · Obsidian" summary with
// commandCenterMemoryBand: every number is derived from the governance
// collections, zero rows are hidden, and every item clicks through to the
// actual record/route (/memory · /knowledge · /learning).
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import type { MemoryRecord } from "@/domain/types";
import { useCollection } from "@/app/data/hooks";
import { commandCenterMemoryBand } from "@/integration/commandCenterMemory";
import { memoryBandItems } from "./memoryBandItems";
import { dateHe } from "@/modules/quotations/fmt";

const rowStyle: CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: "var(--os-space-2)",
  fontSize: "var(--os-text-sm, 12px)",
};

export function MemoryBand(): ReactElement {
  const recordsQ = useCollection<MemoryRecord>("memoryRecords");
  const proposalsQ = useCollection("memoryProposals");
  const memConflictsQ = useCollection("memoryConflicts");
  const knConflictsQ = useCollection("knowledgeConflicts");
  const knReviewsQ = useCollection("knowledgeReviews");
  const knUsageQ = useCollection("knowledgeUsage");
  const learnProposalsQ = useCollection("learningProposals");

  const band = commandCenterMemoryBand({
    memoryRecords: recordsQ.data ?? [],
    memoryProposals: proposalsQ.data ?? [],
    memoryConflicts: memConflictsQ.data ?? [],
    knowledgeConflicts: knConflictsQ.data ?? [],
    knowledgeReviews: knReviewsQ.data ?? [],
    knowledgeUsage: knUsageQ.data ?? [],
    learningProposals: learnProposalsQ.data ?? [],
    todayIso: new Date().toISOString(),
  });
  const items = memoryBandItems(band);
  const empty =
    items.length === 0 && band.recentApproved.length === 0 && band.recentWikiUsage.length === 0;

  return (
    <div style={{ display: "grid", gap: "var(--os-space-2)" }} data-testid="cc-memory-band">
      {empty && (
        <div style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
          אין עדיין נתוני ממשל זיכרון/ידע/למידה — הכול נגזר מרשומות אמיתיות.
        </div>
      )}
      {items.map((item) => (
        <Link
          key={item.id}
          to={item.route}
          style={{ ...rowStyle, color: "var(--os-text-2)", textDecoration: "none" }}
          data-testid={`cc-memory-item-${item.id}`}
        >
          <span>{item.labelHe}</span>
          <span className="os-num" style={{ color: "var(--os-cyan)" }}>
            {item.value}
          </span>
        </Link>
      ))}
      {band.recentApproved.length > 0 && (
        <div style={{ display: "grid", gap: 3, marginBlockStart: 4 }}>
          <div
            style={{
              fontSize: "var(--os-text-2xs, 11px)",
              fontWeight: 600,
              color: "var(--os-text-2)",
            }}
          >
            זיכרון מאושר לאחרונה
          </div>
          {band.recentApproved.slice(0, 3).map((r) => (
            <Link
              key={r.id}
              to={`/memory?record=${r.id}`}
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
                textDecoration: "none",
              }}
            >
              {r.title}{" "}
              <span className="os-num" style={{ color: "var(--os-muted)" }}>
                · {dateHe(r.updatedAt)}
              </span>
            </Link>
          ))}
        </div>
      )}
      {band.recentWikiUsage.length > 0 && (
        <div style={{ display: "grid", gap: 3, marginBlockStart: 4 }}>
          <div
            style={{
              fontSize: "var(--os-text-2xs, 11px)",
              fontWeight: 600,
              color: "var(--os-text-2)",
            }}
          >
            שימוש אחרון בידע (Wiki)
          </div>
          {band.recentWikiUsage.slice(0, 3).map((u) => (
            <Link
              key={u.id}
              to="/knowledge?filter=usage"
              style={{
                fontSize: "var(--os-text-2xs, 11px)",
                color: "var(--os-text-2)",
                textDecoration: "none",
              }}
            >
              {u.description || u.id}
              {u.at ? (
                <span className="os-num" style={{ color: "var(--os-muted)" }}>
                  {" "}
                  · {dateHe(u.at)}
                </span>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
