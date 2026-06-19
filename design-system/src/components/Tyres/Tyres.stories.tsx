import type { Meta, StoryObj } from "@storybook/react-vite";
import { Tyres } from "./Tyres";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Tyres> = {
  title: "Widgets/Tyres",
  component: Tyres,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 260, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Tyres" widgetId="tyres">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Tyres>;

// Real CarTelemetry/CarDamage/CarStatus snapshot for carIdx 2 (Sviter, the
// player) on Inters in the rain-affected Singapore race — 6 laps old, light
// wear, surface/inner temps still below the Inter compound's perfect window.
export const Default: Story = {
  args: {
    tyresInnerTemperature: [64, 65, 58, 59],
    tyresSurfaceTemperature: [33, 36, 31, 33],
    tyresPressure: [20.5, 20.5, 22.5, 22.5],
    tyresWear: [17.772724, 19.440355, 4.0043545, 5.9377217],
    tyreBlisters: [0, 0, 0, 0],
    visualTyreCompound: 7,
    actualTyreCompound: 7,
    tyresAgeLaps: 6,
  },
};

// Real snapshot from another car (carIdx 5) — heavier rear wear, also on Inters.
export const RearWearHeavy: Story = {
  args: {
    tyresInnerTemperature: [64, 65, 63, 64],
    tyresSurfaceTemperature: [35, 38, 34, 35],
    tyresPressure: [20.9, 20.9, 24.2, 24.2],
    tyresWear: [30.610497, 36.103382, 7.0713854, 11.393358],
    tyreBlisters: [0, 0, 0, 0],
    visualTyreCompound: 7,
    actualTyreCompound: 7,
    tyresAgeLaps: 7,
  },
};

// Representative (not from the recorded log — Singapore's storm race never
// pushed tyres into the blister-risk zone): Hard compound well above the
// 115°C blister threshold, triggering the pulsing red corner highlight.
export const BlisterRisk: Story = {
  args: {
    tyresInnerTemperature: [108, 110, 104, 106],
    tyresSurfaceTemperature: [122, 126, 118, 121],
    tyresPressure: [23.1, 23.1, 25.4, 25.4],
    tyresWear: [42, 45, 38, 40],
    tyreBlisters: [4, 6, 2, 3],
    visualTyreCompound: 18,
    actualTyreCompound: 18,
    tyresAgeLaps: 14,
  },
};
