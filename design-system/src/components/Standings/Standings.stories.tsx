import type { Meta, StoryObj } from "@storybook/react-vite";
import { Standings } from "./Standings";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Standings> = {
  title: "Widgets/Standings",
  component: Standings,
  decorators: [
    (Story) => (
      <div style={{ width: 460, height: 320, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Standings" widgetId="standings">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Standings>;

// Real LapData/CarStatus snapshot from the Singapore race, positions 6-11 —
// centered on carIdx 2 (Sviter, the recorded player) at P8. Gaps are
// `deltaToRaceLeaderMinutesPart*60000 + deltaToRaceLeaderMsPart`, all cars on
// Inters (compound 7) mid-race after the rain arrived.
export const Default: Story = {
  args: {
    rows: [
      { pos: 6, name: "armavel", gapMs: 78313, lastLapMs: 109722, visualCompound: 7, tyreAge: 6, pitStatus: 0 },
      { pos: 7, name: "Duk3", gapMs: 81579, lastLapMs: 110722, visualCompound: 7, tyreAge: 6, pitStatus: 0 },
      { pos: 8, name: "Sviter", gapMs: 82454, lastLapMs: 110818, visualCompound: 7, tyreAge: 6, pitStatus: 0, isPlayer: true },
      { pos: 9, name: "ANTONELLI", gapMs: 82829, lastLapMs: 108751, visualCompound: 7, tyreAge: 5, pitStatus: 0 },
      { pos: 10, name: "HAMILTON", gapMs: 90352, lastLapMs: 109366, visualCompound: 7, tyreAge: 4, pitStatus: 0 },
      { pos: 11, name: "PIASTRI", gapMs: 91300, lastLapMs: 108668, visualCompound: 7, tyreAge: 5, pitStatus: 0 },
    ],
  },
};

// Same window, with the leader and one car currently in the pits.
export const WithPitStop: Story = {
  args: {
    rows: [
      { pos: 1, name: "AleluyA", gapMs: 0, lastLapMs: 106744, visualCompound: 7, tyreAge: 6, pitStatus: 0 },
      { pos: 2, name: "bogdanich", gapMs: 16809, lastLapMs: 109317, visualCompound: 7, tyreAge: 7, pitStatus: 0 },
      { pos: 8, name: "Sviter", gapMs: 82454, lastLapMs: 110818, visualCompound: 7, tyreAge: 6, pitStatus: 0, isPlayer: true },
      { pos: 19, name: "HULKENBERG", gapMs: 0, lastLapMs: 95902, visualCompound: 18, tyreAge: 2, pitStatus: 2 },
    ],
  },
};
