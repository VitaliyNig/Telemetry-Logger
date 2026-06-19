import { Button } from "../Button/Button";

export interface PacketStatsProps {
  total: number;
  /** Packet type name -> count received this session. Sorted by count (desc) for display. */
  counts: Record<string, number>;
  onDownloadLog?: () => void;
  /** Caller owns the confirm() prompt before invoking this — mirrors the original's blocking dialog. */
  onResetStats?: () => void;
  className?: string;
}

function formatNumber(n: number) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Mirrors `.debug-left` — packet type/count breakdown plus Download Log / Reset actions. */
export function PacketStats({ total, counts, onDownloadLog, onResetStats, className }: PacketStatsProps) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className={["debug-left", className ?? ""].filter(Boolean).join(" ")}>
      <h3>Packet Counts</h3>
      <div className="packet-stats">
        <div className="stat-total">
          <span className="stat-label">Total Packets</span>
          <span className="stat-value">{formatNumber(total)}</span>
        </div>
        <div className="stat-list">
          {sorted.length === 0 ? (
            <p className="muted">No packets received yet.</p>
          ) : (
            sorted.map(([name, count]) => (
              <div className="stat-item" key={name}>
                <span className="stat-item-name">{name}</span>
                <span className="stat-item-count">{formatNumber(count)}</span>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="debug-actions">
        <Button variant="secondary" onClick={onDownloadLog}>Download Log</Button>
        <Button variant="danger" onClick={onResetStats}>Reset</Button>
      </div>
    </div>
  );
}
