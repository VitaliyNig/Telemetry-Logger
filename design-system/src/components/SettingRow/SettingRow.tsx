import type { ReactNode } from "react";

export interface SettingRowProps {
  /** Field label. */
  label: ReactNode;
  /** `for`/`id` link between label and control. */
  htmlFor?: string;
  /** Helper text under the control. May contain `<code>` etc. */
  hint?: ReactNode;
  /** `toggle` lays the control out inline beside the label (`.setting-toggle`). */
  layout?: "stacked" | "toggle";
  /** The control: an input, Select, ToggleSwitch, etc. */
  children: ReactNode;
  className?: string;
}

/**
 * Labeled settings field with optional hint. Mirrors the `.setting-row` blocks
 * in the Settings tab; `layout="toggle"` matches the inline toggle rows.
 */
export function SettingRow({
  label,
  htmlFor,
  hint,
  layout = "stacked",
  children,
  className,
}: SettingRowProps) {
  const classes = [
    "setting-row",
    layout === "toggle" ? "setting-toggle" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint != null && <span className="setting-hint">{hint}</span>}
    </div>
  );
}
