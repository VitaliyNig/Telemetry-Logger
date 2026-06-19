import type { Meta, StoryObj } from "@storybook/react-vite";
import { StatBox, StatGrid } from "./StatBox";

const meta: Meta<typeof StatBox> = {
  title: "Atoms/StatBox",
  component: StatBox,
  args: { label: "Air Temp", value: "25°C" },
};
export default meta;

type Story = StoryObj<typeof StatBox>;

export const Default: Story = {};
export const Big: Story = { args: { label: "Total Laps", value: 2, big: true } };

// Real Session packet values from Singapore Q1 (`packets.Session`).
export const SessionGrid: Story = {
  render: () => (
    <StatGrid>
      <StatBox label="Track Temp" value="28°C" />
      <StatBox label="Air Temp" value="25°C" />
      <StatBox label="Weather" value="Light Cloud" />
      <StatBox label="Pit Limit" value="60 km/h" />
      <StatBox label="Time Left" value="2:33" big />
    </StatGrid>
  ),
};
