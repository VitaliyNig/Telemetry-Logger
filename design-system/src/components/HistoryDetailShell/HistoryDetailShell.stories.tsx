import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HistoryDetailShell, type HistorySubTab } from "./HistoryDetailShell";

const meta: Meta<typeof HistoryDetailShell> = {
  title: "History/HistoryDetailShell",
  component: HistoryDetailShell,
  decorators: [
    (Story) => (
      <div style={{ width: 900, height: 600, border: "1px solid #30363d" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HistoryDetailShell>;

function InteractiveWrapper({ showLapChartTab }: { showLapChartTab?: boolean }) {
  const [subTab, setSubTab] = useState<HistorySubTab>("laptimes");
  return (
    <HistoryDetailShell
      weekendName="Singapore"
      sessionLabel={subTab === "laptimes" ? "race" : subTab}
      activeSubTab={subTab}
      onSubTabChange={setSubTab}
      showLapChartTab={showLapChartTab}
      onBack={() => alert("back to All Sessions")}
    >
      <div style={{ padding: 16, color: "#8b949e" }}>[{subTab} content placeholder]</div>
    </HistoryDetailShell>
  );
}

export const Default: Story = {
  render: () => <InteractiveWrapper />,
};

export const RaceSessionWithLapChart: Story = {
  render: () => <InteractiveWrapper showLapChartTab />,
};
