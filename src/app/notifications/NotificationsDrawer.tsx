// NotificationsDrawer — RTL drawer opened from the header bell. Real derived
// notifications only: filter by category, unread-only toggle, mark read/unread,
// mark-all-read, and open → navigate to the related entity + mark as read.
import { useMemo, useState } from "react";
import type { ReactElement } from "react";
import { useNavigate } from "react-router-dom";
import { Drawer, EmptyState, OsButton, OsIcon } from "@/design-system";
import type { AppNotification, NotificationCategory } from "@/domain/types";
import { useNotifications } from "./useNotifications";

const CATEGORY_FILTERS: readonly (NotificationCategory | "הכול")[] = [
  "הכול",
  "מכירות",
  "משימות",
  "שירות",
  "מסמכים",
  "למידה",
  "סוכני AI",
  "אוטומציות",
];

const SEVERITY_CLASS: Record<AppNotification["severity"], string> = {
  דחוף: "os-ntf--danger",
  אזהרה: "os-ntf--warning",
  מידע: "os-ntf--info",
};

export interface NotificationsDrawerProps {
  open: boolean;
  onClose: () => void;
}

export function NotificationsDrawer({
  open,
  onClose,
}: NotificationsDrawerProps): ReactElement | null {
  const { notifications, isLoading, unreadCount, setRead, markAllRead } = useNotifications();
  const [category, setCategory] = useState<NotificationCategory | "הכול">("הכול");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const navigate = useNavigate();

  const visible = useMemo(
    () =>
      notifications.filter(
        (n) => (category === "הכול" || n.category === category) && (!unreadOnly || !n.read),
      ),
    [notifications, category, unreadOnly],
  );

  if (!open) return null;

  const openNotification = (n: AppNotification): void => {
    if (!n.read) setRead(n.id, true);
    onClose();
    void navigate(n.relatedEntity.route);
  };

  return (
    <Drawer open onClose={onClose} title={`התראות${unreadCount > 0 ? ` (${unreadCount})` : ""}`}>
      <div className="os-ntf-toolbar">
        <div className="os-ntf-filters" role="group" aria-label="סינון לפי קטגוריה">
          {CATEGORY_FILTERS.map((c) => (
            <button
              key={c}
              type="button"
              className={`os-ntf-filter${category === c ? " os-ntf-filter--active" : ""}`}
              aria-pressed={category === c}
              onClick={() => setCategory(c)}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="os-ntf-actions">
          <label className="os-ntf-unread-toggle">
            <input
              type="checkbox"
              checked={unreadOnly}
              onChange={(e) => setUnreadOnly(e.target.checked)}
            />
            <span>רק שלא נקראו</span>
          </label>
          {unreadCount === 0 ? (
            <OsButton size="sm" variant="ghost" disabled disabledReason="אין התראות שלא נקראו">
              סמן הכול כנקרא
            </OsButton>
          ) : (
            <OsButton size="sm" variant="ghost" onClick={markAllRead}>
              סמן הכול כנקרא
            </OsButton>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="os-ntf-empty">טוען התראות…</div>
      ) : visible.length === 0 ? (
        <EmptyState
          title="אין התראות להצגה"
          reason={
            unreadOnly
              ? "כל ההתראות בסינון הנוכחי נקראו."
              : "אין התראות בקטגוריה הזו — התראות נגזרות ממצב הנתונים בפועל."
          }
        />
      ) : (
        <ul className="os-ntf-list">
          {visible.map((n) => (
            <li
              key={n.id}
              className={`os-ntf ${SEVERITY_CLASS[n.severity]}${n.read ? " os-ntf--read" : ""}`}
            >
              <button
                type="button"
                className="os-ntf__main"
                onClick={() => openNotification(n)}
                aria-label={`פתיחת ההתראה: ${n.title}`}
              >
                <span className="os-ntf__row">
                  {!n.read && <span className="os-ntf__dot" aria-hidden="true" />}
                  <span className="os-ntf__title">{n.title}</span>
                </span>
                {n.body && <span className="os-ntf__body">{n.body}</span>}
                <span className="os-ntf__meta">
                  <span className="os-chip os-chip--muted">{n.category}</span>
                  <span className="os-ntf__severity">{n.severity}</span>
                </span>
              </button>
              <button
                type="button"
                className="os-ntf__read-toggle"
                onClick={() => setRead(n.id, !n.read)}
                aria-label={n.read ? "סמן כלא נקרא" : "סמן כנקרא"}
                title={n.read ? "סמן כלא נקרא" : "סמן כנקרא"}
              >
                <OsIcon name={n.read ? "mail" : "check"} size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Drawer>
  );
}
