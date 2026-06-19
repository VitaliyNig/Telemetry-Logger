import type { Meta, StoryObj } from "@storybook/react-vite";
import { HistoryLapTimesGrid, type HistoryLapTimesDriver, type HistoryLapTimesLap } from "./HistoryLapTimesGrid";

const meta: Meta<typeof HistoryLapTimesGrid> = {
  title: "History/HistoryLapTimesGrid",
  component: HistoryLapTimesGrid,
  decorators: [
    (Story) => (
      <div style={{ width: 1000, height: 560, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HistoryLapTimesGrid>;

function lap(partial: Partial<HistoryLapTimesLap> & { lapNum: number; lapTimeMs: number }): HistoryLapTimesLap {
  return {
    valid: true,
    s1Ms: Math.round(partial.lapTimeMs * 0.31),
    s2Ms: Math.round(partial.lapTimeMs * 0.38),
    s3Ms: Math.round(partial.lapTimeMs * 0.31),
    pit: false,
    blueFlag: false,
    raceFlag: 0,
    compoundVisual: 16,
    tyreAge: partial.lapNum,
    tyreWearEnd: [partial.lapNum * 1.4, partial.lapNum * 1.5, partial.lapNum * 1.1, partial.lapNum * 1.2],
    perf: { perfPct: 60 + ((partial.lapNum * 7) % 35), ersUsagePct: 40 + (partial.lapNum % 20), drsUsagePct: 15 + (partial.lapNum % 10), drsZoneBased: true },
    ...partial,
  };
}

const raceDrivers: HistoryLapTimesDriver[] = [
  {
    carIdx: 0,
    name: "VERSTAPPEN",
    teamColor: "#3671C6",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 92450, compoundVisual: 16 }),
      lap({ lapNum: 2, lapTimeMs: 91120, compoundVisual: 16 }),
      lap({ lapNum: 3, lapTimeMs: 90875, compoundVisual: 16 }),
      lap({ lapNum: 4, lapTimeMs: 91030, compoundVisual: 16, raceFlag: 2 }),
      lap({ lapNum: 5, lapTimeMs: 95200, compoundVisual: 16, raceFlag: 2 }),
      lap({ lapNum: 6, lapTimeMs: 90100, compoundVisual: 17, pit: true }),
      lap({ lapNum: 7, lapTimeMs: 93300, compoundVisual: 17 }),
      lap({ lapNum: 8, lapTimeMs: 90950, compoundVisual: 17 }),
      lap({ lapNum: 9, lapTimeMs: 90810, compoundVisual: 17 }),
    ],
  },
  {
    carIdx: 1,
    name: "NORRIS",
    teamColor: "#FF8000",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 92900, compoundVisual: 16 }),
      lap({ lapNum: 2, lapTimeMs: 91340, compoundVisual: 16 }),
      lap({ lapNum: 3, lapTimeMs: 90990, compoundVisual: 16 }),
      lap({ lapNum: 4, lapTimeMs: 91200, compoundVisual: 16, raceFlag: 2 }),
      lap({ lapNum: 5, lapTimeMs: 95400, compoundVisual: 16, raceFlag: 2 }),
      lap({ lapNum: 6, lapTimeMs: 90400, compoundVisual: 17, pit: true }),
      lap({ lapNum: 7, lapTimeMs: 93500, compoundVisual: 17 }),
      lap({ lapNum: 8, lapTimeMs: 91100, compoundVisual: 17, valid: false }),
      lap({ lapNum: 9, lapTimeMs: 90700, compoundVisual: 17 }),
    ],
  },
  {
    carIdx: 2,
    name: "LECLERC",
    teamColor: "#E8002D",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 93100, compoundVisual: 17 }),
      lap({ lapNum: 2, lapTimeMs: 91500, compoundVisual: 17 }),
      lap({ lapNum: 3, lapTimeMs: 91220, compoundVisual: 17 }),
      lap({ lapNum: 4, lapTimeMs: 91400, compoundVisual: 17, raceFlag: 2 }),
      lap({ lapNum: 5, lapTimeMs: 95600, compoundVisual: 17, raceFlag: 4 }),
      lap({ lapNum: 6, lapTimeMs: 60000, compoundVisual: 17, raceFlag: 4, valid: false }),
      lap({ lapNum: 7, lapTimeMs: 91900, compoundVisual: 18, pit: true }),
      lap({ lapNum: 8, lapTimeMs: 91950, compoundVisual: 18 }),
      lap({ lapNum: 9, lapTimeMs: 91700, compoundVisual: 18 }),
    ],
  },
];

export const RaceSession: Story = {
  args: {
    category: "race",
    drivers: raceDrivers,
    redFlagClearedAfterLap: 6,
  },
};

const qualiDrivers: HistoryLapTimesDriver[] = [
  {
    carIdx: 0,
    name: "VERSTAPPEN",
    teamColor: "#3671C6",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 81450, compoundVisual: 19 }),
      lap({ lapNum: 2, lapTimeMs: 80200, compoundVisual: 19, s1Ms: 24500, s2Ms: 30800, s3Ms: 24900 }),
      lap({ lapNum: 3, lapTimeMs: 80050, compoundVisual: 19, s1Ms: 24400, s2Ms: 30700, s3Ms: 24950 }),
    ],
  },
  {
    carIdx: 1,
    name: "NORRIS",
    teamColor: "#FF8000",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 81700, compoundVisual: 19 }),
      lap({ lapNum: 2, lapTimeMs: 80300, compoundVisual: 19, s1Ms: 24450, s2Ms: 30850, s3Ms: 25000 }),
      lap({ lapNum: 3, lapTimeMs: 80120, compoundVisual: 19, s1Ms: 24380, s2Ms: 30740, s3Ms: 25000 }),
    ],
  },
];

export const QualifyingSession: Story = {
  args: {
    category: "qualifying",
    drivers: qualiDrivers,
  },
};

const ttDrivers: HistoryLapTimesDriver[] = [
  {
    carIdx: 0,
    name: "PLAYER",
    teamColor: "#9B3FF5",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 79900 }),
      lap({ lapNum: 2, lapTimeMs: 79400 }),
      lap({ lapNum: 3, lapTimeMs: 79150 }),
      lap({ lapNum: 4, lapTimeMs: 79600, valid: false }),
      lap({ lapNum: 5, lapTimeMs: 79050 }),
    ],
  },
];

export const TimeTrialSession: Story = {
  args: {
    category: "time_trial",
    drivers: ttDrivers,
  },
};

const practiceDrivers: HistoryLapTimesDriver[] = [
  {
    carIdx: 0,
    name: "HAMILTON",
    teamColor: "#27F4D2",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 95100, compoundVisual: 18 }),
      lap({ lapNum: 2, lapTimeMs: 92300, compoundVisual: 18 }),
      lap({ lapNum: 3, lapTimeMs: 91950, compoundVisual: 17, pit: true }),
      lap({ lapNum: 4, lapTimeMs: 91500, compoundVisual: 16 }),
    ],
  },
  {
    carIdx: 1,
    name: "RUSSELL",
    teamColor: "#27F4D2",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 95400, compoundVisual: 18 }),
      lap({ lapNum: 2, lapTimeMs: 92500, compoundVisual: 18 }),
      lap({ lapNum: 3, lapTimeMs: 92100, compoundVisual: 17, pit: true }),
      lap({ lapNum: 4, lapTimeMs: 91400, compoundVisual: 16 }),
    ],
  },
];

export const PracticeSession: Story = {
  args: {
    category: "practice",
    drivers: practiceDrivers,
  },
};

const emptyDrivers: HistoryLapTimesDriver[] = [
  {
    carIdx: 0,
    name: "PLAYER",
    teamColor: "#9B3FF5",
    laps: [
      lap({ lapNum: 1, lapTimeMs: 80100, valid: false }),
      lap({ lapNum: 2, lapTimeMs: 79900, valid: false }),
    ],
  },
];

export const NoValidLaps: Story = {
  args: {
    category: "time_trial",
    drivers: emptyDrivers,
  },
};
