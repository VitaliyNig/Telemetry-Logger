import type { ReactNode } from "react";

export interface StatGridProps {
  children?: ReactNode;
  className?: string;
}

/** Auto-fit grid of `StatBox` tiles. Mirrors `.session-grid`/`.status-grid`/`.lap-grid`. */
export function StatGrid({ children, className }: StatGridProps) {
  return <div className={["stat-grid", className ?? ""].filter(Boolean).join(" ")}>{children}</div>;
}

export interface StatBoxProps {
  label: ReactNode;
  value: ReactNode;
  /** Larger value text, mirrors `.stat-value.big`. */
  big?: boolean;
  className?: string;
}

/** Labeled stat tile used inside Session/Tyres/LapData widget grids. */
export function StatBox({ label, value, big = false, className }: StatBoxProps) {
  return (
    <div className={["stat-box", className ?? ""].filter(Boolean).join(" ")}>
      <span className="stat-label">{label}</span>
      <span className={["stat-value", big ? "stat-value-big" : ""].filter(Boolean).join(" ")}>{value}</span>
    </div>
  );
}
