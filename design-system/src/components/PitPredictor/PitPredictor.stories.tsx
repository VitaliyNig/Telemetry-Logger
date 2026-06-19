import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { PitPredictor } from "./PitPredictor";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof PitPredictor> = {
  title: "Widgets/PitPredictor",
  component: PitPredictor,
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 220, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Pit Stop Predictor" widgetId="pitPredictor">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof PitPredictor>;

// Real grid from race.json (LapData + Participants), Singapore race — full
// classified field, player Sviter (carIdx 2) running P8, 82.454s off the lead.
const RACE_GRID = [
  { carIdx: 1, pos: 1, gapToLeaderMs: 0, name: "AleluyA" },
  { carIdx: 5, pos: 2, gapToLeaderMs: 16809, name: "bogdanich" },
  { carIdx: 17, pos: 3, gapToLeaderMs: 23671, name: "Player" },
  { carIdx: 4, pos: 4, gapToLeaderMs: 40836, name: "ProstoSith" },
  { carIdx: 3, pos: 5, gapToLeaderMs: 56005, name: "Player" },
  { carIdx: 0, pos: 6, gapToLeaderMs: 78313, name: "armavel" },
  { carIdx: 6, pos: 7, gapToLeaderMs: 81579, name: "Duk3" },
  { carIdx: 2, pos: 8, gapToLeaderMs: 82454, name: "Sviter", isPlayer: true },
  { carIdx: 14, pos: 9, gapToLeaderMs: 82829, name: "ANTONELLI" },
  { carIdx: 10, pos: 10, gapToLeaderMs: 90352, name: "HAMILTON" },
  { carIdx: 7, pos: 11, gapToLeaderMs: 91300, name: "PIASTRI" },
  { carIdx: 12, pos: 12, gapToLeaderMs: 93310, name: "TSUNODA" },
  { carIdx: 11, pos: 13, gapToLeaderMs: 97548, name: "VERSTAPPEN" },
  { carIdx: 18, pos: 14, gapToLeaderMs: 101237, name: "Player" },
  { carIdx: 15, pos: 15, gapToLeaderMs: 101757, name: "BORTOLETO" },
  { carIdx: 9, pos: 16, gapToLeaderMs: 103828, name: "LECLERC" },
];

function Controlled(props: { initialPitTime: number }) {
  const [pitTimeSec, setPitTimeSec] = useState(props.initialPitTime);
  const [saveStatus, setSaveStatus] = useState("");
  return (
    <PitPredictor
      cars={RACE_GRID}
      pitTimeSec={pitTimeSec}
      onPitTimeChange={setPitTimeSec}
      onSave={() => {
        setSaveStatus("Saved!");
        setTimeout(() => setSaveStatus(""), 2000);
      }}
      saveStatus={saveStatus}
    />
  );
}

export const Default: Story = {
  render: () => <Controlled initialPitTime={23.0} />,
};

export const SlowPitLane: Story = {
  render: () => <Controlled initialPitTime={31.5} />,
};

export const Leader: Story = {
  args: {
    cars: [
      { carIdx: 2, pos: 1, gapToLeaderMs: 0, name: "Sviter", isPlayer: true },
      { carIdx: 1, pos: 2, gapToLeaderMs: 4200, name: "AleluyA" },
      { carIdx: 5, pos: 3, gapToLeaderMs: 9800, name: "bogdanich" },
    ],
    pitTimeSec: 23.0,
    onPitTimeChange: () => {},
    onSave: () => {},
  },
};
