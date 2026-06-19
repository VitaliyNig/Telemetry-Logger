export interface TopSpeedCompareProps {
  /** Highest speed ever observed for the player this session, km/h. */
  sessionBest: number;
  /** Peak speed of the last fully completed lap, km/h. */
  lastLap: number;
  /** Peak speed of the lap currently in progress, km/h. */
  thisLap: number;
  className?: string;
}

function formatSpeedKmh(v: number) {
  if (!v || v <= 0) return "--";
  return Math.round(v).toString();
}

function lastLapDelta(lastLap: number, sessionBest: number) {
  if (!(lastLap > 0 && sessionBest > 0)) return null;
  const delta = Math.round(lastLap - sessionBest);
  if (delta === 0) return { text: "PB", cls: "tsc-delta-pb" };
  return { text: delta.toString(), cls: "tsc-delta-down" };
}

function thisLapDelta(thisLap: number, lastLap: number, sessionBest: number) {
  let delta: number | null = null;
  if (thisLap > 0 && lastLap > 0) delta = Math.round(thisLap - lastLap);
  else if (thisLap > 0 && sessionBest > 0) delta = Math.round(thisLap - sessionBest);
  if (delta === null) return null;
  const sign = delta >= 0 ? "+" : "";
  return { text: `${sign}${delta}`, cls: delta >= 0 ? "tsc-delta-up" : "tsc-delta-down" };
}

/** Mirrors `tpl-topSpeedCompare` / `updateTopSpeedCompareWidget` — session best vs last lap vs live lap peak speed. */
export function TopSpeedCompare({ sessionBest, lastLap, thisLap, className }: TopSpeedCompareProps) {
  const lastDelta = lastLapDelta(lastLap, sessionBest);
  const liveDelta = thisLapDelta(thisLap, lastLap, sessionBest);

  return (
    <div className={["card", "ts-widget-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="tsc-outer" data-ts-widget="compare">
        <div className="tsc-layout">
          <div className="tsc-block">
            <div className="tsc-label">Session best</div>
            <div className="tsc-value-row">
              <span className="tsc-metric">{formatSpeedKmh(sessionBest)}</span>
              <span className="tsc-unit">km/h</span>
            </div>
          </div>
          <div className="tsc-sep tsc-sep-between" aria-hidden="true" />
          <div className="tsc-block">
            <div className="tsc-label">Last lap</div>
            <div className="tsc-value-row">
              <span className="tsc-metric">{lastLap > 0 ? formatSpeedKmh(lastLap) : "--"}</span>
              <span className="tsc-unit">km/h</span>
              <span className={["tsc-delta", lastDelta?.cls ?? ""].filter(Boolean).join(" ")}>{lastDelta?.text ?? ""}</span>
            </div>
          </div>
          <div className="tsc-sep tsc-sep-between" aria-hidden="true" />
          <div className="tsc-block tsc-block-live">
            <div className="tsc-label">This lap</div>
            <div className="tsc-value-row">
              <span className="tsc-metric tsc-live-val">{thisLap > 0 ? formatSpeedKmh(thisLap) : "--"}</span>
              <span className="tsc-unit">km/h</span>
              <span className={["tsc-delta", liveDelta?.cls ?? ""].filter(Boolean).join(" ")}>{liveDelta?.text ?? ""}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
