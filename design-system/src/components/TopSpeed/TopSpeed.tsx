export interface TopSpeedRow {
  name: string;
  /** km/h, typically `speedTrapFastestSpeed` from LapData. */
  speed: number;
  isPlayer?: boolean;
}

export interface TopSpeedProps {
  /** Pre-sorted fastest-first; the component only adds rank numbers. */
  rows: TopSpeedRow[];
  className?: string;
}

function formatSpeedKmh(v: number) {
  if (!v || v <= 0) return "--";
  return Math.round(v).toString();
}

/** Mirrors `tpl-topSpeed` / `updateTopSpeedLeaderboard` — session top-speed ranking. */
export function TopSpeed({ rows, className }: TopSpeedProps) {
  return (
    <div className={["card", "ts-widget-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="ts-widget-layout" data-ts-widget="leaderboard">
        <div className="ts-lb-head">
          <span className="ts-lb-rank">#</span>
          <span className="ts-lb-name">Driver</span>
          <span className="ts-lb-speed">km/h</span>
        </div>
        <div className="ts-lb-rows">
          {rows.length === 0 ? (
            <div className="ts-lb-placeholder">Waiting for telemetry...</div>
          ) : (
            rows.map((r, i) => (
              <div className={["ts-lb-row", r.isPlayer ? "player-row" : ""].filter(Boolean).join(" ")} key={i}>
                <span className="ts-lb-rank">{i + 1}</span>
                <span className="ts-lb-name" title={r.name}>{r.name}</span>
                <span className="ts-lb-speed">{formatSpeedKmh(r.speed)}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
