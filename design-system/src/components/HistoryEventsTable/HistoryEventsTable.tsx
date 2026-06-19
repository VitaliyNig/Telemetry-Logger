import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";

const EVENT_NAMES: Record<string, string> = {
  SSTA: "Session Start", SEND: "Session End",
  FTLP: "Fastest Lap", RTMT: "Retirement",
  DRSE: "DRS Enabled", DRSD: "DRS Disabled",
  TMPT: "Teammate in Pits", CHQF: "Chequered Flag",
  RCWN: "Race Winner", PENA: "Penalty", SPTP: "Speed Trap",
  STLG: "Start Lights", LGOT: "Lights Out",
  DTSV: "DT Pen Served", SGSV: "Stop-Go Served",
  FLBK: "Flashback", BUTN: "Buttons",
  OVTK: "Overtake", SCAR: "Safety Car",
  COLL: "Collision", RDFL: "Red Flag",
};

const EVENT_CODE_COLORS: Record<string, string> = {
  SSTA: "#22c55e", SEND: "#22c55e", LGOT: "#22c55e", CHQF: "#22c55e",
  FTLP: "#a855f7", RCWN: "#c084fc",
  PENA: "#ef4444", DTSV: "#ef4444", SGSV: "#ef4444", RDFL: "#ef4444",
  SCAR: "#eab308", COLL: "#f59e0b", FLBK: "#f59e0b",
  DRSE: "#38bdf8", DRSD: "#38bdf8", SPTP: "#38bdf8", STLG: "#38bdf8",
  OVTK: "#fb923c", RTMT: "#fb923c", TMPT: "#fb923c",
  BUTN: "#6b7280",
};

const EVENT_CODES = Object.keys(EVENT_NAMES);

export type HistoryEventsCodeFilter = Record<string, boolean>;

/** All codes shown by default except BUTN (button telemetry — noisy, rarely useful). */
export const DEFAULT_HISTORY_EVENTS_CODE_FILTER: HistoryEventsCodeFilter = EVENT_CODES.reduce(
  (acc, code) => ({ ...acc, [code]: code !== "BUTN" }),
  {} as HistoryEventsCodeFilter
);

export interface HistoryEventsRow {
  code: string;
  /** Session-elapsed seconds; formatted internally as `m:ss`. */
  timeS: number | null;
  lap?: number | null;
  /** Resolved name for events tied to a single car (FTLP, TMPT, RTMT, RCWN, DTSV, SGSV). */
  driverName?: string | null;
  /** Resolved livery/team colour for the row's driver dot (see liveryColours convention). */
  driverColor?: string | null;
  /**
   * Pre-formatted by the caller (mirrors `formatEventDetails` in historyDetail.js) — penalty,
   * collision and overtake summaries need the full driver roster, which this table does not own.
   */
  detail?: string | null;
}

export interface HistoryEventsTableProps {
  rows: HistoryEventsRow[];
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  /** false hides a code; absent/true shows it. Defaults to `DEFAULT_HISTORY_EVENTS_CODE_FILTER`. */
  codeFilter?: HistoryEventsCodeFilter;
  onCodeFilterChange?: (filter: HistoryEventsCodeFilter) => void;
  className?: string;
}

function formatSessionTime(s: number | null | undefined): string {
  if (s == null) return "—";
  const m = Math.floor(s / 60);
  const rest = String(Math.round(s % 60)).padStart(2, "0");
  return m + ":" + rest;
}

function FilterIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

function FilterPanel({
  anchorRect,
  codeFilter,
  onChange,
  onClose,
}: {
  anchorRect: DOMRect;
  codeFilter: HistoryEventsCodeFilter;
  onChange: (next: HistoryEventsCodeFilter) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: anchorRect.bottom + 4, left: Math.max(4, anchorRect.right - 260) });

  useLayoutEffect(() => {
    setPos({ top: anchorRect.bottom + 4, left: Math.max(4, anchorRect.right - 260) });
  }, [anchorRect]);

  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("click", onOutsideClick);
    return () => document.removeEventListener("click", onOutsideClick);
  }, [onClose]);

  return (
    <div ref={ref} className="event-filter-panel" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
      <div className="event-filter-actions">
        <button
          type="button"
          className="event-filter-action-btn"
          onClick={() => onChange(EVENT_CODES.reduce((acc, c) => ({ ...acc, [c]: true }), {} as HistoryEventsCodeFilter))}
        >
          All
        </button>
        <button
          type="button"
          className="event-filter-action-btn"
          onClick={() => onChange(EVENT_CODES.reduce((acc, c) => ({ ...acc, [c]: false }), {} as HistoryEventsCodeFilter))}
        >
          None
        </button>
      </div>
      {EVENT_CODES.map((code) => {
        const checked = codeFilter[code] !== false;
        const color = EVENT_CODE_COLORS[code] || "var(--accent-blue)";
        return (
          <label key={code} className="event-filter-item">
            <input
              type="checkbox"
              checked={checked}
              onChange={(e) => onChange({ ...codeFilter, [code]: e.target.checked })}
            />
            <span className="event-filter-code" style={{ color }}>{code}</span>
            {EVENT_NAMES[code]}
          </label>
        );
      })}
    </div>
  );
}

/** Mirrors `renderEvents`/`renderEventRows` — full session event log with a type-filter
 *  popover and a driver-name search box. */
export function HistoryEventsTable({
  rows,
  searchQuery = "",
  onSearchQueryChange,
  codeFilter = DEFAULT_HISTORY_EVENTS_CODE_FILTER,
  onCodeFilterChange,
  className,
}: HistoryEventsTableProps) {
  const [panelOpen, setPanelOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  const query = searchQuery.toLowerCase();
  const filtered = rows.filter((r) => {
    if (codeFilter[r.code] === false) return false;
    if (query && !(r.driverName || "").toLowerCase().includes(query)) return false;
    return true;
  });

  const selectedCount = EVENT_CODES.reduce((acc, code) => acc + (codeFilter[code] === false ? 0 : 1), 0);

  return (
    <div className={className}>
      <div className="ev-toolbar">
        <div className="ev-tools">
          <button
            ref={toggleRef}
            type="button"
            className={["event-filter-toggle", "ev-filter-toggle", panelOpen ? "active" : ""].filter(Boolean).join(" ")}
            title="Filter events"
            aria-label="Filter events"
            onClick={(e) => {
              e.stopPropagation();
              if (panelOpen) {
                setPanelOpen(false);
              } else {
                setAnchorRect(toggleRef.current?.getBoundingClientRect() ?? null);
                setPanelOpen(true);
              }
            }}
          >
            <FilterIcon />
          </button>
          <span className="ev-filter-hint" title={`Selected event types: ${selectedCount}`}>
            Event filters ({selectedCount}/{EVENT_CODES.length})
          </span>
          {panelOpen && anchorRect && (
            <FilterPanel
              anchorRect={anchorRect}
              codeFilter={codeFilter}
              onChange={(next) => onCodeFilterChange?.(next)}
              onClose={() => setPanelOpen(false)}
            />
          )}
        </div>
        <input
          type="search"
          className="ev-search"
          placeholder="Filter driver…"
          value={searchQuery}
          onChange={(e) => onSearchQueryChange?.(e.target.value)}
        />
      </div>

      <div className="ev-table-wrap">
        <table className="ev-table">
          <thead>
            <tr>
              <th className="ev-col-time">Time</th>
              <th className="ev-col-lap">Lap</th>
              <th className="ev-col-event">Event</th>
              <th className="ev-col-driver">Driver</th>
              <th className="ev-col-details">Details</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={5} className="ev-empty">No events match.</td></tr>
            ) : (
              filtered.map((r, i) => {
                const codeColor = EVENT_CODE_COLORS[r.code] || "var(--text-dim)";
                return (
                  <tr key={i} style={{ "--event-color": codeColor } as CSSProperties}>
                    <td data-label="Time">{formatSessionTime(r.timeS)}</td>
                    <td data-label="Lap">{r.lap || "—"}</td>
                    <td data-label="Event">
                      <span className="ev-code-chip" style={{ color: codeColor, borderColor: codeColor }}>{r.code}</span>
                      <span className="ev-name">{EVENT_NAMES[r.code] || r.code}</span>
                    </td>
                    <td data-label="Driver">
                      {r.driverColor && <span className="driver-dot" style={{ background: r.driverColor }} />}
                      {r.driverName ? (r.driverColor ? " " : "") + r.driverName : "—"}
                    </td>
                    <td data-label="Details">{r.detail || <span className="ev-muted">—</span>}</td>
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
