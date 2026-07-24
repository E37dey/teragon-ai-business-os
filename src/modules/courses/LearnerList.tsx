// Learner list — the selectable roster of enrollments. Rendered as a permanent
// column when wide, and inside a Drawer otherwise. Presentational only.
import type { ReactElement } from "react";
import { EmptyState } from "@/design-system";
import type { Course, Enrollment } from "@/domain/types";
import { progressPercent } from "./lib";

export function LearnerList({
  enrollments,
  selectedId,
  onSelect,
  courseOf,
}: {
  enrollments: readonly Enrollment[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  courseOf: (id: string) => Course | undefined;
}): ReactElement {
  if (enrollments.length === 0) {
    return <EmptyState title="אין רישומים" reason="לא נמצאו רישומי תלמידים לקורס שנבחר." />;
  }
  return (
    <div className="courses-learner-list">
      {enrollments.map((enr) => {
        const pct = progressPercent(enr);
        const active = selectedId === enr.id;
        return (
          <button
            key={enr.id}
            type="button"
            onClick={() => onSelect(enr.id)}
            className={`courses-learner-card${active ? " courses-learner-card--active" : ""}`}
          >
            <div className="courses-learner-card__head">
              <span className="courses-learner-card__name">{enr.studentName}</span>
              {pct !== null ? (
                <span className="os-num" style={{ color: "var(--os-cyan)" }}>
                  {pct}%
                </span>
              ) : (
                <span style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
                  ללא מסלול
                </span>
              )}
            </div>
            <div className="courses-learner-card__sub">
              {courseOf(enr.courseId)?.name ?? enr.courseId} · תשלום: {enr.payment}
            </div>
          </button>
        );
      })}
    </div>
  );
}
