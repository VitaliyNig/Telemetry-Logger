import type { Meta, StoryObj } from "@storybook/react-vite";
import { Session } from "./Session";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Session> = {
  title: "Widgets/Session",
  component: Session,
  decorators: [
    (Story) => (
      <div style={{ width: 440, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Session" widgetId="session">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Session>;

// Real Session packet from the Singapore race: trackId 12 (Singapore -> SG
// flag), sessionType 15 (Race), weather 5 (Storm), 24C track / 25C air,
// totalLaps 31 (F1 25's off-by-one — includes the cooldown lap), player
// (carIdx 2) on lap 16. Trends are derived/rolling-window data, not present
// in a single packet snapshot, so these are representative.
export const Default: Story = {
  args: {
    trackName: "Singapore",
    countryCode: "SG",
    sessionTypeLabel: "Race",
    weatherLabel: "Storm ⛈",
    trackTemp: 24,
    trackTempTrend: { arrow: "▼", cls: "temp-trend-down", delta: -3 },
    airTemp: 25,
    airTempTrend: { arrow: "—", cls: "temp-trend-stable", delta: 0 },
    progressLabel: "Laps",
    progressValue: "16/31",
    progressPct: 52,
    flagLabel: "GREEN",
    flagColor: "green",
  },
};

export const QualifyingDry: Story = {
  args: {
    trackName: "Singapore",
    countryCode: "SG",
    sessionTypeLabel: "Qualifying 1",
    weatherLabel: "Light Cloud 🌤",
    trackTemp: 28,
    trackTempTrend: { arrow: "▲", cls: "temp-trend-up", delta: 1 },
    airTemp: 25,
    airTempTrend: { arrow: "", cls: "", delta: 0 },
    progressLabel: "Time",
    progressValue: "2:33",
    progressPct: 83,
    flagLabel: "--",
    flagColor: "none",
  },
};

export const SafetyCar: Story = {
  args: {
    trackName: "Singapore",
    countryCode: "SG",
    sessionTypeLabel: "Race",
    weatherLabel: "Storm ⛈",
    trackTemp: 23,
    trackTempTrend: { arrow: "▼", cls: "temp-trend-down", delta: -4 },
    airTemp: 24,
    airTempTrend: { arrow: "▼", cls: "temp-trend-down", delta: -1 },
    progressLabel: "Laps",
    progressValue: "12/31",
    progressPct: 39,
    flagLabel: "SC",
    flagColor: "yellow",
  },
};

// All optional fields shown (Pit Limit / AI Level / Equal Cars) — hidden by
// default in the live widget, surfaced via the "Visible fields" settings panel.
export const AllFields: Story = {
  args: {
    ...Default.args,
    pitLimit: "80 km/h",
    aiLevel: "95",
    equalCars: "Off",
  },
};
