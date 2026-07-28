// W8-E — Phase 8.13: the Command-Center MANAGEMENT BAND.
// Seven derived attention items (risk / incidents / access reviews / health /
// baselines / policies / submission approvals) — every number derives from
// real records via deriveManagementBand and clicks through to the owning
// screen. NO duplication of the existing KPI strip.
import type { CSSProperties, ReactElement } from "react";
import { Link } from "react-router-dom";
import { Panel, SectionTitle } from "@/design-system";
import { useCollection } from "@/app/data/hooks";
import type { Approval, BaseEntity } from "@/domain/types";
import type { GovernancePolicy, GovernanceRisk } from "@/domain/governance";
import type { AccessReviewRecord } from "@/domain/administration";
import type { SystemHealthSnapshot } from "@/domain/system-health";
import {
  deriveManagementBand,
  type ManagementBandItem,
} from "@/integration/wave8/managementBand";

const cardStyle = (attention: boolean): CSSProperties => ({
  display: "grid",
  gap: 4,
  border: `1px solid ${attention ? "var(--os-warning, #E5A93D)" : "var(--os-border)"}`,
  borderRadius: "var(--os-radius-sm, 8px)",
  paddingBlock: "var(--os-space-3)",
  paddingInline: "var(--os-space-3)",
  textDecoration: "none",
  color: "var(--os-text)",
  minInlineSize: 0,
});

function BandCard({ item }: { item: ManagementBandItem }): ReactElement {
  return (
    <Link
      to={item.route}
      style={cardStyle(item.attention)}
      data-testid={`management-band-${item.key}`}
    >
      <span
        style={{
          fontSize: "var(--os-text-2xs, 11px)",
          color: "var(--os-text-2)",
          fontWeight: 600,
        }}
      >
        {item.titleHe}
      </span>
      <span
        className="os-num"
        style={{
          fontSize: "var(--os-text-lg, 18px)",
          fontWeight: 700,
          color: item.attention ? "var(--os-warning, #E5A93D)" : "var(--os-text)",
        }}
      >
        {item.count === null ? "טרם נבדק" : item.count}
      </span>
      <span style={{ fontSize: "var(--os-text-2xs, 11px)", color: "var(--os-muted)" }}>
        {item.detailHe}
      </span>
    </Link>
  );
}

export function ManagementBand(): ReactElement {
  const risksQ = useCollection<GovernanceRisk>("governanceRisks");
  const incidentsQ = useCollection<BaseEntity>("governanceIncidents");
  const reviewsQ = useCollection<AccessReviewRecord>("accessReviews");
  const snapshotsQ = useCollection<SystemHealthSnapshot>("healthSnapshots");
  const approvalsQ = useCollection<Approval>("approvals");
  const policiesQ = useCollection<GovernancePolicy>("governancePolicies");

  const isLoading = [risksQ, incidentsQ, reviewsQ, snapshotsQ, approvalsQ, policiesQ].some(
    (q) => q.isLoading,
  );

  const allItems = deriveManagementBand({
    risks: risksQ.data ?? [],
    incidents: incidentsQ.data ?? [],
    accessReviews: reviewsQ.data ?? [],
    healthSnapshots: snapshotsQ.data ?? [],
    approvals: approvalsQ.data ?? [],
    policies: policiesQ.data ?? [],
    nowISO: new Date().toISOString(),
  });

  // VC density round-2: show ONLY items that require action (attention), capped
  // at three. A healthy state renders a single neutral line — no wall of cards.
  const items = allItems.filter((i) => i.attention).slice(0, 3);

  return (
    <Panel variant="panel" style={{ padding: "var(--os-space-5)" }} data-testid="management-band">
      <SectionTitle
        title="רצועת הניהול"
        subtitle="הפריטים הדורשים פעולה — נגזרים מרשומות אמת ומקושרים למסך שלהם"
        icon="shield"
      />
      {isLoading ? (
        <div
          style={{
            marginBlockStart: "var(--os-space-3)",
            fontSize: "var(--os-text-2xs, 11px)",
            color: "var(--os-text-2)",
          }}
          role="status"
        >
          טוען את נתוני הניהול מהמאגר המקומי…
        </div>
      ) : items.length === 0 ? (
        <div
          style={{
            marginBlockStart: "var(--os-space-3)",
            fontSize: "var(--os-text-sm, 13px)",
            color: "var(--os-text-2)",
          }}
        >
          אין פריטי ניהול הדורשים פעולה כעת — כל הבקרות במצב תקין או ממתינות למדידה.
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
            gap: "var(--os-space-3)",
            marginBlockStart: "var(--os-space-3)",
          }}
        >
          {items.map((item) => (
            <BandCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </Panel>
  );
}
