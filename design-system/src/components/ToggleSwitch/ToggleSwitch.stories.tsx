import type { Meta, StoryObj } from "@storybook/react-vite";
import { ToggleSwitch } from "./ToggleSwitch";

const meta: Meta<typeof ToggleSwitch> = {
  title: "Primitives/ToggleSwitch",
  component: ToggleSwitch,
  argTypes: { size: { control: "inline-radio", options: ["medium", "small"] } },
};
export default meta;

type Story = StoryObj<typeof ToggleSwitch>;

export const Off: Story = { args: { defaultChecked: false } };
export const On: Story = { args: { defaultChecked: true } };
export const Small: Story = { args: { size: "small", defaultChecked: true } };
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

export const States: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
      <ToggleSwitch defaultChecked={false} />
      <ToggleSwitch defaultChecked />
      <ToggleSwitch size="small" defaultChecked={false} />
      <ToggleSwitch size="small" defaultChecked />
    </div>
  ),
};
