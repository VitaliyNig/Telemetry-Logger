const TYRE_CORNERS = ["RL", "RR", "FL", "FR"] as const;
type Corner = (typeof TYRE_CORNERS)[number];

export interface TyresProps {
  /** [RL, RR, FL, FR], °C — from CarTelemetry. */
  tyresInnerTemperature: number[];
  /** [RL, RR, FL, FR], °C — from CarTelemetry. */
  tyresSurfaceTemperature: number[];
  /** [RL, RR, FL, FR], psi — from CarTelemetry. */
  tyresPressure: number[];
  /** [RL, RR, FL, FR], 0-100% — from CarDamage. */
  tyresWear: number[];
  /** [RL, RR, FL, FR], 0-100% — from CarDamage. */
  tyreBlisters: number[];
  visualTyreCompound: number;
  actualTyreCompound: number;
  tyresAgeLaps: number;
  className?: string;
}

const VISUAL_COMPOUNDS: Record<number, string> = {
  16: "Soft", 17: "Medium", 18: "Hard", 7: "Inter", 8: "Wet",
  9: "Dry", 10: "Wet",
  15: "Wet", 19: "Super Soft", 20: "Soft", 21: "Medium", 22: "Hard",
};
const ACTUAL_COMPOUNDS: Record<number, string> = {
  16: "C5", 17: "C4", 18: "C3", 19: "C2", 20: "C1", 21: "C0", 22: "C6",
  7: "Inter", 8: "Wet", 9: "Dry", 10: "Wet",
  11: "SS", 12: "S", 13: "M", 14: "H", 15: "W",
};
const COMPOUND_DOT_COLORS: Record<number, string> = {
  16: "#ff3333", 17: "#ffd700", 18: "#e0e0e0", 7: "#00cc00", 8: "#00a6ff",
  9: "#e0e0e0", 10: "#00a6ff", 15: "#00a6ff",
  19: "#9B3CC4", 20: "#ff3333", 21: "#ffd700", 22: "#e0e0e0",
};

interface TempRange { cold: number; perfectLow: number; perfectHigh: number; hot: number }
const ACTUAL_COMPOUND_TEMP: Record<number, TempRange> = {
  20: { cold: 70, perfectLow: 100, perfectHigh: 110, hot: 130 },
  19: { cold: 60, perfectLow: 100, perfectHigh: 100, hot: 130 },
  18: { cold: 60, perfectLow: 90, perfectHigh: 100, hot: 120 },
  17: { cold: 50, perfectLow: 80, perfectHigh: 90, hot: 120 },
  16: { cold: 40, perfectLow: 70, perfectHigh: 90, hot: 110 },
  22: { cold: 40, perfectLow: 70, perfectHigh: 80, hot: 100 },
  7: { cold: 20, perfectLow: 60, perfectHigh: 70, hot: 90 },
  8: { cold: 20, perfectLow: 50, perfectHigh: 60, hot: 80 },
  14: { cold: 70, perfectLow: 100, perfectHigh: 110, hot: 130 },
  13: { cold: 60, perfectLow: 90, perfectHigh: 100, hot: 120 },
  12: { cold: 50, perfectLow: 80, perfectHigh: 90, hot: 120 },
  11: { cold: 40, perfectLow: 70, perfectHigh: 80, hot: 110 },
  15: { cold: 20, perfectLow: 50, perfectHigh: 60, hot: 80 },
};
const ACTUAL_COMPOUND_TEMP_DEFAULT: TempRange = { cold: 60, perfectLow: 90, perfectHigh: 100, hot: 120 };

const COMPOUND_BLISTER_TEMP_C: Record<number, { min: number; max: number }> = {
  20: { min: 115, max: 155 }, 19: { min: 115, max: 155 }, 18: { min: 115, max: 155 },
  17: { min: 115, max: 155 }, 16: { min: 115, max: 155 }, 22: { min: 115, max: 155 },
  7: { min: 100, max: 140 }, 8: { min: 90, max: 130 },
  14: { min: 115, max: 155 }, 13: { min: 115, max: 155 }, 12: { min: 115, max: 155 },
  11: { min: 115, max: 155 }, 15: { min: 90, max: 130 },
};

const TEMP_COLORS = { cold: "#00a6ff", normal: "#22c55e", perfect: "#b85cff", hot: "#eab308", critical: "#ef4444" };

function getCompoundTempRange(actualCompoundId: number) {
  return ACTUAL_COMPOUND_TEMP[actualCompoundId] || ACTUAL_COMPOUND_TEMP_DEFAULT;
}
function getCompoundBlisterTemp(actualCompoundId: number) {
  return COMPOUND_BLISTER_TEMP_C[actualCompoundId] || null;
}
function tyreTempColor(temp: number | undefined, range: TempRange) {
  const t = Number(temp);
  if (!Number.isFinite(t) || t <= 0) return null;
  if (t < range.cold) return TEMP_COLORS.cold;
  if (t < range.perfectLow) return TEMP_COLORS.normal;
  if (t <= range.perfectHigh) return TEMP_COLORS.perfect;
  if (t <= range.hot) return TEMP_COLORS.hot;
  return TEMP_COLORS.critical;
}
function tyreTempColorAlpha(temp: number | undefined, range: TempRange, alpha: number) {
  const hex = tyreTempColor(temp, range);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
function formatDeg(v: number | undefined | null) {
  if (v === undefined || v === null || v === 0) return "--";
  return v + "°";
}

/** Mirrors `tpl-tyres` / `setTyreWidgetTemps`+`setTyreWidgetWear`+`setTyreWidgetCompoundAge` — 4-corner tyre temp/wear/pressure readout. */
export function Tyres({
  tyresInnerTemperature,
  tyresSurfaceTemperature,
  tyresPressure,
  tyresWear,
  tyreBlisters,
  visualTyreCompound,
  actualTyreCompound,
  tyresAgeLaps,
  className,
}: TyresProps) {
  const range = getCompoundTempRange(actualTyreCompound);
  const blister = getCompoundBlisterTemp(actualTyreCompound);

  const visual = VISUAL_COMPOUNDS[visualTyreCompound] || "--";
  const actual = ACTUAL_COMPOUNDS[actualTyreCompound] || "";
  const dotCol = COMPOUND_DOT_COLORS[visualTyreCompound] || "var(--text-dim)";
  const nameText = actual || visual;
  const rangeText = blister
    ? `${range.perfectLow}–${range.perfectHigh}°C · ⚠ ${blister.min}°C`
    : `${range.perfectLow}–${range.perfectHigh}°C`;

  return (
    <div className={["card", "tyre-widget", className ?? ""].filter(Boolean).join(" ")}>
      <div className="tyres-grid">
        {TYRE_CORNERS.map((corner, i) => {
          const ts = tyresSurfaceTemperature?.[i];
          const ti = tyresInnerTemperature?.[i];
          const surfCol = tyreTempColor(ts, range);
          const innerCol = tyreTempColor(ti, range);
          const tsNum = Number(ts);
          const inBlister = !!blister && Number.isFinite(tsNum) && tsNum >= blister.min;
          const w = tyresWear?.[i];
          const pct = w != null && Number.isFinite(Number(w)) ? Math.min(100, Math.max(0, Number(w))) : null;

          return (
            <div
              className={inBlister ? "tc tc-blister-risk" : "tc"}
              data-tyre-corner={corner}
              key={corner}
              style={{
                borderColor: surfCol || "var(--border)",
                boxShadow: inBlister ? "0 0 12px rgba(239,68,68,0.6)" : surfCol ? `0 0 8px ${tyreTempColorAlpha(ts, range, 0.3)}` : "",
              }}
            >
              <div className="tc-fill" style={{ height: pct !== null ? `${100 - pct}%` : "100%", background: innerCol ? tyreTempColorAlpha(ti, range, 0.12) ?? "" : "" }} />
              <div className="tc-body">
                <div className="tc-temps">
                  <svg className="tc-ico" viewBox="0 0 10 10" style={{ color: surfCol || "var(--text-dim)" }}>
                    <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeWidth="1.8" fill="currentColor" fillOpacity="0.25" />
                  </svg>
                  <span className="tc-tv tc-ts" style={{ color: surfCol || "" }}>{formatDeg(ts)}</span>
                  <span className="tc-sep">|</span>
                  <svg className="tc-ico" viewBox="0 0 10 10" style={{ color: innerCol || "var(--text-dim)" }}>
                    <circle cx="5" cy="5" r="3.5" stroke="currentColor" strokeOpacity="0.35" strokeWidth="1.8" fill="currentColor" />
                  </svg>
                  <span className="tc-tv tc-ti" style={{ color: innerCol || "" }}>{formatDeg(ti)}</span>
                </div>
                <div className="tc-wear">{pct !== null ? `${Math.round(pct)}%` : "--"}</div>
                <div className="tc-info">
                  <span className="tc-bls">{tyreBlisters?.[i] != null ? `Blisters ${tyreBlisters[i]}%` : "Blisters --"}</span>
                </div>
                <div className="tc-psi">{tyresPressure?.[i] != null ? `${tyresPressure[i].toFixed(1)} psi` : "-- psi"}</div>
              </div>
              <span className={`tc-lbl tc-lbl-${corner}`}>{cornerLabel(corner)}</span>
            </div>
          );
        })}
      </div>
      <div className="tyre-info-row">
        <span className="ti-dot" style={{ background: dotCol }} />
        <span className="ti-name">{nameText}</span>
        <span className="ti-range">{rangeText}</span>
        <span className="ti-age">{tyresAgeLaps} laps</span>
      </div>
    </div>
  );
}

function cornerLabel(corner: Corner) {
  switch (corner) {
    case "FL": return "◤ FL";
    case "FR": return "FR ◥";
    case "RL": return "◣ RL";
    case "RR": return "RR ◢";
  }
}
