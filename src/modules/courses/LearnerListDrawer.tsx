// LearnerListPanel — the learner roster with its course filter (and, in the
// drawer, a search box). Rendered as the permanent learner column AND inside the
// "רשימת הלומדים" drawer; an idPrefix keeps the control ids unique when both are
// mounted. Presentational; filtering is done by the caller.
import type { ReactElement, ReactNode } from "react";
import { SearchInput } from "@/design-system";
import type { Course, Enrollment } from "@/domain/types";
import { LearnerList } from "./LearnerList";

export function LearnerListPanel({
  idPrefix,
  courses,
  enrollments,
  courseFilter,
  onCourseFilter,
  search,
  onSearch,
  selectedId,
  onSelect,
  courseOf,
  statusOf,
  showSearch = false,
}: {
  idPrefix: string;
  courses: readonly Course[];
  enrollments: readonly Enrollment[];
  courseFilter: string;
  onCourseFilter: (value: string) => void;
  search: string;
  onSearch: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  courseOf: (id: string) => Course | undefined;
  statusOf?: (enr: Enrollment) => ReactNode;
  showSearch?: boolean;
}): ReactElement {
  const filterId = `${idPrefix}-course-filter`;
  return (
    <div className="courses-learner-toolbar">
      {showSearch && <SearchInput value={search} onChange={onSearch} />}
      <div className="courses-learner-field">
        <label className="os-qc-label" htmlFor={filterId}>
          סינון לפי קורס
        </label>
        <select
          id={filterId}
          className="os-qc-input"
          value={courseFilter}
          onChange={(e) => onCourseFilter(e.target.value)}
        >
          <option value="all">כל הקורסים</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>
      <LearnerList
        enrollments={enrollments}
        selectedId={selectedId}
        onSelect={onSelect}
        courseOf={courseOf}
        statusOf={statusOf}
      />
    </div>
  );
}
