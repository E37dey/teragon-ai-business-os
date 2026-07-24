// CoursesKpiStrip — the five existing KPIs (values/labels/accents unchanged),
// laid out 2 → 3 → 5 by CONTENT width (@container courses), plus one compact
// overall-progress strip below (derived from completionStats — no new data).
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
      <div className="courses-kpi">
        <KpiCard title="קורסים פעילים" value={activeCourses} accent="cyan" icon="graduation" />
        <KpiCard title="לומדים פעילים" value={learners} accent="blue" icon="users" />
        <KpiCard
          title="ממתינים לבדיקת מדריך"
          value={approvals}
          accent="violet"
          icon="check"
          glow={approvals > 0}
        />
        <KpiCard title="לומדים הדורשים מעקב" value={delayed} accent="danger" icon="alert" />
        <KpiCard
          title="מפגשים בשבעת הימים הקרובים"
          value={upcoming}
          accent="success"
          icon="clock"
        />
      </div>
      <Panel className="courses-progress-strip">
        <ConfidenceBar value={overallProgress} label="התקדמות במסלולים" />
      </Panel>
    </>
  );
}
