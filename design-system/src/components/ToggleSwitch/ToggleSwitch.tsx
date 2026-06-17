import type { InputHTMLAttributes } from "react";

export interface ToggleSwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size" | "type"> {
  /** `small` maps to the `.toggle-switch.small` compact variant. */
  size?: "medium" | "small";
}

/**
 * On/off switch built on a visually-hidden checkbox + `.toggle-slider`.
 * Mirrors the toggles in Settings and the dashboard toolbar.
 */
export function ToggleSwitch({ size = "medium", className, ...rest }: ToggleSwitchProps) {
  const classes = [
    "toggle-switch",
    size === "small" ? "small" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes}>
      <input type="checkbox" {...rest} />
      <span className="toggle-slider" />
    </label>
  );
}
