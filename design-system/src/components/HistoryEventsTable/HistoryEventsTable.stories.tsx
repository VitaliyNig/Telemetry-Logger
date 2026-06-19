import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  HistoryEventsTable,
  DEFAULT_HISTORY_EVENTS_CODE_FILTER,
  type HistoryEventsRow,
  type HistoryEventsCodeFilter,
} from "./HistoryEventsTable";

const meta: Meta<typeof HistoryEventsTable> = {
  title: "History/HistoryEventsTable",
  component: HistoryEventsTable,
  decorators: [
    (Story) => (
      <div style={{ width: 900, height: 520, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof HistoryEventsTable>;

const raceRows: HistoryEventsRow[] = [
  { code: "SSTA", timeS: 0, lap: 1 },
  { code: "STLG", timeS: 4, lap: 1, detail: "Lights: 5" },
  { code: "LGOT", timeS: 9, lap: 1 },
  { code: "FTLP", timeS: 92, lap: 2, driverName: "VERSTAPPEN", driverColor: "#3671C6", detail: "1:30.450" },
  { code: "OVTK", timeS: 140, lap: 3, detail: "NORRIS ← LECLERC" },
  { code: "SPTP", timeS: 210, lap: 4, driverName: "NORRIS", driverColor: "#FF8000", detail: "327.4 km/h" },
  { code: "SCAR", timeS: 245, lap: 5, detail: "Full SC — Deployed" },
  { code: "COLL", timeS: 248, lap: 5, detail: "LECLERC × HAMILTON" },
  { code: "PENA", timeS: 260, lap: 5, driverName: "LECLERC", driverColor: "#E8002D", detail: "Time penalty — Causing a collision — 5s — Lap 5 — Driver: LECLERC" },
  { code: "SCAR", timeS: 310, lap: 6, detail: "Full SC — Ending" },
  { code: "DRSE", timeS: 312, lap: 6 },
  { code: "RTMT", timeS: 480, lap: 9, driverName: "HAMILTON", driverColor: "#27F4D2", detail: "Retired" },
  { code: "TMPT", timeS: 600, lap: 11, driverName: "RUSSELL", driverColor: "#27F4D2", detail: "RUSSELL" },
  { code: "CHQF", timeS: 3600, lap: 58 },
  { code: "RCWN", timeS: 3605, lap: 58, driverName: "VERSTAPPEN", driverColor: "#3671C6", detail: "VERSTAPPEN" },
  { code: "SEND", timeS: 3620, lap: 58 },
];

function ControlledWrapper({ rows }: { rows: HistoryEventsRow[] }) {
  const [searchQuery, setSearchQuery] = useState("");
  const [codeFilter, setCodeFilter] = useState<HistoryEventsCodeFilter>(DEFAULT_HISTORY_EVENTS_CODE_FILTER);
  return (
    <HistoryEventsTable
      rows={rows}
      searchQuery={searchQuery}
      onSearchQueryChange={setSearchQuery}
      codeFilter={codeFilter}
      onCodeFilterChange={setCodeFilter}
    />
  );
}

export const RaceSession: Story = {
  render: () => <ControlledWrapper rows={raceRows} />,
};

export const NoEvents: Story = {
  render: () => <ControlledWrapper rows={[]} />,
};

export const AllFilteredOut: Story = {
  render: () => {
    const [codeFilter] = useState<HistoryEventsCodeFilter>(
      Object.keys(DEFAULT_HISTORY_EVENTS_CODE_FILTER).reduce((acc, code) => ({ ...acc, [code]: false }), {})
    );
    return <HistoryEventsTable rows={raceRows} codeFilter={codeFilter} />;
  },
};
