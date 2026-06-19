import type { Meta, StoryObj } from "@storybook/react-vite";
import { PitStopTimer } from "./PitStopTimer";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof PitStopTimer> = {
  title: "Widgets/PitStopTimer",
  component: PitStopTimer,
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 280, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Pit Stop Timer" widgetId="pitStopTimer">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PitStopTimer>;

// Real tyre-stint boundaries for carIdx 2 (Sviter) in the Singapore race:
// stops at the end of laps 15 (Hard→Medium) and 24 (Medium→Inter, rain
// arriving) — lane/stall durations are representative since the snapshot
// only preserves stint-end laps, not the live timer values.
export const Idle: Story = {
  args: {
    live: null,
    history: [
      { lap: 15, laneMs: 23840, stallMs: 2310 },
      { lap: 24, laneMs: 24190, stallMs: 2480 },
    ],
  },
};

export const ActiveStop: Story = {
  args: {
    live: { laneMs: 18230, stallMs: 2100 },
    history: [{ lap: 15, laneMs: 23840, stallMs: 2310 }],
  },
};

export const NoStopsYet: Story = { args: { live: null, history: [] } };
