// NextStageMiniCard — the compact "next stage" card that lives INSIDE the center
// workflow (never a rail): three lines (next stage · stage N · name · N meetings)
// and a button that opens the next-stage drawer. NextStageDrawerBody renders the
// full recommendation + meetings inside that drawer. All strings are unchanged
// from the previous implementation.
import type { ReactElement } from "react";
import { ConfidenceBar, OsButton, Panel, SectionTitle } from "@/design-system";
import type { CourseSession } from "@/domain/types";
import { RULES_ENGINE_LABEL, type nextExercise } from "./lib";

type Rec = ReturnType<typeof nextExercise>;

export function NextStageMiniCard({
  rec,
  courseUpcoming,
  onOpenDetails,
}: {
  rec: Rec;
  courseUpcoming: readonly CourseSession[];
  onOpenDetails: () => void;
}): ReactElement {
  return (
    <Panel variant="raised" accent="cyan" className="courses-next-card">
      <SectionTitle icon="sparkle" title="השלב הבא" />
      {rec ? (
        <div className="courses-next">
          <div className="courses-next__stage">
            שלב {rec.stage.order}: {rec.stage.name}
          </div>
          <div className="courses-next__count">
            <span className="os-num">{courseUpcoming.length}</span> מפגשים קרובים
          </div>
          <div>
            <OsButton variant="ghost" icon="doc" onClick={onOpenDetails}>
              פרטים נוספים
            </OsButton>
          </div>
        </div>
      ) : (
        <div className="courses-next">
          <div className="courses-next__done">המסלול הושלם — אין שלב הבא. 🎓</div>
          <div className="courses-next__count">
            <span className="os-num">{courseUpcoming.length}</span> מפגשים קרובים
          </div>
          {courseUpcoming.length > 0 && (
            <div>
              <OsButton variant="ghost" icon="doc" onClick={onOpenDetails}>
                פרטים נוספים
              </OsButton>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

export function NextStageDrawerBody({
  rec,
  courseUpcoming,
}: {
  rec: Rec;
  courseUpcoming: readonly CourseSession[];
}): ReactElement {
  return (
    <div className="courses-drawer-section">
      <SectionTitle icon="sparkle" title="השלב הבא" subtitle={RULES_ENGINE_LABEL} />
      {rec ? (
        <>
          <div style={{ fontWeight: 600 }}>
            שלב {rec.stage.order}: {rec.stage.name}
          </div>
          <div style={{ color: "var(--os-text-2)", fontSize: "var(--os-text-sm)" }}>
            {rec.reason}
          </div>
          <ConfidenceBar value={null} label="רמת ביטחון" />
          <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-2xs)" }}>
            המלצה דטרמיניסטית מסדר המסלול — ללא מודל AI וללא מדדים מומצאים.
          </div>
        </>
      ) : (
        <div style={{ color: "var(--success-text)" }}>המסלול הושלם — אין שלב הבא. 🎓</div>
      )}
      <div className="courses-next__count">
        <span className="os-num">{courseUpcoming.length}</span> מפגשים קרובים
      </div>
      {courseUpcoming.length > 0 && (
        <div className="courses-drawer-list">
          {courseUpcoming.map((s) => (
            <Panel
              key={s.id}
              variant="raised"
              style={{ padding: "var(--os-space-3)", fontSize: "var(--os-text-sm)" }}
            >
              <div>{s.title}</div>
              <div style={{ color: "var(--os-muted)", fontSize: "var(--os-text-xs)" }}>
                <span className="os-num" dir="ltr">
                  {new Date(s.scheduledAt).toLocaleString("he-IL", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </Panel>
          ))}
        </div>
      )}
    </div>
  );
}
