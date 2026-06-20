import type { ReactNode } from "react";

export type SectorBadgesToolbarDeltaMode = "cumulative" | "sector";
export type SectorBadgesToolbarSplit = 3 | 9 | 12;
export type SectorBadgesToolbarChipMode = "pair" | "diff";

export interface SectorBadgesToolbarZoomRange {
  start: number;
  end: number;
}

export interface SectorBadgesToolbarSegment {
  sector: number;
  /** 1-based sub-part index within the sector when `parts` > 1. */
  part?: number;
  parts?: number;
  start: number;
  end: number;
  /** Segment/sector time in ms — formatted internally (mirrors `formatSectorTime`). */
  timeMs: number;
}

export interface SectorBadgesToolbarChannel {
  key: string;
  label: string;
  active: boolean;
}

export interface SectorBadgesToolbarProps {
  deltaMode: SectorBadgesToolbarDeltaMode;
  onDeltaModeChange: (mode: SectorBadgesToolbarDeltaMode) => void;

  /** Segments-per-sector split: 3 (unsplit), 9, or 12. */
  split: SectorBadgesToolbarSplit;
  onSplitChange: (split: SectorBadgesToolbarSplit) => void;

  segments: SectorBadgesToolbarSegment[];
  zoomRange: SectorBadgesToolbarZoomRange | null;
  onZoomRangeChange: (range: SectorBadgesToolbarZoomRange | null) => void;
  onZoomIn2x: () => void;
  onZoomOut2x: () => void;

  channels: SectorBadgesToolbarChannel[];
  onChannelToggle: (key: string) => void;

  chipMode: SectorBadgesToolbarChipMode;
  onChipModeChange: (mode: SectorBadgesToolbarChipMode) => void;

  /** One of 1.3 / 1.9 / 2.8 (Compact / Normal / Tall). */
  heightScale: number;
  onHeightScaleChange: (scale: number) => void;

  insightsEnabled: boolean;
  onInsightsEnabledChange: (enabled: boolean) => void;

  /** Rendered as the toolbar's trailing section, e.g. a Top Loss Zones panel, when `insightsEnabled`. */
  children?: ReactNode;
  className?: string;
}

const SPLIT_OPTIONS: { value: SectorBadgesToolbarSplit; label: string }[] = [
  { value: 3, label: "3" },
  { value: 9, label: "9" },
  { value: 12, label: "12" },
];

const SIZE_PRESETS: { scale: number; title: string; barY: number; barH: number }[] = [
  { scale: 1.3, title: "Compact", barY: 9, barH: 4 },
  { scale: 1.9, title: "Normal", barY: 6, barH: 7 },
  { scale: 2.8, title: "Tall", barY: 2, barH: 11 },
];

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function formatSectorTime(ms: number): string {
  if (!ms || ms <= 0) return "—";
  return (ms / 1000).toFixed(3);
}

function segmentLabels(seg: SectorBadgesToolbarSegment): { full: string; short: string } {
  const suffix = seg.parts && seg.parts > 1 ? `.${seg.part}` : "";
  return { full: `S${seg.sector}${suffix}`, short: `${seg.sector}${suffix}` };
}

/** Groups consecutive segments sharing the same `sector` into `.tc-sector-group`s. */
function groupBySector(segments: SectorBadgesToolbarSegment[]): SectorBadgesToolbarSegment[][] {
  const groups: SectorBadgesToolbarSegment[][] = [];
  let current: SectorBadgesToolbarSegment[] | null = null;
  let currentSector: number | null = null;
  segments.forEach((seg) => {
    if (currentSector !== seg.sector) {
      current = [];
      groups.push(current);
      currentSector = seg.sector;
    }
    current!.push(seg);
  });
  return groups;
}

/**
 * Compact side toolbar for the Telemetry Compare 2D charts — mirrors the `.tc-stb` markup
 * built by `drawBadges()` in telemetryCompare.js. Page-layout placement (`.tc-side-toolbar
 * .tc-sector-badges` host) is the composing screen's job; this component only owns the
 * `.tc-stb` content (View / Sectors / Channels / Display sections).
 */
export function SectorBadgesToolbar({
  deltaMode,
  onDeltaModeChange,
  split,
  onSplitChange,
  segments,
  zoomRange,
  onZoomRangeChange,
  onZoomIn2x,
  onZoomOut2x,
  channels,
  onChannelToggle,
  chipMode,
  onChipModeChange,
  heightScale,
  onHeightScaleChange,
  insightsEnabled,
  onInsightsEnabledChange,
  children,
  className,
}: SectorBadgesToolbarProps) {
  const miniCount = split / 3;
  const sectorGroups = groupBySector(segments);

  function toggleZoomRange(start: number, end: number) {
    if (zoomRange && zoomRange.start === start && zoomRange.end === end) onZoomRangeChange(null);
    else onZoomRangeChange({ start, end });
  }

  return (
    <div className={cx("tc-stb", className)}>
      <div className="tc-stb-section">
        <div className="tc-stb-label">View</div>
        <div className="tc-segmented tc-segmented--full">
          <button
            type="button"
            className={cx("tc-seg-btn", deltaMode === "cumulative" && "active")}
            title="Cumulative delta"
            onClick={() => onDeltaModeChange("cumulative")}
          >
            Cumul.
          </button>
          <button
            type="button"
            className={cx("tc-seg-btn", deltaMode === "sector" && "active")}
            title="Per-sector delta"
            onClick={() => onDeltaModeChange("sector")}
          >
            Per Sec.
          </button>
        </div>
        <div className="tc-stb-row">
          <span className="tc-stb-mini">Split</span>
          <div className="tc-segmented">
            {SPLIT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                className={cx("tc-seg-btn", split === opt.value && "active")}
                onClick={() => onSplitChange(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="tc-stb-row">
          <span className="tc-stb-mini">Zoom</span>
          <div className="tc-zoom-actions">
            <button type="button" className="tc-zoom-btn" title="Reset to full lap" onClick={() => onZoomRangeChange(null)}>
              Reset
            </button>
            <button
              type="button"
              className="tc-zoom-btn"
              title="Zoom in 2×"
              aria-label="Zoom in 2×"
              onClick={onZoomIn2x}
            >
              +2×
            </button>
            <button
              type="button"
              className="tc-zoom-btn"
              title="Zoom out 2×"
              aria-label="Zoom out 2×"
              onClick={onZoomOut2x}
            >
              −2×
            </button>
          </div>
        </div>
      </div>

      <div className="tc-stb-section">
        <div className="tc-stb-label">Sectors</div>
        <div className="tc-sector-groups">
          {sectorGroups.map((group, gi) => (
            <div className="tc-sector-group" data-sector={`S${group[0].sector}`} key={group[0].sector}>
              {group.map((seg) => {
                const { full, short } = segmentLabels(seg);
                const active = zoomRange != null && zoomRange.start === seg.start && zoomRange.end === seg.end;
                return (
                  <button
                    key={`${seg.start}-${seg.end}`}
                    type="button"
                    className={cx("tc-badge", active && "active")}
                    title={full}
                    onClick={() => toggleZoomRange(seg.start, seg.end)}
                  >
                    <strong>
                      <span className="tc-badge-label-full">{full}</span>
                      <span className="tc-badge-label-short">{short}</span>
                    </strong>{" "}
                    {formatSectorTime(seg.timeMs)}
                  </button>
                );
              })}
              {miniCount > 1 && gi < sectorGroups.length - 1 && <span className="tc-sector-divider" aria-hidden="true" />}
            </div>
          ))}
        </div>
      </div>

      <div className="tc-stb-section">
        <div className="tc-stb-label">Channels</div>
        <div className="tc-channel-list">
          {channels.map((c) => (
            <button
              key={c.key}
              type="button"
              className={cx("tc-channel", c.active && "active")}
              data-key={c.key}
              aria-pressed={c.active}
              onClick={() => onChannelToggle(c.key)}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tc-stb-section">
        <div className="tc-stb-label">Display</div>
        <div className="tc-stb-row">
          <div className="tc-segmented tc-segmented--grow">
            <button
              type="button"
              className={cx("tc-seg-btn", "tc-chip-mode", chipMode === "pair" && "active")}
              onClick={() => onChipModeChange("pair")}
            >
              Values
            </button>
            <button
              type="button"
              className={cx("tc-seg-btn", "tc-chip-mode", chipMode === "diff" && "active")}
              onClick={() => onChipModeChange("diff")}
            >
              Delta
            </button>
          </div>
        </div>
        <div className="tc-stb-row">
          <span className="tc-stb-mini">Size</span>
          <div className="tc-segmented tc-segmented--grow">
            {SIZE_PRESETS.map((preset) => {
              const active = Math.abs(heightScale - preset.scale) < 0.01;
              return (
                <button
                  key={preset.scale}
                  type="button"
                  className={cx("tc-seg-btn", "tc-seg-btn--icon", active && "active")}
                  title={preset.title}
                  aria-label={preset.title}
                  onClick={() => onHeightScaleChange(preset.scale)}
                >
                  <svg className="tc-size-icon" viewBox="0 0 16 14" aria-hidden="true" focusable="false">
                    <rect x={1} y={preset.barY} width={14} height={preset.barH} rx={1.5} />
                  </svg>
                </button>
              );
            })}
          </div>
        </div>
        <div className="tc-stb-row">
          <span className="tc-stb-mini">Insights</span>
          <button
            type="button"
            className={cx("tc-seg-btn", "tc-insights-toggle", "tc-stb-toggle", insightsEnabled && "active")}
            onClick={() => onInsightsEnabledChange(!insightsEnabled)}
          >
            {insightsEnabled ? "On" : "Off"}
          </button>
        </div>
      </div>

      {insightsEnabled && children}
    </div>
  );
}
