export interface TabItem {
  /** Stable identifier returned by `onChange`. */
  id: string;
  /** Visible label. */
  label: string;
  /** Hide the tab without removing it (maps to `.tab-btn.hidden`). */
  hidden?: boolean;
}

export interface TabNavProps {
  tabs: TabItem[];
  /** Id of the currently active tab. */
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
}

/**
 * Segmented tab bar used in the app header (Live / History / Settings / Debug).
 */
export function TabNav({ tabs, activeId, onChange, className }: TabNavProps) {
  return (
    <nav className={["tab-nav", className ?? ""].filter(Boolean).join(" ")}>
      {tabs.map((tab) => {
        const classes = [
          "tab-btn",
          tab.id === activeId ? "active" : "",
          tab.hidden ? "hidden" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <button
            key={tab.id}
            type="button"
            className={classes}
            data-tab={tab.id}
            onClick={() => onChange?.(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
