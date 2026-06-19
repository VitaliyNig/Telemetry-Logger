export type GaugeBarTone = "safe" | "warning" | "danger" | "throttle" | "brake" | "ers" | "drs";

export interface GaugeBarProps {
  /** 0-100 (or 0-max) fill percentage. */
  value: number;
  max?: number;
  tone?: GaugeBarTone;
  /** Thinner track, mirrors `.cs-bar-thin` (used for secondary Fuel/ERS rows). */
  thin?: boolean;
  /** Overrides the fill color, e.g. a tyre-wear gradient color computed by the caller. */
  color?: string;
  className?: string;
}

/**
 * Horizontal fill bar used for tyre wear/damage, fuel and ERS deploy/harvest
 * meters. Mirrors `.cs-bar`/`.cs-bar-fill` (Fuel/ERS) and `.damage-bar-bg`/
 * `.damage-bar-fill` (Damage) — same visual language, unified here.
 */
export function GaugeBar({ value, max = 100, tone = "safe", thin = false, color, className }: GaugeBarProps) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));

  return (
    <div className={["gauge-bar", thin ? "gauge-bar-thin" : "", className ?? ""].filter(Boolean).join(" ")}>
      <div
        className={["gauge-bar-fill", color ? "" : `gauge-bar-${tone}`].filter(Boolean).join(" ")}
        style={{ width: `${pct}%`, ...(color ? { background: color } : {}) }}
      />
    </div>
  );
}
