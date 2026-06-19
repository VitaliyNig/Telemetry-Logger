import type { Meta, StoryObj } from "@storybook/react-vite";
import { GapRing, type GapRingDriver } from "./GapRing";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof GapRing> = {
  title: "Widgets/GapRing",
  component: GapRing,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 380, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Gap Ring" widgetId="gapRing">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GapRing>;

const LAP_LENGTH = 4940; // Marina Bay Street Circuit

// Singapore race, carIdx 2 (Sviter, the player) running P3 mid-pack.
const FIELD: GapRingDriver[] = [
  { carIdx: 1, pos: 1, gapLeaderMs: 0, gapAheadMs: 0, lapDistanceMeters: 3120, name: "Max Verstappen", teamColor: "#3671C6" },
  { carIdx: 11, pos: 2, gapLeaderMs: 4210, gapAheadMs: 4210, lapDistanceMeters: 2865, name: "Sergio Perez", teamColor: "#3671C6" },
  { carIdx: 2, pos: 3, gapLeaderMs: 9870, gapAheadMs: 5660, lapDistanceMeters: 2610, name: "Vitaliy Sviter", teamColor: "#27F4D2", isPlayer: true },
  { carIdx: 16, pos: 4, gapLeaderMs: 12440, gapAheadMs: 2570, lapDistanceMeters: 2455, name: "Charles Leclerc", teamColor: "#E8002D" },
  { carIdx: 55, pos: 5, gapLeaderMs: 18920, gapAheadMs: 6480, lapDistanceMeters: 2210, name: "Carlos Sainz", teamColor: "#E8002D" },
  { carIdx: 44, pos: 6, gapLeaderMs: 24100, gapAheadMs: 5180, lapDistanceMeters: 1960, name: "Lewis Hamilton", teamColor: "#27F4D2" },
  { carIdx: 63, pos: 7, gapLeaderMs: 31550, gapAheadMs: 7450, lapDistanceMeters: 1640, name: "George Russell", teamColor: "#27F4D2" },
  { carIdx: 4, pos: 8, gapLeaderMs: 38900, gapAheadMs: 7350, lapDistanceMeters: 1310, name: "Lando Norris", teamColor: "#FF8000" },
];

export const Default: Story = {
  args: {
    drivers: FIELD,
    lapLengthMeters: LAP_LENGTH,
  },
};

export const PlayerLeading: Story = {
  args: {
    drivers: FIELD.map((d) =>
      d.isPlayer
        ? { ...d, pos: 1, gapLeaderMs: 0, gapAheadMs: 0 }
        : d.pos === 1
          ? { ...d, pos: 3, gapLeaderMs: 9870, gapAheadMs: 5660 }
          : d
    ),
    lapLengthMeters: LAP_LENGTH,
  },
};

export const TightPack: Story = {
  args: {
    drivers: FIELD.map((d, i) => ({ ...d, lapDistanceMeters: 2610 + i * 12 })),
    lapLengthMeters: LAP_LENGTH,
  },
};

export const FullGrid: Story = {
  args: {
    drivers: Array.from({ length: 20 }, (_, i) => {
      const base = FIELD[i % FIELD.length];
      return {
        ...base,
        carIdx: i,
        pos: i + 1,
        isPlayer: i === 2,
        gapLeaderMs: i === 0 ? 0 : i * 4200 + 1800,
        gapAheadMs: i === 0 ? 0 : 4200 + (i % 3) * 900,
        lapDistanceMeters: (LAP_LENGTH - i * 240 + LAP_LENGTH) % LAP_LENGTH,
      };
    }),
    lapLengthMeters: LAP_LENGTH,
  },
};

export const NoData: Story = {
  args: {
    drivers: [],
    lapLengthMeters: LAP_LENGTH,
  },
};
