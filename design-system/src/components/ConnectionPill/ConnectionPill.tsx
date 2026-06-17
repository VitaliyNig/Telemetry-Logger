export type ConnectionState = "connecting" | "reconnecting" | "connected" | "offline";

export interface ConnectionPillProps {
  state: ConnectionState;
  /** Override the label; defaults to a sensible label per state. */
  label?: string;
  className?: string;
}

const defaultLabels: Record<ConnectionState, string> = {
  connecting: "Connecting…",
  reconnecting: "Reconnecting…",
  connected: "Connected",
  offline: "Offline",
};

/**
 * Live connection status indicator from the app header. The colored dot pulses
 * while connecting/reconnecting; color + label track `state`.
 */
export function ConnectionPill({ state, label, className }: ConnectionPillProps) {
  return (
    <div
      className={["connection-pill", className ?? ""].filter(Boolean).join(" ")}
      data-state={state}
      role="status"
      aria-live="polite"
    >
      <span className="connection-pill__dot" />
      <span className="connection-pill__label">{label ?? defaultLabels[state]}</span>
    </div>
  );
}
