import type { Meta, StoryObj } from "@storybook/react-vite";
import { ConnectionPill } from "./ConnectionPill";

const meta: Meta<typeof ConnectionPill> = {
  title: "Primitives/ConnectionPill",
  component: ConnectionPill,
  argTypes: {
    state: {
      control: "inline-radio",
      options: ["connecting", "reconnecting", "connected", "offline"],
    },
  },
  args: { state: "connected" },
};
export default meta;

type Story = StoryObj<typeof ConnectionPill>;

export const Connected: Story = {};
export const Connecting: Story = { args: { state: "connecting" } };
export const Reconnecting: Story = { args: { state: "reconnecting" } };
export const Offline: Story = { args: { state: "offline" } };

export const AllStates: Story = {
  render: () => (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <ConnectionPill state="connecting" />
      <ConnectionPill state="reconnecting" />
      <ConnectionPill state="connected" />
      <ConnectionPill state="offline" />
    </div>
  ),
};
