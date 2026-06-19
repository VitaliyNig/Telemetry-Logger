import type { Meta, StoryObj } from "@storybook/react-vite";
import { PacketStats } from "./PacketStats";

const meta: Meta<typeof PacketStats> = {
  title: "Debug/PacketStats",
  component: PacketStats,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 420 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PacketStats>;

export const Default: Story = {
  args: {
    total: 184302,
    counts: {
      CarTelemetry: 92150,
      CarStatus: 18430,
      Motion: 92150,
      Session: 1842,
      LapData: 18430,
      Event: 412,
      CarDamage: 1842,
      CarSetups: 92,
      FinalClassification: 2,
    },
  },
};

export const AwaitingPackets: Story = {
  args: {
    total: 0,
    counts: {},
  },
};
