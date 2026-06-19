export type EventCode =
  | "SSTA" | "SEND" | "FTLP" | "RTMT" | "DRSE" | "DRSD" | "TMPT" | "CHQF" | "RCWN"
  | "PENA" | "SPTP" | "STLG" | "LGOT" | "DTSV" | "SGSV" | "FLBK" | "RDFL" | "OVTK"
  | "SCAR" | "COLL" | "BUTN";

const EVENT_NAMES: Record<string, string> = {
  SSTA: "Session Started", SEND: "Session Ended", FTLP: "Fastest Lap",
  RTMT: "Retirement", DRSE: "DRS Enabled", DRSD: "DRS Disabled",
  TMPT: "Teammate In Pits", CHQF: "Chequered Flag", RCWN: "Race Winner",
  PENA: "Penalty", SPTP: "Speed Trap", STLG: "Start Lights",
  LGOT: "Lights Out", DTSV: "Drive Through Served", SGSV: "Stop-Go Served",
  FLBK: "Flashback", RDFL: "Red Flag",
  OVTK: "Overtake", SCAR: "Safety Car", COLL: "Collision", BUTN: "Button Status",
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

export interface EventBadgeProps {
  code: string;
  /** Shows the full event name next to the code chip. Default true. */
  showName?: boolean;
  className?: string;
}

/**
 * Event-code chip used in the Events widget and History's Events tab.
 * Mirrors `EVENT_NAMES`/`EVENT_CODE_COLORS` (telemetry.js) — code colored,
 * full name in muted text alongside it.
 */
export function EventBadge({ code, showName = true, className }: EventBadgeProps) {
  const name = EVENT_NAMES[code] ?? code;
  const color = EVENT_CODE_COLORS[code] ?? "var(--accent-blue)";

  return (
    <span className={["event-badge", className ?? ""].filter(Boolean).join(" ")}>
      <span className="event-badge-code" style={{ color }}>{code}</span>
      {showName && <span className="event-badge-name">{name}</span>}
    </span>
  );
}
