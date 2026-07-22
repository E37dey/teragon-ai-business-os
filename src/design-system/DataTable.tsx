import type { CSSProperties, ReactElement, ReactNode } from "react";
import { OsIcon } from "./icons";
import "../styles/components.css";

export interface DataTableColumn<T> {
  /** Column id — used as React key; when `render` is absent it is read as a field of the row. */
  key: string;
  /** Column header text. */
  header: string;
  /** Logical alignment (RTL-aware). Default 'start'. */
  align?: "start" | "center" | "end";
  /** CSS width. */
  width?: string | number;
  /** Wrap plain value in an LTR tabular-nums span. */
  numeric?: boolean;
  /** Custom cell renderer (chips, buttons, slots). */
  render?: (row: T, rowIndex: number) => ReactNode;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  /** Row key: field name or fn (default: index). */
  rowKey?: keyof T | ((row: T, index: number) => string);
  onRowClick?: (row: T) => void;
  /** Per-row extra class — e.g. highlight an exception row. */
  rowClassName?: (row: T) => string;
  /** Honest empty state title. */
  emptyText?: string;
  /** Honest reason WHY the table is empty (e.g. "החיבור ל-ERP טרם הוגדר"). */
  emptyReason?: string;
  /** Pagination / summary footer slot. */
  footer?: ReactNode;
  /** Scroll-area max height (sticky header stays visible). */
  maxHeight?: string | number;
  className?: string;
}

function cellValue<T>(row: T, key: string): ReactNode {
  const raw = (row as Record<string, unknown>)[key];
  if (raw == null) return null;
  if (typeof raw === "string" || typeof raw === "number") return raw;
  return String(raw);
}

/**
 * DataTable — dense dark enterprise table. Sticky header, row hover,
 * RTL start-alignment by default, typed column render fns, honest empty
 * state ("אין נתונים להצגה" + reason), footer slot.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  rowClassName,
  emptyText = "אין נתונים להצגה",
  emptyReason,
  footer,
  maxHeight,
  className = "",
}: DataTableProps<T>): ReactElement {
  const keyOf = (row: T, i: number): string => {
    if (typeof rowKey === "function") return rowKey(row, i);
    if (rowKey != null) {
      const v = row[rowKey];
      if (v != null) return String(v);
    }
    return String(i);
  };

  const scrollStyle: CSSProperties | undefined = maxHeight
    ? ({
        "--os-table-max-height": typeof maxHeight === "number" ? `${maxHeight}px` : maxHeight,
      } as CSSProperties)
    : undefined;

  return (
    <div className={`os-table-wrap ${className}`.trim()}>
      <div className="os-table-scroll" style={scrollStyle}>
        <table className="os-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={col.align ? `os-table--${col.align}` : undefined}
                  style={col.width != null ? { width: col.width } : undefined}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length || 1}>
                  <div className="os-table__empty" role="status">
                    <OsIcon name="inbox" size={20} />
                    <span>{emptyText}</span>
                    {emptyReason && <span className="os-table__empty-reason">{emptyReason}</span>}
                  </div>
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr
                  key={keyOf(row, i)}
                  className={
                    [
                      onRowClick ? "os-table__row--clickable" : "",
                      rowClassName ? rowClassName(row) : "",
                    ]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => {
                    const content = col.render ? col.render(row, i) : cellValue(row, col.key);
                    return (
                      <td
                        key={col.key}
                        className={col.align ? `os-table--${col.align}` : undefined}
                      >
                        {col.numeric && !col.render ? (
                          <span className="os-table__num">{content}</span>
                        ) : (
                          content
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {footer && <div className="os-table__footer">{footer}</div>}
    </div>
  );
}
