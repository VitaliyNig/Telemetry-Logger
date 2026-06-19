import type { Meta, StoryObj } from "@storybook/react-vite";
import { GaugeBar } from "./GaugeBar";

const meta: Meta<typeof GaugeBar> = {
  title: "Atoms/GaugeBar",
  component: GaugeBar,
  argTypes: {
    tone: {
      control: "select",
      options: ["safe", "warning", "danger", "throttle", "brake", "ers", "drs"],
    },
  },
  args: { value: 60, tone: "safe" },
  decorators: [(Story) => <div style={{ width: 160 }}><Story /></div>],
};
export default meta;

type Story = StoryObj<typeof GaugeBar>;

export const Default: Story = {};
export const Thin: Story = { args: { thin: true } };

// Real front-left tyre wear from the Singapore Q1 session
// (`packets.CarDamage.carDamageDataItems[2].tyresWear[0]` ≈ 9.85%).
export const TyreWear: Story = { args: { value: 9.85, tone: "safe" } };

export const Tones: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 160 }}>
      <GaugeBar value={82} tone="throttle" />
      <GaugeBar value={35} tone="brake" />
      <GaugeBar value={64} tone="ers" />
      <GaugeBar value={20} tone="drs" />
      <GaugeBar value={90} tone="danger" />
      <GaugeBar value={55} tone="warning" />
    </div>
  ),
};
