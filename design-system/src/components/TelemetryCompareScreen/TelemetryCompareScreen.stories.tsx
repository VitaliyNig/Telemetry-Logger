import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TelemetryCompareScreen } from "./TelemetryCompareScreen";
import type { CompareLapPickerDriver, CompareLapPickerSelection } from "../CompareLapPicker/CompareLapPicker";
import type { SectorBadgesToolbarSegment, SectorBadgesToolbarSplit } from "../SectorBadgesToolbar/SectorBadgesToolbar";
import type { TopLossZonesZone } from "../TopLossZones/TopLossZones";
import type { ChartStackDriver, ChartStackSample } from "../TelemetryChartStack/TelemetryChartStack";
import type {
  TrackMap3DCenterlinePoint,
  TrackMap3DDriver,
  TrackMap3DGeometry,
  TrackMap3DMotionSample,
} from "../TrackMap3D/TrackMap3D";

const meta: Meta<typeof TelemetryCompareScreen> = {
  title: "Telemetry/TelemetryCompareScreen",
  component: TelemetryCompareScreen,
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div style={{ background: "#0d0f12", padding: 12, minHeight: "100vh" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TelemetryCompareScreen>;

// ---------- shared track geometry (drives both the map and the chart's distance domain) ----------

function buildCenterline(): TrackMap3DCenterlinePoint[] {
  const n = 240;
  const rx = 380;
  const rz = 260;
  const pts: TrackMap3DCenterlinePoint[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const x = Math.sign(Math.cos(a)) * Math.pow(Math.abs(Math.cos(a)), 0.7) * rx;
    const z = Math.sign(Math.sin(a)) * Math.pow(Math.abs(Math.sin(a)), 0.7) * rz;
    const y = 3 + Math.sin(a * 2) * 2.5 + Math.sin(a * 5) * 0.6;
    pts.push([x, y, z]);
  }
  return pts;
}

function computeBounds(points: TrackMap3DCenterlinePoint[]): TrackMap3DGeometry["bounds"] {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity, maxZ = -Infinity;
  points.forEach(([x, y, z]) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    if (z < minZ) minZ = z;
    if (z > maxZ) maxZ = z;
  });
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

function perimeterOf(points: TrackMap3DCenterlinePoint[]): number {
  let len = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    len += Math.hypot(b[0] - a[0], b[2] - a[2]);
  }
  return len;
}

function buildDriverMotion(points: TrackMap3DCenterlinePoint[], opts: { paceFactor: number; lateralOffset: number }): TrackMap3DMotionSample[] {
  const n = points.length;
  const samples: TrackMap3DMotionSample[] = [];
  let d = 0;
  let t = 0;
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const c = points[idx];
    if (i > 0) {
      const pc = points[(idx - 1 + n) % n];
      d += Math.hypot(c[0] - pc[0], c[2] - pc[2]);
    }
    const prev = points[(idx - 1 + n) % n];
    const next = points[(idx + 1) % n];
    const tx = next[0] - prev[0];
    const tz = next[2] - prev[2];
    const len = Math.hypot(tx, tz) || 1;
    const px = -tz / len;
    const pz = tx / len;
    const x = c[0] + px * opts.lateralOffset;
    const z = c[2] + pz * opts.lateralOffset;
    const speed = (60 + 35 * Math.sin(i / 11)) * opts.paceFactor;
    samples.push({ t, d, x, y: c[1], z });
    const segLen = Math.hypot(next[0] - c[0], next[2] - c[2]);
    t += segLen / Math.max(10, speed);
  }
  return samples;
}

const centerline = buildCenterline();
const bounds = computeBounds(centerline);
const TRACK_LEN_M = Math.round(perimeterOf(centerline));
const SECTOR2_START_M = Math.round(TRACK_LEN_M * 0.34);
const SECTOR3_START_M = Math.round(TRACK_LEN_M * 0.7);

const geometry: TrackMap3DGeometry = {
  points: centerline,
  bounds,
  drsZones: [
    [0, 0.05],
    [0.46, 0.55],
    [0.95, 1],
  ],
  xModeZones: [
    [0, 0.05],
    [0.3, 0.34],
    [0.95, 1],
  ],
};

const mapDrivers: TrackMap3DDriver[] = [
  { carIdx: 1, color: "#3671C6", isRef: true, motion: buildDriverMotion(centerline, { paceFactor: 1, lateralOffset: 1.2 }) },
  { carIdx: 16, color: "#E8002D", isPlayer: true, motion: buildDriverMotion(centerline, { paceFactor: 0.985, lateralOffset: -1.2 }) },
];

// ---------- chart samples, on the same lap-distance domain as the map motion above ----------

function buildLap(opts: { paceFactor: number; brakePoints: number[]; drsZones: [number, number][] }): ChartStackSample[] {
  const samples: ChartStackSample[] = [];
  const stepM = 5;
  let t = 0;
  let prevSpd = 90;
  for (let d = 0; d <= TRACK_LEN_M; d += stepM) {
    const nearestBrake = opts.brakePoints.reduce((best, bp) => Math.min(best, Math.abs(d - bp)), Infinity);
    const braking = nearestBrake < 90;
    const corner = nearestBrake < 160;
    const inDrs = opts.drsZones.some(([a, b]) => d >= a && d <= b);
    const targetSpd = corner ? 95 + (nearestBrake / 160) * 90 : inDrs ? 330 : 295;
    const spd = prevSpd + (targetSpd - prevSpd) * 0.18 * opts.paceFactor;
    prevSpd = spd;

    const thr = braking ? 0 : Math.min(100, 40 + (spd / 330) * 70);
    const brk = braking ? Math.max(0, 100 - nearestBrake) : 0;
    const str = Math.sin(d / 95) * (corner ? 55 : 8);
    const gr = spd < 110 ? 2 : spd < 150 ? 3 : spd < 190 ? 4 : spd < 230 ? 5 : spd < 270 ? 6 : spd < 305 ? 7 : 8;
    const rpm = 9500 + (spd / 330) * 4200 - (braking ? 1800 : 0);
    const ers = Math.max(0, Math.min(100, 60 + Math.sin(d / 400) * 35));
    const drs: 0 | 1 = inDrs && thr > 80 ? 1 : 0;

    const dt = stepM / Math.max(20, spd / 3.6);
    t += dt * opts.paceFactor;

    samples.push({ d, t, spd: Math.round(spd * 10) / 10, thr: Math.round(thr), brk: Math.round(brk), str: Math.round(str * 10) / 10, gr, rpm: Math.round(rpm), ers: Math.round(ers), drs });
  }
  return samples;
}

const referenceLap = buildLap({
  paceFactor: 1,
  brakePoints: [TRACK_LEN_M * 0.06, TRACK_LEN_M * 0.18, TRACK_LEN_M * 0.31, TRACK_LEN_M * 0.45, TRACK_LEN_M * 0.58, TRACK_LEN_M * 0.73, TRACK_LEN_M * 0.85],
  drsZones: [
    [0, TRACK_LEN_M * 0.05],
    [TRACK_LEN_M * 0.46, TRACK_LEN_M * 0.55],
  ],
});

const compareLap = buildLap({
  paceFactor: 0.985,
  brakePoints: [TRACK_LEN_M * 0.058, TRACK_LEN_M * 0.178, TRACK_LEN_M * 0.305, TRACK_LEN_M * 0.448, TRACK_LEN_M * 0.575, TRACK_LEN_M * 0.728, TRACK_LEN_M * 0.848],
  drsZones: [
    [0, TRACK_LEN_M * 0.052],
    [TRACK_LEN_M * 0.46, TRACK_LEN_M * 0.555],
  ],
});

const chartDrivers: ChartStackDriver[] = [
  { carIdx: 1, label: "VER", color: "#3671C6", teamId: "redbull", isReference: true, samples: referenceLap },
  { carIdx: 16, label: "LEC", color: "#E8002D", teamId: "ferrari", samples: compareLap },
];

// ---------- sector badges, for every selectable split ----------

function segmentsFor(split: SectorBadgesToolbarSplit): SectorBadgesToolbarSegment[] {
  const parts = split / 3;
  const bounds3 = [0, SECTOR2_START_M, SECTOR3_START_M, TRACK_LEN_M];
  const segments: SectorBadgesToolbarSegment[] = [];
  for (let sector = 1; sector <= 3; sector++) {
    const s0 = bounds3[sector - 1];
    const s1 = bounds3[sector];
    const sectorLen = (s1 - s0) / parts;
    for (let part = 1; part <= parts; part++) {
      const start = s0 + sectorLen * (part - 1);
      const end = s0 + sectorLen * part;
      segments.push({
        sector,
        part: parts > 1 ? part : undefined,
        parts,
        start,
        end,
        timeMs: 7800 + sector * 1100 + part * 90,
      });
    }
  }
  return segments;
}

const sectorSegmentsBySplit: Record<SectorBadgesToolbarSplit, SectorBadgesToolbarSegment[]> = {
  3: segmentsFor(3),
  9: segmentsFor(9),
  12: segmentsFor(12),
};

const lossZones: TopLossZonesZone[] = [
  {
    id: "z0",
    start: Math.round(TRACK_LEN_M * 0.22),
    end: Math.round(TRACK_LEN_M * 0.26),
    loss: 0.482,
    primary: "late_brake",
    primaryLabel: "Late braking",
    facts: [{ label: "Brake pt", value: "−18 m", tone: "loss" }],
    recommendations: ["Brake 15-20 m earlier into this corner"],
  },
  {
    id: "z1",
    start: Math.round(TRACK_LEN_M * 0.41),
    end: Math.round(TRACK_LEN_M * 0.45),
    loss: 0.276,
    primary: "low_apex",
    primaryLabel: "Low apex speed",
  },
];

// ---------- driver/lap picker fixtures ----------

function lapsFor(count: number, baseMs: number): CompareLapPickerDriver["laps"] {
  return Array.from({ length: count }, (_, i) => {
    const lapNum = i + 1;
    return {
      lapNum,
      lapTimeMs: baseMs + (lapNum % 5) * 120 - (lapNum % 3) * 60,
      valid: lapNum !== 4,
      tyre: lapNum < 6 ? "Soft" : lapNum < 12 ? "Medium" : "Hard",
    };
  });
}

const pickerDrivers: CompareLapPickerDriver[] = [
  { carIdx: 1, name: "Max VERSTAPPEN", teamColor: "#3671C6", teamId: "redbull", racePosition: 1, laps: lapsFor(18, 82000) },
  { carIdx: 16, name: "Charles LECLERC", teamColor: "#E8002D", teamId: "ferrari", racePosition: 2, laps: lapsFor(18, 82450) },
  { carIdx: 55, name: "Carlos SAINZ", teamColor: "#E8002D", teamId: "ferrari", racePosition: 3, laps: lapsFor(18, 82600) },
];

function Demo() {
  const [selection, setSelection] = useState<CompareLapPickerSelection[]>([
    { key: 1, sourceCarIdx: 1, lap: 12, isRef: true },
    { key: 16, sourceCarIdx: 16, lap: 12 },
  ]);

  function nextKey(): number {
    let key = 1000;
    while (selection.some((s) => s.key === key)) key++;
    return key;
  }

  return (
    <TelemetryCompareScreen
      trackLengthM={TRACK_LEN_M}
      sector2StartM={SECTOR2_START_M}
      sector3StartM={SECTOR3_START_M}
      pickerDrivers={pickerDrivers}
      selection={selection}
      onAddLap={(carIdx, lap) => setSelection((prev) => [...prev, { key: nextKey(), sourceCarIdx: carIdx, lap }])}
      onRemoveLap={(key) => setSelection((prev) => prev.filter((s) => s.key !== key))}
      onSetReference={(key) => setSelection((prev) => prev.map((s) => ({ ...s, isRef: s.key === key })))}
      onToggleLapVisibility={(key) => setSelection((prev) => prev.map((s) => (s.key === key ? { ...s, hidden: !s.hidden } : s)))}
      chartDrivers={chartDrivers}
      mapGeometry={geometry}
      mapDrivers={mapDrivers}
      sectorSegmentsBySplit={sectorSegmentsBySplit}
      lossZones={lossZones}
    />
  );
}

export const Default: Story = {
  render: () => <Demo />,
};
