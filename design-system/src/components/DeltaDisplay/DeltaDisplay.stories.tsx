import type { Meta, StoryObj } from "@storybook/react-vite";
import { DeltaDisplay } from "./DeltaDisplay";

const meta: Meta<typeof DeltaDisplay> = {
  title: "Atoms/DeltaDisplay",
  component: DeltaDisplay,
  argTypes: {
    mode: { control: "inline-radio", options: ["time", "position"] },
    goodWhen: { control: "inline-radio", options: ["negative", "positive"] },
  },
  args: { value: -234, mode: "time" },
};
export default meta;

type Story = StoryObj<typeof DeltaDisplay>;

export const Ahead: Story = { args: { value: -234 } };
export const Behind: Story = { args: { value: 234 } };
export const Zero: Story = { args: { value: 0 } };
export const Missing: Story = { args: { value: null } };

// Real Lap Data gap-to-leader from Singapore Q1 (`packets.LapData.lapDataItems[2]`):
// deltaToRaceLeaderMinutesPart * 60000 + deltaToRaceLeaderMsPart.
export const RealGapToLeader: Story = { args: { value: 247 * 60000 + 20338 } };

export const PositionGained: Story = { args: { mode: "position", value: 2 } };
export const PositionLost: Story = { args: { mode: "position", value: -1, goodWhen: "positive" } };

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 16 }}>
      <DeltaDisplay value={-1234} />
      <DeltaDisplay value={1234} />
      <DeltaDisplay value={0} />
      <DeltaDisplay mode="position" value={3} />
      <DeltaDisplay mode="position" value={-3} goodWhen="positive" />
    </div>
  ),
};
