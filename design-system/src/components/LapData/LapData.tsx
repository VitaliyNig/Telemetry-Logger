export interface LapDataReading {
  /** 0 = no time set yet. */
  currentMs: number;
  /** Reference lap/sector time (previous lap or personal best, caller decides which). 0 = none. */
  refMs: number;
  /** Personal-best lap/sector time, used for the purple "PB" highlight. 0 = none. */
  pbMs: number;
}

export interface LapDataMiniLapRow {
  lapNum: number;
  valid: boolean;
  lap: LapDataReading;
  s1: LapDataReading;
  s2: LapDataReading;
  s3: LapDataReading;
}

export interface LapDataProps {
  lastLap: LapDataReading;
  lastLapValid?: boolean;
  sector1: LapDataReading;
  sector2: LapDataReading;
  sector3: LapDataReading;
  /** 1-3, or null/undefined when no sector is in progress (e.g. between laps). */
  activeSector?: 1 | 2 | 3 | null;
  currentLapMs: number;
  currentLapInvalid?: boolean;
  /** Predicted finish time for the lap in progress; 0 = not enough data yet. */
  predictedFinishMs: number;
  /** Most recent laps, oldest first (the app keeps the last 5). */
  miniLaps?: LapDataMiniLapRow[];
  className?: string;
}

function formatLapClock(ms: number) {
  if (!ms || ms <= 0) return "--";
  const x = Math.round(ms);
  const msPart = x % 1000;
  let t = Math.floor(x / 1000);
  const s = t % 60;
  t = Math.floor(t / 60);
  const m = t % 60;
  const h = Math.floor(t / 60);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const p3 = (n: number) => String(n).padStart(3, "0");
  return h > 0 ? `${h}:${p2(m)}:${p2(s)}.${p3(msPart)}` : `${m}:${p2(s)}.${p3(msPart)}`;
}

function formatDelta(deltaMs: number) {
  const sign = deltaMs >= 0 ? "+" : "−";
  return `${sign}${(Math.abs(deltaMs) / 1000).toFixed(3)}`;
}

function deltaClass(deltaMs: number) {
  if (deltaMs < 0) return "ld-delta-up";
  if (deltaMs > 0) return "ld-delta-down";
  return "ld-delta-neutral";
}

function sectorClass({ currentMs, refMs }: LapDataReading, isPB: boolean) {
  if (!currentMs) return "ld-none";
  if (isPB) return "ld-pb";
  if (refMs && currentMs < refMs) return "ld-up";
  if (refMs && currentMs > refMs) return "ld-down";
  return "";
}

function Delta({ reading }: { reading: LapDataReading }) {
  if (!reading.currentMs || !reading.refMs) return <span className="ld-delta" />;
  const d = reading.currentMs - reading.refMs;
  return <span className={["ld-delta", deltaClass(d)].join(" ")}>{formatDelta(d)}</span>;
}

function MiniSq({ reading, isPB, valid }: { reading: LapDataReading; isPB: boolean; valid: boolean }) {
  const cls = ["ld-mini-sq", sectorClass(reading, isPB), valid ? "" : "ld-mini-invalid"].filter(Boolean).join(" ");
  return <span className={cls} />;
}

function sectorReadingOf(row: LapDataMiniLapRow, num: 1 | 2 | 3): LapDataReading {
  return num === 1 ? row.s1 : num === 2 ? row.s2 : row.s3;
}

function Sector({
  num,
  reading,
  lastLapValid,
  miniLaps,
  active,
}: {
  num: 1 | 2 | 3;
  reading: LapDataReading;
  lastLapValid: boolean;
  miniLaps: LapDataMiniLapRow[];
  active: boolean;
}) {
  const isPB = lastLapValid && reading.pbMs > 0 && reading.currentMs === reading.pbMs;
  return (
    <div className={["ld-sector", active ? "ld-sector-active" : ""].filter(Boolean).join(" ")} data-ld-sector={num}>
      <div className="ld-sector-head">
        <span className="ld-sector-label">S{num}</span>
        <Delta reading={reading} />
      </div>
      <div className={["ld-sector-time", sectorClass(reading, isPB)].filter(Boolean).join(" ")}>
        {formatLapClock(reading.currentMs)}
      </div>
      <div className="ld-mini-strip">
        {miniLaps.map((row) => {
          const r = sectorReadingOf(row, num);
          return <MiniSq key={row.lapNum} reading={r} isPB={row.valid && r.pbMs > 0 && r.currentMs === r.pbMs} valid={row.valid} />;
        })}
      </div>
    </div>
  );
}

/** Mirrors `tpl-lapData` / `updateLapDataWidget` — last lap + 3 sectors vs. reference, current lap progress, recent-lap mini strips. */
export function LapData({
  lastLap,
  lastLapValid = true,
  sector1,
  sector2,
  sector3,
  activeSector,
  currentLapMs,
  currentLapInvalid = false,
  predictedFinishMs,
  miniLaps = [],
  className,
}: LapDataProps) {
  const lastLapIsPB = lastLapValid && lastLap.pbMs > 0 && lastLap.currentMs === lastLap.pbMs;

  return (
    <div className={["card", "lap-data-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="ld-last-block">
        <div className="ld-last-head">
          <span className="ld-label">Last Lap</span>
          <Delta reading={lastLap} />
        </div>
        <div className={["ld-time", "ld-last-time", sectorClass(lastLap, lastLapIsPB)].filter(Boolean).join(" ")}>
          {formatLapClock(lastLap.currentMs)}
        </div>
        <div className="ld-mini-strip">
          {miniLaps.map((row) => (
            <MiniSq key={row.lapNum} reading={row.lap} isPB={row.valid && row.lap.pbMs > 0 && row.lap.currentMs === row.lap.pbMs} valid={row.valid} />
          ))}
        </div>
      </div>

      <div className="ld-sectors">
        <Sector num={1} reading={sector1} lastLapValid={lastLapValid} miniLaps={miniLaps} active={activeSector === 1} />
        <Sector num={2} reading={sector2} lastLapValid={lastLapValid} miniLaps={miniLaps} active={activeSector === 2} />
        <Sector num={3} reading={sector3} lastLapValid={lastLapValid} miniLaps={miniLaps} active={activeSector === 3} />
      </div>

      <div className="ld-current-block">
        <div className="ld-current-head">
          <span className="ld-label">Current Lap</span>
          {currentLapInvalid && <span className="ld-invalid-badge">INV</span>}
        </div>
        <div className="ld-time ld-current-time">{formatLapClock(currentLapMs)}</div>
        <div className="ld-predicted">
          <span className="ld-predicted-label">est. finish</span> {formatLapClock(predictedFinishMs)}
        </div>
      </div>
    </div>
  );
}
