import type { ButtonHTMLAttributes, ReactElement, ReactNode } from "react";
import { OsIcon, type IconName } from "./icons";
import "../styles/components.css";

export type OsButtonVariant =
  "primary" | "cyan" | "violet" | "success" | "danger" | "ghost" | "approve" | "reject";

interface OsButtonBaseProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "disabled" | "type" | "onClick"
> {
  variant?: OsButtonVariant;
  size?: "sm" | "md" | "lg";
  icon?: IconName;
  onClick?: () => void;
  type?: "button" | "submit";
  className?: string;
  children?: ReactNode;
}

/**
 * Honesty contract enforced at the type level: a disabled button MUST
 * explain itself — `disabled: true` requires `disabledReason` (Hebrew).
 * Never disable silently.
 */
export type OsButtonProps = OsButtonBaseProps &
  ({ disabled: true; disabledReason: string } | { disabled?: false; disabledReason?: undefined });

/**
 * OsButton — the OS action button.
 * When disabled, `disabledReason` renders as a visible Hebrew tooltip on
 * hover/focus, a native title, and an aria-label on the focusable wrapper.
 */
export function OsButton({
  variant = "primary",
  size = "md",
  icon,
  disabled = false,
  disabledReason,
  onClick,
  type = "button",
  className = "",
  children,
  ...rest
}: OsButtonProps): ReactElement {
  const btnCls = ["os-btn", `os-btn--${variant}`, size !== "md" ? `os-btn--${size}` : "", className]
    .filter(Boolean)
    .join(" ");

  const showReason = disabled && disabledReason ? disabledReason : undefined;

  const button = (
    <button
      type={type}
      className={btnCls}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      title={showReason}
      {...rest}
    >
      {icon && <OsIcon name={icon} size={size === "sm" ? 12 : 14} />}
      {children}
    </button>
  );

  // Wrapper carries the tooltip; tabIndex lets keyboard users reach the reason
  // even though the native button is unfocusable while disabled.
  return (
    <span
      className="os-btn-wrap"
      data-disabled-reason={showReason}
      tabIndex={showReason ? 0 : undefined}
      aria-label={showReason}
    >
      {button}
    </span>
  );
}
