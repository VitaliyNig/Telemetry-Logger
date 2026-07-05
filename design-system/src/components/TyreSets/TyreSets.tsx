export interface TyreSetItem {
  visualTyreCompound: number;
  actualTyreCompound: number;
  /** Whether this set is still in the player's pool (not yet used up/discarded this weekend). */
  available: boolean;
  /** 0-100 wear percentage. */
  wear: number;
  /** Laps run on this set so far. */
  lifeSpan: number;
  /** Predicted lap time delta vs. a fresh set, in ms (game-provided). */
  lapDeltaTime: number;
}

export interface TyreSetsProps {
  sets: TyreSetItem[];
  /** Index into `sets` of the set currently fitted to the car. */
  fittedIdx: number;
  className?: string;
}

const COMPOUND_ORDER = ["Super Soft", "Soft", "Medium", "Hard", "Dry", "Inter", "Wet"];

const VISUAL_COMPOUND_INFO: Record<number, { name: string; css: string }> = {
  16: { name: "Soft", css: "compound-soft" },
  17: { name: "Medium", css: "compound-medium" },
  18: { name: "Hard", css: "compound-hard" },
  7: { name: "Inter", css: "compound-inter" },
  8: { name: "Wet", css: "compound-wet" },
  9: { name: "Dry", css: "compound-hard" },
  10: { name: "Wet", css: "compound-wet" },
  15: { name: "Wet", css: "compound-wet" },
  19: { name: "Super Soft", css: "compound-soft" },
  20: { name: "Soft", css: "compound-soft" },
  21: { name: "Medium", css: "compound-medium" },
  22: { name: "Hard", css: "compound-hard" },
  // F2 2024/2025
  11: { name: "Super Soft", css: "compound-super-soft" },
  12: { name: "Soft", css: "compound-soft" },
  13: { name: "Medium", css: "compound-medium" },
  14: { name: "Hard", css: "compound-hard" },
};
const VISUAL_COMPOUND_FALLBACK = { name: "Unknown", css: "compound-unknown" };

function getVisualCompoundInfo(visualId: number) {
  return VISUAL_COMPOUND_INFO[visualId] || VISUAL_COMPOUND_FALLBACK;
}

// Per-lap wear rate (%) per actual compound, from in-game wear rates.
// IDs 16..22, 7, 8 are F1 25; IDs 11..15 are F2 2024/2025 (identical sets).
const COMPOUND_WEAR_RATE_PCT: Record<number, number> = {
  20: 0.85, // C1
  19: 1.06, // C2
  18: 1.31, // C3
  17: 1.64, // C4
  16: 2.14, // C5
  22: 2.9, // C6
  7: 0.97, // Inter
  8: 0.97, // Wet
  14: 0.85, // F2 Hard
  13: 1.06, // F2 Medium
  12: 1.31, // F2 Soft
  11: 1.64, // F2 SuperSoft
  15: 0.97, // F2 Wet
};

// Remaining-grip curve (fraction of fresh-tyre grip) sampled at 0/25/50/75/100% wear.
const COMPOUND_WEAR_GRIP: Record<number, number[]> = {
  20: [1.0, 0.98, 0.957, 0.928, 0.876], // C1
  19: [1.0, 0.966, 0.938, 0.906, 0.857], // C2
  18: [1.0, 0.954, 0.922, 0.887, 0.84], // C3
  17: [1.0, 0.942, 0.906, 0.867, 0.821], // C4
  16: [1.0, 0.932, 0.891, 0.852, 0.807], // C5
  22: [1.0, 0.928, 0.882, 0.842, 0.798], // C6
  7: [1.0, 0.992, 0.968, 0.941, 0.894], // Inter
  8: [1.0, 0.997, 0.983, 0.971, 0.948], // Wet
  14: [1.0, 0.981, 0.957, 0.929, 0.879], // F2 Hard
  13: [1.0, 0.969, 0.939, 0.904, 0.855], // F2 Medium
  12: [1.0, 0.955, 0.92, 0.88, 0.832], // F2 Soft
  11: [1.0, 0.938, 0.898, 0.855, 0.808], // F2 SuperSoft
  15: [1.0, 0.99, 0.973, 0.96, 0.925], // F2 Wet
};

function getCompoundExpectedGrip(actualCompoundId: number, wearPct: number) {
  const curve = COMPOUND_WEAR_GRIP[actualCompoundId];
  if (!curve) return null;
  const w = Math.max(0, Math.min(100, wearPct));
  if (!Number.isFinite(w)) return null;
  const idx = w / 25;
  const i0 = Math.floor(idx);
  if (i0 >= curve.length - 1) return curve[curve.length - 1];
  const t = idx - i0;
  return curve[i0] * (1 - t) + curve[i0 + 1] * t;
}

function formatTyreSetGrip(actualCompoundId: number, wearPct: number) {
  const grip = getCompoundExpectedGrip(actualCompoundId, wearPct);
  if (grip == null) return null;
  const pct = Math.round(grip * 1000) / 10;
  const color = grip >= 0.95 ? "var(--safe)" : grip >= 0.9 ? "var(--warning)" : "var(--danger)";
  return { text: `${pct.toFixed(1)}%`, color };
}

// Wear-fill colour: 4-step scale (fresh → spent).
function wearFillColor(w: number) {
  return w <= 25 ? "#3ecf8e" : w <= 50 ? "#f5c518" : w <= 75 ? "#ff9f0a" : "#ff453a";
}

interface AnnotatedSet extends TyreSetItem {
  idx: number;
  isFitted: boolean;
  compoundName: string;
  compoundCss: string;
}

/** Mirrors `tpl-tyreSets` / `updateTyreSets` — player's available tyre-set inventory, grouped by compound. */
export function TyreSets({ sets, fittedIdx, className }: TyreSetsProps) {
  const annotated: AnnotatedSet[] = sets
    .map((s, idx) => {
      const info = getVisualCompoundInfo(s.visualTyreCompound);
      return { ...s, idx, isFitted: idx === fittedIdx, compoundName: info.name, compoundCss: info.css };
    })
    .filter((s) => s.visualTyreCompound !== 0 || s.actualTyreCompound !== 0);

  const available = annotated.filter((s) => s.available || s.isFitted);

  const byCompound = new Map<string, AnnotatedSet[]>();
  for (const s of available) {
    const list = byCompound.get(s.compoundName) ?? [];
    list.push(s);
    byCompound.set(s.compoundName, list);
  }

  const sortedCompounds = [...byCompound.keys()].sort((a, b) => {
    const ai = COMPOUND_ORDER.indexOf(a);
    const bi = COMPOUND_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  for (const compound of sortedCompounds) {
    byCompound.get(compound)!.sort((a, b) => Number(b.isFitted) - Number(a.isFitted) || a.wear - b.wear);
  }

  const fitted = annotated.find((s) => s.isFitted) ?? null;

  return (
    <div className={["card", "ts-card", className ?? ""].filter(Boolean).join(" ")}>
      {fitted && (
        <div className="ts-fitted">
          <div className="ts-fitted-left">
            <span className="ts-fitted-label">Fitted · On Car</span>
            <span className={`ts-fitted-name ${fitted.compoundCss}`}>{fitted.compoundName}</span>
          </div>
          <div className="ts-fitted-right">
            <div className="ts-fitted-stat">
              <span className="ts-fitted-val" style={{ color: wearFillColor(fitted.wear) }}>{fitted.wear}%</span>
              <span className="ts-fitted-cap">Wear</span>
            </div>
            <div className="ts-fitted-stat">
              <span className="ts-fitted-val">{fitted.lifeSpan}L</span>
              <span className="ts-fitted-cap">Life</span>
            </div>
          </div>
        </div>
      )}
      <div className="ts-pool">
        {sortedCompounds.length === 0 && (
          <div className="widget-empty">
            <div className="widget-empty-icon"><span className="widget-empty-dash" /></div>
            <div className="widget-empty-title">No tyre sets available</div>
            <div className="widget-empty-sub">Waiting for telemetry</div>
          </div>
        )}
        {sortedCompounds.map((compound) => {
          const list = byCompound.get(compound)!;
          return (
            <div className="ts-group" key={compound}>
              <div className="ts-group-head">
                <span className={`ts-group-dot ${list[0].compoundCss}`} />
                <span className="ts-group-name">{compound}</span>
                <span className="ts-group-count">{list.length}</span>
              </div>
              {list.map((s) => {
                const delta = s.lapDeltaTime;
                const deltaCls = delta > 0 ? "ts-delta--slower" : delta < 0 ? "ts-delta--faster" : "ts-delta--zero";
                const deltaText = delta === 0 ? "±0.0s" : `${delta > 0 ? "+" : "−"}${(Math.abs(delta) / 1000).toFixed(1)}s`;
                const grip = formatTyreSetGrip(s.actualTyreCompound, s.wear);
                const wrate = COMPOUND_WEAR_RATE_PCT[s.actualTyreCompound];
                const tipTitle = `Wear ${s.wear}%${wrate != null ? ` · Rate ${wrate.toFixed(2)}%/L` : ""}${s.isFitted ? " · Fitted" : ""}`;

                return (
                  <div className={s.isFitted ? "ts-set-row ts-set-row--fitted" : "ts-set-row"} title={tipTitle} key={s.idx}>
                    <span className={`ts-row-accent ${s.compoundCss}`} />
                    <div className="ts-wear">
                      <div className="ts-wear-track">
                        <div className="ts-wear-fill" style={{ width: `${s.wear}%`, background: wearFillColor(s.wear) }} />
                      </div>
                      <span className="ts-wear-pct">{s.wear}%</span>
                    </div>
                    <span className={`ts-delta ${deltaCls}`}>{deltaText}</span>
                    <span className="ts-life">{s.lifeSpan}L</span>
                    {grip ? (
                      <span className="ts-grip" style={{ color: grip.color }}>{grip.text}</span>
                    ) : (
                      <span className="ts-grip ts-grip--na">—</span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
