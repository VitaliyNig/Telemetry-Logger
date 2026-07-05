import type { Meta, StoryObj } from "@storybook/react-vite";
import { PitPredictor } from "./PitPredictor";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof PitPredictor> = {
  title: "Widgets/PitPredictor",
  component: PitPredictor,
  decorators: [
    (Story) => (
      <div style={{ width: 380, height: 420, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Pit Stop Predictor" widgetId="pitPredictor">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PitPredictor>;

export const Approaching: Story = {
  args: {
    currentLap: 15, idealLap: 18, latestLap: 22,
    currentPos: 8, rejoinPos: 10,
    carAhead: { name: "LECLERC", gap: 0.6 },
    carBehind: { name: "PIASTRI", gap: 4.2 },
  },
};

export const WindowOpen: Story = {
  args: {
    currentLap: 19, idealLap: 18, latestLap: 22,
    currentPos: 8, rejoinPos: 12,
    carAhead: { name: "TSUNODA", gap: 2.4 },
    carBehind: { name: "HAMILTON", gap: 1.8 },
  },
};

export const WindowClosing: Story = {
  args: {
    currentLap: 22, idealLap: 18, latestLap: 22,
    currentPos: 6, rejoinPos: 7,
    carAhead: { name: "RUSSELL", gap: 1.1 },
    carBehind: { name: "ALONSO", gap: 0.7 },
  },
};

export const FrontWingDamage: Story = {
  args: {
    currentLap: 16, idealLap: 18, latestLap: 22,
    currentPos: 7, rejoinPos: 15,
    carAhead: { name: "VERSTAPPEN", gap: 3.6 },
    carBehind: { name: "BORTOLETO", gap: 1.2 },
    damage: { label: "Front Wing", repairSec: 7.0 },
  },
};

export const NoStrategy: Story = {
  args: { state: "nodata" },
};
