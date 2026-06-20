import type { TrackMap3DSyncMode } from "../TrackMap3D/TrackMap3D";

export type TransportControlsSpeed = 0.1 | 0.25 | 0.5 | 1 | 2 | 4;

const SPEED_OPTIONS: TransportControlsSpeed[] = [0.1, 0.25, 0.5, 1, 2, 4];

export interface TransportControlsProps {
  playing: boolean;
  onPlayingChange: (playing: boolean) => void;
  onRestart: () => void;

  /** Current scrub position in metres along the lap. */
  distance: number;
  trackLengthM: number;
  onScrub: (distance: number) => void;

  speed: TransportControlsSpeed;
  onSpeedChange: (speed: TransportControlsSpeed) => void;

  /** Marker sync mode shared with TrackMap3D — "dist" (same track position) or "time" (real elapsed-time gap). */
  syncMode: TrackMap3DSyncMode;
  onSyncModeChange: (mode: TrackMap3DSyncMode) => void;

  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Mirrors the `#tcTransport` bar built in telemetryCompare.js's `render()`/`wireTransport()`. */
export function TransportControls({
  playing,
  onPlayingChange,
  onRestart,
  distance,
  trackLengthM,
  onScrub,
  speed,
  onSpeedChange,
  syncMode,
  onSyncModeChange,
  className,
}: TransportControlsProps) {
  return (
    <div className={cx("tc-transport", className)}>
      <button
        type="button"
        className={cx("tc-tp-btn", playing && "is-playing")}
        title="Play / pause lap"
        aria-label="Play lap"
        onClick={() => onPlayingChange(!playing)}
      >
        {playing ? "⏸" : "▶"}
      </button>
      <button type="button" className="tc-tp-btn" title="Restart from start" aria-label="Restart" onClick={onRestart}>
        ⏮
      </button>
      <input
        type="range"
        className="tc-tp-scrub"
        min={0}
        max={trackLengthM}
        step={1}
        value={Math.round(distance)}
        aria-label="Lap position"
        onChange={(e) => onScrub(Number(e.target.value))}
      />
      <span className="tc-tp-pos">{Math.round(distance)} m</span>
      <select
        className="tc-tp-speed"
        aria-label="Playback speed"
        value={speed}
        onChange={(e) => onSpeedChange(Number(e.target.value) as TransportControlsSpeed)}
      >
        {SPEED_OPTIONS.map((s) => (
          <option key={s} value={s}>
            {s}×
          </option>
        ))}
      </select>
      <span className="tc-tp-sync" role="group" aria-label="Marker sync mode">
        <button
          type="button"
          className={cx(syncMode === "dist" && "active")}
          title="Markers at the same track position"
          onClick={() => onSyncModeChange("dist")}
        >
          Pos
        </button>
        <button
          type="button"
          className={cx(syncMode === "time" && "active")}
          title="Markers at their real position for the same elapsed time — shows the live gap"
          onClick={() => onSyncModeChange("time")}
        >
          Gap
        </button>
      </span>
    </div>
  );
}
