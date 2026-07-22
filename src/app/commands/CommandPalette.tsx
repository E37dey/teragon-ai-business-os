// CommandPalette — Ctrl+K/⌘K overlay with two modes:
//  - "commands": the typed command registry (registry.ts) — every entry works
//  - "search":  real global search over repositories via rankedSearch
// Accessible combobox pattern: input[role=combobox] + listbox options, arrow
// keys move the highlighted option, Enter activates, Escape closes.
import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";
import { OsIcon } from "@/design-system";
import { rankedSearch, type RankedSearchHit } from "@/domain/selectors";
import { useGlobalSearchData } from "@/app/search/useGlobalSearchData";
import { COMMANDS, filterCommands, type Command, type CommandContext } from "./registry";

export type PaletteMode = "commands" | "search";

export interface CommandPaletteProps {
  mode: PaletteMode;
  /** initial query (e.g. text typed in the header search box) */
  initialQuery?: string;
  ctx: CommandContext;
  /** navigate to a search hit destination */
  onOpenHit: (hit: RankedSearchHit) => void;
  onClose: () => void;
}

const SEARCH_LIMIT = 12;

export function CommandPalette({
  mode,
  initialQuery = "",
  ctx,
  onOpenHit,
  onClose,
}: CommandPaletteProps): ReactElement {
  const [query, setQuery] = useState(initialQuery);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const { data, isLoading } = useGlobalSearchData();

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const commandResults: readonly Command[] = useMemo(
    () => (mode === "commands" ? filterCommands(query) : []),
    [mode, query],
  );
  const searchResults: readonly RankedSearchHit[] = useMemo(
    () => (mode === "search" ? rankedSearch(data, query, SEARCH_LIMIT) : []),
    [mode, data, query],
  );

  const count = mode === "commands" ? commandResults.length : searchResults.length;
  const clamped = count === 0 ? 0 : Math.min(highlighted, count - 1);

  const activate = (index: number): void => {
    if (mode === "commands") {
      const cmd = commandResults[index];
      if (cmd) {
        if (cmd.id === "open-search") setQuery("");
        cmd.run(ctx);
        setHighlighted(0);
      }
    } else {
      const hit = searchResults[index];
      if (hit) onOpenHit(hit);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(count === 0 ? 0 : (clamped + 1) % count);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(count === 0 ? 0 : (clamped - 1 + count) % count);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activate(clamped);
    }
  };

  const listboxId = "os-palette-listbox";
  const activeId = count > 0 ? `os-palette-option-${clamped}` : undefined;

  return (
    <div className="os-palette-overlay" onClick={onClose}>
      <div
        className="os-palette"
        role="dialog"
        aria-modal="true"
        aria-label={mode === "commands" ? "לוח פקודות" : "חיפוש גלובלי"}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="os-palette__head">
          <span className="os-palette__mode-icon" aria-hidden="true">
            <OsIcon name={mode === "commands" ? "sparkle" : "search"} size={15} />
          </span>
          <input
            ref={inputRef}
            className="os-palette__input"
            type="text"
            role="combobox"
            aria-expanded={count > 0}
            aria-controls={listboxId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            aria-label={mode === "commands" ? "חיפוש פקודה" : "חיפוש בכל המערכת"}
            placeholder={
              mode === "commands" ? "הקלידו פקודה… (למשל: צור ליד חדש)" : "חיפוש בכל המערכת…"
            }
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setHighlighted(0);
            }}
            onKeyDown={onKeyDown}
          />
          <span className="os-palette__kbd" aria-hidden="true">
            Esc
          </span>
        </div>

        <ul className="os-palette__list" role="listbox" id={listboxId} aria-label="תוצאות">
          {mode === "commands" &&
            commandResults.map((cmd, i) => (
              <li
                key={cmd.id}
                id={`os-palette-option-${i}`}
                role="option"
                aria-selected={i === clamped}
                className={`os-palette__item${i === clamped ? " os-palette__item--active" : ""}`}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => activate(i)}
              >
                <span className="os-palette__item-icon" aria-hidden="true">
                  <OsIcon name={cmd.icon} size={15} />
                </span>
                <span className="os-palette__item-title">{cmd.title}</span>
              </li>
            ))}

          {mode === "search" &&
            searchResults.map((hit, i) => (
              <li
                key={`${hit.kind}-${hit.id}`}
                id={`os-palette-option-${i}`}
                role="option"
                aria-selected={i === clamped}
                className={`os-palette__item os-palette__item--hit${
                  i === clamped ? " os-palette__item--active" : ""
                }`}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => activate(i)}
              >
                <span className="os-palette__hit-kind">{hit.kind}</span>
                <span className="os-palette__hit-main">
                  <span className="os-palette__item-title">{hit.title}</span>
                  <span className="os-palette__hit-sub">{hit.subtitle}</span>
                </span>
                <span className="os-palette__hit-meta">
                  <span className="os-palette__hit-field">התאמה: {hit.matchedField}</span>
                  {hit.status && <span className="os-chip os-chip--cyan">{hit.status}</span>}
                </span>
              </li>
            ))}
        </ul>

        {mode === "search" && query.trim() === "" && (
          <div className="os-palette__empty">
            הקלידו כדי לחפש לקוחות, לידים, מדפסות, הצעות ועוד…
          </div>
        )}
        {mode === "search" && query.trim() !== "" && isLoading && (
          <div className="os-palette__empty">טוען נתונים…</div>
        )}
        {mode === "search" && query.trim() !== "" && !isLoading && searchResults.length === 0 && (
          <div className="os-palette__empty">לא נמצאו תוצאות עבור «{query.trim()}»</div>
        )}
        {mode === "commands" && commandResults.length === 0 && (
          <div className="os-palette__empty">
            אין פקודה תואמת — כל {COMMANDS.length} הפקודות זמינות בניקוי החיפוש
          </div>
        )}
      </div>
    </div>
  );
}
