import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  TrackMap3D,
  type TrackMap3DCenterlinePoint,
  type TrackMap3DDominanceRun,
  type TrackMap3DDriver,
  type TrackMap3DGeometry,
  type TrackMap3DMotionSample,
  type TrackMap3DOverlayMode,
} from "./TrackMap3D";

const meta: Meta<typeof TrackMap3D> = {
  title: "Telemetry/TrackMap3D",
  component: TrackMap3D,
  decorators: [
    (Story) => (
      <div style={{ width: 460, display: "flex", flexDirection: "column", gap: 6, background: "#11151b", padding: 12, borderRadius: 8 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TrackMap3D>;

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

function buildDriverMotion(points: TrackMap3DCenterlinePoint[], opts: { paceFactor: number; lateralOffset: number }): TrackMap3DMotionSample[] {
  const n = points.length;
  const samples: TrackMap3DMotionSample[] = [];
  let d = 0;
  let t = 0;
  for (let i = 0; i <= n; i++) {
    const idx = i % n;
    const prev = points[(idx - 1 + n) % n];
    const next = points[(idx + 1) % n];
    const c = points[idx];
    if (i > 0) {
      const pc = points[(idx - 1 + n) % n];
      d += Math.hypot(c[0] - pc[0], c[2] - pc[2]);
    }
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

const drivers: TrackMap3DDriver[] = [
  {
    carIdx: 1,
    color: "#58a6ff",
    isRef: true,
    motion: buildDriverMotion(centerline, { paceFactor: 1, lateralOffset: 1.5 }),
  },
  {
    carIdx: 44,
    color: "#ff8700",
    isPlayer: true,
    motion: buildDriverMotion(centerline, { paceFactor: 0.985, lateralOffset: -1.5 }),
  },
];

const dominance: TrackMap3DDominanceRun[] = [
  { start: 0, end: 0.18, color: "#58a6ff" },
  { start: 0.18, end: 0.42, color: "#ff8700" },
  { start: 0.42, end: 0.7, color: "#58a6ff" },
  { start: 0.7, end: 1, color: "#ff8700" },
];

export const Default: Story = {
  render: () => {
    const [overlayMode, setOverlayMode] = useState<TrackMap3DOverlayMode>("none");
    const [follow, setFollow] = useState(false);
    return (
      <TrackMap3D
        geometry={geometry}
        drivers={drivers}
        dominance={dominance}
        markerDistance={300}
        overlayMode={overlayMode}
        onOverlayModeChange={setOverlayMode}
        follow={follow}
        onFollowChange={setFollow}
      />
    );
  },
};

export const DrsOverlay: Story = {
  render: () => {
    const [overlayMode, setOverlayMode] = useState<TrackMap3DOverlayMode>("drs");
    return <TrackMap3D geometry={geometry} drivers={drivers} markerDistance={120} overlayMode={overlayMode} onOverlayModeChange={setOverlayMode} />;
  },
};

export const DominanceOverlay: Story = {
  render: () => {
    const [overlayMode, setOverlayMode] = useState<TrackMap3DOverlayMode>("dom");
    return (
      <TrackMap3D
        geometry={geometry}
        drivers={drivers}
        dominance={dominance}
        markerDistance={600}
        overlayMode={overlayMode}
        onOverlayModeChange={setOverlayMode}
      />
    );
  },
};

export const Empty: Story = {
  render: () => <TrackMap3D geometry={null} drivers={[]} />,
};
