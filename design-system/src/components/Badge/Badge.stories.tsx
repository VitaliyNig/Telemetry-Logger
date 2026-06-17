import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

const meta: Meta<typeof Badge> = {
  title: "Primitives/Badge",
  component: Badge,
  argTypes: { variant: { control: "inline-radio", options: ["warning", "accent"] } },
  args: { children: "Restart required", variant: "warning" },
};
export default meta;

type Story = StoryObj<typeof Badge>;

export const Warning: Story = {};
export const Accent: Story = { args: { variant: "accent", children: "custom" } };

export const Both: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <Badge variant="warning">Restart required</Badge>
      <Badge variant="accent">custom</Badge>
    </div>
  ),
};
