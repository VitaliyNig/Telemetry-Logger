export interface MapDeltaOverlayProps {
  /** Cumulative time delta vs reference in seconds at the cursor distance, or null for "—" (no hover / no compare lap). */
  deltaSeconds: number | null;
  /** Mirrors the original's `[hidden]` toggle — shown only in Map mode. */
  hidden?: boolean;
  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/**
 * Big running-delta badge pinned to the top of the 3D map stage — mirrors `updateTopDelta()` /
 * the `#tcMapDelta` element from telemetryCompare.js. Meant to be rendered as `TrackMap3D`'s
 * `children` (its overlay slot), not as a standalone page element.
 */
export function MapDeltaOverlay({ deltaSeconds, hidden = false, className }: MapDeltaOverlayProps) {
  const tone = deltaSeconds == null ? null : deltaSeconds < -0.01 ? "is-ahead" : deltaSeconds > 0.01 ? "is-behind" : "is-even";
  const text = deltaSeconds == null ? "—" : (deltaSeconds >= 0 ? "+" : "") + deltaSeconds.toFixed(3);

  return (
    <div className={cx("tc-map3d-delta", tone, className)} hidden={hidden} title="Time vs reference at the cursor">
      <span className="tc-md-num">{text}</span>
    </div>
  );
}
