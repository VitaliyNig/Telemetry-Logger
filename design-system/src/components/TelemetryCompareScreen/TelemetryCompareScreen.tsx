import { useEffect, useMemo, useRef, useState } from "react";
import { CompareModeToggle, type CompareLayoutMode } from "../CompareModeToggle/CompareModeToggle";
import { TransportControls, type TransportControlsSpeed } from "../TransportControls/TransportControls";
import {
  CompareLapPicker,
  type CompareLapPickerDriver,
  type CompareLapPickerSelection,
} from "../CompareLapPicker/CompareLapPicker";
import {
  SectorBadgesToolbar,
  type SectorBadgesToolbarChannel,
  type SectorBadgesToolbarChipMode,
  type SectorBadgesToolbarDeltaMode,
  type SectorBadgesToolbarSegment,
  type SectorBadgesToolbarSplit,
  type SectorBadgesToolbarZoomRange,
} from "../SectorBadgesToolbar/SectorBadgesToolbar";
import { TopLossZones, type TopLossZonesZone } from "../TopLossZones/TopLossZones";
import {
  TelemetryChartStack,
  type ChartStackDriver,
  type ChartStackMetricKey,
  type ChartStackSample,
} from "../TelemetryChartStack/TelemetryChartStack";
import {
  TrackMap3D,
  type TrackMap3DDominanceRun,
  type TrackMap3DDriver,
  type TrackMap3DGeometry,
  type TrackMap3DOverlayMode,
  type TrackMap3DSyncMode,
} from "../TrackMap3D/TrackMap3D";
import { MapDeltaOverlay } from "../MapDeltaOverlay/MapDeltaOverlay";
import { FocusPanel, type FocusPanelDriver } from "../FocusPanel/FocusPanel";

const PLAY_SECONDS = 6; // real seconds for a full lap at 1x — mirrors playbackTick's PLAY_SECONDS.

const DEFAULT_CHANNELS: SectorBadgesToolbarChannel[] = [
  { key: "delta", label: "Δ", active: true },
  { key: "spd", label: "Speed", active: true },
  { key: "thr", label: "Throttle", active: true },
  { key: "brk", label: "Brake", active: true },
  { key: "str", label: "Steering", active: false },
  { key: "gr", label: "Gear", active: false },
  { key: "rpm", label: "RPM", active: false },
  { key: "ers", label: "ERS", active: false },
  { key: "drs", label: "DRS", active: false },
];

export interface TelemetryCompareScreenProps {
  trackLengthM: number;
  sector2StartM?: number;
  sector3StartM?: number;

  pickerDrivers: CompareLapPickerDriver[];
  selection: CompareLapPickerSelection[];
  onAddLap: (carIdx: number, lapNum: number) => void;
  onRemoveLap: (key: number) => void;
  onSetReference: (key: number) => void;
  onToggleLapVisibility: (key: number) => void;
  maxTotal?: number;
  maxPerTeam?: number;
  redFlagClearedAfterLap?: number | null;

  /** Already-resolved lap samples for every visible selection, one entry per lap. */
  chartDrivers: ChartStackDriver[];

  mapGeometry: TrackMap3DGeometry | null;
  mapDrivers: TrackMap3DDriver[];
  mapDominance?: TrackMap3DDominanceRun[];

  /** Sector-badge segments, pre-computed by the host for every selectable split (3/9/12-way). */
  sectorSegmentsBySplit: Record<SectorBadgesToolbarSplit, SectorBadgesToolbarSegment[]>;
  lossZones?: TopLossZonesZone[];

  className?: string;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

interface ResolvedSample {
  d: number;
  t: number;
  spd: number;
  thr: number;
  brk: number;
  str: number;
  gr: number;
  rpm: number;
  ers: number;
  ersMd: number;
  drs: number;
}

/** Binary search + linear interp of sample fields at a given lap distance — mirrors TelemetryChartStack's own `interpAtDistance`. */
function sampleAt(samples: ChartStackSample[], targetD: number): ResolvedSample | null {
  if (!samples || samples.length === 0) return null;
  const toResolved = (s: ChartStackSample): ResolvedSample => ({
    d: s.d,
    t: s.t,
    spd: s.spd,
    thr: s.thr,
    brk: s.brk,
    str: s.str,
    gr: s.gr,
    rpm: s.rpm,
    ers: s.ers || 0,
    ersMd: s.ersMd || 0,
    drs: s.drs || 0,
  });
  if (targetD <= samples[0].d) return toResolved(samples[0]);
  const last = samples[samples.length - 1];
  if (targetD >= last.d) return toResolved(last);
  let lo = 1;
  let hi = samples.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].d < targetD) lo = mid + 1;
    else hi = mid;
  }
  const b = samples[lo];
  const a = samples[lo - 1];
  const span = b.d - a.d;
  if (span <= 0) return toResolved(a);
  const f = (targetD - a.d) / span;
  return {
    d: targetD,
    t: a.t + (b.t - a.t) * f,
    spd: a.spd + (b.spd - a.spd) * f,
    thr: a.thr + (b.thr - a.thr) * f,
    brk: a.brk + (b.brk - a.brk) * f,
    str: a.str + (b.str - a.str) * f,
    gr: a.gr,
    rpm: a.rpm + (b.rpm - a.rpm) * f,
    ers: (a.ers || 0) + ((b.ers || 0) - (a.ers || 0)) * f,
    ersMd: a.ersMd || 0,
    drs: a.drs || 0,
  };
}

/**
 * Composes the whole Telemetry Compare page — lap picker, sector badges (+ insights), chart
 * stack, 3D map (+ delta overlay) and focus panel — sharing one piece of screen state, mirroring
 * `telemetryCompare.js`'s `render()` skeleton and hover-bridge wiring. Lap selection / data are
 * controlled by the host (callbacks out); zoom, hover, chip mode, height, playback and the
 * charts/map layout mode are pure view state owned here, same as the original's in-closure
 * `compareState` ephemeral group.
 */
export function TelemetryCompareScreen({
  trackLengthM,
  sector2StartM,
  sector3StartM,
  pickerDrivers,
  selection,
  onAddLap,
  onRemoveLap,
  onSetReference,
  onToggleLapVisibility,
  maxTotal,
  maxPerTeam,
  redFlagClearedAfterLap,
  chartDrivers,
  mapGeometry,
  mapDrivers,
  mapDominance,
  sectorSegmentsBySplit,
  lossZones,
  className,
}: TelemetryCompareScreenProps) {
  const [mode, setMode] = useState<CompareLayoutMode>("charts");

  const [deltaMode, setDeltaMode] = useState<SectorBadgesToolbarDeltaMode>("cumulative");
  const [split, setSplit] = useState<SectorBadgesToolbarSplit>(3);
  const [zoomRange, setZoomRange] = useState<SectorBadgesToolbarZoomRange | null>(null);
  const [channels, setChannels] = useState<SectorBadgesToolbarChannel[]>(DEFAULT_CHANNELS);
  const [chipMode, setChipMode] = useState<SectorBadgesToolbarChipMode>("pair");
  const [heightScale, setHeightScale] = useState(1.9);
  const [insightsEnabled, setInsightsEnabled] = useState(false);

  const [overlayMode, setOverlayMode] = useState<TrackMap3DOverlayMode>("none");
  const [follow, setFollow] = useState(false);
  const [syncMode, setSyncMode] = useState<TrackMap3DSyncMode>("dist");

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<TransportControlsSpeed>(1);
  const [scrubDistance, setScrubDistance] = useState(0);
  const [hoverDistance, setHoverDistance] = useState<number | null>(null);

  const playRef = useRef({ raf: 0, last: 0 });
  useEffect(() => {
    if (!playing) return;
    playRef.current.last = 0;
    function tick(ts: number) {
      const dt = playRef.current.last ? Math.min(0.1, (ts - playRef.current.last) / 1000) : 0;
      playRef.current.last = ts;
      setScrubDistance((d) => {
        let next = d + (trackLengthM / PLAY_SECONDS) * speed * dt;
        if (next >= trackLengthM) next -= trackLengthM;
        return next;
      });
      playRef.current.raf = requestAnimationFrame(tick);
    }
    playRef.current.raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(playRef.current.raf);
  }, [playing, speed, trackLengthM]);

  const hiddenMetrics = useMemo(
    () => channels.filter((c) => !c.active).map((c) => c.key) as ChartStackMetricKey[],
    [channels],
  );

  const effectiveDistance = hoverDistance ?? scrubDistance;

  function handleHover(d: number) {
    setHoverDistance(d);
  }
  function handleHoverClear() {
    setHoverDistance(null);
  }

  const referenceDriver = useMemo(() => chartDrivers.find((d) => d.isReference) ?? chartDrivers[0] ?? null, [chartDrivers]);
  const primaryCompareDriver = useMemo(() => chartDrivers.find((d) => !d.isReference) ?? null, [chartDrivers]);

  const deltaSeconds = useMemo(() => {
    if (!referenceDriver || !primaryCompareDriver) return null;
    const refS = sampleAt(referenceDriver.samples, effectiveDistance);
    const cmpS = sampleAt(primaryCompareDriver.samples, effectiveDistance);
    if (!refS || !cmpS) return null;
    return cmpS.t - refS.t;
  }, [referenceDriver, primaryCompareDriver, effectiveDistance]);

  const focusDrivers: FocusPanelDriver[] = useMemo(
    () =>
      chartDrivers.map((d) => {
        const s = sampleAt(d.samples, effectiveDistance);
        return {
          key: d.carIdx,
          name: d.label,
          color: d.color,
          isReference: d.isReference,
          sample: s && {
            spd: s.spd,
            rpm: s.rpm,
            gr: s.gr,
            thr: s.thr,
            brk: s.brk,
            str: s.str,
            drs: !!s.drs,
            ers: s.ers,
            ersMode: s.ersMd,
          },
        };
      }),
    [chartDrivers, effectiveDistance],
  );

  return (
    <div className={cx("tc-compare-screen", className)}>
      <CompareModeToggle mode={mode} onModeChange={setMode} />
      <TransportControls
        playing={playing}
        onPlayingChange={setPlaying}
        onRestart={() => {
          setPlaying(false);
          setScrubDistance(0);
        }}
        distance={scrubDistance}
        trackLengthM={trackLengthM}
        onScrub={(d) => {
          setPlaying(false);
          setScrubDistance(d);
        }}
        speed={speed}
        onSpeedChange={setSpeed}
        syncMode={syncMode}
        onSyncModeChange={setSyncMode}
      />
      <div className={cx("tc-layout", mode === "map" ? "tc-layout--map" : "tc-layout--charts")}>
        <div className="tc-side" data-priority="secondary">
          <div className="tc-side-picker-host">
            <CompareLapPicker
              drivers={pickerDrivers}
              selected={selection}
              maxTotal={maxTotal}
              maxPerTeam={maxPerTeam}
              redFlagClearedAfterLap={redFlagClearedAfterLap}
              onAddLap={onAddLap}
              onRemove={onRemoveLap}
              onSetRef={onSetReference}
              onToggleVisibility={onToggleLapVisibility}
            />
          </div>
          <div className="tc-side-toolbar tc-sector-badges">
            <SectorBadgesToolbar
              deltaMode={deltaMode}
              onDeltaModeChange={setDeltaMode}
              split={split}
              onSplitChange={setSplit}
              segments={sectorSegmentsBySplit[split] ?? []}
              zoomRange={zoomRange}
              onZoomRangeChange={setZoomRange}
              onZoomIn2x={() => {
                const z0 = zoomRange?.start ?? 0;
                const z1 = zoomRange?.end ?? trackLengthM;
                const mid = (z0 + z1) / 2;
                const span = (z1 - z0) / 4;
                setZoomRange({ start: Math.max(0, mid - span), end: Math.min(trackLengthM, mid + span) });
              }}
              onZoomOut2x={() => {
                const z0 = zoomRange?.start ?? 0;
                const z1 = zoomRange?.end ?? trackLengthM;
                const mid = (z0 + z1) / 2;
                const span = z1 - z0;
                setZoomRange(span * 2 >= trackLengthM ? null : { start: Math.max(0, mid - span), end: Math.min(trackLengthM, mid + span) });
              }}
              channels={channels}
              onChannelToggle={(key) => setChannels((prev) => prev.map((c) => (c.key === key ? { ...c, active: !c.active } : c)))}
              chipMode={chipMode}
              onChipModeChange={setChipMode}
              heightScale={heightScale}
              onHeightScaleChange={setHeightScale}
              insightsEnabled={insightsEnabled}
              onInsightsEnabledChange={setInsightsEnabled}
            >
              {insightsEnabled && lossZones && lossZones.length > 0 && (
                <TopLossZones zones={lossZones} zoomRange={zoomRange} onZoomRangeChange={setZoomRange} />
              )}
            </SectorBadgesToolbar>
          </div>
        </div>
        <div className="tc-main">
          <div className="tc-layer tc-layer-b" data-priority="primary">
            <div className="tc-charts">
              <TelemetryChartStack
                drivers={chartDrivers}
                sector2StartM={sector2StartM}
                sector3StartM={sector3StartM}
                zoomRange={zoomRange}
                hiddenMetrics={hiddenMetrics}
                chipMode={chipMode}
                heightScale={heightScale}
                hoverDistance={effectiveDistance}
                onHover={handleHover}
                onHoverClear={handleHoverClear}
              />
            </div>
          </div>
        </div>
        <div className="tc-rail" data-priority="secondary">
          <div className="tc-map tc-layer tc-layer-c">
            <TrackMap3D
              geometry={mapGeometry}
              drivers={mapDrivers}
              dominance={mapDominance}
              markerDistance={effectiveDistance}
              syncMode={syncMode}
              overlayMode={overlayMode}
              onOverlayModeChange={setOverlayMode}
              follow={follow}
              onFollowChange={setFollow}
              onHover={handleHover}
              onHoverClear={handleHoverClear}
            >
              <MapDeltaOverlay deltaSeconds={deltaSeconds} hidden={mode !== "map"} />
            </TrackMap3D>
          </div>
          <FocusPanel drivers={focusDrivers} distance={effectiveDistance} />
        </div>
      </div>
    </div>
  );
}
