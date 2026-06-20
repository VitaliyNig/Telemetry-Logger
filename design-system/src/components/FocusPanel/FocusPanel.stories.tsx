import type { Meta, StoryObj } from "@storybook/react-vite";
import { FocusPanel, type FocusPanelDriver } from "./FocusPanel";

const meta: Meta<typeof FocusPanel> = {
  title: "Telemetry/FocusPanel",
  component: FocusPanel,
  decorators: [
    (Story) => (
      <div style={{ width: 260, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FocusPanel>;

const drivers: FocusPanelDriver[] = [
  {
    key: "you",
    name: "You",
    color: "#3671C6",
    isReference: false,
    sample: { spd: 312, rpm: 11800, gr: 7, thr: 100, brk: 0, str: -12, drs: true, ers: 64, ersMode: 1 },
  },
  {
    key: "ref",
    name: "Max VERSTAPPEN",
    color: "#E8002D",
    isReference: true,
    sample: { spd: 318, rpm: 12100, gr: 7, thr: 100, brk: 0, str: -8, drs: false, ers: 71, ersMode: 0 },
  },
];

export const Hovered: Story = {
  render: () => <FocusPanel drivers={drivers} distance={2140} lateralOffset={0.34} />,
};

export const Braking: Story = {
  render: () => (
    <FocusPanel
      drivers={[
        { ...drivers[0], sample: { spd: 96, rpm: 6200, gr: 3, thr: 0, brk: 92, str: 28, drs: false, ers: 40, ersMode: 2 } },
        { ...drivers[1], sample: { spd: 102, rpm: 6500, gr: 3, thr: 0, brk: 88, str: 22, drs: false, ers: 45, ersMode: 0 } },
      ]}
      distance={3420}
      lateralOffset={-0.12}
    />
  ),
};

export const NoHover: Story = {
  render: () => <FocusPanel drivers={[]} distance={null} />,
};
