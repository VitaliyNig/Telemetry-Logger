import { useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactElement } from "react";

export type ChartStackMetricKey = "delta" | "spd" | "thr" | "brk" | "str" | "gr" | "rpm" | "ers" | "drs";

export interface ChartStackSample {
  /** Lap distance, metres — the shared X domain for every row. */
  d: number;
  /** Lap time at this point, seconds — only used internally to derive the Delta row. */
  t: number;
  spd: number;
  thr: number;
  brk: number;
  str: number;
  gr: number;
  rpm: number;
  ers?: number;
  ersMd?: 0 | 1 | 2 | 3;
  drs?: 0 | 1;
}

export interface ChartStackDriver {
  carIdx: number;
  /** Short label (driver code) used in the DRS track and hover chip. */
  label: string;
  /** Resolved livery/team colour — never a hardcoded team palette. */
  color: string;
  /** Drivers sharing a teamId get solid/dashed/dotted line styles in selection order. */
  teamId?: string | number;
  /** Exactly one driver should be the reference; defaults to the first driver if none is marked. */
  isReference?: boolean;
  /** Already resolved lap samples, ordered by ascending `d`. */
  samples: ChartStackSample[];
}

export interface TelemetryChartStackProps {
  drivers: ChartStackDriver[];
  sector2StartM?: number;
  sector3StartM?: number;
  className?: string;
}

interface MetricDef {
  key: ChartStackMetricKey;
  label: string;
  plotTitle: string;
  height: number;
  min: number;
  max: number;
  style?: "band";
}

const METRICS: MetricDef[] = [
  { key: "delta", label: "Δ", plotTitle: "DELTA", height: 70, min: -1, max: 1 },
  { key: "spd", label: "Speed", plotTitle: "SPEED", height: 70, min: 0, max: 370 },
  { key: "thr", label: "Throttle", plotTitle: "THROTTLE", height: 50, min: 0, max: 100 },
  { key: "brk", label: "Brake", plotTitle: "BRAKE", height: 50, min: 0, max: 100 },
  { key: "str", label: "Steering", plotTitle: "STEERING", height: 50, min: -100, max: 100 },
  { key: "gr", label: "Gear", plotTitle: "GEAR", height: 50, min: -1, max: 8 },
  { key: "rpm", label: "RPM", plotTitle: "RPM", height: 60, min: 0, max: 14000 },
  { key: "ers", label: "ERS", plotTitle: "ERS", height: 60, min: 0, max: 100 },
  { key: "drs", label: "DRS", plotTitle: "DRS", height: 22, min: 0, max: 1, style: "band" },
];

const ERS_MODE_TAGS = ["", "MED", "HOT", "OT"];
const HEIGHT_SCALE = 1.9;
const W = 900;
const PAD_T = 4;
const PAD_B = 16;

function getMetricPriority(key: ChartStackMetricKey): "primary" | "secondary" {
  return key === "spd" || key === "thr" || key === "brk" || key === "str" ? "primary" : "secondary";
}

function effectiveHeight(metric: MetricDef): number {
  const scaled = Math.max(18, Math.round(metric.height * HEIGHT_SCALE));
  return getMetricPriority(metric.key) === "secondary" ? Math.max(18, Math.round(scaled * 0.75)) : scaled;
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

function toResolved(s: ChartStackSample): ResolvedSample {
  return { d: s.d, t: s.t, spd: s.spd, thr: s.thr, brk: s.brk, str: s.str, gr: s.gr, rpm: s.rpm, ers: s.ers || 0, ersMd: s.ersMd || 0, drs: s.drs || 0 };
}

/** Binary search + linear interp of sample fields at a given lap distance. */
function interpAtDistance(samples: ChartStackSample[], targetD: number): ResolvedSample | null {
  if (!samples || samples.length === 0) return null;
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
    t: a.t + (b.t - a.t) * f,
    d: targetD,
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

/** Cumulative time delta vs. the reference, sampled at the reference's own distances. */
function computeDeltaSeries(driverSamples: ChartStackSample[], refSamples: ChartStackSample[]): { d: number; v: number }[] {
  const out: { d: number; v: number }[] = [];
  for (const ref of refSamples) {
    const interp = interpAtDistance(driverSamples, ref.d);
    if (interp == null) continue;
    out.push({ d: ref.d, v: interp.t - ref.t });
  }
  return out;
}

/** Runs of a constant field value (used for DRS-open blocks and ERS-mode background bands). */
function runLengthRuns(samples: ChartStackSample[], field: "drs" | "ersMd"): { from: number; to: number; v: number }[] {
  const runs: { from: number; to: number; v: number }[] = [];
  if (!samples || samples.length === 0) return runs;
  let curV = samples[0][field] || 0;
  let curFrom = samples[0].d;
  for (let i = 1; i < samples.length; i++) {
    const v = samples[i][field] || 0;
    if (v !== curV) {
      runs.push({ from: curFrom, to: samples[i].d, v: curV });
      curV = v;
      curFrom = samples[i].d;
    }
  }
  runs.push({ from: curFrom, to: samples[samples.length - 1].d, v: curV });
  return runs;
}

/** Drops intermediate vertices so a polyline never exceeds maxPoints — rendering more
 *  than ~2 verts per CSS pixel is invisible but still costs string building + paint. */
function subsamplePolyline<T>(values: T[], maxPoints: number): T[] {
  if (!values || values.length <= maxPoints) return values;
  const step = values.length / maxPoints;
  const out: T[] = new Array(maxPoints);
  for (let i = 0; i < maxPoints; i++) out[i] = values[Math.min(values.length - 1, Math.floor(i * step))];
  out[out.length - 1] = values[values.length - 1];
  return out;
}

function getHorizontalGridSpec(key: ChartStackMetricKey, plotVMin: number, plotVMax: number): { v: number; label: string }[] {
  if (key === "delta") {
    const n = 5;
    const out: { v: number; label: string }[] = [];
    for (let i = 0; i < n; i++) {
      const v = plotVMin + (i / (n - 1)) * (plotVMax - plotVMin);
      out.push({ v, label: (v >= 0 ? "+" : "") + v.toFixed(3) });
    }
    return out;
  }
  if (key === "spd") {
    return [
      { v: 0, label: "0" },
      { v: 100, label: "100" },
      { v: 200, label: "200" },
      { v: 300, label: "300" },
      { v: 370, label: "370" },
    ];
  }
  if (key === "thr" || key === "brk" || key === "ers") {
    return [
      { v: 0, label: "0%" },
      { v: 50, label: "50%" },
      { v: 100, label: "100%" },
    ];
  }
  if (key === "str") {
    return [
      { v: -100, label: "−100" },
      { v: -50, label: "−50" },
      { v: 0, label: "0" },
      { v: 50, label: "+50" },
      { v: 100, label: "+100" },
    ];
  }
  if (key === "gr") {
    const out: { v: number; label: string }[] = [];
    for (let g = -1; g <= 8; g++) out.push({ v: g, label: g < 0 ? "R" : g === 0 ? "N" : String(g) });
    return out;
  }
  if (key === "rpm") {
    return [
      { v: 0, label: "0" },
      { v: 7000, label: "7k" },
      { v: 14000, label: "14k" },
    ];
  }
  if (key === "drs") {
    return [
      { v: 0, label: "0" },
      { v: 0.5, label: "·" },
      { v: 1, label: "1" },
    ];
  }
  const n = 3;
  const out: { v: number; label: string }[] = [];
  const span = Math.max(0.0001, plotVMax - plotVMin);
  for (let i = 0; i < n; i++) {
    const v = plotVMin + (i / (n - 1)) * span;
    out.push({ v, label: Math.abs(v) < 1e-6 ? "0" : v < 1 ? v.toFixed(1) : String(Math.round(v)) });
  }
  return out;
}

interface SampleValueSource {
  spd: number;
  thr: number;
  brk: number;
  str: number;
  gr: number;
  rpm: number;
  ers?: number;
  drs?: number;
}

function sampleValue(s: SampleValueSource, key: ChartStackMetricKey): number {
  switch (key) {
    case "spd": return s.spd;
    case "thr": return s.thr;
    case "brk": return s.brk;
    case "str": return s.str;
    case "gr": return s.gr;
    case "rpm": return s.rpm;
    case "ers": return s.ers || 0;
    case "drs": return s.drs || 0;
    default: return 0;
  }
}

function formatChipValue(metricKey: ChartStackMetricKey, sample: ResolvedSample | null, deltaAt: number | null): string {
  if (!sample && metricKey !== "delta") return "—";
  switch (metricKey) {
    case "delta":
      return deltaAt == null ? "—" : (deltaAt >= 0 ? "+" : "") + deltaAt.toFixed(3) + " s";
    case "spd": return Math.round(sample!.spd) + " km/h";
    case "thr": return Math.round(sample!.thr) + "%";
    case "brk": return Math.round(sample!.brk) + "%";
    case "str": return Math.round(sample!.str) + "°";
    case "gr": return sample!.gr > 0 ? "G" + sample!.gr : sample!.gr === 0 ? "N" : "R";
    case "rpm": return Math.round(sample!.rpm).toLocaleString();
    case "ers": return Math.round(sample!.ers || 0) + "% " + (ERS_MODE_TAGS[sample!.ersMd || 0] || "");
    case "drs": return sample!.drs ? "ON" : "OFF";
    default: return "";
  }
}

interface HoverEntry {
  driver: ChartStackDriver;
  sample: ResolvedSample;
  delta: number | null;
  isReference: boolean;
}

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function MetricRow({
  metric,
  height,
  drivers,
  referenceCarIdx,
  dashIndexByCarIdx,
  deltaSeriesByCarIdx,
  range,
  trackLen,
  sectorBoundaries,
  hover,
  hoverEntries,
}: {
  metric: MetricDef;
  height: number;
  drivers: ChartStackDriver[];
  referenceCarIdx: number | null;
  dashIndexByCarIdx: Map<number, number>;
  deltaSeriesByCarIdx: Map<number, { d: number; v: number }[]>;
  range: { min: number; max: number };
  trackLen: number;
  sectorBoundaries: number[];
  hover: { pct: number; d: number } | null;
  hoverEntries: HoverEntry[];
}) {
  const priority = getMetricPriority(metric.key);
  const plotH = height - PAD_T - PAD_B;
  const x = (d: number) => (d / Math.max(1, trackLen)) * W;
  const yFor = (v: number) => PAD_T + plotH - ((v - range.min) / Math.max(0.0001, range.max - range.min)) * plotH;

  const ticks = getHorizontalGridSpec(metric.key, range.min, range.max).filter(
    (t) => t.v >= range.min - 1e-9 && t.v <= range.max + 1e-9
  );

  let referenceDriver: ChartStackDriver | undefined;
  if (referenceCarIdx != null) referenceDriver = drivers.find((d) => d.carIdx === referenceCarIdx);

  let body: ReactElement;
  let drsLabels: { top: number; text: string }[] = [];
  let ersTags: { left: number; text: string }[] = [];

  if (metric.style === "band" && metric.key === "drs") {
    const tracks = drivers
      .map((d) => ({ samples: d.samples, color: d.color, label: d.label.toUpperCase().slice(0, 3), isRef: d.carIdx === referenceCarIdx }))
      .sort((a, b) => (b.isRef ? 1 : 0) - (a.isRef ? 1 : 0));
    const trackH = tracks.length ? plotH / tracks.length : plotH;
    const trackGap = tracks.length > 1 ? Math.min(2, trackH * 0.1) : 0;
    const rects: ReactElement[] = [];
    tracks.forEach((track, idx) => {
      const ty = PAD_T + trackH * idx + trackGap / 2;
      const th = Math.max(2, trackH - trackGap);
      runLengthRuns(track.samples, "drs").forEach((r, ri) => {
        if (r.v !== 1) return;
        const x0 = Math.max(0, x(r.from));
        const x1 = Math.min(W, x(r.to));
        if (x1 <= x0) return;
        rects.push(<rect key={`${idx}-${ri}`} className="tc-drs-block" x={x0} y={ty} width={x1 - x0} height={th} fill={track.color} />);
      });
      if (th >= 10) drsLabels.push({ top: ty + th / 2, text: track.label });
    });
    body = <>{rects}</>;
  } else {
    const ersBg: ReactElement[] = [];
    if (metric.key === "ers" && referenceDriver) {
      runLengthRuns(referenceDriver.samples, "ersMd").forEach((r, ri) => {
        const x0 = Math.max(0, x(r.from));
        const x1 = Math.min(W, x(r.to));
        if (x1 <= x0) return;
        ersBg.push(<rect key={ri} className={`tc-ers-band tc-ers-mode-${r.v}`} x={x0} y={PAD_T} width={x1 - x0} height={plotH} />);
        const tag = ERS_MODE_TAGS[r.v] || "";
        if (tag && x1 - x0 > 30) ersTags.push({ left: ((x1 - 3) / W) * 100, text: tag });
      });
    }

    const lines: ReactElement[] = [];
    let compareSeriesCount = 0;
    drivers.forEach((d) => {
      let values: { d: number; v: number }[];
      if (metric.key === "delta") {
        values = deltaSeriesByCarIdx.get(d.carIdx) || [];
      } else {
        values = d.samples.map((s) => ({ d: s.d, v: sampleValue(s, metric.key) }));
      }
      if (values.length === 0) return;
      values = subsamplePolyline(values, 1800);
      const pts = values.map((pt) => `${x(pt.d)},${yFor(pt.v)}`).join(" ");
      const dashIdx = dashIndexByCarIdx.get(d.carIdx) || 0;
      const dashClass = dashIdx === 0 ? "tc-line--solid" : dashIdx === 1 ? "tc-line--dashed" : "tc-line--dotted";
      let roleClass = "tc-line-extra";
      if (d.carIdx === referenceCarIdx) roleClass = "tc-line-ref";
      else if (compareSeriesCount === 0) roleClass = "tc-line-current";
      lines.push(<polyline key={d.carIdx} className={cx("tc-line", roleClass, dashClass)} stroke={d.color} points={pts} />);
      if (d.carIdx !== referenceCarIdx) compareSeriesCount++;
    });

    const baseY = yFor(0);
    const baseline =
      0 >= range.min - 1e-9 && 0 <= range.max + 1e-9 && baseY >= PAD_T && baseY <= PAD_T + plotH ? (
        <line className="tc-baseline" x1={0} x2={W} y1={baseY} y2={baseY} />
      ) : null;

    const sectorLines = sectorBoundaries
      .filter((b) => b > 0 && b < trackLen)
      .map((b, i) => <line key={i} className="tc-sector-line" x1={x(b)} x2={x(b)} y1={PAD_T} y2={PAD_T + plotH} />);

    body = (
      <>
        {ersBg}
        {sectorLines}
        {lines}
        {baseline}
      </>
    );
  }

  const current = hoverEntries.find((h) => !h.isReference) || hoverEntries[0] || null;
  let chipTop = height / 2;
  if (current) {
    const yv = metric.key === "delta" ? current.delta ?? 0 : sampleValue(current.sample, metric.key);
    const yNorm = (yv - range.min) / Math.max(0.0001, range.max - range.min);
    chipTop = Math.max(2, Math.min(height - 18, PAD_T + (1 - yNorm) * plotH));
  }
  // Chip follows the crosshair horizontally, flipping to hug the right edge once the
  // cursor gets close enough that a left-anchored chip would run off the row.
  const chipOnRight = !hover || hover.pct > 0.82;
  const chipPositionStyle: CSSProperties = chipOnRight ? { right: 6 } : { left: `calc(${(hover?.pct ?? 0) * 100}% + 6px)` };

  return (
    <div className="tc-chart-row" data-metric={metric.key} data-priority={priority} style={{ "--tc-row-h": `${height}px` } as CSSProperties}>
      <div className="tc-chart-label tc-chart-label--rail" />
      <div className="tc-chart-svg-host">
        <svg className="tc-chart" viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none">
          {ticks.map((t, i) => {
            const yn = PAD_T + plotH - ((t.v - range.min) / Math.max(0.0001, range.max - range.min)) * plotH;
            if (yn < PAD_T - 0.5 || yn > PAD_T + plotH + 0.5) return null;
            return <line key={i} className="tc-grid-h" x1={0} x2={W} y1={yn} y2={yn} />;
          })}
          {body}
        </svg>
        {metric.key === "drs" &&
          drsLabels.map((l, i) => (
            <div key={i} className="tc-drs-track-label" style={{ top: l.top }}>
              {l.text}
            </div>
          ))}
        {metric.key === "ers" &&
          ersTags.map((tag, i) => (
            <div key={i} className="tc-ers-mode-tag" style={{ left: `${tag.left}%`, top: PAD_T + 2 }}>
              {tag.text}
            </div>
          ))}
        {ticks.map((t, i) => {
          const yn = PAD_T + plotH - ((t.v - range.min) / Math.max(0.0001, range.max - range.min)) * plotH;
          if (yn < PAD_T - 0.5 || yn > PAD_T + plotH + 0.5) return null;
          let translateY = "translateY(-50%)";
          if (yn <= PAD_T + 11) translateY = "translateY(0)";
          else if (yn >= PAD_T + plotH - 3) translateY = "translateY(-100%)";
          return (
            <div key={i} className="tc-axis-tick" style={{ top: yn, transform: translateY }}>
              {t.label}
            </div>
          );
        })}
        <div className="tc-plot-title">{metric.plotTitle}</div>
        <div className="tc-row-chip" data-metric={metric.key} hidden={!hover || hoverEntries.length === 0} style={{ top: chipTop, ...chipPositionStyle }}>
          {hoverEntries.map((h) => {
            const dv = metric.key === "delta" ? h.delta : null;
            const text = formatChipValue(metric.key, h.sample, dv);
            const tone = h.isReference ? "ref" : h.delta != null ? (h.delta < -0.01 ? "win" : h.delta > 0.01 ? "loss" : "ref") : "ref";
            const showDrsTag = metric.key === "spd" && !!h.sample.drs;
            return (
              <span className="tc-chip-row" key={h.driver.carIdx}>
                <span className="tc-chip-dot" style={{ background: h.driver.color }} />
                <span className={cx("tc-chip-ref", `tc-chip-ref--${tone}`)}>{h.driver.label}</span>
                <span className="tc-chip-val">{text}</span>
                {showDrsTag && <span className="tc-chip-drs tc-chip-drs--equal">DRS</span>}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** Mirrors `drawChartStack`/`renderChartSvg` — the 9-row metric stack (Δ/Speed/Throttle/
 *  Brake/Steering/Gear/RPM/ERS/DRS) sharing one lapDistance X-domain, with a hover
 *  crosshair and per-row value chips. Zoom/pan, playback, keyboard shortcuts, the
 *  loss-zone insights panel and persisted UI prefs are app-level interaction layers,
 *  not visual surface — they're intentionally not ported here. */
export function TelemetryChartStack({ drivers, sector2StartM, sector3StartM, className }: TelemetryChartStackProps) {
  const hoverLayerRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ pct: number; d: number } | null>(null);

  const reference = useMemo(() => drivers.find((d) => d.isReference) ?? drivers[0] ?? null, [drivers]);

  const trackLen = useMemo(() => {
    let max = 0;
    drivers.forEach((d) => d.samples.forEach((s) => { if (s.d > max) max = s.d; }));
    return max || 1;
  }, [drivers]);

  const dashIndexByCarIdx = useMemo(() => {
    const seen = new Map<string, number>();
    const out = new Map<number, number>();
    drivers.forEach((d) => {
      const tid = d.teamId != null ? String(d.teamId) : `_${d.carIdx}`;
      const n = seen.get(tid) || 0;
      out.set(d.carIdx, n);
      seen.set(tid, n + 1);
    });
    return out;
  }, [drivers]);

  const deltaSeriesByCarIdx = useMemo(() => {
    const map = new Map<number, { d: number; v: number }[]>();
    if (!reference) return map;
    drivers.forEach((d) => map.set(d.carIdx, computeDeltaSeries(d.samples, reference.samples)));
    return map;
  }, [drivers, reference]);

  const plotRanges = useMemo(() => {
    const map = new Map<ChartStackMetricKey, { min: number; max: number }>();
    let maxAbs = 0.05;
    deltaSeriesByCarIdx.forEach((series, carIdx) => {
      if (carIdx === reference?.carIdx) return;
      series.forEach((pt) => { maxAbs = Math.max(maxAbs, Math.abs(pt.v)); });
    });
    maxAbs = Math.min(10, Math.max(0.05, maxAbs * 1.08));
    METRICS.forEach((m) => {
      map.set(m.key, m.key === "delta" ? { min: -maxAbs, max: maxAbs } : { min: m.min, max: m.max });
    });
    return map;
  }, [deltaSeriesByCarIdx, reference]);

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const el = hoverLayerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    setHover({ pct, d: pct * trackLen });
  }

  function handleMouseLeave() {
    setHover(null);
  }

  const hoverEntries: HoverEntry[] = useMemo(() => {
    if (!hover || !reference) return [];
    return drivers
      .map((d) => {
        const sample = interpAtDistance(d.samples, hover.d);
        if (!sample) return null;
        const isReference = d.carIdx === reference.carIdx;
        let delta: number | null = null;
        if (isReference) delta = 0;
        else {
          const refSample = interpAtDistance(reference.samples, hover.d);
          if (refSample) delta = sample.t - refSample.t;
        }
        return { driver: d, sample, delta, isReference };
      })
      .filter((x): x is HoverEntry => x != null)
      .sort((a, b) => (b.isReference ? 1 : 0) - (a.isReference ? 1 : 0));
  }, [hover, drivers, reference]);

  const sectorBoundaries = [sector2StartM, sector3StartM].filter((v): v is number => v != null);

  if (drivers.length === 0) {
    return (
      <div className={cx("tc-charts", className)}>
        <div className="history-placeholder">No telemetry samples.</div>
      </div>
    );
  }

  return (
    <div className={cx("tc-charts", className)}>
      {METRICS.map((metric) => (
        <MetricRow
          key={metric.key}
          metric={metric}
          height={effectiveHeight(metric)}
          drivers={drivers}
          referenceCarIdx={reference?.carIdx ?? null}
          dashIndexByCarIdx={dashIndexByCarIdx}
          deltaSeriesByCarIdx={deltaSeriesByCarIdx}
          range={plotRanges.get(metric.key) || { min: metric.min, max: metric.max }}
          trackLen={trackLen}
          sectorBoundaries={sectorBoundaries}
          hover={hover}
          hoverEntries={hoverEntries}
        />
      ))}
      <div className="tc-hover-layer" ref={hoverLayerRef} onMouseMove={handleMouseMove} onMouseLeave={handleMouseLeave}>
        <div className="tc-crosshair" style={{ left: hover ? `${hover.pct * 100}%` : -9999 }} />
      </div>
    </div>
  );
}
