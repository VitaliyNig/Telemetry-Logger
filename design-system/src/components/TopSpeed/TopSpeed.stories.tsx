import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopSpeed } from "./TopSpeed";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof TopSpeed> = {
  title: "Widgets/TopSpeed",
  component: TopSpeed,
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 360, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Session Top Speeds" widgetId="topSpeed">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TopSpeed>;

// Real `speedTrapFastestSpeed` per car from the Singapore race, sorted
// fastest-first. "Player" (idx 3/17) are other human network slots that kept
// the lobby's default name — Sviter (idx 2, isPlayer) is the recorded driver.
export const Default: Story = {
  args: {
    rows: [
      { name: "armavel", speed: 306.0024 },
      { name: "Player", speed: 306.0014 },
      { name: "Player", speed: 305.22556 },
      { name: "HAMILTON", speed: 304.11392 },
      { name: "PIASTRI", speed: 303.87708 },
      { name: "LECLERC", speed: 303.86722 },
      { name: "ANTONELLI", speed: 303.86365 },
      { name: "NORRIS", speed: 303.55643 },
      { name: "VERSTAPPEN", speed: 303.4885 },
      { name: "BORTOLETO", speed: 302.7109 },
      { name: "RUSSELL", speed: 302.40945 },
      { name: "HULKENBERG", speed: 302.3762 },
      { name: "TSUNODA", speed: 301.8765 },
      { name: "bogdanich", speed: 301.56213 },
      { name: "AleluyA", speed: 298.23843 },
      { name: "ProstoSith", speed: 298.23816 },
      { name: "Sviter", speed: 296.81937, isPlayer: true },
      { name: "Player", speed: 295.37613 },
      { name: "Duk3", speed: 293.6439 },
      { name: "Mirrro", speed: 291.95578 },
    ],
  },
};

export const Empty: Story = { args: { rows: [] } };
