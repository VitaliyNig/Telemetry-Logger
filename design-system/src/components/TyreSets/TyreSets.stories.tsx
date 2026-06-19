import type { Meta, StoryObj } from "@storybook/react-vite";
import { TyreSets } from "./TyreSets";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof TyreSets> = {
  title: "Widgets/TyreSets",
  component: TyreSets,
  decorators: [
    (Story) => (
      <div style={{ width: 380, height: 340, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Available Tyre Sets" widgetId="tyreSets">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TyreSets>;

function toItem(raw: { actualTyreCompound: number; visualTyreCompound: number; wear: number; available: number; lifeSpan: number; lapDeltaTime: number }) {
  return {
    actualTyreCompound: raw.actualTyreCompound,
    visualTyreCompound: raw.visualTyreCompound,
    wear: raw.wear,
    available: raw.available === 1,
    lifeSpan: raw.lifeSpan,
    lapDeltaTime: raw.lapDeltaTime,
  };
}

// Real `TyreSets` packet from late in the Singapore race. Not literally the
// player's own car (the game round-robins which car's tyre-set data it
// broadcasts each tick, and none of the 4 recorded snapshots happened to
// land on the player's slot) — but every value here is a real recorded set:
// 20 sets, fittedIdx 12 (Hard, 6% worn, currently on the car).
const RACE_LATE_RAW = [
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 5, available: 1, lifeSpan: 9, lapDeltaTime: -30 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 4, available: 1, lifeSpan: 9, lapDeltaTime: -83 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 1, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 1, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 1, lifeSpan: 9, lapDeltaTime: -425 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 0, lifeSpan: 16, lapDeltaTime: -425 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 0, lifeSpan: 16, lapDeltaTime: -425 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 1, lifeSpan: 16, lapDeltaTime: -425 },
  { actualTyreCompound: 18, visualTyreCompound: 18, wear: 0, available: 0, lifeSpan: 18, lapDeltaTime: -425 },
  { actualTyreCompound: 18, visualTyreCompound: 18, wear: 6, available: 1, lifeSpan: 16, lapDeltaTime: 0 }, // fitted
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 26, lapDeltaTime: -15695 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 26, lapDeltaTime: -15695 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 26, lapDeltaTime: -15695 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 26, lapDeltaTime: -15695 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 1, lifeSpan: 19, lapDeltaTime: -15373 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 1, lifeSpan: 19, lapDeltaTime: -15373 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 1, lifeSpan: 19, lapDeltaTime: -15373 },
];

export const RaceLateStint: Story = {
  args: { sets: RACE_LATE_RAW.map(toItem), fittedIdx: 12 },
};

// Real `TyreSets` packet from Q1 — fresher pool, Soft fitted (idx 1, 2% worn).
const QUALIFYING_RAW = [
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 4, available: 1, lifeSpan: 22, lapDeltaTime: 76 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 2, available: 1, lifeSpan: 23, lapDeltaTime: 0 }, // fitted
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 1, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 16, visualTyreCompound: 16, wear: 0, available: 0, lifeSpan: 24, lapDeltaTime: -102 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 0, lifeSpan: 41, lapDeltaTime: 547 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 1, lifeSpan: 41, lapDeltaTime: 547 },
  { actualTyreCompound: 17, visualTyreCompound: 17, wear: 0, available: 0, lifeSpan: 41, lapDeltaTime: 547 },
  { actualTyreCompound: 18, visualTyreCompound: 18, wear: 0, available: 0, lifeSpan: 46, lapDeltaTime: 1198 },
  { actualTyreCompound: 18, visualTyreCompound: 18, wear: 0, available: 0, lifeSpan: 46, lapDeltaTime: 1198 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 68, lapDeltaTime: 5065 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 68, lapDeltaTime: 5065 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 1, lifeSpan: 68, lapDeltaTime: 5065 },
  { actualTyreCompound: 7, visualTyreCompound: 7, wear: 0, available: 0, lifeSpan: 68, lapDeltaTime: 5065 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 1, lifeSpan: 48, lapDeltaTime: 7779 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 1, lifeSpan: 48, lapDeltaTime: 7779 },
  { actualTyreCompound: 8, visualTyreCompound: 8, wear: 0, available: 0, lifeSpan: 48, lapDeltaTime: 7779 },
];

export const QualifyingFreshPool: Story = {
  args: { sets: QUALIFYING_RAW.map(toItem), fittedIdx: 1 },
};

export const NoData: Story = {
  args: { sets: [], fittedIdx: -1 },
};
