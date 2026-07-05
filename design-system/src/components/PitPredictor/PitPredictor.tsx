export interface PitPredictorTrafficCar {
  name: string;
  /** Gap in seconds at pit exit. */
  gap: number;
}

export interface PitPredictorDamage {
  /** e.g. "Front Wing". */
  label: string;
  /** Repair time added to the stop, seconds. */
  repairSec: number;
}

export interface PitPredictorProps {
  /** "nodata" renders the empty / awaiting-telemetry state. */
  state?: "ok" | "nodata";
  /** Player current lap (LapData m_currentLapNum). */
  currentLap?: number;
  /** Ideal pit-window lap (SessionPacket m_pitStopWindowIdealLap). */
  idealLap?: number;
  /** Latest pit-window lap (SessionPacket m_pitStopWindowLatestLap). */
  latestLap?: number;
  /** Player current race position. */
  currentPos?: number;
  /** Game predicted rejoin position (SessionPacket m_pitStopRejoinPosition). */
  rejoinPos?: number;
  carAhead?: PitPredictorTrafficCar | null;
  carBehind?: PitPredictorTrafficCar | null;
  /** Front-wing damage forces a pit and adds repair time. */
  damage?: PitPredictorDamage | null;
  /** Hide the Exit Traffic section. */
  showTraffic?: boolean;
  className?: string;
}

const COL = {
  blue: "#3a8dff", green: "#3ecf8e", amber: "#ff9f0a", red: "#ff453a",
  redSoft: "#ff6b6b", yellow: "#f5c518",
};

function LapTimeline({ cur, ideal, latest, color }: { cur: number; ideal: number; latest: number; color: string }) {
  const ds = Math.min(cur, ideal) - 2;
  const de = Math.max(cur, latest) + 2;
  const span = Math.max(1, de - ds);
  const pct = (l: number) => ((l - ds) / span) * 100;
  return (
    <div className="pp-timeline">
      <div className="pp-tl-curlabel" style={{ left: `${pct(cur)}%`, color }}>L{cur}</div>
      <div className="pp-tl-track" />
      <div className="pp-tl-band" style={{ left: `${pct(ideal)}%`, width: `${pct(latest) - pct(ideal)}%` }} />
      <div className="pp-tl-ideal" style={{ left: `${pct(ideal)}%` }} />
      <div className="pp-tl-cur" style={{ left: `${pct(cur)}%`, background: color, boxShadow: `0 0 6px ${color}` }} />
      <div className="pp-tl-dot" style={{ left: `${pct(cur)}%`, background: color }} />
      <div className="pp-tl-lo" style={{ left: `${pct(ideal)}%` }}>L{ideal}</div>
      <div className="pp-tl-hi" style={{ left: `${pct(latest)}%` }}>L{latest}</div>
    </div>
  );
}

function TrafficRow({ cap, car }: { cap: string; car?: PitPredictorTrafficCar | null }) {
  if (!car) {
    return (
      <div className="pp-traffic-row">
        <span className="pp-traffic-cap">{cap}</span>
        <span className="pp-traffic-name pp-traffic-empty">—</span>
        <span className="pp-traffic-gap">--</span>
      </div>
    );
  }
  const tight = car.gap < 1.0, clean = car.gap > 3.0;
  const tag = tight ? "DRS" : clean ? "CLEAN AIR" : null;
  const tagCol = tight ? COL.amber : COL.green;
  const gapCol = tight ? COL.amber : clean ? COL.green : "#cdd3db";
  return (
    <div className="pp-traffic-row">
      <span className="pp-traffic-cap">{cap}</span>
      <span className="pp-traffic-name">{car.name}</span>
      {tag && <span className="pp-traffic-tag" style={{ color: tagCol, borderColor: `${tagCol}55` }}>{tag}</span>}
      <span className="pp-traffic-gap" style={{ color: gapCol }}>+{car.gap.toFixed(1)}s</span>
    </div>
  );
}

/** Mirrors `tpl-pitPredictor` / `updatePitPredictor` — game pit window (ideal/latest lap)
 *  and predicted rejoin position, urgency colour-coded against the current lap. */
export function PitPredictor(props: PitPredictorProps) {
  const { state = "ok", showTraffic = true, className } = props;
  const cls = ["card", "pp-card", className ?? ""].filter(Boolean).join(" ");

  if (state === "nodata") {
    return (
      <div className={cls}>
        <div className="pp">
          <div className="pp-empty">
            <div className="pp-empty-icon"><span className="pp-empty-dash" /></div>
            <div className="pp-empty-title">No pit strategy yet</div>
            <div className="pp-empty-sub">Awaiting telemetry</div>
          </div>
        </div>
      </div>
    );
  }

  const currentLap = props.currentLap ?? 0;
  const idealLap = props.idealLap ?? 0;
  const latestLap = props.latestLap ?? 0;
  const currentPos = props.currentPos ?? 0;
  const rejoinPos = props.rejoinPos ?? 0;
  const damage = props.damage ?? null;

  // The game only fills the pit window when a stop is planned/mandatory.
  const hasWindow = idealLap > 0 && latestLap > 0;
  const hasRejoin = rejoinPos > 0;

  let statusText = "", statusColor = COL.blue;
  if (hasWindow) {
    if (currentLap < idealLap) {
      const n = idealLap - currentLap;
      statusText = `PIT IN ${n} ${n === 1 ? "LAP" : "LAPS"}`;
      statusColor = COL.blue;
    } else if (currentLap <= latestLap) {
      const left = latestLap - currentLap;
      statusText = left <= 1 ? "WINDOW CLOSING" : "PIT NOW";
      statusColor = left <= 1 ? COL.amber : COL.green;
    } else {
      statusText = "WINDOW MISSED";
      statusColor = COL.red;
    }
    if (damage) { statusText = "BOX NOW · REPAIR"; statusColor = COL.red; }
  }

  const delta = rejoinPos - currentPos;
  const dCol = delta <= 0 ? COL.green : delta <= 2 ? COL.yellow : COL.redSoft;
  const arrow = delta > 0 ? "▼" : delta < 0 ? "▲" : "–";
  const changeText = delta === 0 ? "even" : `${Math.abs(delta)} ${Math.abs(delta) === 1 ? "place" : "places"}`;

  return (
    <div className={cls}>
      <div className="pp">
        {damage && (
          <div className="pp-damage">
            <span className="pp-damage-icon">⚠</span>
            <span className="pp-damage-label">{damage.label.toUpperCase()} DAMAGE</span>
            <span className="pp-damage-repair">+{damage.repairSec.toFixed(1)}s repair</span>
          </div>
        )}

        {hasWindow && (
          <div className="pp-section pp-window-sec">
            <div className="pp-row-top">
              <span className="pp-label">Pit Window</span>
              <span className="pp-window-laps">Laps {idealLap}–{latestLap}</span>
            </div>
            <div className="pp-status">
              <span className="pp-status-dot" style={{ background: statusColor, boxShadow: `0 0 7px ${statusColor}` }} />
              <span className="pp-status-text" style={{ color: statusColor }}>{statusText}</span>
            </div>
            <LapTimeline cur={currentLap} ideal={idealLap} latest={latestLap} color={statusColor} />
          </div>
        )}

        {hasRejoin && (
          <div className="pp-section pp-rejoin-sec">
            <div className="pp-rejoin-left">
              <span className="pp-label">Rejoin Position</span>
              <div className="pp-rejoin-num" style={{ color: dCol }}>P{rejoinPos}</div>
              {damage && <span className="pp-rejoin-repair">incl. +{damage.repairSec.toFixed(1)}s wing repair</span>}
            </div>
            <div className="pp-rejoin-right">
              <span className="pp-rejoin-flow">P{currentPos} → P{rejoinPos}</span>
              <span className="pp-rejoin-badge" style={{ color: dCol, background: `${dCol}1f` }}>{arrow} {changeText}</span>
            </div>
          </div>
        )}

        {showTraffic && (
          <div className="pp-section pp-traffic-sec">
            <span className="pp-label">Exit Traffic</span>
            <TrafficRow cap="AHEAD" car={props.carAhead} />
            <TrafficRow cap="BEHIND" car={props.carBehind} />
          </div>
        )}
      </div>
    </div>
  );
}
