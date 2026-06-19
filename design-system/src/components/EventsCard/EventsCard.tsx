const EVENT_CODE_COLORS: Record<string, string> = {
  SSTA: "#22c55e", SEND: "#22c55e", LGOT: "#22c55e", CHQF: "#22c55e",
  FTLP: "#a855f7", RCWN: "#c084fc",
  PENA: "#ef4444", DTSV: "#ef4444", SGSV: "#ef4444", RDFL: "#ef4444",
  SCAR: "#eab308", COLL: "#f59e0b", FLBK: "#f59e0b",
  DRSE: "#38bdf8", DRSD: "#38bdf8", SPTP: "#38bdf8", STLG: "#38bdf8",
  OVTK: "#fb923c", RTMT: "#fb923c", TMPT: "#fb923c",
  BUTN: "#6b7280",
};

export interface EventsCardEntry {
  code: string;
  name: string;
  detail?: string;
  /** Already formatted: "L12" for race/time-trial sessions, "3:45" elapsed otherwise. */
  timeLabel: string;
  /** Drive Through / Stop-Go penalty that has since been served. */
  served?: boolean;
  /** Penalty severe enough to warrant the red "serious" treatment (matches `PINNABLE_PENALTY_TYPES`). */
  serious?: boolean;
}

export interface EventsCardProps {
  /** Most recent first; the app caps this at `maxEvents`. */
  events: EventsCardEntry[];
  /** Active serious penalties pinned above the feed until served. */
  pinnedPenalties?: EventsCardEntry[];
  className?: string;
}

function EventRow({ entry, pinned }: { entry: EventsCardEntry; pinned: boolean }) {
  const cls = ["event-item", pinned ? "penalty-serious pinned" : entry.serious ? "penalty-serious" : ""]
    .filter(Boolean)
    .join(" ");
  const color = EVENT_CODE_COLORS[entry.code] ?? "var(--accent-blue)";
  return (
    <div className={cls}>
      <span className="event-code" style={{ color }}>
        {pinned && <span className="pin-icon">📌</span>} {entry.code}
      </span>
      <span className="event-detail">
        {entry.name}
        {entry.detail ? ` — ${entry.detail}` : ""}
        {entry.served && <span className="served-badge">SERVED</span>}
      </span>
      <span className="event-time">{entry.timeLabel}</span>
    </div>
  );
}

/** Mirrors `tpl-events` / `renderEvents` — live event feed with pinned active-penalty section. */
export function EventsCard({ events, pinnedPenalties = [], className }: EventsCardProps) {
  if (events.length === 0 && pinnedPenalties.length === 0) {
    return (
      <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
        <div className="events-list">
          <div className="event-item placeholder">Waiting for events...</div>
        </div>
      </div>
    );
  }

  const activePinned = pinnedPenalties.filter((e) => !e.served);

  return (
    <div className={["card", className ?? ""].filter(Boolean).join(" ")}>
      <div className="events-list">
        {activePinned.length > 0 && (
          <div className="pinned-section">
            <div className="pinned-header">ACTIVE PENALTIES</div>
            {activePinned.map((e, i) => (
              <EventRow key={`pinned-${i}`} entry={e} pinned />
            ))}
          </div>
        )}
        {events.length === 0 && activePinned.length === 0 && (
          <div className="event-item placeholder">No events matching filter</div>
        )}
        {events.map((e, i) => (
          <EventRow key={i} entry={e} pinned={false} />
        ))}
      </div>
    </div>
  );
}
