// CoursesSubnav — four primary tabs (Tabs primitive) plus an "עוד" overflow menu
// holding the two secondary tabs (catalogue · certificates). Tab ids/behaviour
// are preserved exactly (students/paths/approvals/sessions/catalog/certs); only
// the visual grouping changes so the strip never wraps or clips.
import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";
import { OsIcon, Tabs } from "@/design-system";

interface Counts {
  students: number;
  paths: number;
  approvals: number;
  sessions: number;
  catalog: number;
}

interface SecondaryItem {
  id: string;
  label: string;
  badge?: number;
}

export function CoursesSubnav({
  activeId,
  onChange,
  counts,
}: {
  activeId: string;
  onChange: (id: string) => void;
  counts: Counts;
}): ReactElement {
  const primary = [
    { id: "students", label: "לומדים והתקדמות", badge: counts.students },
    { id: "paths", label: "מסלולים וקורסים", badge: counts.paths },
    { id: "approvals", label: "מטלות והגשות", badge: counts.approvals },
    { id: "sessions", label: "לוח מפגשים", badge: counts.sessions },
  ];
  const secondary: SecondaryItem[] = [
    { id: "catalog", label: "קטלוג הקורסים", badge: counts.catalog },
    { id: "certs", label: "תעודות והסמכות" },
  ];

  const [menuOpen, setMenuOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const secondaryActive = secondary.some((s) => s.id === activeId);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent): void => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [menuOpen]);

  return (
    <div className="courses-subnav">
      <div className="courses-subnav__tabs">
        <Tabs
          ariaLabel="אזורי העבודה של מודול הקורסים"
          items={primary}
          activeId={activeId}
          onChange={onChange}
        />
      </div>
      <div className="courses-more" ref={moreRef}>
        <button
          type="button"
          className={`os-tabs__tab${secondaryActive ? " os-tabs__tab--active" : ""}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          עוד
          <OsIcon name="chevron-down" size={12} />
        </button>
        {menuOpen && (
          <div className="courses-more__menu" role="menu" aria-label="עוד">
            {secondary.map((s) => (
              <button
                key={s.id}
                type="button"
                role="menuitem"
                className="courses-more__item"
                aria-current={s.id === activeId ? "true" : undefined}
                onClick={() => {
                  onChange(s.id);
                  setMenuOpen(false);
                }}
              >
                <span>{s.label}</span>
                {typeof s.badge === "number" && (
                  <span className="courses-more__badge os-num">{s.badge}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
