export interface Telemetry26Props {
  /** False until the first `CarTelemetry26` packet arrives this session (format-2025 sessions stay false forever). */
  hasData: boolean;
  activeAeroAvailable: boolean;
  /** true = straight-line mode, false = cornering mode. */
  activeAeroStraightMode: boolean;
  activeAeroActivationDistance: number;
  overtakeAvailable: boolean;
  overtakeActive: boolean;
  overtakeActivationDistance: number;
  regulations2026: boolean;
  drivingWrongWay: boolean;
  className?: string;
}

function tileState(available: boolean, active: boolean) {
  if (!available) return "idle";
  return active ? "active" : "ready";
}

function formatDistance(d: number) {
  return d > 0 ? `${Math.trunc(d)} m` : "now";
}

/** Mirrors `tpl-telemetry26` / `updateCarTelemetry26` — F1 26 Active Aero + Boost (Overtake) systems. */
export function Telemetry26({
  hasData,
  activeAeroAvailable,
  activeAeroStraightMode,
  activeAeroActivationDistance,
  overtakeAvailable,
  overtakeActive,
  overtakeActivationDistance,
  regulations2026,
  drivingWrongWay,
  className,
}: Telemetry26Props) {
  const aeroState = tileState(activeAeroAvailable, activeAeroStraightMode);
  const boostState = tileState(overtakeAvailable, overtakeActive);

  return (
    <div className={["card", "t26-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="t26-grid">
        <section className="t26-tile t26-tile-aero" data-state={aeroState}>
          <header className="t26-tile-head">
            <span className="t26-tile-label">ACTIVE AERO</span>
            <span className="t26-tile-status">{activeAeroAvailable ? "Ready" : "N/A"}</span>
          </header>
          <div className="t26-mode-row">
            <div className="t26-mode-pill">
              <span className="t26-mode-icon">{activeAeroStraightMode ? "●" : "◐"}</span>
              <span className="t26-mode-text">{!activeAeroAvailable ? "—" : activeAeroStraightMode ? "Straight" : "Corner"}</span>
            </div>
          </div>
          <div className="t26-meta">
            <span className="t26-meta-label">Next zone</span>
            <span className="t26-meta-value">{activeAeroAvailable ? formatDistance(activeAeroActivationDistance) : "—"}</span>
          </div>
        </section>

        <section className="t26-tile t26-tile-boost" data-state={boostState}>
          <header className="t26-tile-head">
            <span className="t26-tile-label">BOOST</span>
            <span className="t26-tile-status">{!overtakeAvailable ? "N/A" : overtakeActive ? "ACTIVE" : "Ready"}</span>
          </header>
          <div className="t26-mode-row">
            <div className="t26-mode-pill">
              <span className="t26-mode-icon">{overtakeActive ? "⚡" : "⟁"}</span>
              <span className="t26-mode-text">{!overtakeAvailable ? "—" : overtakeActive ? "Pushing" : "Armed"}</span>
            </div>
          </div>
          <div className="t26-meta">
            <span className="t26-meta-label">Activates in</span>
            <span className="t26-meta-value">{overtakeAvailable ? formatDistance(overtakeActivationDistance) : "—"}</span>
          </div>
        </section>
      </div>

      <div className="t26-flags">
        {regulations2026 && <span className="t26-badge" title="Car is running 2026 regulations spec">2026 REGS</span>}
        {drivingWrongWay && <span className="t26-warn" title="Car is driving the wrong way around the circuit">⚠ WRONG WAY</span>}
        {!hasData && <span className="t26-placeholder">Awaiting 2026 telemetry…</span>}
      </div>
    </div>
  );
}
