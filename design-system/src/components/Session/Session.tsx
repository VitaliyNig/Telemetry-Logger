import { StatBox, StatGrid } from "../StatBox/StatBox";

export interface TempTrend {
  /** "▲" / "▼" / "—" */
  arrow: string;
  cls: "temp-trend-up" | "temp-trend-down" | "temp-trend-stable" | "";
  /** Signed degree change vs. the oldest sample in the rolling history window. */
  delta: number;
}

export type FlagColor = "none" | "red" | "yellow" | "blue" | "green";

export interface SessionProps {
  trackName: string;
  /** ISO 3166-1 alpha-2, resolves to `/assets/flags/<countryCode>.svg`. */
  countryCode?: string;
  sessionTypeLabel: string;
  /** e.g. "Clear ☀️" — `WEATHER_NAMES` already bakes the emoji into the label. */
  weatherLabel: string;
  trackTemp: number;
  trackTempTrend?: TempTrend;
  airTemp: number;
  airTempTrend?: TempTrend;
  /** "Laps" or "Time" depending on session type. */
  progressLabel: string;
  progressValue: string;
  flagLabel: string;
  flagColor: FlagColor;
  className?: string;
}

function renderTrend(trend?: TempTrend) {
  if (!trend || !trend.arrow) return null;
  const deltaText = trend.delta !== 0 ? ` (${trend.delta > 0 ? "+" : ""}${trend.delta}°)` : "";
  return <span className={["temp-trend", trend.cls].filter(Boolean).join(" ")}>{trend.arrow}{deltaText}</span>;
}

/** Mirrors `tpl-session` / `updateSession` — track, session type, weather, temps, progress, flags. */
export function Session({
  trackName,
  countryCode,
  sessionTypeLabel,
  weatherLabel,
  trackTemp,
  trackTempTrend,
  airTemp,
  airTempTrend,
  progressLabel,
  progressValue,
  flagLabel,
  flagColor,
  className,
}: SessionProps) {
  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <StatGrid>
        <div className="stat-box">
          <span className="stat-label">Track</span>
          <span className="stat-value stat-value-track">
            {countryCode && <img className="track-flag" src={`/assets/flags/${countryCode}.svg`} alt={countryCode} />}
            <span>{trackName}</span>
          </span>
        </div>
        <StatBox label="Session" value={sessionTypeLabel} />
        <StatBox label="Weather" value={weatherLabel} />
        <StatBox label="Track Temp" value={<>{trackTemp}&deg;C {renderTrend(trackTempTrend)}</>} />
        <StatBox label="Air Temp" value={<>{airTemp}&deg;C {renderTrend(airTempTrend)}</>} />
        <StatBox label={progressLabel} value={progressValue} />
        <div className="stat-box session-flags-box">
          <span className="stat-label">Flags</span>
          <span className="stat-value flag-rect" data-flag={flagColor}>{flagLabel}</span>
        </div>
      </StatGrid>
    </div>
  );
}
