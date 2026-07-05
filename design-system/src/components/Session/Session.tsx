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
  /** 0–100 fill of the progress bar, or null/undefined to hide the bar (e.g. unknown total). */
  progressPct?: number | null;
  /** Optional fields — hidden by default in the live widget, shown when provided. */
  pitLimit?: string;
  aiLevel?: string;
  equalCars?: string;
  flagLabel: string;
  flagColor: FlagColor;
  className?: string;
}

/** Big trend-coloured temperature value — mirrors `renderTempWithTrend`. */
function TempValue({ temp, trend }: { temp: number; trend?: TempTrend }) {
  const cls = trend?.cls || "temp-trend-stable";
  let delta = null;
  if (trend && trend.cls) {
    const deltaText = trend.delta > 0 ? `+${trend.delta}°` : trend.delta < 0 ? `${trend.delta}°` : "±0°";
    const arrow = trend.arrow ? `${trend.arrow} ` : "";
    delta = <span className={`temp-delta ${cls}`}>{arrow}{deltaText}</span>;
  }
  return (
    <span className="stat-value session-temp">
      <span className={`temp-num ${cls}`}>{temp}&deg;C</span>
      {delta}
    </span>
  );
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
  progressPct,
  pitLimit,
  aiLevel,
  equalCars,
  flagLabel,
  flagColor,
  className,
}: SessionProps) {
  const showBar = progressPct !== null && progressPct !== undefined;
  const pulse = flagColor === "yellow" || flagColor === "red";
  return (
    <div className={["card", "session-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="session-grid">
        <div className="stat-box session-tile session-tile-track">
          <span className="stat-label">Track</span>
          <span className="stat-value stat-value-track">
            {countryCode && <img className="track-flag" src={`/assets/flags/${countryCode}.svg`} alt={countryCode} />}
            <span>{trackName}</span>
          </span>
        </div>

        <div className="stat-box session-tile">
          <span className="stat-label">Session</span>
          <span className="stat-value">{sessionTypeLabel}</span>
        </div>

        <div className="stat-box session-tile">
          <span className="stat-label">Weather</span>
          <span className="stat-value">{weatherLabel}</span>
        </div>

        <div className="stat-box session-tile session-tile-temp">
          <span className="stat-label">Track Temp</span>
          <TempValue temp={trackTemp} trend={trackTempTrend} />
        </div>

        <div className="stat-box session-tile session-tile-temp">
          <span className="stat-label">Air Temp</span>
          <TempValue temp={airTemp} trend={airTempTrend} />
        </div>

        <div className="stat-box session-tile session-tile-progress">
          <span className="stat-label">{progressLabel}</span>
          <span className="stat-value">{progressValue}</span>
          {showBar && (
            <span className="session-progress-track">
              <span className="session-progress-fill is-animated" style={{ width: `${Math.max(0, Math.min(100, progressPct))}%` }} />
            </span>
          )}
        </div>

        {pitLimit !== undefined && (
          <div className="stat-box session-tile">
            <span className="stat-label">Pit Limit</span>
            <span className="stat-value">{pitLimit}</span>
          </div>
        )}
        {aiLevel !== undefined && (
          <div className="stat-box session-tile">
            <span className="stat-label">AI Level</span>
            <span className="stat-value">{aiLevel}</span>
          </div>
        )}
        {equalCars !== undefined && (
          <div className="stat-box session-tile">
            <span className="stat-label">Equal Cars</span>
            <span className="stat-value">{equalCars}</span>
          </div>
        )}

        <div className="stat-box session-tile session-flags-box">
          <span className="stat-label">Flags</span>
          <span className="stat-value flag-rect" data-flag={flagColor} data-pulse={pulse ? "1" : "0"}>{flagLabel}</span>
        </div>
      </div>
    </div>
  );
}
