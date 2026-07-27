// CoursesKpiStrip — VC-D density: EXACTLY four primary KPIs (only the
// action-driving ones), laid out 2 → 3 by CONTENT width (@container courses).
// The four: ממתינים לבדיקת מדריך · לומדים הדורשים מעקב · מפגשים בשבעת הימים
// הקרובים · התקדמות במסלולים (the compact progress strip below — the 4th KPI).
// Zero is neutral (muted grey icon), never green; amber/danger only when action
// is genuinely required. Passive totals (קורסים פעילים / לומדים פעילים) move to
// a "מדדים נוספים" disclosure — no value is deleted.
import type { ReactElement } from "react";
import { ConfidenceBar, KpiCard, Panel } from "@/design-system";

export function CoursesKpiStrip({
  activeCourses,
  learners,
  approvals,
  delayed,
  upcoming,
  overallProgress,
}: {
  activeCourses: number;
  learners: number;
  approvals: number;
  delayed: number;
  upcoming: number;
  /** Average learning-path progress across measured enrollments, or null. */
  overallProgress: number | null;
}): ReactElement {
  return (
    <>
      <div className="courses-kpi" data-testid="courses-kpi">
        <KpiCard
          title="ממתינים לבדיקת מדריך"
          value={approvals}
          accent="warning"
          icon="check"
          muted={approvals === 0}
        />
        <KpiCard
          title="לומדים הדורשים מעקב"
          value={delayed}
          accent="danger"
          icon="alert"
          muted={delayed === 0}
        />
        <KpiCard
          title="מפגשים בשבעת הימים הקרובים"
          value={upcoming}
          accent="blue"
          icon="clock"
          muted={upcoming === 0}
        />
      </div>
      {/* 4th primary KPI — overall learning-path progress (null-safe). */}
      <Panel className="courses-progress-strip">
        <ConfidenceBar value={overallProgress} label="התקדמות במסלולים" />
      </Panel>

      {/* Passive totals — present but demoted; not action-driving. */}
      <details className="os-more-metrics" data-testid="courses-more-metrics">
        <summary>מדדים נוספים</summary>
        <div className="os-more-metrics__grid">
          <div className="os-more-metrics__item">
            <span>קורסים פעילים</span>
            <span className="os-num">{activeCourses}</span>
          </div>
          <div className="os-more-metrics__item">
            <span>לומדים פעילים</span>
            <span className="os-num">{learners}</span>
          </div>
        </div>
      </details>
    </>
  );
}
