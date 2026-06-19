export type TyreCompoundVariant =
  | "soft"
  | "super-soft"
  | "medium"
  | "hard"
  | "inter"
  | "wet"
  | "unknown";
export type TyreCompoundShape = "square" | "circle";
export type TyreCompoundSize = "sm" | "md" | "lg";

export interface TyreCompoundBadgeProps {
  /** `actualTyreCompound`/`visualTyreCompound` id from CarStatus/TyreSets telemetry. */
  compound?: number;
  /** Explicit color variant, overrides the id→variant lookup. */
  variant?: TyreCompoundVariant;
  /** Text override; defaults to the compound's short label (e.g. "C3", "S", "Inter"). */
  label?: string;
  /** `square` mirrors the lap-table `.compound-badge`; `circle` mirrors `.tyreset-badge`. */
  shape?: TyreCompoundShape;
  /** Only meaningful for `circle` — sm/md/lg mirror `.tyreset-badge-sm`/`.tyreset-badge`/`.chip-badge`. */
  size?: TyreCompoundSize;
  className?: string;
}

// m_actualTyreCompound ids — shared across F1 Modern (16-22), Classic (9-10), F2 (11-15).
const COMPOUND_VARIANT: Record<number, TyreCompoundVariant> = {
  16: "soft", 17: "medium", 18: "hard", 19: "super-soft", 20: "soft", 21: "medium", 22: "hard",
  7: "inter", 8: "wet", 9: "hard", 10: "wet", 15: "wet",
  11: "super-soft", 12: "soft", 13: "medium", 14: "hard",
};

const COMPOUND_LABEL: Record<number, string> = {
  16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
  7: "Inter", 8: "Wet", 9: "Dry", 10: "Wet",
  11: "SS", 12: "S", 13: "M", 14: "H", 15: "W",
};

/**
 * Tyre compound indicator. Mirrors `.compound-badge`/`.tyreset-badge`/`.chip-badge`
 * used across Tyres, TyreSets, Standings and lap tables.
 */
export function TyreCompoundBadge({
  compound,
  variant,
  label,
  shape = "square",
  size = "md",
  className,
}: TyreCompoundBadgeProps) {
  const resolvedVariant = variant ?? (compound != null ? COMPOUND_VARIANT[compound] : undefined) ?? "unknown";
  const resolvedLabel = label ?? (compound != null ? COMPOUND_LABEL[compound] : undefined) ?? "?";

  const classes = [
    "tcb",
    shape === "circle" ? "tcb-circle" : "tcb-square",
    shape === "circle" ? `tcb-${size}` : "",
    `tcb-${resolvedVariant}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={classes}>{resolvedLabel}</span>;
}
