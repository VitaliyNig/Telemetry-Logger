import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { CompareLapPicker, type CompareLapPickerDriver, type CompareLapPickerSelection } from "./CompareLapPicker";

const meta: Meta<typeof CompareLapPicker> = {
  title: "Telemetry/CompareLapPicker",
  component: CompareLapPicker,
  decorators: [
    (Story) => (
      <div style={{ width: 320, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof CompareLapPicker>;

function lapsFor(count: number, baseMs: number): CompareLapPickerDriver["laps"] {
  return Array.from({ length: count }, (_, i) => {
    const lapNum = i + 1;
    return {
      lapNum,
      lapTimeMs: baseMs + (lapNum % 5) * 120 - (lapNum % 3) * 60,
      valid: lapNum !== 4,
      pit: lapNum === 6,
      raceFlag: lapNum === 9 ? 2 : 0,
      tyre: lapNum < 6 ? "Soft" : lapNum < 12 ? "Medium" : "Hard",
    };
  });
}

const drivers: CompareLapPickerDriver[] = [
  { carIdx: 1, name: "Max VERSTAPPEN", teamColor: "#3671C6", teamId: "red-bull", racePosition: 1, laps: lapsFor(18, 82000) },
  { carIdx: 44, name: "Lewis HAMILTON", teamColor: "#27F4D2", teamId: "mercedes", racePosition: 2, laps: lapsFor(18, 82300) },
  { carIdx: 16, name: "Charles LECLERC", teamColor: "#E8002D", teamId: "ferrari", racePosition: 3, laps: lapsFor(18, 82450) },
  { carIdx: 55, name: "Carlos SAINZ", teamColor: "#E8002D", teamId: "ferrari", racePosition: 4, laps: lapsFor(18, 82600) },
];

function ControlledPicker({ initial }: { initial: CompareLapPickerSelection[] }) {
  const [selected, setSelected] = useState<CompareLapPickerSelection[]>(initial);

  function nextKey(): number {
    let key = 1000;
    while (selected.some((s) => s.key === key)) key++;
    return key;
  }

  return (
    <CompareLapPicker
      drivers={drivers}
      selected={selected}
      onAddLap={(carIdx, lapNum) => setSelected((prev) => [...prev, { key: nextKey(), sourceCarIdx: carIdx, lap: lapNum }])}
      onRemove={(key) => setSelected((prev) => prev.filter((s) => s.key !== key))}
      onSetRef={(key) => setSelected((prev) => prev.map((s) => ({ ...s, isRef: s.key === key })))}
      onToggleVisibility={(key) => setSelected((prev) => prev.map((s) => (s.key === key ? { ...s, hidden: !s.hidden } : s)))}
    />
  );
}

export const Default: Story = {
  render: () => (
    <ControlledPicker
      initial={[
        { key: 1, sourceCarIdx: 1, lap: 12, isRef: true },
        { key: 44, sourceCarIdx: 44, lap: 12 },
      ]}
    />
  ),
};

export const WithHiddenAndTags: Story = {
  render: () => (
    <ControlledPicker
      initial={[
        { key: 1, sourceCarIdx: 1, lap: 6, isRef: true },
        { key: 44, sourceCarIdx: 44, lap: 7, hidden: true },
        { key: 16, sourceCarIdx: 16, lap: 9 },
      ]}
    />
  ),
};

export const AtCaps: Story = {
  render: () => (
    <ControlledPicker
      initial={[
        { key: 1, sourceCarIdx: 1, lap: 1, isRef: true },
        { key: 1001, sourceCarIdx: 16, lap: 2 },
        { key: 1002, sourceCarIdx: 16, lap: 3 },
        { key: 1003, sourceCarIdx: 16, lap: 5 },
        { key: 1004, sourceCarIdx: 44, lap: 2 },
        { key: 1005, sourceCarIdx: 44, lap: 3 },
      ]}
    />
  ),
};

export const Empty: Story = {
  render: () => <ControlledPicker initial={[]} />,
};
