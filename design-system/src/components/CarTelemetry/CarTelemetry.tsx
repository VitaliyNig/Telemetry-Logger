import type { CSSProperties } from "react";

const RPM_BAR_GREEN_END = 11000;
const RPM_BAR_GRADIENT_END = 12000;
const RPM_SCALE_FALLBACK = 15000;

export interface CarTelemetryProps {
  speed: number;
  /** -1 = R, 0 = N, 1-8 = forward gears. */
  gear: number;
  engineRpm: number;
  /** From CarStatus.maxRpm; falls back to 15000 until the first CarStatus packet arrives. */
  maxRpm?: number;
  /** 0-1 */
  throttle: number;
  /** 0-1 */
  brake: number;
  drsActive?: boolean;
  pitLimiterActive?: boolean;
  /** Front brake bias %, from CarStatus. null/undefined renders "--". */
  frontBrakeBias?: number | null;
  /** Differential on-throttle %, from CarSetups. null/undefined renders "--". */
  diffOnThrottle?: number | null;
  /** Last ~180 throttle samples (0-1), oldest first. Drives the pedal trace. */
  throttleHistory?: number[];
  /** Last ~180 brake samples (0-1), oldest first. */
  brakeHistory?: number[];
  className?: string;
}

function rpmSegmentFlex(scale: number) {
  const s = scale > 0 ? scale : RPM_SCALE_FALLBACK;
  const greenEnd = Math.min(RPM_BAR_GREEN_END, s);
  const gradEnd = Math.min(RPM_BAR_GRADIENT_END, s);
  return {
    green: greenEnd,
    gradient: Math.max(0, gradEnd - greenEnd),
    red: Math.max(0, s - gradEnd),
  };
}

function buildPedalPoints(values: number[]) {
  const n = values.length;
  if (n === 0) return "";
  const parts: string[] = [];
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 100 : (i / (n - 1)) * 100;
    const y = 40 - values[i] * 40;
    parts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  return parts.join(" ");
}

const PEDAL_GRID_X = [1, 2, 3, 4, 5].map((i) => (i / 6) * 100);

/** Mirrors `tpl-telemetry` / `updateCarTelemetry25` — RPM strip, DRS/pit/gear/speed tiles, brake-bias/diff column, pedal trace. */
export function CarTelemetry({
  speed,
  gear,
  engineRpm,
  maxRpm = RPM_SCALE_FALLBACK,
  throttle,
  brake,
  drsActive = false,
  pitLimiterActive = false,
  frontBrakeBias,
  diffOnThrottle,
  throttleHistory = [],
  brakeHistory = [],
  className,
}: CarTelemetryProps) {
  const scale = maxRpm > 0 ? maxRpm : RPM_SCALE_FALLBACK;
  const rpmPct = Math.min(100, (engineRpm / scale) * 100);
  const seg = rpmSegmentFlex(scale);
  const gearText = gear === -1 ? "R" : gear === 0 ? "N" : String(gear);
  const throttlePct = Math.round(Math.max(0, Math.min(1, throttle)) * 100);
  const brakePct = Math.round(Math.max(0, Math.min(1, brake)) * 100);

  return (
    <div className={["card", "telemetry-widget", className ?? ""].filter(Boolean).join(" ")}>
      <div className="telemetry-stack">
        <div className="rpm-strip">
          <div className="rpm-bar-bg">
            <div className="rpm-bar-track" aria-hidden="true" />
            <div className="rpm-bar-lit-clip" style={{ "--rpm-pct": `${rpmPct}%` } as CSSProperties}>
              <div className="rpm-bar-lit">
                <span className="rpm-seg rpm-seg-green" style={{ flex: `${seg.green} 0 0` }} />
                <span className="rpm-seg rpm-seg-gradient" style={{ flex: `${seg.gradient} 0 0` }} />
                <span className="rpm-seg rpm-seg-red" style={{ flex: `${seg.red} 0 0` }} />
              </div>
            </div>
          </div>
          <div className="rpm-value-row">
            <span className="rpm-value">{engineRpm} / {scale} RPM</span>
          </div>
        </div>

        <div className="telemetry-middle">
          <div className={["telemetry-cell", "drs-tile", "drs-indicator", drsActive ? "active" : ""].filter(Boolean).join(" ")}>DRS</div>
          <div className={["telemetry-cell", "pit-limiter-tile", pitLimiterActive ? "active" : ""].filter(Boolean).join(" ")} title="Pit limiter">PIT</div>
          <div className="telemetry-cell telemetry-cell-gear">
            <div className="gear-value">{gearText}</div>
          </div>
          <div className="telemetry-cell speed-tile">
            <div className="speed-tile-value">{speed}</div>
            <div className="speed-tile-unit">KM/H</div>
          </div>
          <div className="telemetry-cell telemetry-metrics-column">
            <div className="telemetry-metric-row" title="Front brake bias (Car Status)">
              <span className="telemetry-metric-label">BB</span>
              <span className="telemetry-metric-value">{frontBrakeBias != null ? `${frontBrakeBias}%` : "--"}</span>
            </div>
            <div className="telemetry-metric-row" title="Differential on throttle (Car Setups)">
              <span className="telemetry-metric-label">DIFF</span>
              <span className="telemetry-metric-value">{diffOnThrottle != null ? `${diffOnThrottle}%` : "--"}</span>
            </div>
          </div>
        </div>

        <div className="pedals-panel">
          <div className="pedal-chart-box">
            <svg className="pedal-chart" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
              <g className="pedal-chart-grid">
                {PEDAL_GRID_X.map((x) => (
                  <line key={x} x1={x} y1={0} x2={x} y2={40} />
                ))}
              </g>
              <polyline className="pedal-line pedal-line-brake" fill="none" points={buildPedalPoints(brakeHistory)} />
              <polyline className="pedal-line pedal-line-throttle" fill="none" points={buildPedalPoints(throttleHistory)} />
            </svg>
          </div>
          <div className="pedal-vbars">
            <div className="pedal-vbar">
              <div className="pedal-vbar-track"><div className="pedal-vbar-fill pedal-vbar-brake" style={{ height: `${brakePct}%` }} /></div>
              <span className="pedal-vbar-label">{brakePct}%</span>
            </div>
            <div className="pedal-vbar">
              <div className="pedal-vbar-track"><div className="pedal-vbar-fill pedal-vbar-throttle" style={{ height: `${throttlePct}%` }} /></div>
              <span className="pedal-vbar-label">{throttlePct}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
