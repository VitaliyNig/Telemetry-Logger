import type { Meta, StoryObj } from "@storybook/react-vite";
import { Popover } from "./Popover";
import { Button } from "../Button/Button";

const meta: Meta<typeof Popover> = {
  title: "Atoms/Popover",
  component: Popover,
  args: { open: true, placement: "bottom-start" },
};
export default meta;

type Story = StoryObj<typeof Popover>;

export const Default: Story = {
  render: (args) => (
    <Popover {...args} trigger={<Button variant="ghost" size="small">Filter ▾</Button>}>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--color-text-secondary)", fontSize: 12 }}>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" defaultChecked /> Safety Car</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" defaultChecked /> Penalty</label>
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" /> Button Status</label>
      </div>
    </Popover>
  ),
};

export const Closed: Story = { args: { open: false }, render: Default.render };
export const BottomEnd: Story = { args: { placement: "bottom-end" }, render: Default.render };
