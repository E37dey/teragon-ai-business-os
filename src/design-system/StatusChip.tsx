import type { ReactElement } from "react";
import { OsIcon } from "./icons";
import type { OsStatus } from "./types";
import "../styles/components.css";
import { STATUS_MAP } from "./statusMap";

export interface StatusChipProps {
  /** Canonical Hebrew status — the only 8 allowed values. */
  status: OsStatus;
  /** Override display text (color still derives from status). */
  label?: string;
  className?: string;
}

/** StatusChip — canonical status pill with color dot (⚠ icon for אזהרה). */
export function StatusChip({ status, label, className = "" }: StatusChipProps): ReactElement {
  const meta = STATUS_MAP[status];
  return (
    <span className={`os-chip os-chip--${meta.tone} ${className}`.trim()}>
      {meta.warn ? (
        <OsIcon name="alert" size={11} />
      ) : (
        <span className="os-chip__dot" aria-hidden="true" />
      )}
      {label ?? status}
    </span>
  );
}
