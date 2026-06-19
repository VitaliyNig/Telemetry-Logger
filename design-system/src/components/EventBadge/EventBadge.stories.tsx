import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventBadge } from "./EventBadge";

const meta: Meta<typeof EventBadge> = {
  title: "Atoms/EventBadge",
  component: EventBadge,
  args: { code: "SCAR" },
};
export default meta;

type Story = StoryObj<typeof EventBadge>;

export const Default: Story = {};
export const CodeOnly: Story = { args: { showName: false } };

// Real first events from Singapore Q1 (`events[]`): safety-car deployed at
// session start, then SSTA.
export const RealSessionStart: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <EventBadge code="SCAR" />
      <EventBadge code="SSTA" />
    </div>
  ),
};

export const AllCodes: Story = {
  render: () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {["SSTA", "FTLP", "PENA", "SCAR", "DRSE", "RDFL", "OVTK", "CHQF"].map((c) => (
        <EventBadge key={c} code={c} />
      ))}
    </div>
  ),
};
