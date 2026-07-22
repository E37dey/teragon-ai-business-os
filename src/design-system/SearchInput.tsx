import type { ReactElement } from "react";
import { OsIcon } from "./icons";
import "../styles/components.css";

export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called with the current value on Enter. */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Keyboard hint rendered at the inline-end (e.g. "⌘K"). */
  kbdHint?: string;
  /** Accessible label (default: the placeholder). */
  ariaLabel?: string;
  className?: string;
}

/** SearchInput — dark search field with leading icon + optional ⌘K hint. */
export function SearchInput({
  value,
  onChange,
  onSubmit,
  placeholder = "חיפוש…",
  kbdHint,
  ariaLabel,
  className = "",
}: SearchInputProps): ReactElement {
  return (
    <div className={`os-search ${className}`.trim()}>
      <span className="os-search__icon" aria-hidden="true">
        <OsIcon name="search" size={14} />
      </span>
      <input
        type="search"
        className="os-search__input"
        value={value}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={
          onSubmit
            ? (e) => {
                if (e.key === "Enter") onSubmit(value);
              }
            : undefined
        }
      />
      {kbdHint && <span className="os-search__kbd">{kbdHint}</span>}
    </div>
  );
}
