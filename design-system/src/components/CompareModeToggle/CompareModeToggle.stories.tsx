import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompareModeToggle, type CompareLayoutMode } from "./CompareModeToggle";

const meta: Meta<typeof CompareModeToggle> = {
  title: "Telemetry/CompareModeToggle",
  component: CompareModeToggle,
  decorators: [
    (Story) => (
      <div style={{ width: 360, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CompareModeToggle>;

function ControlledToggle({ initial }: { initial: CompareLayoutMode }) {
  const [mode, setMode] = useState<CompareLayoutMode>(initial);
  return <CompareModeToggle mode={mode} onModeChange={setMode} />;
}

export const Charts: Story = {
  render: () => <ControlledToggle initial="charts" />,
};

export const Map: Story = {
  render: () => <ControlledToggle initial="map" />,
};
