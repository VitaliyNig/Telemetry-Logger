import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { HistorySessionList, type HistoryWeekend, type HistoryFilters } from "./HistorySessionList";

const meta: Meta<typeof HistorySessionList> = {
  title: "History/HistorySessionList",
  component: HistorySessionList,
  decorators: [
    (Story) => (
      <div style={{ width: 900, height: 600, border: "1px solid #30363d", padding: 16 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HistorySessionList>;

const WEEKENDS: HistoryWeekend[] = [
  {
    folder: "2026-06-14_Singapore",
    trackName: "Singapore",
    trackId: 16,
    flagCode: "sg",
    gameYear: 25,
    sessions: [
      { slug: "fp1", typeName: "FP1", savedAt: "2026-06-14T14:00:00Z" },
      { slug: "fp2", typeName: "FP2", savedAt: "2026-06-14T17:30:00Z" },
      { slug: "q", typeName: "Quali", savedAt: "2026-06-14T21:00:00Z" },
      { slug: "race", typeName: "Race", savedAt: "2026-06-15T20:00:00Z" },
    ],
  },
  {
    folder: "2026-06-01_Bahrain_TT",
    trackName: "Bahrain",
    trackId: 1,
    flagCode: "bh",
    gameYear: 25,
    sessions: [{ slug: "time_trial", typeName: "Time Trial", savedAt: "2026-06-01T10:00:00Z" }],
  },
  {
    folder: "2026-05-20_Suzuka",
    trackName: "Suzuka",
    trackId: 12,
    flagCode: "jp",
    gameYear: 24,
    formulaName: "F2",
    sessions: [
      { slug: "q1", typeName: "Q1", savedAt: "2026-05-20T08:00:00Z" },
      { slug: "race1", typeName: "Race 1", savedAt: "2026-05-21T06:00:00Z" },
    ],
  },
];

function InteractiveWrapper() {
  const [filters, setFilters] = useState<HistoryFilters>({ track: "", game: "", from: "", to: "" });
  return (
    <HistorySessionList
      weekends={WEEKENDS}
      filters={filters}
      onFilterChange={setFilters}
      folderPath="Logs"
      onOpenSession={(folder, slug, name) => alert(`open ${name} / ${slug} (${folder})`)}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveWrapper />,
};

export const CustomFolder: Story = {
  args: {
    weekends: WEEKENDS,
    folderPath: "D:\\F1Replays\\Logs",
    isCustomFolder: true,
    onOpenSession: () => {},
  },
};

export const Loading: Story = {
  args: {
    weekends: [],
    loading: true,
    folderPath: "Logs",
    onOpenSession: () => {},
  },
};

export const LoadFailed: Story = {
  args: {
    weekends: [],
    loadError: "network error",
    folderPath: "Logs",
    onOpenSession: () => {},
  },
};

export const NoSessions: Story = {
  args: {
    weekends: [],
    folderPath: "Logs",
    onOpenSession: () => {},
  },
};

export const NoFilterMatches: Story = {
  args: {
    weekends: WEEKENDS,
    filters: { track: "", game: "23", from: "", to: "" },
    folderPath: "Logs",
    onOpenSession: () => {},
  },
};

export const DeletingCard: Story = {
  args: {
    weekends: WEEKENDS,
    deletingFolder: WEEKENDS[1].folder,
    folderPath: "Logs",
    onOpenSession: () => {},
  },
};
