export interface GapBoardDriver {
  pos: number;
  name: string;
  isPlayer?: boolean;
  /** lapTimeInMs per lap column, aligned with `GapBoardProps.lapNumbers`; `0`/missing renders "--". */
  lapTimesMs: (number | null | undefined)[];
}

export interface GapBoardProps {
  /** Lap numbers (1-based) shown as column headers, oldest first. */
  lapNumbers: number[];
  /** Three rows: car ahead, player, car behind (or top/bottom 3 near the grid edges). */
  drivers: GapBoardDriver[];
  className?: string;
}

function formatTime(ms: number) {
  if (!ms || ms === 0) return "--";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(3).padStart(6, "0")}` : sec.toFixed(3);
}

function formatLapCell(timeMs: number | null | undefined, playerTimeMs: number | null | undefined, isPlayer: boolean) {
  if (!timeMs) return { text: "--", cls: "gap-cell-dim" };
  if (isPlayer) return { text: formatTime(timeMs), cls: "" };

  if (playerTimeMs) {
    const deltaMs = timeMs - playerTimeMs;
    if (deltaMs < 0) return { text: (deltaMs / 1000).toFixed(3), cls: "gap-cell-slower" };
    if (deltaMs > 0) return { text: "+" + (deltaMs / 1000).toFixed(3), cls: "gap-cell-faster" };
  }
  return { text: formatTime(timeMs), cls: "" };
}

/** Mirrors `tpl-gapBoard` / `updateGapBoard` — last N laps for the 3 cars around the player, deltas vs the player's own lap time. */
export function GapBoard({ lapNumbers, drivers, className }: GapBoardProps) {
  if (lapNumbers.length === 0) {
    return (
      <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
        <div className="gap-board-placeholder">Waiting for lap history...</div>
      </div>
    );
  }

  const playerRow = drivers.find((d) => d.isPlayer);

  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="gap-board">
        <table className="gap-table">
          <thead>
            <tr>
              <th className="gap-hdr-label">LAST {lapNumbers.length} LAPS</th>
              {lapNumbers.map((n) => (
                <th key={n}>LAP {n}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {drivers.map((d) => (
              <tr className={d.isPlayer ? "gap-row-player" : ""} key={d.pos}>
                <td className="gap-driver-cell">
                  <span className={["gap-pos", d.isPlayer ? "gap-pos-player" : ""].filter(Boolean).join(" ")}>{d.pos}</span>
                  <span className="gap-driver-name">{d.name}</span>
                </td>
                {lapNumbers.map((n, i) => {
                  const cell = formatLapCell(d.lapTimesMs[i], playerRow?.lapTimesMs[i], !!d.isPlayer);
                  return (
                    <td className={["gap-time-cell", cell.cls].filter(Boolean).join(" ")} key={n}>
                      {cell.text}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
