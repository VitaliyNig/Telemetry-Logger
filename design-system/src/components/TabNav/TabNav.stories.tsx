import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TabNav } from "./TabNav";

const meta: Meta<typeof TabNav> = {
  title: "Primitives/TabNav",
  component: TabNav,
};
export default meta;

type Story = StoryObj<typeof TabNav>;

const tabs = [
  { id: "live", label: "Live" },
  { id: "history", label: "History" },
  { id: "settings", label: "Settings" },
  { id: "debug", label: "Debug" },
];

export const Default: Story = {
  render: () => {
    const [active, setActive] = useState("live");
    return <TabNav tabs={tabs} activeId={active} onChange={setActive} />;
  },
};

export const DebugHidden: Story = {
  render: () => {
    const [active, setActive] = useState("history");
    const withHidden = tabs.map((t) => (t.id === "debug" ? { ...t, hidden: true } : t));
    return <TabNav tabs={withHidden} activeId={active} onChange={setActive} />;
  },
};
