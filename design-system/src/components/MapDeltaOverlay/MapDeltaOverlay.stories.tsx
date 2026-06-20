import type { Meta, StoryObj } from "@storybook/react-vite";
import { MapDeltaOverlay } from "./MapDeltaOverlay";

const meta: Meta<typeof MapDeltaOverlay> = {
  title: "Telemetry/MapDeltaOverlay",
  component: MapDeltaOverlay,
  decorators: [
    (Story) => (
      <div style={{ position: "relative", width: 420, height: 140, background: "#11151b", borderRadius: 8 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof MapDeltaOverlay>;

export const Ahead: Story = {
  args: { deltaSeconds: -0.412 },
};

export const Behind: Story = {
  args: { deltaSeconds: 0.187 },
};

export const Even: Story = {
  args: { deltaSeconds: 0.004 },
};

export const NoHover: Story = {
  args: { deltaSeconds: null },
};

export const HiddenInChartsMode: Story = {
  args: { deltaSeconds: -0.412, hidden: true },
};
