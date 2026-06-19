import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

export interface HistoryLapChartLap {
  lapNum: number;
  /** 1-based race position; 0 or absent means no data for this lap. */
  position: number;
  pit?: boolean;
}

export interface HistoryLapChartDriver {
  carIdx: number;
  name: string;
  /** Resolved livery/team colour (see liveryColours convention) — never a hardcoded team palette. */
  color: string;
  laps: HistoryLapChartLap[];
}

/** CurrentRaceFlag values that get a background band: 2=SC, 3=VSC, 4=Red. */
export type LapChartFlag = 2 | 3 | 4;

export interface HistoryLapChartFlagSpan {
  /** Already resolved to a lap number by the caller (mirrors `resolveEventLap`, which needs the full event list to fall back on nearest `timeS`). */
  lap: number;
  flag: LapChartFlag;
}

export interface HistoryLapChartProps {
  /** Already in final display order (mirrors `sortDriversByFinalPosition`). */
  drivers: HistoryLapChartDriver[];
  totalLaps: number;
  /** Y-axis row count; defaults to the full grid size (`max(20, drivers.length)`). */
  totalDrivers?: number;
  flagSpans?: HistoryLapChartFlagSpan[];
  className?: string;
}

const PAD_L = 64, PAD_R = 16, PAD_T = 32, PAD_B = 18;
const MIN_ROW_PX = 12, MAX_ROW_PX = 38, MIN_LAP_COL_PX = 5.5;

function shortDriverName(name: string | null | undefined): string {
  const raw = String(name || "").trim();
  if (!raw) return "Unknown";
  const bracketMatch = raw.match(/\[([A-Za-z0-9]{3,})\]/);
  if (bracketMatch) return bracketMatch[1].toUpperCase();
  if (/^[A-Za-z0-9_]{2,16}$/.test(raw) && raw.indexOf(" ") < 0) return raw;
  const parts = raw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts[parts.length - 1];
    if (last.length <= 3) return (first + ". " + last).trim();
    return (first + ". " + last.substring(0, 12)).trim();
  }
  return raw.length > 12 ? raw.substring(0, 12) : raw;
}

function driverCode(name: string): string {
  const short = shortDriverName(name);
  const normalized = short.replace(/[^A-Za-z0-9]/g, "");
  if (normalized.length >= 3) return normalized.substring(0, 3).toUpperCase();
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const initials = words.map((w) => w.charAt(0)).join("");
  if (initials.length >= 3) return initials.substring(0, 3).toUpperCase();
  return (normalized || initials || "?").toUpperCase();
}

function isPitLap(lap: HistoryLapChartLap | undefined): boolean {
  return !!lap && lap.pit === true;
}

function fontSzUser(labelPxScr: number, W: number, hostWidthPx: number): string {
  const u = (labelPxScr * W) / hostWidthPx;
  return String(Number(u.toPrecision(8)));
}

function bandClass(f: number): string {
  return f === 2 ? "pos-band-sc" : f === 3 ? "pos-band-vsc" : "pos-band-red";
}

interface TooltipState {
  lap: number;
  crosshairX: number;
  left: number;
  top: number;
  rows: { pos: number; name: string; color: string }[];
}

function EyeIcon({ hidden, color }: { hidden: boolean; color: string }) {
  return hidden ? (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="pos-eye-svg pos-eye-svg--off" aria-hidden="true">
      <path
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17.94 17.94A10 10 0 0112 20c-7 0-11-8-11-8 .55-1 1.72-3.52 6.94-9.88M14.12 14.12a3 3 0 11-4.24-4.24M10.73 5.08A10 10 0 0112 4c7 0 11 8 11 8 .55 1.33 3.93 11.93 11 23M3 3l18 18"
      />
    </svg>
  ) : (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="pos-eye-svg" aria-hidden="true">
      <path stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" stroke={color} strokeWidth={2} />
    </svg>
  );
}

/** Mirrors `renderPositions`/`drawPositionChart` — per-lap position lines with pit badges,
 *  SC/VSC/red-flag bands, a hide/show driver sidebar and a hover crosshair/tooltip. */
export function HistoryLapChart({
  drivers,
  totalLaps,
  totalDrivers,
  flagSpans = [],
  className,
}: HistoryLapChartProps) {
  const [hiddenCarIdx, setHiddenCarIdx] = useState<Set<number>>(new Set());
  const [hoveredCarIdx, setHoveredCarIdx] = useState<number | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [vpan, setVpan] = useState({ max: 0, value: 0 });
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  function toggleHidden(carIdx: number) {
    setHiddenCarIdx((prev) => {
      const next = new Set(prev);
      if (next.has(carIdx)) next.delete(carIdx);
      else next.add(carIdx);
      return next;
    });
  }

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || typeof ResizeObserver === "undefined") return;
    let timer: number | undefined;
    const sync = () => setContainerSize({ width: wrap.clientWidth, height: wrap.clientHeight });
    sync();
    const ro = new ResizeObserver(() => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(sync, 50);
    });
    ro.observe(wrap);
    return () => {
      ro.disconnect();
      if (timer != null) window.clearTimeout(timer);
    };
  }, []);

  const roster = useMemo(() => drivers.filter((d) => d.laps.some((l) => l.position > 0)), [drivers]);
  const totalDriverRows = Math.max(20, totalDrivers ?? drivers.length);

  const geometry = useMemo(() => {
    const hostWidthPx = Math.max(280, Math.round(containerSize.width || 320));
    const hostHeightMeasured = containerSize.height || 0;
    const minPlotFx = MIN_LAP_COL_PX * Math.max(1, totalLaps - 1);
    const W = Math.max(hostWidthPx, Math.ceil(PAD_L + PAD_R + minPlotFx));
    const svgCssScale = hostWidthPx / W;
    const fAxis = fontSzUser(11, W, hostWidthPx);
    const fPitLt = fontSzUser(6.5, W, hostWidthPx);
    const segments = Math.max(1, totalDriverRows - 1);
    const padTbPx = (PAD_T + PAD_B) * svgCssScale;
    const availPlotPxBase = hostHeightMeasured > 12 ? hostHeightMeasured - padTbPx : 260;
    const availPlotPx = Math.max(55, availPlotPxBase);
    const idealRowPx = availPlotPx / segments;
    const rowPx = Math.min(MAX_ROW_PX, Math.max(MIN_ROW_PX, idealRowPx));
    const plotHPx = rowPx * segments;
    const plotW = W - PAD_L - PAD_R;
    const plotH = plotHPx / svgCssScale;
    const H = PAD_T + plotH + PAD_B;
    const lapStep = plotW / Math.max(1, totalLaps - 1);
    const x = (lap: number) => PAD_L + (lap - 1) * lapStep;
    const y = (pos: number) => PAD_T + ((pos - 1) / Math.max(1, totalDriverRows - 1)) * plotH;
    return { W, H, plotW, plotH, lapStep, x, y, fAxis, fPitLt };
  }, [containerSize.width, containerSize.height, totalLaps, totalDriverRows]);

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const maxScroll = wrap.scrollHeight - wrap.clientHeight;
    if (maxScroll <= 2) {
      setVpan({ max: 0, value: 0 });
      return;
    }
    const max = Math.max(1, Math.round(maxScroll));
    setVpan({ max, value: Math.round(Math.min(max, wrap.scrollTop)) });
  }, [geometry]);

  function syncVpanFromWrap() {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const maxScroll = wrap.scrollHeight - wrap.clientHeight;
    if (maxScroll <= 2) {
      setVpan({ max: 0, value: 0 });
      return;
    }
    setVpan({ max: Math.max(1, Math.round(maxScroll)), value: Math.round(wrap.scrollTop) });
  }

  const flagByLap = useMemo(() => {
    const map = new Map<number, number>();
    flagSpans.forEach((f) => {
      if (f.lap > totalLaps) return;
      map.set(f.lap, Math.max(map.get(f.lap) || 0, f.flag));
    });
    return map;
  }, [flagSpans, totalLaps]);

  const bands = useMemo(() => {
    const result: { key: string; flag: number; x: number; width: number }[] = [];
    let groupStart: number | null = null;
    let groupFlag = 0;
    for (let lap = 1; lap <= totalLaps + 1; lap++) {
      const f = flagByLap.get(lap) || 0;
      if (f !== groupFlag) {
        if (groupFlag > 0 && groupStart !== null) {
          const xs = geometry.x(groupStart) - geometry.lapStep / 2;
          const xe = geometry.x(lap - 1) + geometry.lapStep / 2;
          result.push({ key: `${groupStart}-${lap - 1}`, flag: groupFlag, x: xs, width: xe - xs });
        }
        groupFlag = f;
        groupStart = f > 0 ? lap : null;
      }
    }
    return result;
  }, [flagByLap, totalLaps, geometry]);

  const yTicks = useMemo(() => {
    const ticks: { key: number; y: number; label: boolean }[] = [];
    for (let p = 1; p <= totalDriverRows; p++) {
      ticks.push({ key: p, y: geometry.y(p), label: p === 1 || p % 5 === 0 || p === totalDriverRows });
    }
    return ticks;
  }, [totalDriverRows, geometry]);

  const xTicks = useMemo(() => {
    const ticks: { key: number; x: number; major: boolean }[] = [];
    for (let lx = 1; lx <= totalLaps; lx++) {
      ticks.push({ key: lx, x: geometry.x(lx), major: lx === 1 || lx % 5 === 0 || lx === totalLaps });
    }
    return ticks;
  }, [totalLaps, geometry]);

  const pitByLap = useMemo(() => {
    const map = new Map<number, number[]>();
    roster.forEach((d) => {
      d.laps.forEach((l) => {
        if (isPitLap(l) && l.position > 0) {
          const arr = map.get(l.lapNum) || [];
          arr.push(d.carIdx);
          map.set(l.lapNum, arr);
        }
      });
    });
    return map;
  }, [roster]);

  const driverGroups = useMemo(
    () =>
      roster
        .map((d) => ({
          driver: d,
          validLaps: d.laps
            .filter((l) => l.position > 0 && l.lapNum <= totalLaps)
            .slice()
            .sort((a, b) => a.lapNum - b.lapNum),
        }))
        .filter((g) => g.validLaps.length > 0),
    [roster, totalLaps]
  );

  function handleMouseMove(e: ReactMouseEvent<HTMLDivElement>) {
    const svg = svgRef.current;
    const wrap = wrapRef.current;
    if (!svg || !wrap) return;
    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const svgX = (e.clientX - svgRect.left) * (geometry.W / svgRect.width);
    const svgY = (e.clientY - svgRect.top) * (geometry.H / svgRect.height);

    if (svgX < PAD_L || svgX > geometry.W - PAD_R || svgY < PAD_T || svgY > geometry.H - PAD_B) {
      setTooltip(null);
      return;
    }

    let lap = Math.round((svgX - PAD_L) / geometry.lapStep) + 1;
    lap = Math.max(1, Math.min(totalLaps, lap));

    const rows: TooltipState["rows"] = [];
    roster.forEach((d) => {
      if (hiddenCarIdx.has(d.carIdx)) return;
      const lapData = d.laps.find((l) => l.lapNum === lap && l.position > 0);
      if (!lapData) return;
      rows.push({ pos: lapData.position, name: driverCode(d.name), color: d.color });
    });
    rows.sort((a, b) => a.pos - b.pos);

    const mouseXWrap = e.clientX - wrapRect.left;
    const mouseYWrap = e.clientY - wrapRect.top;
    let left = mouseXWrap + 14;
    let top = mouseYWrap + 14;
    const tipW = tooltipRef.current?.offsetWidth || 160;
    const tipH = tooltipRef.current?.offsetHeight || 120;
    if (left + tipW > wrapRect.width) left = mouseXWrap - tipW - 10;
    if (top + tipH > wrapRect.height) top = mouseYWrap - tipH - 10;

    setTooltip({ lap, crosshairX: geometry.x(lap), left, top, rows });
  }

  function handleMouseLeave() {
    setTooltip(null);
    setHoveredCarIdx(null);
  }

  return (
    <div className={["pos-layout", className ?? ""].filter(Boolean).join(" ")}>
      <div className="pos-sidebar">
        <div className="pos-sidebar-header">Drivers</div>
        {roster.map((d) => {
          const hidden = hiddenCarIdx.has(d.carIdx);
          return (
            <div
              key={d.carIdx}
              className={["pos-sidebar-row", hidden ? "is-hidden" : ""].filter(Boolean).join(" ")}
              onClick={() => toggleHidden(d.carIdx)}
            >
              <span className="pos-sidebar-swatch" style={{ background: d.color }} />
              <span className="pos-sidebar-code">{driverCode(d.name)}</span>
              <span className="pos-sidebar-name">{shortDriverName(d.name) || "Unknown"}</span>
              <span className="pos-sidebar-eye">
                <EyeIcon hidden={hidden} color={d.color} />
              </span>
            </div>
          );
        })}
      </div>

      <div className="pos-main">
        <div className="pos-chart">
          <div className="pos-legend">
            <span className="pos-legend-item"><span className="pos-legend-chip pos-legend-chip--sc" />SC</span>
            <span className="pos-legend-item"><span className="pos-legend-chip pos-legend-chip--vsc" />VSC</span>
            <span className="pos-legend-item"><span className="pos-legend-chip pos-legend-chip--red" />Red Flag</span>
            <span className="pos-legend-item"><span className="pos-legend-chip pos-legend-chip--pit" />Pitstop</span>
          </div>
          <div className="pos-chart-frame">
            <div
              className="pos-chart-wrap"
              ref={wrapRef}
              onScroll={syncVpanFromWrap}
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {roster.length === 0 ? (
                <div className="history-placeholder">No position data.</div>
              ) : (
                <>
                  <svg
                    ref={svgRef}
                    viewBox={`0 0 ${geometry.W} ${geometry.H}`}
                    className="pos-svg"
                    preserveAspectRatio="xMinYMin meet"
                  >
                    <g className="pos-bands">
                      {bands.map((b) => (
                        <rect key={b.key} className={bandClass(b.flag)} x={b.x} y={PAD_T} width={b.width} height={geometry.plotH} />
                      ))}
                    </g>
                    <g className="pos-grid-group">
                      {yTicks.map((t) => (
                        <g key={`y${t.key}`}>
                          <line className="pos-grid" x1={PAD_L} x2={geometry.W - PAD_R} y1={t.y} y2={t.y} />
                          {t.label && (
                            <text className="pos-ytick" fontSize={geometry.fAxis} x={22} y={t.y + 4} textAnchor="end">
                              {t.key}
                            </text>
                          )}
                        </g>
                      ))}
                      {xTicks.map((t) => (
                        <g key={`x${t.key}`}>
                          <line
                            className={["pos-grid", "pos-grid--v", t.major ? "pos-grid--v-major" : ""].filter(Boolean).join(" ")}
                            x1={t.x}
                            x2={t.x}
                            y1={PAD_T}
                            y2={geometry.H - PAD_B}
                          />
                          {t.major && (
                            <text className="pos-xtick" fontSize={geometry.fAxis} x={t.x} y={PAD_T - 10} textAnchor="middle">
                              {t.key}
                            </text>
                          )}
                        </g>
                      ))}
                    </g>
                    {tooltip && (
                      <line className="pos-crosshair" x1={tooltip.crosshairX} y1={PAD_T} x2={tooltip.crosshairX} y2={geometry.H - PAD_B} style={{ opacity: 1 }} />
                    )}
                    {driverGroups.map(({ driver: d, validLaps }) => {
                      const hidden = hiddenCarIdx.has(d.carIdx);
                      const dimmed = hoveredCarIdx != null && hoveredCarIdx !== d.carIdx && !hidden;
                      const hovered = hoveredCarIdx === d.carIdx;
                      const points = validLaps.map((l) => `${geometry.x(l.lapNum)},${geometry.y(l.position)}`).join(" ");
                      const first = validLaps[0];
                      const lyStart = geometry.y(first.position) + 4;
                      const code = driverCode(d.name);
                      return (
                        <g
                          key={d.carIdx}
                          className={["pos-driver-group", hidden ? "is-hidden" : "", dimmed ? "is-dimmed" : "", hovered ? "is-hovered" : ""].filter(Boolean).join(" ")}
                        >
                          <polyline
                            className="pos-line"
                            stroke={d.color}
                            points={points}
                            onMouseEnter={() => setHoveredCarIdx(d.carIdx)}
                            onMouseLeave={() => setHoveredCarIdx(null)}
                          />
                          <g className="pos-dots">
                            {validLaps.map((l) => (
                              <circle key={l.lapNum} className="pos-dot" cx={geometry.x(l.lapNum)} cy={geometry.y(l.position)} r={1.5} fill={d.color} />
                            ))}
                          </g>
                          <g className="pos-pits">
                            {d.laps
                              .filter((l) => isPitLap(l) && l.position > 0 && l.lapNum <= totalLaps)
                              .map((l) => {
                                const lapPits = pitByLap.get(l.lapNum) || [];
                                const idx = lapPits.indexOf(d.carIdx);
                                const offset = (idx - (lapPits.length - 1) / 2) * 14;
                                const cx = geometry.x(l.lapNum) + offset;
                                const cy = geometry.y(l.position);
                                return (
                                  <g key={l.lapNum} className="pos-pit-badge">
                                    <rect x={cx - 5.5} y={cy - 5.5} width={11} height={11} rx={2.5} ry={2.5} fill={d.color} stroke="#fff" strokeWidth={1} />
                                    <text className="pos-pit-letter" fontSize={geometry.fPitLt} x={cx} y={cy} textAnchor="middle" dominantBaseline="middle">P</text>
                                  </g>
                                );
                              })}
                          </g>
                          <g
                            className={["pos-label-hit", "pos-label-hit--start", hidden ? "is-hidden" : ""].filter(Boolean).join(" ")}
                            transform={`translate(${PAD_L - 10},${lyStart})`}
                            onClick={() => toggleHidden(d.carIdx)}
                          >
                            <text className="pos-driver-label pos-driver-label--start" fontSize={geometry.fAxis} x={0} y={0} dominantBaseline="middle" textAnchor="end" fill={d.color}>
                              {code}
                            </text>
                          </g>
                        </g>
                      );
                    })}
                  </svg>
                  <div ref={tooltipRef} className={["pos-tooltip", tooltip ? "is-visible" : ""].filter(Boolean).join(" ")} style={tooltip ? { transform: `translate(${tooltip.left}px,${tooltip.top}px)` } : undefined}>
                    <div className="pos-tooltip-lap">{tooltip ? `Lap ${tooltip.lap}` : ""}</div>
                    <div className="pos-tooltip-body">
                      {tooltip?.rows.map((r) => (
                        <div key={r.name} className="pos-tooltip-row">
                          <span className="pos-tooltip-swatch" style={{ background: r.color }} />
                          <span className="pos-tooltip-pos">{r.pos}</span>
                          <span className="pos-tooltip-name">{r.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
            <div className="pos-chart-v-pan" hidden={vpan.max <= 0}>
              <input
                type="range"
                className="pos-chart-v-range"
                aria-label="Scroll chart vertically"
                min={0}
                max={vpan.max}
                value={vpan.value}
                onChange={(e) => {
                  const wrap = wrapRef.current;
                  if (wrap) wrap.scrollTop = Number(e.target.value);
                  syncVpanFromWrap();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
