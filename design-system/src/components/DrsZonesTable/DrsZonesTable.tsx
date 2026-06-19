import { Button } from "../Button/Button";

export interface DrsZoneTrack {
  trackId: number;
  trackName: string;
  hasZones: boolean;
  zoneCount?: number;
  /** 0-1 fraction of the lap covered by DRS zones. */
  coverage?: number;
  /** [startLapFraction, endLapFraction] pairs, each 0-1. */
  zones?: [number, number][];
}

export interface DrsZonesTableProps {
  tracks: DrsZoneTrack[];
  currentTrackId?: number | null;
  currentTrackName?: string | null;
  onRefresh?: () => void;
  /** Caller owns the confirm() prompt before invoking this — mirrors the original's blocking dialog. */
  onRecapture?: (trackId: number) => void;
  /** Disables that row's button mid-request. */
  recapturingTrackId?: number | null;
  loadError?: string | null;
  className?: string;
}

function formatRanges(zones: [number, number][] | undefined) {
  if (!zones || zones.length === 0) return "—";
  return zones.map(([s, e]) => `[${s.toFixed(3)}–${e.toFixed(3)}]`).join(" ");
}

/** Mirrors `.drs-zones-section` — per-track DRS zone capture status and re-capture controls. */
export function DrsZonesTable({
  tracks,
  currentTrackId = null,
  currentTrackName = null,
  onRefresh,
  onRecapture,
  recapturingTrackId = null,
  loadError,
  className,
}: DrsZonesTableProps) {
  return (
    <div className={["debug-section", "drs-zones-section", className ?? ""].filter(Boolean).join(" ")}>
      <div className="drs-zones-header">
        <h3>DRS Zones</h3>
        <span className={`drs-zones-current${currentTrackId != null ? " drs-zones-current--live" : ""}`}>
          {currentTrackId != null ? `Live: ${currentTrackName} (track ${currentTrackId})` : "No live session."}
        </span>
        <Button variant="secondary" size="small" onClick={onRefresh}>Refresh</Button>
      </div>
      <p className="drs-zones-hint">
        Per-track snapshot of <code>wwwroot/data/drs-zones.json</code>. Auto-capture only runs in practice /
        qualifying / time trial (race / sprint use a gap-gated DRS flag, so they can't produce reliable zones). Hit
        Re-capture on the active track to wipe its entry and re-arm capture for the next clean lap.
      </p>
      <div className="drs-zones-table-wrap">
        <table className="drs-zones-table">
          <thead>
            <tr>
              <th>Track</th>
              <th>Status</th>
              <th>Zones</th>
              <th>Coverage</th>
              <th className="drs-zones-zones-col">Ranges</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {loadError ? (
              <tr><td colSpan={6} className="muted">Failed to load: {loadError}</td></tr>
            ) : tracks.length === 0 ? (
              <tr><td colSpan={6} className="muted">No track data.</td></tr>
            ) : (
              tracks.map((t) => {
                const isCurrent = currentTrackId != null && t.trackId === currentTrackId;
                return (
                  <tr key={t.trackId} className={isCurrent ? "drs-zone-row--current" : ""}>
                    <td>
                      {t.trackName} <span className="drs-zone-id">{t.trackId}</span>
                    </td>
                    <td>
                      <span className={`drs-zones-status ${t.hasZones ? "drs-zones-status--has" : "drs-zones-status--missing"}`}>
                        {t.hasZones ? "has zones" : "—"}
                      </span>
                    </td>
                    <td>{t.hasZones ? t.zoneCount : "—"}</td>
                    <td>{t.hasZones ? `${Math.round((t.coverage ?? 0) * 100)}%` : "—"}</td>
                    <td className="drs-zone-ranges">{t.hasZones ? formatRanges(t.zones) : "—"}</td>
                    <td>
                      <Button
                        variant="danger"
                        size="small"
                        disabled={!isCurrent || recapturingTrackId === t.trackId}
                        title={isCurrent ? "Wipe entry and re-arm capture for the next clean lap" : "Drive this track in P/Q/TT first"}
                        onClick={() => onRecapture?.(t.trackId)}
                      >
                        Re-capture
                      </Button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
