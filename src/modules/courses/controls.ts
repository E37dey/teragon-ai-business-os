// Disabled-with-reason props while an async action runs (OsButton honesty
// contract). Moved verbatim from CoursesPage; behaviour and copy unchanged.
export function busyDisabled(
  busy: boolean,
): { disabled: true; disabledReason: string } | { disabled?: false } {
  return busy ? { disabled: true, disabledReason: "פעולה קודמת עדיין רצה" } : {};
}
