import type { Meta, StoryObj } from "@storybook/react-vite";
import { Select } from "./Select";

const meta: Meta<typeof Select> = {
  title: "Primitives/Select",
  component: Select,
  decorators: [(Story) => <div style={{ width: 280 }}>{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof Select>;

export const UdpFormat: Story = {
  args: {
    options: [
      { value: "", label: "Auto (newest available)" },
      { value: "2026", label: "2026 Season Pack" },
      { value: "2025", label: "F1 25" },
    ],
  },
};

export const TrackFilter: Story = {
  args: {
    options: [
      { value: "", label: "All tracks" },
      { value: "monaco", label: "Monaco" },
      { value: "silverstone", label: "Silverstone" },
      { value: "spa", label: "Spa-Francorchamps" },
    ],
  },
};
