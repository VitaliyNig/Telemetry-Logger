import type { ReactNode } from "react";

export interface FuelErsProps {
  /** m_formula from the Session packet: 13 = F1 26, 2 = F2, anything else = F1 25. */
  formula: number;
  /** 0=Lean, 1=Standard, 2=Rich, 3=Max */
  fuelMix: number;
  fuelInTank: number;
  /** Signed MFD fuel delta — laps of surplus (+) or deficit (-) to finish the race. */
  fuelRemainingLaps: number;
  isRaceSession: boolean;
  /** 0=None, 1=Medium, 2=Hot, 3=Overtake/Boost */
  ersDeployMode: number;
  ersStoreEnergy: number;
  ersDeployedThisLap: number;
  /** Format-2026 per-lap harvest cap (MGU-K, MGU-H removed by the 2026 regs); `0` on format-2025 packets. */
  ersHarvestLimitPerLap: number;
  ersHarvestedThisLapMguK: number;
  ersHarvestedThisLapMguH: number;
  /**
   * F1 26 has no documented deploy/lap cap, so the live widget scales the bar to
   * the session peak (floored at 4 MJ) and passes the resolved value here. When
   * omitted, F1 26 falls back to max(deployed, 4 MJ) from this single snapshot.
   */
  deployCapMJ?: number;
  className?: string;
}

const FUEL_MIX_BADGE: Record<number, string> = { 0: "LEAN", 1: "STD", 2: "RICH", 3: "MAX" };
const ERS_MODE_NAME: Record<number, string> = { 0: "NONE", 1: "MEDIUM", 2: "HOTLAP" };
const MAX_ERS_J = 4_000_000;
const MAX_MGUK_HARVEST_J = 2_000_000;

const FORMULA_F1_26 = 13;
const FORMULA_F2 = 2;

type RegKey = "2026" | "2025" | "f2";

interface RegCfg {
  storeCapJ?: number;
  /** null = auto-peak (resolved by caller via deployCapMJ). */
  deployCapJ?: number | null;
  overName?: string;
  harvest?: "combined" | "split";
  hasErs: boolean;
}

const REG_CFG: Record<RegKey, RegCfg> = {
  "2026": { storeCapJ: MAX_ERS_J, deployCapJ: null, overName: "BOOST", harvest: "combined", hasErs: true },
  "2025": { storeCapJ: MAX_ERS_J, deployCapJ: MAX_ERS_J, overName: "OVERTAKE", harvest: "split", hasErs: true },
  "f2": { hasErs: false },
};

function regKeyForFormula(formula: number): RegKey {
  if (formula === FORMULA_F1_26) return "2026";
  if (formula === FORMULA_F2) return "f2";
  return "2025";
}

function clampPct(v: number) {
  return Math.max(0, Math.min(100, v));
}
function toMJ(j: number) {
  return (Math.max(0, j) / 1_000_000).toFixed(2);
}

/** Plain-language fuel verdict from the signed MFD laps-vs-target delta. */
function fuelVerdict(delta: number) {
  const a = Math.abs(delta);
  if (a < 0.05) return "On target";
  const laps = a.toFixed(1);
  const unit = laps === "1.0" ? "lap" : "laps";
  return delta > 0 ? `${laps} ${unit} in hand` : `${laps} ${unit} short — lift & coast`;
}

interface ErsRowProps {
  label: string;
  value: string;
  note?: string;
  noteWarn?: boolean;
  chip?: ReactNode;
  pct: number;
  barClass?: string;
  thin?: boolean;
}

function ErsRow({ label, value, note, noteWarn, chip, pct, barClass, thin }: ErsRowProps) {
  return (
    <div className="cs-ers-row">
      <div className="cs-row-head">
        <span className="cs-micro-label">{label}</span>
        {chip}
        {note && <span className={["cs-harvest-note", noteWarn ? "cs-note-warn" : ""].filter(Boolean).join(" ")}>{note}</span>}
        <span className="cs-bar-value">{value}</span>
      </div>
      <div className={["cs-bar", thin ? "cs-bar-thin" : ""].filter(Boolean).join(" ")}>
        <div className={["cs-bar-fill", barClass ?? ""].filter(Boolean).join(" ")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Mirrors `tpl-fuelErs` / `updateFuelErsWidget` — three regulations (F1 26 / F1 25 / F2, no ERS). */
export function FuelErs({
  formula,
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
  deployCapMJ,
  className,
}: FuelErsProps) {
  const regKey = regKeyForFormula(formula);
  const cfg = REG_CFG[regKey];

  // ---- FUEL ----
  const showDelta = isRaceSession && Number.isFinite(fuelRemainingLaps);
  const deltaCls = fuelRemainingLaps < -0.3 ? "cs-delta-crit" : fuelRemainingLaps < 0 ? "cs-delta-warn" : "cs-delta-up";

  const fuelSection = (
    <section className="cs-section cs-fuel">
      <header className="cs-section-head">
        <span className="cs-section-label">Fuel</span>
        <span className="cs-badge" data-mix={fuelMix}>{FUEL_MIX_BADGE[fuelMix] ?? "--"}</span>
      </header>
      {showDelta && (
        <div className="cs-fuel-delta">
          <div className="cs-delta-row">
            <span className={["cs-big-value", deltaCls].join(" ")}>
              {fuelRemainingLaps >= 0 ? "+" : "−"}{Math.abs(fuelRemainingLaps).toFixed(2)}
            </span>
            <span className="cs-micro-label">laps vs target</span>
          </div>
          <div className={["cs-verdict", deltaCls].join(" ")}>{fuelVerdict(fuelRemainingLaps)}</div>
        </div>
      )}
      <div className="cs-fuel-row">
        <span className="cs-micro-label">In tank</span>
        <span className="cs-value">{fuelInTank.toFixed(1)} kg</span>
      </div>
    </section>
  );

  // ---- ERS ---- (F2 has no ERS)
  let ersSection: ReactNode = null;
  if (cfg.hasErs) {
    const mode = ersDeployMode ?? 0;
    const modeText = mode === 3 ? cfg.overName : (ERS_MODE_NAME[mode] ?? "--");

    const storeJ = Math.max(0, ersStoreEnergy || 0);
    const storePct = clampPct((storeJ / cfg.storeCapJ!) * 100);

    const deployJ = Math.max(0, ersDeployedThisLap || 0);
    let deployCapJ = cfg.deployCapJ;
    if (deployCapJ == null) {
      deployCapJ = deployCapMJ != null ? deployCapMJ * 1_000_000 : Math.max(deployJ, MAX_ERS_J);
    }
    const deployPct = clampPct((deployJ / deployCapJ) * 100);

    const harvKJ = Math.max(0, ersHarvestedThisLapMguK || 0);
    const harvHJ = Math.max(0, ersHarvestedThisLapMguH || 0);

    let harvestRow: ReactNode;
    if (cfg.harvest === "combined") {
      const limitJ = Math.max(0, ersHarvestLimitPerLap || 0) || cfg.storeCapJ!;
      const harvestJ = harvKJ + harvHJ;
      const pct = clampPct(limitJ > 0 ? (harvestJ / limitJ) * 100 : 0);
      const remainMJ = Math.max(0, (limitJ - harvestJ) / 1_000_000);
      harvestRow = (
        <ErsRow
          label="Harvest / lap"
          value={`${toMJ(harvestJ)} / ${toMJ(limitJ)} MJ`}
          note={`${remainMJ.toFixed(1)} MJ left`}
          noteWarn={pct >= 92}
          pct={pct}
          barClass={harvestBarClass(pct)}
          thin
        />
      );
    } else {
      const pct = clampPct((harvKJ / MAX_MGUK_HARVEST_J) * 100);
      harvestRow = (
        <ErsRow
          label="Harvest / lap (MGU-K)"
          value={`${toMJ(harvKJ)} / ${toMJ(MAX_MGUK_HARVEST_J)} MJ`}
          note={`+${toMJ(harvHJ)} MGU-H`}
          pct={pct}
          barClass={harvestBarClass(pct)}
          thin
        />
      );
    }

    ersSection = (
      <section className="cs-section cs-ers">
        <header className="cs-section-head">
          <span className="cs-section-label">ERS</span>
          <span className="cs-badge" data-mode={mode}>{modeText}</span>
        </header>
        <ErsRow label="Store" value={`${storePct.toFixed(0)}% · ${toMJ(storeJ)} MJ`} pct={storePct} />
        <ErsRow
          label="Deploy / lap"
          value={`${toMJ(deployJ)} / ${toMJ(deployCapJ)} MJ`}
          chip={mode === 3 ? <span className="cs-deploy-chip">{cfg.overName}</span> : null}
          pct={deployPct}
          barClass="cs-bar-deploy"
          thin
        />
        {harvestRow}
      </section>
    );
  }

  return (
    <div className={["card", "cs-card", className ?? ""].filter(Boolean).join(" ")} data-reg={regKey}>
      <div className="cs-grid">
        {fuelSection}
        {ersSection}
      </div>
    </div>
  );
}

function harvestBarClass(pct: number) {
  if (pct >= 95) return "cs-bar-harvest cs-bar-crit";
  if (pct >= 85) return "cs-bar-harvest cs-bar-warn";
  return "cs-bar-harvest";
}
