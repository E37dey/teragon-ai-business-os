// vNext Phase E — lightweight, per-portal first-use onboarding. A compact,
// dismissible welcome card (NOT a full-screen forced tutorial): 3-4 role steps,
// Continue / Skip / "אל תציג שוב" (persisted per portal), and a replay hook from
// Help. Calm and mobile-friendly.
import { useState } from "react";
import type { ReactElement } from "react";
import { OsButton, Panel } from "@/design-system";
import type { Portal } from "@/authorization/portals";

const STEPS: Record<Portal, { title: string; steps: readonly string[] }> = {
  manager: {
    title: "ברוך הבא לסביבת המנהל",
    steps: [
      "כאן רואים קודם כול מה דורש החלטה או אישור",
      "מדדי המפתח והמשימות מתחת לאזור ההחלטות",
      "יעדים מתקדמים (ממשל, בריאות המערכת) נמצאים תחת «מערכת ומתקדם»",
    ],
  },
  student: {
    title: "ברוך הבא לסביבת הלמידה",
    steps: [
      "«להמשיך ללמוד» מראה מה הצעד הבא שלך",
      "המשימות שלך והמנטור נמצאים ממש כאן",
      "אפשר תמיד לחפש תשובה במאגר הידע",
    ],
  },
  technician: {
    title: "ברוך הבא לסביבת הטכנאי",
    steps: [
      "«העבודה הנוכחית» מראה את הקריאה הדחופה ביותר",
      "פתיחת הקריאה, ידע טכני ו-Fixer בלחיצה אחת",
      "התור והמשימות שלך מתחת",
    ],
  },
};

const key = (portal: Portal): string => `teragon.vnext.onboarding.${portal}`;

/** Replay onboarding for a portal (called from Help). */
export function replayOnboarding(portal: Portal): void {
  try {
    localStorage.removeItem(key(portal));
    window.dispatchEvent(new Event("teragon-vnext-onboarding-replay"));
  } catch {
    /* storage unavailable — nothing to replay */
  }
}

function dismissed(portal: Portal): boolean {
  try {
    return localStorage.getItem(key(portal)) === "done";
  } catch {
    return false;
  }
}

export function PortalOnboarding({ portal }: { portal: Portal }): ReactElement | null {
  const [hidden, setHidden] = useState<boolean>(() => dismissed(portal));
  if (hidden) return null;
  const cfg = STEPS[portal];

  const persistDone = (): void => {
    try {
      localStorage.setItem(key(portal), "done");
    } catch {
      /* ignore */
    }
    setHidden(true);
  };

  return (
    <Panel variant="raised" className="portal-onboarding" role="region" aria-label="הדרכה" data-testid="portal-onboarding">
      <div className="portal-onboarding__head">
        <div className="portal-onboarding__title">{cfg.title}</div>
        <button
          type="button"
          className="portal-onboarding__close"
          aria-label="סגירה"
          onClick={() => setHidden(true)}
        >
          ✕
        </button>
      </div>
      <ol className="portal-onboarding__steps">
        {cfg.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ol>
      <div className="portal-onboarding__actions">
        <OsButton variant="primary" size="sm" onClick={() => setHidden(true)} data-testid="onboarding-continue">
          הבנתי, בואו נתחיל
        </OsButton>
        <OsButton variant="ghost" size="sm" onClick={persistDone} data-testid="onboarding-dismiss">
          אל תציג שוב
        </OsButton>
      </div>
    </Panel>
  );
}
