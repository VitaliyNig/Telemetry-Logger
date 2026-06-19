import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

export type LapTimesCategory = "practice" | "qualifying" | "race" | "time_trial" | "unknown";

export interface HistoryLapTimesPerf {
  perfPct: number;
  ersUsagePct?: number;
  drsUsagePct?: number;
  drsZoneBased?: boolean;
  /** Only emitted for 2026+ format sessions (game ships `m_ersHarvestLimitPerLap`). */
  harvEfficiencyPct?: number;
  harvUsedMJ?: number;
  harvCapMJ?: number;
}

export interface HistoryLapTimesLap {
  lapNum: number;
  valid: boolean;
  lapTimeMs: number;
  s1Ms: number;
  s2Ms: number;
  s3Ms: number;
  pit?: boolean;
  blueFlag?: boolean;
  /** 0=green 1=yellow 2=SC 3=VSC 4=red. Numeric or string enum accepted (history payload variance). */
  raceFlag?: number | string | null;
  /** `m_visualTyreCompound` id — same numeric space as `TyreCompoundBadge`'s `compound` prop. */
  compoundVisual?: number | null;
  tyreAge?: number | null;
  /** [RL, RR, FL, FR] percent — matches UDP `tyreWearEnd` order. */
  tyreWearEnd?: [number, number, number, number] | null;
  perf?: HistoryLapTimesPerf | null;
}

export interface HistoryLapTimesDriver {
  carIdx: number;
  name: string;
  /** Resolved livery/team colour (see liveryColours convention) — never a hardcoded team palette. */
  teamColor: string;
  laps: HistoryLapTimesLap[];
}

export interface HistoryLapTimesGridProps {
  category: LapTimesCategory;
  /** Already in final display order (mirrors `orderDriversForTable`: race result / classification / best-lap order depending on category). */
  drivers: HistoryLapTimesDriver[];
  /**
   * Lap number after which a stale "sticky Red" flag should be ignored — older logs never
   * reset `CurrentRaceFlag` on race restart, so every lap after RDFL reads Red. Pass the lap
   * nearest the post-restart LGOT event (see `redFlagClearedAfterLap` in historyDetail.js), or
   * omit when the session never raised a red flag.
   */
  redFlagClearedAfterLap?: number | null;
  className?: string;
}

type ColumnKey = "time" | "sectors" | "wear" | "delta" | "perf" | "tt_delta";

const LAP_COLUMNS_BY_CAT: Record<LapTimesCategory, ColumnKey[]> = {
  practice: ["time", "wear"],
  qualifying: ["time", "sectors", "wear"],
  race: ["time", "delta", "wear", "perf"],
  // No tyre wear in TT — gap vs session personal best (valid laps only).
  time_trial: ["time", "sectors", "tt_delta"],
  unknown: ["time", "wear"],
};

const SUB_COL_LABELS: Record<ColumnKey, string> = {
  time: "Time",
  sectors: "Sec",
  wear: "Wear",
  delta: "Δ",
  perf: "Perf",
  tt_delta: "PB Δ",
};

// Delta classification (seconds) relative to the REF lap within a stint / session PB.
const DELTA_THRESHOLDS = { neutral: 0.8, warn: 1.5 };

interface Bests {
  lap: number;
  s1: number;
  s2: number;
  s3: number;
}

interface RefLapInfo {
  stintLapIdx: number;
  refLapNum: number | null;
  refLapTimeMs: number;
  isRef: boolean;
  refUnderSc: boolean;
  refFallback: boolean;
}

type RefIndex = Record<number, { byLap: Record<number, RefLapInfo> }>;

function normalizeRaceFlag(flag: number | string | null | undefined): number {
  if (flag == null) return 0;
  if (typeof flag === "number") return flag;
  const text = String(flag).trim().toLowerCase();
  if (!text) return 0;
  if (text === "0" || text === "green") return 0;
  if (text === "1" || text === "yellow") return 1;
  if (text === "2" || text === "sc" || text === "safetycar" || text === "safety_car" || text === "safety car") return 2;
  if (text === "3" || text === "vsc" || text === "virtualsafetycar" || text === "virtual_safety_car" || text === "virtual safety car") return 3;
  if (text === "4" || text === "red" || text === "redflag" || text === "red_flag" || text === "red flag") return 4;
  return 0;
}

function formatLapTime(ms: number): string {
  if (!ms || ms <= 0) return "—";
  const m = Math.floor(ms / 60000);
  const s = ((ms % 60000) / 1000).toFixed(3);
  return m + ":" + s.padStart(6, "0");
}

function formatSectorTime(ms: number): string {
  if (!ms || ms <= 0) return "—";
  return (ms / 1000).toFixed(3);
}

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function rgbToHex(r: number, g: number, b: number): string {
  return (
    "#" +
    [r, g, b]
      .map((v) => {
        const h = Math.round(v).toString(16);
        return h.length === 1 ? "0" + h : h;
      })
      .join("")
  );
}

function interpolateStops(value: number, stops: [number, string][]): string {
  if (value <= stops[0][0]) return stops[0][1];
  if (value >= stops[stops.length - 1][0]) return stops[stops.length - 1][1];
  for (let i = 0; i < stops.length - 1; i++) {
    const [t1, c1] = stops[i];
    const [t2, c2] = stops[i + 1];
    if (value >= t1 && value <= t2) {
      const t = (value - t1) / (t2 - t1);
      const a = hexToRgb(c1);
      const b = hexToRgb(c2);
      return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
    }
  }
  return stops[stops.length - 1][1];
}

const WEAR_COLOR_STOPS: [number, string][] = [
  [10, "#B6F2B6"], [20, "#CFF7B0"], [30, "#E8FCA8"], [40, "#FFF7A1"], [50, "#FFE89C"],
  [60, "#FFD3A1"], [70, "#FFBFA1"], [80, "#FFA8A8"], [90, "#FF8A8A"], [100, "#D97A7A"],
];

function wearColorFor(avg: number): string {
  return interpolateStops(avg, WEAR_COLOR_STOPS);
}

// Perf badge fill — light grey-blue (low) to brand purple (high).
const PERF_COLOR_STOPS: [number, string][] = [
  [10, "#B8C4D6"], [20, "#B5B5D9"], [30, "#B1A7DD"], [40, "#AE98E0"], [50, "#AB89E4"],
  [60, "#A87AE7"], [70, "#A56CEB"], [80, "#A15DEE"], [90, "#9E4EF2"], [100, "#9B3FF5"],
];

function perfColorFor(pct: number): string {
  return interpolateStops(pct, PERF_COLOR_STOPS);
}

// Pirelli compound colours — fixed game rules, not livery-dependent (unlike team colour).
const COMPOUND_VISUAL_META: Record<number, { name: string; letter: string; color: string }> = {
  16: { name: "Soft", letter: "S", color: "#ff3333" },
  17: { name: "Medium", letter: "M", color: "#ffd700" },
  18: { name: "Hard", letter: "H", color: "#e0e0e0" },
  7: { name: "Inter", letter: "I", color: "#00cc00" },
  8: { name: "Wet", letter: "W", color: "#00a6ff" },
  9: { name: "Dry", letter: "D", color: "#e0e0e0" },
  10: { name: "Wet", letter: "W", color: "#00a6ff" },
  15: { name: "Wet", letter: "W", color: "#00a6ff" },
  19: { name: "Super Soft", letter: "S", color: "#9b3cc4" },
  20: { name: "Soft", letter: "S", color: "#ff3333" },
  21: { name: "Medium", letter: "M", color: "#ffd700" },
  22: { name: "Hard", letter: "H", color: "#e0e0e0" },
};

function compoundMeta(visual: number | null | undefined) {
  if (visual != null && COMPOUND_VISUAL_META[visual]) return COMPOUND_VISUAL_META[visual];
  return { name: "?", letter: "?", color: "#666" };
}

function computeBests(drivers: HistoryLapTimesDriver[]): Bests {
  const best: Bests = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
  drivers.forEach((d) =>
    d.laps.forEach((l) => {
      if (l.valid && l.lapTimeMs > 0 && l.lapTimeMs < best.lap) best.lap = l.lapTimeMs;
      if (l.valid && l.s1Ms > 0 && l.s1Ms < best.s1) best.s1 = l.s1Ms;
      if (l.valid && l.s2Ms > 0 && l.s2Ms < best.s2) best.s2 = l.s2Ms;
      if (l.valid && l.s3Ms > 0 && l.s3Ms < best.s3) best.s3 = l.s3Ms;
    })
  );
  return best;
}

function personalBest(laps: HistoryLapTimesLap[], requireSectors = false): Bests {
  const pb: Bests = { lap: Infinity, s1: Infinity, s2: Infinity, s3: Infinity };
  laps.forEach((l) => {
    const hasSectors = l.s1Ms > 0 && l.s2Ms > 0 && l.s3Ms > 0;
    if (l.valid && l.lapTimeMs > 0 && (!requireSectors || hasSectors) && l.lapTimeMs < pb.lap) pb.lap = l.lapTimeMs;
    if (l.valid && l.s1Ms > 0 && l.s1Ms < pb.s1) pb.s1 = l.s1Ms;
    if (l.valid && l.s2Ms > 0 && l.s2Ms < pb.s2) pb.s2 = l.s2Ms;
    if (l.valid && l.s3Ms > 0 && l.s3Ms < pb.s3) pb.s3 = l.s3Ms;
  });
  return pb;
}

function virtualBestMs(laps: HistoryLapTimesLap[]): number {
  const pb = personalBest(laps);
  if (pb.s1 === Infinity || pb.s2 === Infinity || pb.s3 === Infinity) return Infinity;
  return pb.s1 + pb.s2 + pb.s3;
}

function lapByNum(laps: HistoryLapTimesLap[], n: number): HistoryLapTimesLap | null {
  return laps.find((l) => l.lapNum === n) ?? null;
}

function computeMaxLap(drivers: HistoryLapTimesDriver[]): number {
  let max = 0;
  drivers.forEach((d) => d.laps.forEach((l) => { if (l.lapNum > max) max = l.lapNum; }));
  return max;
}

function rowFlagClass(lapNum: number, drivers: HistoryLapTimesDriver[], redClearAfterLap: number | null | undefined): string {
  const redIsSticky = redClearAfterLap != null && lapNum > redClearAfterLap;
  const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let total = 0;
  drivers.forEach((d) => {
    const lap = lapByNum(d.laps, lapNum);
    if (!lap) return;
    total++;
    const raceFlag = normalizeRaceFlag(lap.raceFlag);
    if (redIsSticky && raceFlag === 4) return; // ignore stale Red after restart
    if (raceFlag && counts[raceFlag] != null) counts[raceFlag]++;
  });
  if (total === 0) return "";
  const half = total / 2;
  if (counts[4] >= half) return "lap-row lap-row--rf";
  if (counts[2] >= half) return "lap-row lap-row--sc";
  if (counts[3] >= half) return "lap-row lap-row--vsc";
  if (counts[1] >= half) return "lap-row lap-row--yellow";
  return "lap-row";
}

function isCleanLap(l: HistoryLapTimesLap): boolean {
  const raceFlag = normalizeRaceFlag(l.raceFlag);
  return l.valid && raceFlag !== 2 && raceFlag !== 3;
}

function argminByLapTime(list: HistoryLapTimesLap[]): HistoryLapTimesLap | null {
  return list.reduce<HistoryLapTimesLap | null>((best, l) => {
    const lt = l.lapTimeMs > 0 ? l.lapTimeMs : Infinity;
    const bt = best && best.lapTimeMs > 0 ? best.lapTimeMs : Infinity;
    return best == null || lt < bt ? l : best;
  }, null);
}

interface RefLapPick {
  refLapNum: number;
  refLapTimeMs: number;
  refUnderSc?: boolean;
  refFallback?: boolean;
}

// Picks the REF lap of a stint per the product spec:
//  - skip the out-lap (stint position 1)
//  - prefer the best valid clean lap within the first 3 laps (positions 2..4)
//  - widen to the first 5 (positions 2..6) if none
//  - then drop the SC/VSC filter and flag refUnderSc
//  - finally fall back to the out-lap itself
function pickRefLap(stintLaps: HistoryLapTimesLap[]): RefLapPick | null {
  if (stintLaps.length === 0) return null;

  let pool = stintLaps.slice(1, 4).filter(isCleanLap);
  if (pool.length === 0) pool = stintLaps.slice(1, 6).filter(isCleanLap);
  if (pool.length > 0) {
    const best = argminByLapTime(pool)!;
    return { refLapNum: best.lapNum, refLapTimeMs: best.lapTimeMs };
  }

  const dirty = stintLaps.slice(1, 6).filter((l) => l.valid);
  if (dirty.length > 0) {
    const bestDirty = argminByLapTime(dirty)!;
    return { refLapNum: bestDirty.lapNum, refLapTimeMs: bestDirty.lapTimeMs, refUnderSc: true };
  }

  const firstLap = stintLaps[0];
  return { refLapNum: firstLap.lapNum, refLapTimeMs: firstLap.lapTimeMs, refFallback: true };
}

// Splits a driver's laps into stints (split on pit-in, or compound change as fallback for
// sessions where pit bits are missing) so the REF lap can be picked once per stint.
function raceStintsForDriver(laps: HistoryLapTimesLap[]): HistoryLapTimesLap[][] {
  if (laps.length === 0) return [];
  const sorted = [...laps].sort((a, b) => a.lapNum - b.lapNum);
  const stints: HistoryLapTimesLap[][] = [[sorted[0]]];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const l = sorted[i];
    if (prev.pit || l.compoundVisual !== prev.compoundVisual) {
      stints.push([l]);
    } else {
      stints[stints.length - 1].push(l);
    }
  }
  return stints;
}

// Builds carIdx -> lapNum -> REF lap info so every delta cell can look itself up in O(1).
function buildRefIndex(drivers: HistoryLapTimesDriver[]): RefIndex {
  const out: RefIndex = {};
  drivers.forEach((d) => {
    const stints = raceStintsForDriver(d.laps);
    const byLap: Record<number, RefLapInfo> = {};
    stints.forEach((stintLaps) => {
      const ref = pickRefLap(stintLaps);
      stintLaps.forEach((l, idx) => {
        byLap[l.lapNum] = {
          stintLapIdx: idx + 1,
          refLapNum: ref ? ref.refLapNum : null,
          refLapTimeMs: ref ? ref.refLapTimeMs : 0,
          isRef: ref ? l.lapNum === ref.refLapNum : false,
          refUnderSc: ref ? !!ref.refUnderSc : false,
          refFallback: ref ? !!ref.refFallback : false,
        };
      });
    });
    out[d.carIdx] = { byLap };
  });
  return out;
}

function deltaClass(deltaSec: number): string {
  if (deltaSec < 0) return "lap-delta--faster";
  if (deltaSec <= DELTA_THRESHOLDS.neutral) return "lap-delta--neutral";
  if (deltaSec <= DELTA_THRESHOLDS.warn) return "lap-delta--warn";
  return "lap-delta--bad";
}

function cellClass(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

function lapTags(
  l: HistoryLapTimesLap,
  category: LapTimesCategory,
  redClearAfterLap: number | null | undefined,
  driverLaps: HistoryLapTimesLap[]
): ReactNode[] {
  const tags: ReactNode[] = [];
  let raceFlag = normalizeRaceFlag(l.raceFlag);
  if (raceFlag === 4 && redClearAfterLap != null && l.lapNum > redClearAfterLap) raceFlag = 0;

  if (category !== "qualifying" && l.pit) {
    tags.push(<span key="pit" className="lap-tag lap-tag--pit" title="Pit Stop">PIT</span>);
  } else if (category !== "qualifying") {
    const prevLap = lapByNum(driverLaps, l.lapNum - 1);
    if (prevLap?.pit) tags.push(<span key="out" className="lap-tag lap-tag--out" title="Out lap (after pit)">OUT</span>);
  }
  if (category === "race" && l.blueFlag) {
    tags.push(<span key="blue" className="lap-tag lap-tag--blue" title="Blue Flag">B</span>);
  }
  if (raceFlag === 2) tags.push(<span key="flag" className="lap-tag lap-tag--sc" title="Safety Car">SC</span>);
  else if (raceFlag === 3) tags.push(<span key="flag" className="lap-tag lap-tag--vsc" title="Virtual Safety Car">VSC</span>);
  else if (raceFlag === 4) tags.push(<span key="flag" className="lap-tag lap-tag--rf" title="Red Flag">RF</span>);
  else if (raceFlag === 1) tags.push(<span key="flag" className="lap-tag lap-tag--yellow" title="Yellow">Y</span>);
  return tags;
}

interface CellCtx {
  category: LapTimesCategory;
  bests: Bests;
  pb: Bests;
  driverLaps: HistoryLapTimesLap[];
  ref: RefIndex[number] | null;
  redFlagClearedAfterLap: number | null | undefined;
}

function timeCell(l: HistoryLapTimesLap, ctx: CellCtx, isLast: boolean, keyProp: string) {
  const invalid = !l.valid;
  let timeCls = "lap-cell__time";
  if (invalid) timeCls += " lap-cell__time--invalid";
  else if (ctx.bests.lap !== Infinity && l.lapTimeMs === ctx.bests.lap) timeCls += " lap-cell__time--sb";
  else if (ctx.pb.lap !== Infinity && l.lapTimeMs === ctx.pb.lap) timeCls += " lap-cell__time--pb";

  const timeText = l.lapTimeMs > 0 ? formatLapTime(l.lapTimeMs) : "—";
  const tags = lapTags(l, ctx.category, ctx.redFlagClearedAfterLap, ctx.driverLaps);
  return (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--time", invalid && "lap-cell--invalid", isLast && "lap-sub--last")}>
      <div className={timeCls}>{timeText}</div>
      {tags.length > 0 && <div className="lap-cell__tags">{tags}</div>}
    </td>
  );
}

function sectorsCell(l: HistoryLapTimesLap, ctx: CellCtx, isLast: boolean, keyProp: string) {
  const seg = (ms: number, bestField: "s1" | "s2" | "s3", segKey: string) => {
    if (!ms || ms <= 0) return <span key={segKey} className="lap-sector lap-sector--empty">{"—"}</span>;
    let cls = "lap-sector";
    if (ctx.bests[bestField] !== Infinity && ms === ctx.bests[bestField]) cls += " lap-sector--sb";
    else if (ctx.pb[bestField] !== Infinity && ms === ctx.pb[bestField]) cls += " lap-sector--pb";
    return <span key={segKey} className={cls}>{formatSectorTime(ms)}</span>;
  };
  return (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--sectors", isLast && "lap-sub--last")}>
      <div className="lap-cell__sectors">
        {seg(l.s1Ms, "s1", "s1")}
        {seg(l.s2Ms, "s2", "s2")}
        {seg(l.s3Ms, "s3", "s3")}
      </div>
    </td>
  );
}

function wearCell(
  l: HistoryLapTimesLap,
  isLast: boolean,
  keyProp: string,
  onShow: (rect: DOMRect, info: TyrePopupInfo) => void,
  onHide: () => void
) {
  const meta = compoundMeta(l.compoundVisual);
  const wearArr = l.tyreWearEnd;
  const hasWear = !!wearArr;
  const avg = hasWear ? Math.round((wearArr![0] + wearArr![1] + wearArr![2] + wearArr![3]) / 4) : null;
  const wearColor = avg != null ? wearColorFor(avg) : "#666";

  return (
    <td
      key={keyProp}
      className={cellClass("lap-cell", "lap-sub--wear", "lap-cell__tyre", isLast && "lap-sub--last")}
      onMouseEnter={(e) => {
        if (!hasWear) return;
        // tyreWearEnd order matches UDP spec: [RL, RR, FL, FR].
        onShow(e.currentTarget.getBoundingClientRect(), {
          name: meta.name,
          age: l.tyreAge ?? null,
          fl: Math.round(wearArr![2]),
          fr: Math.round(wearArr![3]),
          rl: Math.round(wearArr![0]),
          rr: Math.round(wearArr![1]),
        });
      }}
      onMouseLeave={onHide}
    >
      <div className="lap-cell__wear-inner">
        <span className="wear-badge" style={{ background: meta.color }}>{meta.letter}</span>
        {avg != null && <span className="wear-badge" style={{ background: wearColor }}>{avg}%</span>}
      </div>
    </td>
  );
}

function deltaCell(l: HistoryLapTimesLap, ref: RefIndex[number] | null, isLast: boolean, keyProp: string) {
  const base = (extra?: string, title?: string, content: ReactNode = "—") => (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--delta", extra, isLast && "lap-sub--last")} title={title}>
      {content}
    </td>
  );
  if (!ref) return base();
  const info = ref.byLap[l.lapNum];
  if (!info) return base();

  // Out-lap of the stint — no meaningful reference.
  if (info.stintLapIdx === 1) return base("lap-delta--outlap");
  // In-lap (pit stop on this lap) carries pit-lane time that would dwarf any stint
  // degradation — render a placeholder instead of a misleading huge delta.
  if (l.pit) return base("lap-delta--outlap");

  if (info.isRef) {
    let cls = "lap-delta lap-delta--ref";
    let title = "Reference lap for this stint";
    if (info.refUnderSc || info.refFallback) {
      cls += " lap-delta--ref--dirty";
      title = info.refUnderSc
        ? "REF was chosen under SC/VSC — delta values may be optimistic"
        : "Fallback REF — no clean laps in the stint start";
    }
    return (
      <td key={keyProp} className={cellClass("lap-cell", "lap-sub--delta", isLast && "lap-sub--last")}>
        <span className={cls} title={title}>REF</span>
      </td>
    );
  }

  if (!l.lapTimeMs || !info.refLapTimeMs) return base();

  const delta = (l.lapTimeMs - info.refLapTimeMs) / 1000;
  const sign = delta >= 0 ? "+" : "";
  const text = sign + delta.toFixed(3);
  return (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--delta", (!l.valid || l.pit) && "lap-cell--invalid", isLast && "lap-sub--last")}>
      <span className={cellClass("lap-delta", deltaClass(delta))}>{text}</span>
    </td>
  );
}

function perfCell(l: HistoryLapTimesLap, isLast: boolean, keyProp: string) {
  const base = (content: ReactNode = "—") => (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--perf", isLast && "lap-sub--last")}>{content}</td>
  );
  const p = l.perf;
  if (!p) return base();
  const perfPct = typeof p.perfPct === "number" ? Math.max(0, Math.min(100, Math.round(p.perfPct))) : null;
  if (perfPct == null) return base();
  const ersPct = typeof p.ersUsagePct === "number" ? Math.max(0, Math.min(100, Math.round(p.ersUsagePct))) : 0;
  const drsPct = typeof p.drsUsagePct === "number" ? Math.max(0, Math.min(100, Math.round(p.drsUsagePct))) : 0;

  let title =
    `Performance ${perfPct}% · ERS usage ${ersPct}% · DRS usage ${drsPct}%` +
    (p.drsZoneBased ? " (track zones)" : " (whole-lap fallback)");
  if (typeof p.harvEfficiencyPct === "number") {
    title += ` · Harvest ${p.harvEfficiencyPct}%`;
    if (typeof p.harvUsedMJ === "number" && typeof p.harvCapMJ === "number") {
      title += ` (${p.harvUsedMJ.toFixed(2)} / ${p.harvCapMJ.toFixed(2)} MJ)`;
    }
  }
  const bg = perfColorFor(perfPct);
  const raceFlag = normalizeRaceFlag(l.raceFlag);
  const muted = !!l.pit || raceFlag === 2 || raceFlag === 3;
  return (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--perf", muted && "lap-cell--muted", isLast && "lap-sub--last")} title={title}>
      <span className="lap-perf-badge" style={{ background: bg }}>{perfPct}%</span>
    </td>
  );
}

/** Δ (seconds) vs the driver's best valid lap in this session (Time Trial). */
function ttDeltaCell(l: HistoryLapTimesLap, pb: Bests, isLast: boolean, keyProp: string) {
  if (pb.lap === Infinity) {
    return (
      <td key={keyProp} className={cellClass("lap-cell", "lap-sub--tt_delta", "lap-tt-delta--na", isLast && "lap-sub--last")} title="No valid lap in session">
        {"—"}
      </td>
    );
  }
  if (!l.valid || !l.lapTimeMs) {
    return <td key={keyProp} className={cellClass("lap-cell", "lap-sub--tt_delta", "lap-cell--invalid", isLast && "lap-sub--last")}>{"—"}</td>;
  }
  const delta = (l.lapTimeMs - pb.lap) / 1000;
  const sign = delta >= 0 ? "+" : "";
  const text = sign + delta.toFixed(3);
  const title = `Δ vs session PB (${formatLapTime(pb.lap)})`;
  return (
    <td key={keyProp} className={cellClass("lap-cell", "lap-sub--tt_delta", isLast && "lap-sub--last")} title={title}>
      <span className={cellClass("lap-delta", deltaClass(delta))}>{text}</span>
    </td>
  );
}

function renderCell(key: ColumnKey, lap: HistoryLapTimesLap, ctx: CellCtx, isLast: boolean, keyProp: string, onTyreShow: (r: DOMRect, i: TyrePopupInfo) => void, onTyreHide: () => void): ReactNode {
  switch (key) {
    case "time": return timeCell(lap, ctx, isLast, keyProp);
    case "sectors": return sectorsCell(lap, ctx, isLast, keyProp);
    case "wear": return wearCell(lap, isLast, keyProp, onTyreShow, onTyreHide);
    case "delta": return deltaCell(lap, ctx.ref, isLast, keyProp);
    case "perf": return perfCell(lap, isLast, keyProp);
    case "tt_delta": return ttDeltaCell(lap, ctx.pb, isLast, keyProp);
    default: return <td key={keyProp} className="lap-cell">{"—"}</td>;
  }
}

interface TyrePopupInfo {
  name: string;
  age: number | null;
  fl: number;
  fr: number;
  rl: number;
  rr: number;
}

interface TyrePopupState extends TyrePopupInfo {
  anchorRect: DOMRect;
}

// Singleton hover popup positioned relative to the hovered wear cell via getBoundingClientRect,
// so it escapes the lap-grid-wrap's overflow clipping (fixed positioning, viewport-relative).
function TyrePopup({ state }: { state: TyrePopupState }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: state.anchorRect.right, top: state.anchorRect.bottom + 6 });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pw = el.offsetWidth;
    const ph = el.offsetHeight;
    let x = state.anchorRect.right - pw;
    if (x < 8) x = state.anchorRect.left;
    if (x + pw > window.innerWidth - 8) x = window.innerWidth - pw - 8;
    let y = state.anchorRect.bottom + 6;
    if (y + ph > window.innerHeight - 8) y = state.anchorRect.top - ph - 6;
    setPos({ left: Math.max(8, x), top: Math.max(8, y) });
  }, [state]);

  return (
    <div ref={ref} className="tyre-popup" style={{ left: pos.left, top: pos.top }}>
      <div className="tyre-popup__title">
        {state.name}
        {state.age != null && <span className="tyre-popup__age"> ({state.age} laps)</span>}
      </div>
      <div className="tyre-popup__grid">
        <div className="tyre-popup__cell"><span className="tyre-popup__lbl">FL</span><span className="tyre-popup__val">{state.fl}%</span></div>
        <div className="tyre-popup__cell"><span className="tyre-popup__lbl">FR</span><span className="tyre-popup__val">{state.fr}%</span></div>
        <div className="tyre-popup__cell"><span className="tyre-popup__lbl">RL</span><span className="tyre-popup__val">{state.rl}%</span></div>
        <div className="tyre-popup__cell"><span className="tyre-popup__lbl">RR</span><span className="tyre-popup__val">{state.rr}%</span></div>
      </div>
    </div>
  );
}

interface VirtualGridRow {
  carIdx: number;
  name: string;
  teamColor: string;
  actual: number;
  virtual: number;
}

/** Qualifying-only: actual best lap vs theoretical best (sum of personal-best sectors). */
function VirtualGrid({ drivers }: { drivers: HistoryLapTimesDriver[] }) {
  const rows: VirtualGridRow[] = drivers
    .map((d) => ({
      carIdx: d.carIdx,
      name: d.name,
      teamColor: d.teamColor,
      actual: personalBest(d.laps, true).lap,
      virtual: virtualBestMs(d.laps),
    }))
    .filter((r) => r.actual !== Infinity);

  if (rows.length === 0) return null;

  const actualPos: Record<number, number> = {};
  [...rows].sort((a, b) => a.actual - b.actual).forEach((r, i) => { actualPos[r.carIdx] = i + 1; });
  const virtualSorted = [...rows].sort((a, b) => a.virtual - b.virtual);
  const virtualPos: Record<number, number> = {};
  virtualSorted.forEach((r, i) => { virtualPos[r.carIdx] = i + 1; });

  return (
    <div className="lt-virtual-grid">
      <div className="lt-virtual-title">Virtual Best Grid</div>
      <div className="lt-virtual-table-wrap">
        <table className="lt-virtual-table">
          <thead>
            <tr>
              <th className="lt-virtual-th lt-virtual-th--pos">Pos</th>
              <th>Driver</th>
              <th className="lt-virtual-th lt-virtual-th--time">Actual</th>
              <th className="lt-virtual-th lt-virtual-th--time">Virtual</th>
              <th className="lt-virtual-th lt-virtual-th--delta">{"Δ Pos"}</th>
              <th className="lt-virtual-th lt-virtual-th--time">{"Δ Time"}</th>
            </tr>
          </thead>
          <tbody>
            {virtualSorted.map((r, idx) => {
              const aPos = actualPos[r.carIdx];
              const vPos = virtualPos[r.carIdx];
              const deltaPos = aPos - vPos;
              const arrow =
                deltaPos > 0 ? <span className="delta-up">{"▲ " + deltaPos}</span>
                : deltaPos < 0 ? <span className="delta-down">{"▼ " + -deltaPos}</span>
                : <span className="delta-same">{"–"}</span>;

              const deltaTimeMs = r.virtual !== Infinity ? r.virtual - r.actual : null;
              const deltaTimeText = deltaTimeMs != null ? (deltaTimeMs >= 0 ? "+" : "") + (deltaTimeMs / 1000).toFixed(3) : "—";
              const deltaTimeCls = cellClass(
                "lt-virtual-delta-time",
                deltaTimeMs != null && (deltaTimeMs <= 0 ? "lt-virtual-delta-time--faster" : "lt-virtual-delta-time--slower")
              );

              return (
                <tr key={r.carIdx} className={cellClass("lt-virtual-row", idx === 0 && "lt-virtual-row--leader")} style={{ borderLeftColor: r.teamColor }}>
                  <td className="lt-virtual-cell lt-virtual-cell--pos"><span className="lt-virtual-pos">{vPos}</span></td>
                  <td className="lt-virtual-cell lt-virtual-cell--driver">{r.name}</td>
                  <td className="lt-virtual-cell lt-virtual-cell--time">{formatLapTime(r.actual === Infinity ? 0 : r.actual)}</td>
                  <td className="lt-virtual-cell lt-virtual-cell--time">{formatLapTime(r.virtual === Infinity ? 0 : r.virtual)}</td>
                  <td className="lt-virtual-cell lt-virtual-cell--delta">{arrow}</td>
                  <td className="lt-virtual-cell lt-virtual-cell--time"><span className={deltaTimeCls}>{deltaTimeText}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Mirrors `renderLapTimes`/`renderLapPivotTable` — drivers x laps pivot with PB/SB highlighting,
 *  sector coloring, tyre/perf badges, race-flag row tints and (race only) a delta-vs-stint-REF column. */
export function HistoryLapTimesGrid({ category, drivers, redFlagClearedAfterLap = null, className }: HistoryLapTimesGridProps) {
  const [tyrePopup, setTyrePopup] = useState<TyrePopupState | null>(null);

  const cols = LAP_COLUMNS_BY_CAT[category] ?? LAP_COLUMNS_BY_CAT.unknown;
  const bests = computeBests(drivers);
  const pbByDriver: Record<number, Bests> = {};
  drivers.forEach((d) => { pbByDriver[d.carIdx] = personalBest(d.laps); });
  const maxLap = computeMaxLap(drivers);
  const refIndex = category === "race" ? buildRefIndex(drivers) : null;

  const lapNums: number[] = [];
  for (let n = 1; n <= maxLap; n++) lapNums.push(n);

  const showTyrePopup = (rect: DOMRect, info: TyrePopupInfo) => setTyrePopup({ anchorRect: rect, ...info });
  const hideTyrePopup = () => setTyrePopup(null);

  return (
    <div className={cellClass("lt-container", className)}>
      {category === "time_trial" && (
        <div className="lt-toolbar lt-toolbar--tt">
          <p className="lt-tt-hint">
            Lap time and sectors. Column PB {"Δ"} is the gap vs your best valid lap in this session (time trial has no tyre wear).
          </p>
        </div>
      )}

      <div className="lap-grid-wrap">
        <table className={`lap-grid lap-grid--${category}`}>
          <thead>
            <tr className="lap-grid__head-row lap-grid__head-row--drivers">
              <th className="lap-grid__lap-th lap-grid__lap-th--head" rowSpan={2}>Lap</th>
              {drivers.map((d) => {
                const pb = pbByDriver[d.carIdx];
                const pbText = pb.lap !== Infinity ? formatLapTime(pb.lap) : "—";
                return (
                  <th key={d.carIdx} className="lap-grid__driver-th" colSpan={cols.length} style={{ borderTopColor: d.teamColor }}>
                    <div className="lap-grid__driver-name">{d.name}</div>
                    <div className="lap-grid__driver-pb">PB {pbText}</div>
                  </th>
                );
              })}
            </tr>
            <tr className="lap-grid__head-row lap-grid__head-row--sub">
              {drivers.map((d) =>
                cols.map((key, idx) => (
                  <th
                    key={d.carIdx + "-" + key}
                    className={cellClass("lap-grid__sub-th", `lap-grid__sub-th--${key}`, idx === cols.length - 1 && "lap-grid__sub-th--last")}
                  >
                    {SUB_COL_LABELS[key]}
                  </th>
                ))
              )}
            </tr>
          </thead>
          <tbody>
            {lapNums.map((lapNum) => {
              const rowCls = rowFlagClass(lapNum, drivers, redFlagClearedAfterLap);
              return (
                <tr key={lapNum} className={rowCls}>
                  <th className="lap-grid__lap-th">{lapNum}</th>
                  {drivers.map((d) => {
                    const lap = lapByNum(d.laps, lapNum);
                    if (!lap) {
                      return cols.map((key, idx) => (
                        <td
                          key={d.carIdx + "-" + key}
                          className={cellClass("lap-cell", "lap-cell--empty", `lap-sub--${key}`, idx === cols.length - 1 && "lap-sub--last")}
                        >
                          {"—"}
                        </td>
                      ));
                    }
                    const ctx: CellCtx = {
                      category,
                      bests,
                      pb: pbByDriver[d.carIdx],
                      driverLaps: d.laps,
                      ref: refIndex ? refIndex[d.carIdx] : null,
                      redFlagClearedAfterLap,
                    };
                    return cols.map((key, idx) =>
                      renderCell(key, lap, ctx, idx === cols.length - 1, d.carIdx + "-" + key, showTyrePopup, hideTyrePopup)
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {category === "qualifying" && <VirtualGrid drivers={drivers} />}
      {tyrePopup && <TyrePopup state={tyrePopup} />}
    </div>
  );
}
