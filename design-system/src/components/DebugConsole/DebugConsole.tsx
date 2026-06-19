import { useEffect, useRef } from "react";
import { ToggleSwitch } from "../ToggleSwitch/ToggleSwitch";
import { Button } from "../Button/Button";

export interface DebugConsoleEntry {
  timestamp: string;
  name: string;
}

export interface DebugConsoleProps {
  entries: DebugConsoleEntry[];
  autoScroll: boolean;
  onAutoScrollChange: (value: boolean) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
}

/** Mirrors `.debug-right` — live packet feed with auto-scroll toggle and Clear action. */
export function DebugConsole({
  entries,
  autoScroll,
  onAutoScrollChange,
  onClear,
  placeholder = "Waiting for packets...",
  className,
}: DebugConsoleProps) {
  const consoleRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [entries, autoScroll]);

  return (
    <div className={["debug-right", className ?? ""].filter(Boolean).join(" ")}>
      <h3>Packet Console</h3>
      <div className="console-toolbar">
        <ToggleSwitch
          size="small"
          checked={autoScroll}
          onChange={(e) => onAutoScrollChange(e.target.checked)}
          aria-label="Auto-scroll"
        />
        <span className="toolbar-label">Auto-scroll</span>
        <Button variant="secondary" size="small" onClick={onClear}>Clear</Button>
      </div>
      <div className="debug-console" ref={consoleRef}>
        {entries.length === 0 ? (
          <p className="muted">{placeholder}</p>
        ) : (
          entries.map((e, i) => (
            <div className="console-entry" key={i}>
              <span className="console-time">{e.timestamp}</span>
              <span className="console-name">{e.name}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
