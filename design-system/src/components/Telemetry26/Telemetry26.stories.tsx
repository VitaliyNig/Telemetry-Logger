import type { Meta, StoryObj } from "@storybook/react-vite";
import { Telemetry26 } from "./Telemetry26";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Telemetry26> = {
  title: "Widgets/Telemetry26",
  component: Telemetry26,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 220, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="F1 26 Systems" widgetId="telemetry26">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Telemetry26>;

// The recorded Singapore session is a format-2025 log (no `CarTelemetry26`
// packet ever arrives), so this widget's data is necessarily representative
// rather than mined — it only activates on 2026-format sessions.
export const AwaitingData: Story = {
  args: {
    hasData: false,
    activeAeroAvailable: false,
    activeAeroStraightMode: false,
    activeAeroActivationDistance: 0,
    overtakeAvailable: false,
    overtakeActive: false,
    overtakeActivationDistance: 0,
    regulations2026: false,
    drivingWrongWay: false,
  },
};

export const AeroActiveBoostReady: Story = {
  args: {
    hasData: true,
    activeAeroAvailable: true,
    activeAeroStraightMode: true,
    activeAeroActivationDistance: 0,
    overtakeAvailable: true,
    overtakeActive: false,
    overtakeActivationDistance: 320,
    regulations2026: true,
    drivingWrongWay: false,
  },
};

export const BoostActiveWrongWay: Story = {
  args: {
    hasData: true,
    activeAeroAvailable: true,
    activeAeroStraightMode: false,
    activeAeroActivationDistance: 140,
    overtakeAvailable: true,
    overtakeActive: true,
    overtakeActivationDistance: 0,
    regulations2026: true,
    drivingWrongWay: true,
  },
};
