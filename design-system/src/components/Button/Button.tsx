import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "medium" | "small";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual style. Maps to the app's `.btn-*` modifier classes. */
  variant?: ButtonVariant;
  /** `small` maps to `.btn-small` (compact padding/font). */
  size?: ButtonSize;
  /** Optional leading icon (e.g. an inline SVG). */
  icon?: ReactNode;
  children?: ReactNode;
}

const variantClass: Record<ButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  ghost: "btn-ghost",
  danger: "btn-danger",
};

/**
 * Standard action button. Mirrors the `.btn` family from the Telemetry Logger
 * toolbar, settings, and history toolbar.
 */
export function Button({
  variant = "primary",
  size = "medium",
  icon,
  children,
  className,
  type = "button",
  ...rest
}: ButtonProps) {
  const classes = [
    "btn",
    variantClass[variant],
    size === "small" ? "btn-small" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button type={type} className={classes} {...rest}>
      {icon}
      {children}
    </button>
  );
}
