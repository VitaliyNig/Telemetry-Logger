export interface LapTimesTyreInfo {
  /** `visualTyreCompound` id. */
  visualCompound: number;
  ageLaps: number;
  /** 0-100, already the max-wheel wear value, rounded. */
  wearPct: number;
}

export interface LapTimesSetup {
  frontWing: number | null;
  rearWing: number | null;
  onThrottle: number | null;
  offThrottle: number | null;
  frontCamber: number | null;
  rearCamber: number | null;
  frontToe: number | null;
  rearToe: number | null;
  frontSuspension: number | null;
  rearSuspension: number | null;
  frontAntiRollBar: number | null;
  rearAntiRollBar: number | null;
  frontSuspensionHeight: number | null;
  rearSuspensionHeight: number | null;
  brakeBias: number | null;
  brakePressure: number | null;
  frontRightTyrePressure: number | null;
  frontLeftTyrePressure: number | null;
  rearRightTyrePressure: number | null;
  rearLeftTyrePressure: number | null;
}

export interface LapTimesRow {
  /** Also the "#" column — the player's lap number in the session, 1-based. */
  lapNum: number;
  invalid?: boolean;
  lapMs: number;
  s1Ms: number;
  s2Ms: number;
  s3Ms: number;
  /** Practice/race sessions show the tyre worn on this lap. */
  tyre?: LapTimesTyreInfo | null;
  /** Qualifying/time-trial sessions show the car setup snapshot for this lap instead. */
  setup?: LapTimesSetup | null;
}

export interface LapTimesCardProps {
  rows: LapTimesRow[];
  /** Single-driver widget — always the player's own team. */
  teamName: string;
  equalCarPerformance: boolean;
  /** Qualifying/time-trial snapshot sessions show a per-lap Setup button column instead of Tyre. */
  showSetup?: boolean;
  /** Row index whose setup popover is open, or null when closed. Mirrors `Popover`'s controlled-`open` pattern — viewport-aware positioning is left to the integrator. */
  openSetupRowIndex?: number | null;
  /** Caller-measured anchor position for the open popover (the real app uses `getBoundingClientRect` + flip-to-fit logic that doesn't belong in a presentational component). */
  setupPopoverPosition?: { left: number; top: number };
  onSetupButtonClick?: (rowIndex: number) => void;
  placeholder?: string;
  className?: string;
}

const VISUAL_COMPOUNDS: Record<number, string> = {
  16: "Soft", 17: "Medium", 18: "Hard", 7: "Inter", 8: "Wet",
  9: "Dry", 10: "Wet", 15: "Wet", 19: "Super Soft", 20: "Soft", 21: "Medium", 22: "Hard",
};

const COMPOUND_DOT_COLORS: Record<number, string> = {
  16: "#ff3333", 17: "#ffd700", 18: "#e0e0e0", 7: "#00cc00", 8: "#00a6ff",
  9: "#e0e0e0", 10: "#00a6ff", 15: "#00a6ff",
  19: "#9B3CC4", 20: "#ff3333", 21: "#ffd700", 22: "#e0e0e0",
};

const LT_SETUP_ICONS = {
  aero: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M1.5 11.2c2.6-4.4 6.3-5 9-3.8 2.2 1 3.6 2.7 4 4.6H4.2l-2.7-.8z" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/><path d="M4.2 12h10.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  diff: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37 1 .608 2.296.07 2.572-1.065z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.8"/></svg>',
  geom: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 13h11M2.5 13V4.5M2.5 13l10.5-8" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  susp: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3 2.5h10M3 13.5h10M4 4.5l8 1.5-8 1.5 8 1.5-8 1.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  brake: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="5.5" stroke="currentColor" stroke-width="1.3"/><circle cx="8" cy="8" r="2" stroke="currentColor" stroke-width="1.3"/><path d="M11.8 4.2l1.3-1.3M4.2 11.8l-1.3 1.3" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  tyre: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="currentColor" stroke-width="2"/><circle cx="8" cy="8" r="2.5" stroke="currentColor" stroke-width="1.3"/><path d="M8 5.5V3M8 13v-2.5M5.5 8H3M13 8h-2.5" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

interface SetupBarDef {
  key: keyof LapTimesSetup;
  label: string;
  min: number;
  max: number;
  suffix: string;
  decimals?: number;
}

interface SetupSectionDef {
  title: string;
  icon: string;
  bars: SetupBarDef[];
}

const SETUP_SECTIONS: SetupSectionDef[] = [
  { title: "Aerodynamics", icon: LT_SETUP_ICONS.aero, bars: [
    { key: "frontWing", label: "Front Wing", min: 0, max: 50, suffix: "" },
    { key: "rearWing", label: "Rear Wing", min: 0, max: 50, suffix: "" },
  ] },
  { title: "Transmission", icon: LT_SETUP_ICONS.diff, bars: [
    { key: "onThrottle", label: "On Throttle", min: 10, max: 100, suffix: "%" },
    { key: "offThrottle", label: "Off Throttle", min: 10, max: 100, suffix: "%" },
  ] },
  { title: "Suspension Geometry", icon: LT_SETUP_ICONS.geom, bars: [
    { key: "frontCamber", label: "Front Camber", min: -3.5, max: -2.5, suffix: "°", decimals: 2 },
    { key: "rearCamber", label: "Rear Camber", min: -2.0, max: -1.0, suffix: "°", decimals: 2 },
    { key: "frontToe", label: "Front Toe", min: 0.0, max: 0.2, suffix: "°", decimals: 2 },
    { key: "rearToe", label: "Rear Toe", min: 0.1, max: 0.25, suffix: "°", decimals: 2 },
  ] },
  { title: "Suspension", icon: LT_SETUP_ICONS.susp, bars: [
    { key: "frontSuspension", label: "Front Suspension", min: 1, max: 41, suffix: "" },
    { key: "rearSuspension", label: "Rear Suspension", min: 1, max: 41, suffix: "" },
    { key: "frontAntiRollBar", label: "Front Anti-Roll Bar", min: 1, max: 21, suffix: "" },
    { key: "rearAntiRollBar", label: "Rear Anti-Roll Bar", min: 1, max: 21, suffix: "" },
    { key: "frontSuspensionHeight", label: "Front Ride Height", min: 15, max: 35, suffix: "" },
    { key: "rearSuspensionHeight", label: "Rear Ride Height", min: 40, max: 60, suffix: "" },
  ] },
  { title: "Brakes", icon: LT_SETUP_ICONS.brake, bars: [
    { key: "brakeBias", label: "Front Brake Bias", min: 50, max: 70, suffix: "%" },
    { key: "brakePressure", label: "Brake Pressure", min: 80, max: 100, suffix: "%" },
  ] },
  { title: "Tyres", icon: LT_SETUP_ICONS.tyre, bars: [
    { key: "frontRightTyrePressure", label: "FR Tyre Pressure", min: 22.5, max: 29.5, suffix: " psi", decimals: 1 },
    { key: "frontLeftTyrePressure", label: "FL Tyre Pressure", min: 22.5, max: 29.5, suffix: " psi", decimals: 1 },
    { key: "rearRightTyrePressure", label: "RR Tyre Pressure", min: 20.5, max: 26.5, suffix: " psi", decimals: 1 },
    { key: "rearLeftTyrePressure", label: "RL Tyre Pressure", min: 20.5, max: 26.5, suffix: " psi", decimals: 1 },
  ] },
];

function formatTime(ms: number) {
  if (!ms || ms === 0) return "--";
  const totalSec = ms / 1000;
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return min > 0 ? `${min}:${sec.toFixed(3).padStart(6, "0")}` : sec.toFixed(3);
}

function SetupBarRow({ def, setup }: { def: SetupBarDef; setup: LapTimesSetup }) {
  const raw = setup[def.key];
  if (raw == null) {
    return (
      <div className="lt-setup-row">
        <span className="lt-setup-label">{def.label}</span>
        <span className="lt-setup-val">—</span>
      </div>
    );
  }
  const display = def.decimals != null ? raw.toFixed(def.decimals) : String(raw);
  const range = def.max - def.min;
  const pct = range > 0 ? Math.max(0, Math.min(100, ((raw - def.min) / range) * 100)) : 0;
  return (
    <div className="lt-setup-row">
      <span className="lt-setup-label">{def.label}</span>
      <div className="lt-setup-bar-track">
        <div className="lt-setup-bar-fill" style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <span className="lt-setup-val">{display}{def.suffix}</span>
    </div>
  );
}

function SetupPopoverContent({ setup }: { setup: LapTimesSetup | null | undefined }) {
  if (!setup) return <p className="lt-setup-empty">No car setup data.</p>;
  return (
    <div className="lt-setup-panel-inner">
      {SETUP_SECTIONS.map((section) => (
        <section className="lt-setup-section" key={section.title}>
          <header className="lt-setup-section-title">
            <span className="lt-setup-section-icon" dangerouslySetInnerHTML={{ __html: section.icon }} />
            {section.title}
          </header>
          <div className="lt-setup-section-body">
            {section.bars.map((bar) => (
              <SetupBarRow key={bar.key} def={bar} setup={setup} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TyreCell({ tyre }: { tyre?: LapTimesTyreInfo | null }) {
  if (!tyre) return <span className="lt-tyre-empty">—</span>;
  const color = COMPOUND_DOT_COLORS[tyre.visualCompound] ?? "var(--text-dim)";
  const compoundName = VISUAL_COMPOUNDS[tyre.visualCompound] ?? "";
  const title = compoundName ? `${compoundName} — age ${tyre.ageLaps}L, wear ${tyre.wearPct}%` : `Age ${tyre.ageLaps}L, wear ${tyre.wearPct}%`;
  return (
    <span className="lt-tyre-cell" title={title}>
      <span className="lt-tyre-dot" style={{ background: color }}>{tyre.ageLaps}</span>
      <span className="lt-tyre-wear">{tyre.wearPct}%</span>
    </span>
  );
}

/** Mirrors `tpl-lapTimes` / `renderLapTimes` — player's own lap-by-lap sector breakdown with tyre or per-lap setup snapshot. */
export function LapTimesCard({
  rows,
  teamName,
  equalCarPerformance,
  showSetup = false,
  openSetupRowIndex = null,
  setupPopoverPosition,
  onSetupButtonClick,
  placeholder = "Waiting for lap data…",
  className,
}: LapTimesCardProps) {
  const perfLetter = equalCarPerformance ? "E" : "R";
  const perfTitle = equalCarPerformance ? "Equal car performance" : "Realistic car performance";
  const openRow = openSetupRowIndex != null ? rows[openSetupRowIndex] : null;

  return (
    <div className={["card", "lap-times-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="lap-times-wrap standings-table-wrap">
        <table className="standings-table lap-times-table">
          <thead>
            <tr>
              <th className="lt-col-lead">#</th>
              <th>Car</th>
              <th>Lap</th>
              <th>S1</th>
              <th>S2</th>
              <th>S3</th>
              {showSetup ? <th className="lt-col-setup" aria-label="Setup" /> : <th className="lt-col-tyre">Tyre</th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="lt-placeholder">{placeholder}</td>
              </tr>
            ) : (
              rows.map((r, i) => (
                <tr key={r.lapNum} className={r.invalid ? "lt-lap-invalid" : ""}>
                  <td>{r.lapNum}</td>
                  <td className="lt-car-cell">
                    <div className="lt-car-inner">
                      <div className="lt-car-meta">
                        <span className="lt-car-name">{teamName}</span>
                      </div>
                      <span className="lt-perf-ico" title={perfTitle}>{perfLetter}</span>
                    </div>
                  </td>
                  <td>{formatTime(r.lapMs)}</td>
                  <td>{formatTime(r.s1Ms)}</td>
                  <td>{formatTime(r.s2Ms)}</td>
                  <td>{formatTime(r.s3Ms)}</td>
                  {showSetup ? (
                    <td>
                      <button
                        type="button"
                        className="lt-setup-btn"
                        title="Setup (click or right‑click)"
                        aria-expanded={openSetupRowIndex === i}
                        onClick={() => onSetupButtonClick?.(i)}
                      >
                        ⋮
                      </button>
                    </td>
                  ) : (
                    <td className="lt-tyre-td">
                      <TyreCell tyre={r.tyre} />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>

        {openRow && (
          <div className="lt-setup-popover" style={setupPopoverPosition}>
            <SetupPopoverContent setup={openRow.setup} />
          </div>
        )}
      </div>
    </div>
  );
}
