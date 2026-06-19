import type { Meta, StoryObj } from "@storybook/react-vite";
import { CarTelemetry } from "./CarTelemetry";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof CarTelemetry> = {
  title: "Widgets/CarTelemetry",
  component: CarTelemetry,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 320, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Car Telemetry" widgetId="telemetry">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CarTelemetry>;

// Singapore race, carIdx 2 (Sviter, the player) — same recorded session used by GapBoard/Standings.

function rampTrace(from: number, to: number, len: number) {
  return Array.from({ length: len }, (_, i) => from + ((to - from) * i) / (len - 1));
}

// Full-throttle run down the Marina Bay back straight: long WOT, no braking.
const STRAIGHT_THROTTLE = [...rampTrace(0.3, 1, 20), ...Array(40).fill(1)];
const STRAIGHT_BRAKE = Array(60).fill(0);

// Heavy braking zone into Turn 7 (Sviter chicane): hard brake stab, throttle cut, trail off the brake.
const BRAKING_THROTTLE = [...Array(15).fill(1), ...rampTrace(1, 0, 8), ...Array(20).fill(0), ...rampTrace(0, 0.6, 17)];
const BRAKING_BRAKE = [...Array(15).fill(0), ...rampTrace(0, 1, 5), ...Array(10).fill(0.95), ...rampTrace(0.95, 0, 12), ...Array(18).fill(0)];

export const FullThrottle: Story = {
  args: {
    speed: 312,
    gear: 8,
    engineRpm: 13450,
    maxRpm: 15000,
    throttle: 1,
    brake: 0,
    drsActive: false,
    pitLimiterActive: false,
    frontBrakeBias: 56,
    diffOnThrottle: 65,
    throttleHistory: STRAIGHT_THROTTLE,
    brakeHistory: STRAIGHT_BRAKE,
  },
};

export const DrsActive: Story = {
  args: {
    ...FullThrottle.args,
    speed: 298,
    gear: 8,
    engineRpm: 12800,
    drsActive: true,
  },
};

export const BrakingIntoCorner: Story = {
  args: {
    speed: 92,
    gear: 2,
    engineRpm: 9200,
    maxRpm: 15000,
    throttle: 0,
    brake: 1,
    drsActive: false,
    pitLimiterActive: false,
    frontBrakeBias: 58,
    diffOnThrottle: 65,
    throttleHistory: BRAKING_THROTTLE,
    brakeHistory: BRAKING_BRAKE,
  },
};

export const PitLaneLimiter: Story = {
  args: {
    speed: 80,
    gear: 3,
    engineRpm: 6100,
    maxRpm: 15000,
    throttle: 0.4,
    brake: 0,
    drsActive: false,
    pitLimiterActive: true,
    frontBrakeBias: 58,
    diffOnThrottle: 65,
    throttleHistory: Array(60).fill(0.4),
    brakeHistory: Array(60).fill(0),
  },
};

export const AwaitingData: Story = {
  args: {
    speed: 0,
    gear: 0,
    engineRpm: 0,
    maxRpm: 15000,
    throttle: 0,
    brake: 0,
    drsActive: false,
    pitLimiterActive: false,
    frontBrakeBias: null,
    diffOnThrottle: null,
    throttleHistory: [],
    brakeHistory: [],
  },
};
