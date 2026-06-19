export type DeltaMode = "time" | "position";
export type DeltaGoodWhen = "negative" | "positive";

export interface DeltaDisplayProps {
  /** `time`: milliseconds (e.g. `deltaToCarInFrontMs`). `position`: integer position change. */
  value: number | null | undefined;
  mode?: DeltaMode;
  /** Which sign renders green ("good"). Defaults to negative — ahead/gained is good. */
  goodWhen?: DeltaGoodWhen;
  /** Decimal places for `time` mode. */
  precision?: number;
  className?: string;
}

function formatTime(value: number, precision: number) {
  const sign = value >= 0 ? "+" : "−";
  return sign + (Math.abs(value) / 1000).toFixed(precision);
}

function formatPosition(value: number) {
  if (value > 0) return `▲ ${value}`;
  if (value < 0) return `▼ ${Math.abs(value)}`;
  return "–";
}

/**
 * Signed delta formatter. Mirrors `formatLdDelta`/`ldDeltaClass` (Lap Data —
 * gap to car ahead/leader) and the position-change arrows in History's lap
 * times pivot table (`delta-up`/`delta-down`/`delta-same`).
 */
export function DeltaDisplay({
  value,
  mode = "time",
  goodWhen = "negative",
  precision = 3,
  className,
}: DeltaDisplayProps) {
  if (value == null || !Number.isFinite(value)) {
    return <span className={["delta-display", "delta-neutral", className ?? ""].filter(Boolean).join(" ")}>{"–"}</span>;
  }

  const tone = value === 0 ? "neutral" : (value < 0) === (goodWhen === "negative") ? "good" : "bad";
  const text = mode === "time" ? formatTime(value, precision) : formatPosition(value);

  return <span className={["delta-display", `delta-${tone}`, className ?? ""].filter(Boolean).join(" ")}>{text}</span>;
}
