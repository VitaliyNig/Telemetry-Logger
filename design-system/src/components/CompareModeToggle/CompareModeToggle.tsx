export type CompareLayoutMode = "charts" | "map";

export interface CompareModeToggleProps {
  mode: CompareLayoutMode;
  onModeChange: (mode: CompareLayoutMode) => void;
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Mirrors the `.tc-topbar` > `.tc-mode-toggle` markup built in telemetryCompare.js's `render()`/`wireModeToggle()`. */
export function CompareModeToggle({ mode, onModeChange, className }: CompareModeToggleProps) {
  return (
    <div className={cx("tc-topbar", className)}>
      <div className="tc-mode-toggle" role="group" aria-label="Compare layout mode">
        <button type="button" className={cx(mode === "charts" && "active")} onClick={() => onModeChange("charts")}>
          Charts
        </button>
        <button type="button" className={cx(mode === "map" && "active")} onClick={() => onModeChange("map")}>
          Map
        </button>
      </div>
    </div>
  );
}
