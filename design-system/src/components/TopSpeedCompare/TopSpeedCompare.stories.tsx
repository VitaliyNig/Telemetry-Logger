import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopSpeedCompare } from "./TopSpeedCompare";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof TopSpeedCompare> = {
  title: "Widgets/TopSpeedCompare",
  component: TopSpeedCompare,
  decorators: [
    (Story) => (
      <div style={{ width: 380, height: 160, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Top Speed Comparison" widgetId="topSpeedCompare">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TopSpeedCompare>;

// Real per-sample speed peaks for carIdx 2 (Sviter) in the Singapore race:
// session max across all 30 laps (311 km/h), lap 29's peak (285), and lap
// 30's peak (294) standing in for the live in-progress lap.
export const Default: Story = {
  args: { sessionBest: 311, lastLap: 285, thisLap: 294 },
};

export const PersonalBestLastLap: Story = {
  args: { sessionBest: 311, lastLap: 311, thisLap: 298 },
};

export const NoLapsYet: Story = {
  args: { sessionBest: 0, lastLap: 0, thisLap: 0 },
};
