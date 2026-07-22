// ShortcutsDialog — lists ONLY shortcuts that are actually implemented in the
// shell. If a shortcut is removed from the code, remove it here too.
import type { ReactElement } from "react";
import { Modal } from "@/design-system";

interface ShortcutRow {
  keys: string;
  description: string;
}

const SHORTCUTS: readonly ShortcutRow[] = [
  { keys: "Ctrl+K / ⌘K", description: "פתיחת לוח הפקודות (ולחיצה נוספת סוגרת)" },
  { keys: "Esc", description: "סגירת לוח פקודות / חיפוש / חלונית / מגירה" },
  { keys: "↑ / ↓", description: "מעבר בין תוצאות בלוח הפקודות ובחיפוש" },
  { keys: "Enter", description: "הפעלת הפקודה או פתיחת התוצאה המסומנת" },
  { keys: "↑ / ↓ בניווט", description: "מעבר בין פריטי הניווט וכותרות הקבוצות" },
  { keys: "Home / End בניווט", description: "קפיצה לפריט הראשון / האחרון בניווט" },
  { keys: "Tab", description: "מעבר מחזורי בתוך חלוניות (מלכודת פוקוס)" },
];

export interface ShortcutsDialogProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsDialog({ open, onClose }: ShortcutsDialogProps): ReactElement | null {
  if (!open) return null;
  return (
    <Modal open onClose={onClose} title="קיצורי מקלדת">
      <table className="os-shortcuts">
        <thead>
          <tr>
            <th>מקשים</th>
            <th>פעולה</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map((s) => (
            <tr key={s.keys}>
              <td>
                <kbd className="os-shortcuts__kbd">{s.keys}</kbd>
              </td>
              <td>{s.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
