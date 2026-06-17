import type { HTMLAttributes, ReactNode } from "react";

export type BadgeVariant = "warning" | "accent";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  /** `warning` = yellow "Restart required" style; `accent` = brand pill (e.g. "custom"). */
  variant?: BadgeVariant;
  children?: ReactNode;
}

/**
 * Small status tag. `warning` mirrors the "Restart required" badge in Settings;
 * `accent` mirrors the "custom" folder pill in History.
 */
export function Badge({ variant = "accent", children, className, ...rest }: BadgeProps) {
  const classes = ["ds-badge", `ds-badge--${variant}`, className ?? ""]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
