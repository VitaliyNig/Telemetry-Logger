import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { DebugConsole, type DebugConsoleEntry } from "./DebugConsole";

const meta: Meta<typeof DebugConsole> = {
  title: "Debug/DebugConsole",
  component: DebugConsole,
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 360 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DebugConsole>;

const ENTRIES: DebugConsoleEntry[] = [
  { timestamp: "14:32:01.102", name: "CarTelemetry" },
  { timestamp: "14:32:01.118", name: "Motion" },
  { timestamp: "14:32:01.134", name: "CarStatus" },
  { timestamp: "14:32:01.150", name: "LapData" },
  { timestamp: "14:32:01.166", name: "CarTelemetry" },
  { timestamp: "14:32:01.182", name: "Event" },
];

export const Default: Story = {
  args: {
    entries: ENTRIES,
    autoScroll: true,
  },
};

export const AwaitingPackets: Story = {
  args: {
    entries: [],
    autoScroll: true,
  },
};

export const ConsoleCleared: Story = {
  args: {
    entries: [],
    autoScroll: true,
    placeholder: "Console cleared.",
  },
};

export const Interactive: Story = {
  render: (args) => {
    function Wrapper() {
      const [entries, setEntries] = useState(ENTRIES);
      const [autoScroll, setAutoScroll] = useState(true);
      return (
        <DebugConsole
          {...args}
          entries={entries}
          autoScroll={autoScroll}
          onAutoScrollChange={setAutoScroll}
          onClear={() => setEntries([])}
        />
      );
    }
    return <Wrapper />;
  },
  args: {
    entries: ENTRIES,
    autoScroll: true,
  },
};
