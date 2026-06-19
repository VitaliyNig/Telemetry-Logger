import { TyreCompoundBadge } from "../TyreCompoundBadge/TyreCompoundBadge";

export interface StandingsRow {
  pos: number;
  name: string;
  /** Milliseconds behind the race leader; ignored for `pos === 1` ("Leader"). */
  gapMs: number;
  lastLapMs: number;
  /** `visualTyreCompound` id from CarStatus. */
  visualCompound: number;
  tyreAge: number | null;
  /** `0` = none, `1` = "Pitting", `2` = "In Pit". */
  pitStatus: 0 | 1 | 2;
  isPlayer?: boolean;
}

export interface StandingsProps {
  rows: StandingsRow[];
  className?: string;
}

const PIT_STATUS: Record<number, string> = { 0: "", 1: "Pitting", 2: "In Pit" };

// Standings shows short compound abbreviations (S/M/H/SS/I/W), distinct from
// TyreCompoundBadge's default C0-C6 labels used by the Tyres/TyreSets widgets.
const COMPOUND_ABBR: Record<number, string> = {
  16: "S", 17: "M", 18: "H", 19: "SS", 20: "S", 21: "M", 22: "H",
  7: "I", 8: "W", 9: "D", 10: "W", 15: "W",
  11: "SS", 12: "S", 13: "M", 14: "H",
};

function formatTime(ms: number) {
  if (!ms || ms === 0) return "--";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(3).padStart(6, "0")}` : sec.toFixed(3);
}

/** Mirrors `tpl-standings` / `updateStandings` — live position/gap/tyre table. */
export function Standings({ rows, className }: StandingsProps) {
  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="standings-table-wrap">
        <table className="standings-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Gap</th>
              <th>Last Lap</th>
              <th className="standings-tyre-col">Tyre</th>
              <th>Pit</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr className={r.isPlayer ? "player-row" : ""} key={r.pos}>
                <td>{r.pos}</td>
                <td>{r.name}</td>
                <td>{r.pos === 1 ? "Leader" : formatTime(r.gapMs)}</td>
                <td>{formatTime(r.lastLapMs)}</td>
                <td className="standings-tyre-cell">
                  <span className="standings-tyre-wrap">
                    <TyreCompoundBadge compound={r.visualCompound} label={COMPOUND_ABBR[r.visualCompound] ?? "?"} shape="circle" size="sm" />
                    <span className="standings-tyre-age">{r.tyreAge != null && r.tyreAge >= 0 ? r.tyreAge : ""}</span>
                  </span>
                </td>
                <td className="pit-status">{PIT_STATUS[r.pitStatus]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
