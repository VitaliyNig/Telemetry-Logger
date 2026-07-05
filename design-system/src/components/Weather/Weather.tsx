export interface WeatherForecastSample {
  /** `0`=Clear,`1`=Light Cloud,`2`=Overcast,`3`=Light Rain,`4`=Heavy Rain,`5`=Storm. Anything else falls back to "Unknown". */
  weather: number;
  /** Minutes from now; `0` renders as "Now". */
  timeOffset: number;
  rainPercentage: number;
  trackTemperature: number;
  /** `0`=up,`1`=down,`2`=no change. */
  trackTemperatureChange: number;
  airTemperature: number;
  airTemperatureChange: number;
}

export interface WeatherProps {
  samples: WeatherForecastSample[];
  /** `0` = Perfect, anything else = Approximate (`forecastAccuracy` from the Session packet). */
  forecastAccuracy: number;
  className?: string;
}

const WEATHER_ICONS: Record<number, string> = { 0: "☀️", 1: "🌤️", 2: "☁️", 3: "🌧️", 4: "🌧️", 5: "⛈️" };
const WEATHER_LABELS: Record<number, string> = { 0: "Clear", 1: "Light Cloud", 2: "Overcast", 3: "Light Rain", 4: "Heavy Rain", 5: "Storm" };
const TEMP_CHANGE_ARROW: Record<number, string> = { 0: "▲", 1: "▼", 2: "" };
const TEMP_CHANGE_CLS: Record<number, string> = { 0: "wf-up", 1: "wf-down", 2: "" };

function rainClass(rain: number) {
  return rain >= 60 ? "wf-rain-high" : rain >= 30 ? "wf-rain-med" : "wf-rain-low";
}

/** Mirrors `tpl-weather` / `updateWeatherForecast` — a horizontally scrolling forecast timeline. */
export function Weather({ samples, forecastAccuracy, className }: WeatherProps) {
  if (samples.length === 0) {
    return (
      <div className={["card", "weather-card", className ?? ""].filter(Boolean).join(" ")}>
        <div className="widget-empty">
          <div className="widget-empty-icon"><span className="widget-empty-dash" /></div>
          <div className="widget-empty-title">No forecast data available</div>
          <div className="widget-empty-sub">Waiting for session data</div>
        </div>
      </div>
    );
  }

  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="weather-forecast">
        <div className="wf-accuracy">
          Accuracy: <span className="wf-accuracy-val">{forecastAccuracy === 0 ? "Perfect" : "Approximate"}</span>
        </div>
        <div className="wf-timeline">
          {samples.map((s, i) => (
            <div className="wf-card" key={i}>
              <div className="wf-time">{s.timeOffset === 0 ? "Now" : `+${s.timeOffset}m`}</div>
              <div className="wf-icon">{WEATHER_ICONS[s.weather] ?? "❓"}</div>
              <div className="wf-label">{WEATHER_LABELS[s.weather] ?? "Unknown"}</div>
              <div className={["wf-rain", rainClass(s.rainPercentage)].join(" ")}>{s.rainPercentage}%</div>
              <div className="wf-temps">
                <span className="wf-temp-row">
                  T {s.trackTemperature}° <span className={TEMP_CHANGE_CLS[s.trackTemperatureChange] ?? ""}>{TEMP_CHANGE_ARROW[s.trackTemperatureChange] ?? ""}</span>
                </span>
                <span className="wf-temp-row">
                  A {s.airTemperature}° <span className={TEMP_CHANGE_CLS[s.airTemperatureChange] ?? ""}>{TEMP_CHANGE_ARROW[s.airTemperatureChange] ?? ""}</span>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
