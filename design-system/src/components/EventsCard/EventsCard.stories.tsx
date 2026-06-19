import type { Meta, StoryObj } from "@storybook/react-vite";
import { EventsCard } from "./EventsCard";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof EventsCard> = {
  title: "Widgets/EventsCard",
  component: EventsCard,
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 300, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Events" widgetId="events">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof EventsCard>;

// Singapore race, carIdx 2 (Sviter, the player) — most recent event first, lap-based time labels.
export const Default: Story = {
  args: {
    events: [
      { code: "SCAR", name: "Safety Car", detail: "Deployed", timeLabel: "L24" },
      { code: "OVTK", name: "Overtake", detail: "Sviter → Hamilton", timeLabel: "L23" },
      { code: "FTLP", name: "Fastest Lap", detail: "Sviter 1:31.845", timeLabel: "L21" },
      { code: "DRSE", name: "DRS Enabled", timeLabel: "L21" },
      { code: "SPTP", name: "Speed Trap", detail: "Verstappen 318.4 km/h", timeLabel: "L19" },
      { code: "DRSD", name: "DRS Disabled", timeLabel: "L18" },
      { code: "TMPT", name: "Teammate In Pits", detail: "Russell", timeLabel: "L15" },
      { code: "LGOT", name: "Lights Out", timeLabel: "L1" },
    ],
  },
};

export const ActivePenaltyPinned: Story = {
  args: {
    pinnedPenalties: [
      { code: "PENA", name: "Penalty", detail: "Sviter: 5s time penalty — track limits", timeLabel: "L26", serious: true },
    ],
    events: [
      { code: "PENA", name: "Penalty", detail: "Sviter: 5s time penalty — track limits", timeLabel: "L26" },
      { code: "SCAR", name: "Safety Car", detail: "Deployed", timeLabel: "L24" },
      { code: "OVTK", name: "Overtake", detail: "Sviter → Hamilton", timeLabel: "L23" },
      { code: "FTLP", name: "Fastest Lap", detail: "Sviter 1:31.845", timeLabel: "L21" },
    ],
  },
};

export const PenaltyServed: Story = {
  args: {
    events: [
      { code: "DTSV", name: "Drive Through Served", detail: "Sviter: Drive Through served", timeLabel: "L28", served: true },
      { code: "PENA", name: "Penalty", detail: "Sviter: Drive through — unsafe release", timeLabel: "L26" },
      { code: "SCAR", name: "Safety Car", detail: "Deployed", timeLabel: "L24" },
    ],
  },
};

export const NoEventsMatchingFilter: Story = {
  args: {
    events: [],
    pinnedPenalties: [
      { code: "DTSV", name: "Drive Through Served", detail: "Sviter: Drive Through served", timeLabel: "L28", served: true },
    ],
  },
};

export const AwaitingEvents: Story = {
  args: {
    events: [],
    pinnedPenalties: [],
  },
};
