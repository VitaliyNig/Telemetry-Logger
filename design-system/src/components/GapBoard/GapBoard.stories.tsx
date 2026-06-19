import type { Meta, StoryObj } from "@storybook/react-vite";
import { GapBoard } from "./GapBoard";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof GapBoard> = {
  title: "Widgets/GapBoard",
  component: GapBoard,
  decorators: [
    (Story) => (
      <div style={{ width: 460, height: 240, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Gap Board" widgetId="gapBoard">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof GapBoard>;

// Real lapHistories[carIdx].lapHistoryDataItems for laps 28-31 of the
// Singapore race, the GAP_BOARD_LAPS=4 window around carIdx 2 (Sviter,
// the player). Per-cell colors/deltas are computed by the component itself,
// matching `updateGapBoard`'s `formatLapCell`.
export const Default: Story = {
  args: {
    lapNumbers: [28, 29, 30, 31],
    drivers: [
      { pos: 7, name: "Duk3", lapTimesMs: [107389, 108856, 109869, 110722] },
      { pos: 8, name: "Sviter", isPlayer: true, lapTimesMs: [105350, 106799, 109834, 110818] },
      { pos: 9, name: "ANTONELLI", lapTimesMs: [104770, 106100, 107117, 108751] },
    ],
  },
};

export const MissingLapData: Story = {
  args: {
    lapNumbers: [28, 29, 30, 31],
    drivers: [
      { pos: 7, name: "Duk3", lapTimesMs: [107389, 108856, 0, null] },
      { pos: 8, name: "Sviter", isPlayer: true, lapTimesMs: [105350, 106799, 109834, 0] },
      { pos: 9, name: "ANTONELLI", lapTimesMs: [104770, 106100, 107117, 0] },
    ],
  },
};

export const NoHistoryYet: Story = {
  args: { lapNumbers: [], drivers: [] },
};
