import type { Meta, StoryObj } from "@storybook/react-vite";
import { QualiStandings, type QualiStandingsRow } from "./QualiStandings";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof QualiStandings> = {
  title: "Widgets/QualiStandings",
  component: QualiStandings,
  decorators: [
    (Story) => (
      <div style={{ width: 560, height: 340, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Quali Standings" widgetId="qualiStandings">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof QualiStandings>;

// Singapore qualifying, carIdx 2 (Sviter, the player) on a flying lap mid-pack.
const ROWS: QualiStandingsRow[] = [
  { pos: 1, name: "Max Verstappen", bestLapMs: 90120, statusLabel: "In Pit", statusClass: "qs-pit", onTrack: false, currentSector: 0, s1Ms: 0, s2Ms: 0, bestS1Ms: 28010, bestS2Ms: 32450, bestS3Ms: 29660 },
  { pos: 2, name: "Charles Leclerc", bestLapMs: 90345, statusLabel: "In Pit", statusClass: "qs-pit", onTrack: false, currentSector: 0, s1Ms: 0, s2Ms: 0, bestS1Ms: 28090, bestS2Ms: 32510, bestS3Ms: 29745 },
  {
    pos: 3,
    name: "Vitaliy Sviter",
    bestLapMs: 90810,
    statusLabel: "Flying",
    statusClass: "qs-flying",
    isPlayer: true,
    onTrack: true,
    currentSector: 1,
    s1Ms: 27940,
    s2Ms: 0,
    bestS1Ms: 28210,
    bestS2Ms: 32670,
    bestS3Ms: 29930,
    liveDeltaMs: -270,
  },
  { pos: 4, name: "Lewis Hamilton", bestLapMs: 91020, statusLabel: "Out Lap", statusClass: "qs-outlap", onTrack: true, currentSector: 0, s1Ms: 0, s2Ms: 0, bestS1Ms: 28330, bestS2Ms: 32780, bestS3Ms: 29910 },
  { pos: 5, name: "George Russell", bestLapMs: 91265, statusLabel: "In Lap", statusClass: "qs-inlap", onTrack: true, currentSector: 2, s1Ms: 28200, s2Ms: 32700, bestS1Ms: 28200, bestS2Ms: 32700, bestS3Ms: 30365 },
  { pos: 6, name: "Carlos Sainz", bestLapMs: 0, statusLabel: "Garage", statusClass: "qs-garage", onTrack: false, currentSector: 0, s1Ms: 0, s2Ms: 0, bestS1Ms: 0, bestS2Ms: 0, bestS3Ms: 0 },
];

export const Default: Story = {
  args: { rows: ROWS },
};

export const PlayerOnPersonalBestPace: Story = {
  args: {
    rows: ROWS.map((r) => (r.isPlayer ? { ...r, currentSector: 2 as const, s2Ms: 32510, liveDeltaMs: -430 } : r)),
  },
};

export const InvalidLap: Story = {
  args: {
    rows: ROWS.map((r) => (r.isPlayer ? { ...r, lapInvalid: true, liveDeltaMs: 180 } : r)),
  },
};

export const NoTimesSet: Story = {
  args: {
    rows: ROWS.map((r, i) => ({ ...r, bestLapMs: 0, statusLabel: i === 0 ? "Flying" : r.statusLabel, statusClass: i === 0 ? "qs-flying" : r.statusClass, currentSector: 0 as const, s1Ms: 0, s2Ms: 0 })),
  },
};
