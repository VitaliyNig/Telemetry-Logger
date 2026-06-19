import type { Meta, StoryObj } from "@storybook/react-vite";
import { HistoryLapChart, type HistoryLapChartDriver, type HistoryLapChartFlagSpan } from "./HistoryLapChart";

const meta: Meta<typeof HistoryLapChart> = {
  title: "History/HistoryLapChart",
  component: HistoryLapChart,
  decorators: [
    (Story) => (
      <div style={{ width: 1000, height: 560, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HistoryLapChart>;

function lapsFromPositions(positions: number[], pitLaps: number[] = []) {
  return positions.map((position, i) => ({
    lapNum: i + 1,
    position,
    pit: pitLaps.includes(i + 1),
  }));
}

const raceDrivers: HistoryLapChartDriver[] = [
  {
    carIdx: 1,
    name: "Max Verstappen",
    color: "#3671C6",
    laps: lapsFromPositions([1, 1, 1, 1, 2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1], [8]),
  },
  {
    carIdx: 4,
    name: "Lando Norris",
    color: "#FF8000",
    laps: lapsFromPositions([3, 2, 2, 2, 1, 1, 2, 2, 2, 2, 2, 2, 2, 2, 2], [9]),
  },
  {
    carIdx: 16,
    name: "Charles Leclerc",
    color: "#E8002D",
    laps: lapsFromPositions([2, 3, 3, 3, 3, 3, 4, 4, 3, 3, 3, 3, 3, 3, 3], [7]),
  },
  {
    carIdx: 44,
    name: "Lewis Hamilton",
    color: "#27F4D2",
    laps: lapsFromPositions([4, 4, 4, 4, 4, 4, 3, 3, 4, 4, 4, 4, 4, 4, 4], [10]),
  },
];

const raceFlagSpans: HistoryLapChartFlagSpan[] = [
  { lap: 7, flag: 2 },
  { lap: 8, flag: 2 },
];

export const RaceSession: Story = {
  args: {
    drivers: raceDrivers,
    totalLaps: 15,
    flagSpans: raceFlagSpans,
  },
};

export const SmallField: Story = {
  args: {
    drivers: raceDrivers.slice(0, 2),
    totalLaps: 10,
    totalDrivers: 4,
  },
};

export const NoPositionData: Story = {
  args: {
    drivers: [],
    totalLaps: 10,
  },
};
