import type { SelectHTMLAttributes } from "react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  /** Convenience: render `<option>`s from a list. Ignored if `children` given. */
  options?: SelectOption[];
}

/**
 * Themed dropdown matching the app's settings/filter selects: dark surface,
 * monospace text, custom chevron.
 */
export function Select({ options, children, className, ...rest }: SelectProps) {
  return (
    <select
      className={["select-field", className ?? ""].filter(Boolean).join(" ")}
      {...rest}
    >
      {children ??
        options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
    </select>
  );
}
