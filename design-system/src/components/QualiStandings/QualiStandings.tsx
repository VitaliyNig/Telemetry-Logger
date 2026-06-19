import type { ReactNode } from "react";

export interface QualiStandingsRow {
  pos: number;
  name: string;
  /** 0 = no lap set yet. */
  bestLapMs: number;
  statusLabel: string;
  /** "" | "qs-pit" | "qs-garage" | "qs-outlap" | "qs-flying" | "qs-inlap" */
  statusClass: string;
  isPlayer?: boolean;
  lapInvalid?: boolean;
  /** Live delta to this driver's own best previous lap, partial across the lap in progress. null/undefined when not flying or not enough data. */
  liveDeltaMs?: number | null;
  /** Driver is on track and not pitting/in garage — gates whether sector cells render at all. */
  onTrack: boolean;
  /** `LapData.sector`: 0 = currently in S1, 1 = currently in S2, 2 = currently in S3. */
  currentSector: 0 | 1 | 2;
  s1Ms: number;
  s2Ms: number;
  bestS1Ms: number;
  bestS2Ms: number;
  bestS3Ms: number;
}

export interface QualiStandingsProps {
  /** Already sorted into final display order (fastest lap first, no-time rows last). */
  rows: QualiStandingsRow[];
  className?: string;
}

function formatTime(ms: number) {
  if (!ms || ms === 0) return "--";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(3).padStart(6, "0")}` : sec.toFixed(3);
}

function SectorCell({ ms, bestMs, active }: { ms: number; bestMs: number; active: boolean }) {
  if (active) return <span className="qs-sector-active">...</span>;
  if (!ms) return <span className="qs-sector-none">--</span>;
  const text = formatTime(ms);
  if (bestMs && ms <= bestMs) return <span className="qs-sector-up">{text}</span>;
  if (bestMs && ms > bestMs) return <span className="qs-sector-down">{text}</span>;
  return <span>{text}</span>;
}

/** Mirrors `tpl-qualiStandings` / `updateQualiStandings` — ranked best-lap table with live sector progress. */
export function QualiStandings({ rows, className }: QualiStandingsProps) {
  const bestOverall = rows[0]?.bestLapMs ? rows[0].bestLapMs : 0;

  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="standings-table-wrap">
        <table className="standings-table quali-table">
          <thead>
            <tr>
              <th>Pos</th>
              <th>Driver</th>
              <th>Best Lap</th>
              <th>Gap</th>
              <th>Delta</th>
              <th>Status</th>
              <th className="qs-sector-hdr">S1</th>
              <th className="qs-sector-hdr">S2</th>
              <th className="qs-sector-hdr">S3</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const gap =
                i === 0 || !r.bestLapMs || !bestOverall
                  ? i === 0 && r.bestLapMs
                    ? "--"
                    : "No Time"
                  : "+" + ((r.bestLapMs - bestOverall) / 1000).toFixed(3);

              let deltaTd: ReactNode;
              if (r.liveDeltaMs != null) {
                const secs = r.liveDeltaMs / 1000;
                const sign = secs >= 0 ? "+" : "";
                const cls = r.lapInvalid ? "qs-sector-none" : secs < -0.0005 ? "qs-sector-up" : secs > 0.0005 ? "qs-sector-down" : "";
                deltaTd = <span className={cls}>{sign}{secs.toFixed(3)}</span>;
              } else {
                deltaTd = <span className="qs-sector-none">--</span>;
              }

              // Sector 3's live time is never shown mid-lap in the original widget — only the
              // active-sector pulse or a dash; the completed time only ever surfaces via Best Lap.
              const s1 = r.onTrack ? <SectorCell ms={r.currentSector >= 1 ? r.s1Ms : 0} bestMs={r.bestS1Ms} active={r.currentSector === 0} /> : <span className="qs-sector-none">--</span>;
              const s2 = r.onTrack ? <SectorCell ms={r.currentSector >= 2 ? r.s2Ms : 0} bestMs={r.bestS2Ms} active={r.currentSector === 1} /> : <span className="qs-sector-none">--</span>;
              const s3 = r.onTrack ? <SectorCell ms={0} bestMs={r.bestS3Ms} active={r.currentSector === 2} /> : <span className="qs-sector-none">--</span>;

              const rowCls = [r.isPlayer ? "player-row" : "", r.statusClass ? "qs-row-" + r.statusClass : ""].filter(Boolean).join(" ");

              return (
                <tr className={rowCls} key={r.pos}>
                  <td>{i + 1}</td>
                  <td>{r.name}</td>
                  <td>{formatTime(r.bestLapMs)}</td>
                  <td className="qs-gap">{gap}</td>
                  <td className="qs-delta-pb">{deltaTd}</td>
                  <td>
                    <span className={["qs-badge", r.statusClass].filter(Boolean).join(" ")}>{r.statusLabel}</span>
                    {r.lapInvalid && r.statusClass === "qs-flying" && <span className="qs-invalid"> ✗</span>}
                  </td>
                  <td className="qs-sector">{s1}</td>
                  <td className="qs-sector">{s2}</td>
                  <td className="qs-sector">{s3}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
