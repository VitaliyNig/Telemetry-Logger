export interface FuelErsProps {
  /** 0=Lean, 1=Standard, 2=Rich, 3=Max */
  fuelMix: number;
  fuelInTank: number;
  /** Signed MFD fuel delta — laps of surplus (+) or deficit (-) to finish the race. */
  fuelRemainingLaps: number;
  isRaceSession: boolean;
  /** 0=None, 1=Medium, 2=Hot, 3=Overtake */
  ersDeployMode: number;
  ersStoreEnergy: number;
  ersDeployedThisLap: number;
  /** Format-2026 per-lap harvest cap (MGU-K + MGU-H combined); `0` on format-2025 packets. */
  ersHarvestLimitPerLap: number;
  ersHarvestedThisLapMguK: number;
  ersHarvestedThisLapMguH: number;
  className?: string;
}

const FUEL_MIX_BADGE: Record<number, string> = { 0: "LEAN", 1: "STD", 2: "RICH", 3: "MAX" };
const ERS_MODE_BADGE: Record<number, string> = { 0: "NONE", 1: "MED", 2: "HOT", 3: "OVER" };
const MAX_ERS_J = 4_000_000;
const MAX_MGUK_HARVEST_J = 2_000_000;

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}

/** Mirrors `tpl-fuelErs` / `updateFuelErsWidget` — fuel mix/tank/delta + ERS store/deploy/harvest bars. */
export function FuelErs({
  fuelMix,
  fuelInTank,
  fuelRemainingLaps,
  isRaceSession,
  ersDeployMode,
  ersStoreEnergy,
  ersDeployedThisLap,
  ersHarvestLimitPerLap,
  ersHarvestedThisLapMguK,
  ersHarvestedThisLapMguH,
  className,
}: FuelErsProps) {
  const showDelta = isRaceSession && Number.isFinite(fuelRemainingLaps);
  const deltaSign = fuelRemainingLaps >= 0 ? "+" : "";
  const deltaCls = fuelRemainingLaps < -0.3 ? "cs-delta-crit" : fuelRemainingLaps > 0 ? "cs-delta-up" : "cs-delta-warn";

  const storeJ = Math.max(0, ersStoreEnergy || 0);
  const storePct = clampPct((storeJ / MAX_ERS_J) * 100);

  const deployJ = Math.max(0, ersDeployedThisLap || 0);
  const deployPct = clampPct((deployJ / MAX_ERS_J) * 100);

  const has2026Limit = ersHarvestLimitPerLap > 0;
  const harvKJ = Math.max(0, ersHarvestedThisLapMguK || 0);
  const harvHJ = Math.max(0, ersHarvestedThisLapMguH || 0);
  const harvestJ = has2026Limit ? harvKJ + harvHJ : harvKJ;
  const harvestCapJ = has2026Limit ? ersHarvestLimitPerLap : MAX_MGUK_HARVEST_J;
  const harvestPct = harvestCapJ > 0 ? clampPct((harvestJ / harvestCapJ) * 100) : 0;
  const harvestBarCls = harvestPct >= 95 ? "cs-bar-crit" : harvestPct >= 85 ? "cs-bar-warn" : "";

  return (
    <div className={["card", "cs-card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="cs-grid">
        <section className="cs-section cs-fuel">
          <header className="cs-section-head">
            <span className="cs-section-label">FUEL</span>
            <span className="cs-badge" data-mix={fuelMix}>{FUEL_MIX_BADGE[fuelMix] ?? "--"}</span>
          </header>
          {showDelta && (
            <div className="cs-fuel-delta">
              <span className="cs-micro-label">Δ vs target</span>
              <span className={["cs-big-value", deltaCls].join(" ")}>{deltaSign}{fuelRemainingLaps.toFixed(2)}</span>
            </div>
          )}
          <div className="cs-fuel-metrics">
            <div className="cs-stat">
              <span className="cs-micro-label">In tank</span>
              <span className="cs-value">{fuelInTank.toFixed(1)} kg</span>
            </div>
            <div className="cs-stat">
              <span className="cs-micro-label">Laps</span>
              <span className="cs-value">{fuelRemainingLaps.toFixed(1)} L</span>
            </div>
          </div>
        </section>
        <section className="cs-section cs-ers">
          <header className="cs-section-head">
            <span className="cs-section-label">ERS</span>
            <span className="cs-badge" data-mode={ersDeployMode}>{ERS_MODE_BADGE[ersDeployMode] ?? "--"}</span>
          </header>
          <div className="cs-ers-row">
            <div className="cs-row-head"><span className="cs-micro-label">Store</span><span className="cs-bar-value">{storePct.toFixed(0)}% · {(storeJ / 1_000_000).toFixed(2)} MJ</span></div>
            <div className="cs-bar cs-bar-store"><div className="cs-bar-fill" style={{ width: `${storePct}%` }} /></div>
          </div>
          <div className="cs-ers-row">
            <div className="cs-row-head"><span className="cs-micro-label">Deploy / lap</span><span className="cs-bar-value">{(deployJ / 1_000_000).toFixed(2)} / 4.00 MJ</span></div>
            <div className="cs-bar cs-bar-thin"><div className="cs-bar-fill cs-bar-deploy" style={{ width: `${deployPct}%` }} /></div>
          </div>
          <div className="cs-ers-row">
            <div className="cs-row-head"><span className="cs-micro-label">Harvest / lap</span><span className="cs-bar-value">{(harvestJ / 1_000_000).toFixed(2)} / {(harvestCapJ / 1_000_000).toFixed(2)} MJ</span></div>
            <div className="cs-bar cs-bar-thin"><div className={["cs-bar-fill", "cs-bar-harvest", harvestBarCls].filter(Boolean).join(" ")} style={{ width: `${harvestPct}%` }} /></div>
          </div>
        </section>
      </div>
    </div>
  );
}
