import type { SectorBadgesToolbarZoomRange } from "../SectorBadgesToolbar/SectorBadgesToolbar";

export type TopLossZonesFactTone = "loss" | "gain" | "neutral";

export interface TopLossZonesFact {
  label: string;
  value: string;
  tone?: TopLossZonesFactTone;
}

export interface TopLossZonesZone {
  id: string | number;
  /** Distance range in metres. */
  start: number;
  end: number;
  /** Seconds lost vs reference across this zone. */
  loss: number;
  /** Cause key — drives the badge's colour via a `tc-loss-cause--<primary>` class (e.g. "late_brake", "low_apex", "mixed"). */
  primary: string;
  /** Pre-resolved display label for the cause (already localized by the caller). */
  primaryLabel: string;
  facts?: TopLossZonesFact[];
  recommendations?: string[];
}

export interface TopLossZonesProps {
  zones: TopLossZonesZone[];
  zoomRange?: SectorBadgesToolbarZoomRange | null;
  onZoomRangeChange?: (range: SectorBadgesToolbarZoomRange | null) => void;
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Mirrors `renderTopLossZones()` from telemetryCompare.js — the "Top Loss Zones" insights cards. */
export function TopLossZones({ zones, zoomRange = null, onZoomRangeChange, className }: TopLossZonesProps) {
  if (!zones.length) {
    return <div className={cx("tc-insights-empty", className)}>Top Loss Zones: not enough comparable data.</div>;
  }

  const maxLoss = zones.reduce((acc, z) => Math.max(acc, z.loss), 0);

  function handleJump(z: TopLossZonesZone) {
    const isSame = zoomRange != null && zoomRange.start === z.start && zoomRange.end === z.end;
    onZoomRangeChange?.(isSame ? null : { start: z.start, end: z.end });
  }

  return (
    <div className={cx("tc-insights", className)}>
      <div className="tc-insights-title">Top Loss Zones</div>
      {zones.map((z, i) => {
        const barPct = maxLoss > 0 ? Math.max(8, Math.round((z.loss / maxLoss) * 100)) : 100;
        return (
          <div className="tc-loss-zone" key={z.id} data-zone-id={z.id}>
            <div className="tc-loss-zone-head">
              <button className="tc-loss-jump" title="Zoom charts to this segment + highlight on map" onClick={() => handleJump(z)}>
                <span className="tc-loss-num">#{i + 1}</span>
                <span className="tc-loss-range">
                  {Math.round(z.start)}–{Math.round(z.end)} m
                </span>
              </button>
              <span className="tc-loss-amount">+{z.loss.toFixed(3)} s</span>
            </div>
            <div className="tc-loss-bar">
              <div className="tc-loss-bar-fill" style={{ width: `${barPct}%` }} />
            </div>
            <div className={cx("tc-loss-cause", `tc-loss-cause--${z.primary}`)}>{z.primaryLabel}</div>
            {z.facts && z.facts.length > 0 && (
              <div className="tc-loss-facts">
                {z.facts.map((f, fi) => (
                  <span key={fi} className={cx("tc-loss-fact", `tc-loss-fact--${f.tone ?? "neutral"}`)}>
                    <span className="tc-loss-fact-label">{f.label}</span>
                    <span className="tc-loss-fact-value">{f.value}</span>
                  </span>
                ))}
              </div>
            )}
            {z.recommendations && z.recommendations.length > 0 && (
              <ul className="tc-loss-recs">
                {z.recommendations.map((r, ri) => (
                  <li key={ri}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
