import { StatGrid, StatBox } from "../StatBox/StatBox";

export interface PitStopHistoryRow {
  lap: number;
  laneMs: number;
  stallMs: number;
}

export interface PitStopTimerProps {
  /** `null` when the car isn't currently in the pit lane (live boxes show "--"). */
  live: { laneMs: number; stallMs: number } | null;
  history: PitStopHistoryRow[];
  className?: string;
}

function formatPitTimeMs(ms: number) {
  if (!ms || ms <= 0) return "--";
  return (ms / 1000).toFixed(2) + "s";
}

/** Mirrors `tpl-pitStopTimer` / `updatePitStopTimer` — live lane/stall clocks plus a stop history table. */
export function PitStopTimer({ live, history, className }: PitStopTimerProps) {
  return (
    <div className={["card", "pit-timer-card", className ?? ""].filter(Boolean).join(" ")}>
      <StatGrid className="pit-timer-live">
        <StatBox label="Pit Lane" value={live ? formatPitTimeMs(live.laneMs) : "--"} />
        <StatBox label="Pit Stall" value={live ? formatPitTimeMs(live.stallMs) : "--"} />
      </StatGrid>
      <div className="pit-timer-history-wrap">
        <table className="pit-timer-history">
          <thead>
            <tr>
              <th className="pit-timer-col-num">#</th>
              <th>Lap</th>
              <th>Lane</th>
              <th>Stall</th>
            </tr>
          </thead>
          <tbody>
            {history.length === 0 ? (
              <tr className="pit-timer-empty">
                <td colSpan={4}>No pit stops yet</td>
              </tr>
            ) : (
              history.map((r, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{r.lap || "--"}</td>
                  <td>{formatPitTimeMs(r.laneMs)}</td>
                  <td>{formatPitTimeMs(r.stallMs)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
