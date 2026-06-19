import type { ReactNode } from "react";

export type HistorySubTab = "laptimes" | "positions" | "compare" | "events";

const SIDENAV_ITEMS: { id: HistorySubTab; label: string }[] = [
  { id: "laptimes", label: "Lap Times" },
  { id: "positions", label: "Lap Chart" },
  { id: "compare", label: "Telemetry Compare" },
  { id: "events", label: "Events" },
];

export interface HistoryDetailShellProps {
  weekendName: string;
  /** Session slug shown capitalized, e.g. "race", "fp1". */
  sessionLabel: string;
  activeSubTab: HistorySubTab;
  onSubTabChange: (id: HistorySubTab) => void;
  /** "Lap Chart" only applies to Race-type sessions — hidden otherwise, mirroring `updateHistorySubTabsVisibility`. */
  showLapChartTab?: boolean;
  onBack: () => void;
  /** Rendered into `.history-detail-body` — the active sub-tab's content panel. */
  children?: ReactNode;
  className?: string;
}

/** Mirrors `.history-detail` — breadcrumb + sidenav chrome wrapping the active sub-tab panel. */
export function HistoryDetailShell({
  weekendName,
  sessionLabel,
  activeSubTab,
  onSubTabChange,
  showLapChartTab = false,
  onBack,
  children,
  className,
}: HistoryDetailShellProps) {
  return (
    <div className={["history-detail", className ?? ""].filter(Boolean).join(" ")}>
      <nav className="history-breadcrumb">
        <button className="history-back" onClick={onBack}>&larr; All Sessions</button>
        <span className="history-bc-sep">/</span>
        <span className="history-bc-weekend">{weekendName}</span>
        <span className="history-bc-sep">/</span>
        <span className="history-bc-session">{sessionLabel}</span>
      </nav>
      <div className="history-detail-layout">
        <nav className="history-sidenav" role="tablist">
          {SIDENAV_ITEMS.map((item) => {
            if (item.id === "positions" && !showLapChartTab) return null;
            return (
              <button
                key={item.id}
                className={`history-sidenav-item${activeSubTab === item.id ? " active" : ""}`}
                data-sub={item.id}
                onClick={() => onSubTabChange(item.id)}
              >
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="history-detail-body">{children}</div>
      </div>
    </div>
  );
}
