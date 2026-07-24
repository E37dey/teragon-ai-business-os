// CoursesInsights — the relocated "insights" content (formerly the shell rail).
// Rendered BOTH as the permanent insights column (@container courses ≥1500) and
// inside the "תובנות והמשך" drawer at narrower widths. Presentational; every
// value is derived on the page (completionStats / delayedQueue / upcoming) and
// every string is unchanged from the previous rail.
import type { ReactElement } from "react";
import { ConfidenceBar, StatusChip } from "@/design-system";
import type { Course, CourseSession } from "@/domain/types";
import type { completionStats, delayedQueue } from "./lib";

export function CoursesInsights({
  courses,
  stats,
  delayed,
  upcoming,
}: {
  courses: readonly Course[];
  stats: ReturnType<typeof completionStats>;
  delayed: ReturnType<typeof delayedQueue>;
  upcoming: readonly CourseSession[];
}): ReactElement {
  const nameOf = (id: string): string => courses.find((c) => c.id === id)?.name ?? id;
  const withStudents = stats.filter((s) => s.students > 0);
  return (
    <div className="courses-insights">
      <div className="courses-insights__group">
        <div className="courses-insights__title">התקדמות במסלולים</div>
        {withStudents.length === 0 && (
          <div className="courses-insights__muted">אין רישומים פעילים למדידה.</div>
        )}
        {withStudents.map((s) => (
          <ConfidenceBar
            key={s.courseId}
            value={s.avgProgress}
            label={`${nameOf(s.courseId)} · ${s.students} לומדים`}
          />
        ))}
      </div>

      <div className="courses-insights__group">
        <div className="courses-insights__title">לומדים הדורשים מעקב ({delayed.length})</div>
        {delayed.length === 0 && (
          <div className="courses-insights__muted">אין כרגע לומדים הדורשים מעקב.</div>
        )}
        {delayed.slice(0, 5).map((d, i) => (
          <div key={`${d.enrollment.id}-${d.stage.stageId}-${i}`} className="courses-insights__row">
            <span>{d.enrollment.studentName}</span>
            <StatusChip status={d.kind === "חסום / צריך עזרה" ? "חסום" : "אזהרה"} label={d.kind} />
          </div>
        ))}
      </div>

      <div className="courses-insights__group">
        <div className="courses-insights__title">מפגשים בשבעת הימים הקרובים</div>
        {upcoming.length === 0 && (
          <div className="courses-insights__muted">אין מפגשים מתוזמנים קדימה.</div>
        )}
        {upcoming.map((s) => (
          <div key={s.id}>
            <div>{s.title}</div>
            <div className="courses-insights__muted">
              <span className="os-num" dir="ltr">
                {new Date(s.scheduledAt).toLocaleString("he-IL", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </span>
              {" · "}
              {nameOf(s.courseId)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
