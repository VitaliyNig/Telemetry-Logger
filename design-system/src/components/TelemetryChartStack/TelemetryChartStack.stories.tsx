import type { Meta, StoryObj } from "@storybook/react-vite";
import { TelemetryChartStack, type ChartStackDriver, type ChartStackSample } from "./TelemetryChartStack";

const meta: Meta<typeof TelemetryChartStack> = {
  title: "Telemetry/TelemetryChartStack",
  component: TelemetryChartStack,
  decorators: [
    (Story) => (
      <div style={{ width: 1000, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TelemetryChartStack>;

const TRACK_LEN_M = 5300;
const STEP_M = 5;

function buildLap(opts: {
  paceFactor: number;
  brakePoints: number[];
  drsZones: [number, number][];
  ersHotZones?: [number, number][];
}): ChartStackSample[] {
  const samples: ChartStackSample[] = [];
  let t = 0;
  let prevSpd = 90;
  for (let d = 0; d <= TRACK_LEN_M; d += STEP_M) {
    const nearestBrake = opts.brakePoints.reduce((best, bp) => {
      const dist = Math.abs(d - bp);
      return dist < best ? dist : best;
    }, Infinity);
    const braking = nearestBrake < 90;
    const corner = nearestBrake < 160;

    const inDrs = opts.drsZones.some(([a, b]) => d >= a && d <= b);
    const targetSpd = corner ? 95 + (nearestBrake / 160) * 90 : inDrs ? 335 : 300;
    const spd = prevSpd + (targetSpd - prevSpd) * 0.18 * opts.paceFactor;
    prevSpd = spd;

    const thr = braking ? 0 : Math.min(100, 40 + (spd / 335) * 70);
    const brk = braking ? Math.max(0, 100 - nearestBrake) : 0;
    const str = Math.sin(d / 95) * (corner ? 55 : 8);
    const gr = spd < 110 ? 2 : spd < 150 ? 3 : spd < 190 ? 4 : spd < 230 ? 5 : spd < 270 ? 6 : spd < 305 ? 7 : 8;
    const rpm = 9500 + (spd / 335) * 4200 - (braking ? 1800 : 0);
    const ersMd: 0 | 1 | 2 | 3 = (opts.ersHotZones || []).some(([a, b]) => d >= a && d <= b) ? 2 : thr > 90 ? 1 : 0;
    const ers = Math.max(0, Math.min(100, 60 + Math.sin(d / 400) * 35));
    const drs: 0 | 1 = inDrs && thr > 80 ? 1 : 0;

    const dt = STEP_M / Math.max(20, spd / 3.6);
    t += dt * opts.paceFactor;

    samples.push({ d, t, spd: Math.round(spd * 10) / 10, thr: Math.round(thr), brk: Math.round(brk), str: Math.round(str * 10) / 10, gr, rpm: Math.round(rpm), ers: Math.round(ers), ersMd, drs });
  }
  return samples;
}

const referenceLap = buildLap({
  paceFactor: 1,
  brakePoints: [320, 980, 1650, 2400, 3100, 3850, 4500],
  drsZones: [
    [60, 300],
    [3950, 4450],
  ],
  ersHotZones: [[3950, 4450]],
});

const compareLapFaster = buildLap({
  paceFactor: 0.985,
  brakePoints: [300, 960, 1600, 2380, 3050, 3820, 4480],
  drsZones: [
    [60, 320],
    [3950, 4480],
  ],
  ersHotZones: [[3950, 4480]],
});

const compareLapSlower = buildLap({
  paceFactor: 1.02,
  brakePoints: [340, 1010, 1690, 2430, 3140, 3880, 4520],
  drsZones: [
    [60, 280],
    [3950, 4420],
  ],
});

const twoDriverFixture: ChartStackDriver[] = [
  { carIdx: 1, label: "VER", color: "#3671C6", teamId: "redbull", isReference: true, samples: referenceLap },
  { carIdx: 16, label: "LEC", color: "#E8002D", teamId: "ferrari", samples: compareLapFaster },
];

const teammatesFixture: ChartStackDriver[] = [
  { carIdx: 1, label: "VER", color: "#3671C6", teamId: "redbull", isReference: true, samples: referenceLap },
  { carIdx: 11, label: "PER", color: "#3671C6", teamId: "redbull", samples: compareLapSlower },
  { carIdx: 16, label: "LEC", color: "#E8002D", teamId: "ferrari", samples: compareLapFaster },
  { carIdx: 55, label: "SAI", color: "#E8002D", teamId: "ferrari", samples: compareLapSlower },
];

export const TwoDrivers: Story = {
  args: {
    drivers: twoDriverFixture,
    sector2StartM: 1800,
    sector3StartM: 3700,
  },
};

export const Teammates: Story = {
  args: {
    drivers: teammatesFixture,
    sector2StartM: 1800,
    sector3StartM: 3700,
  },
};

export const SlowerCompare: Story = {
  args: {
    drivers: [
      { carIdx: 1, label: "VER", color: "#3671C6", teamId: "redbull", isReference: true, samples: referenceLap },
      { carIdx: 63, label: "RUS", color: "#27F4D2", teamId: "mercedes", samples: compareLapSlower },
    ],
    sector2StartM: 1800,
    sector3StartM: 3700,
  },
};

export const NoSamples: Story = {
  args: {
    drivers: [],
  },
};
