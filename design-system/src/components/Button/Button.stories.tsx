import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";

const meta: Meta<typeof Button> = {
  title: "Primitives/Button",
  component: Button,
  argTypes: {
    variant: {
      control: "select",
      options: ["primary", "secondary", "ghost", "danger"],
    },
    size: { control: "inline-radio", options: ["medium", "small"] },
  },
  args: { children: "Add Widget", variant: "primary", size: "medium" },
};
export default meta;

type Story = StoryObj<typeof Button>;

export const Primary: Story = {};
export const Secondary: Story = { args: { variant: "secondary", children: "Select Folder" } };
export const Ghost: Story = { args: { variant: "ghost", children: "Reset" } };
export const Danger: Story = { args: { variant: "danger", children: "Undo" } };
export const Small: Story = { args: { size: "small", variant: "secondary", children: "Browse…" } };

export const AllVariants: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
      <Button variant="primary">+ Add Widget</Button>
      <Button variant="secondary">Save Preset</Button>
      <Button variant="ghost">Clear filters</Button>
      <Button variant="danger">Undo</Button>
      <Button variant="secondary" size="small">Browse…</Button>
      <Button variant="primary" disabled>Disabled</Button>
    </div>
  ),
};
