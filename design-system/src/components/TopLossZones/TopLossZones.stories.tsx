import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { TopLossZones, type TopLossZonesZone } from "./TopLossZones";
import type { SectorBadgesToolbarZoomRange } from "../SectorBadgesToolbar/SectorBadgesToolbar";

const meta: Meta<typeof TopLossZones> = {
  title: "Telemetry/TopLossZones",
  component: TopLossZones,
  decorators: [
    (Story) => (
      <div style={{ width: 360, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof TopLossZones>;

const zones: TopLossZonesZone[] = [
  {
    id: "z0",
    start: 1180,
    end: 1340,
    loss: 0.482,
    primary: "late_brake",
    primaryLabel: "Поздний тормоз",
    facts: [
      { label: "Brake pt", value: "−18 m", tone: "loss" },
      { label: "Apex spd", value: "142 km/h", tone: "neutral" },
    ],
    recommendations: ["Brake 15-20 m earlier into Turn 4", "Carry less entry speed to protect the apex"],
  },
  {
    id: "z1",
    start: 2210,
    end: 2390,
    loss: 0.276,
    primary: "low_apex",
    primaryLabel: "Низкая скорость в апексе",
    facts: [{ label: "Apex spd", value: "−6 km/h", tone: "loss" }],
  },
  {
    id: "z2",
    start: 3040,
    end: 3120,
    loss: 0.103,
    primary: "choppy_thr",
    primaryLabel: "Рваный газ",
  },
];

function ControlledZones() {
  const [zoomRange, setZoomRange] = useState<SectorBadgesToolbarZoomRange | null>(null);
  return <TopLossZones zones={zones} zoomRange={zoomRange} onZoomRangeChange={setZoomRange} />;
}

export const Default: Story = {
  render: () => <ControlledZones />,
};

export const Empty: Story = {
  render: () => <TopLossZones zones={[]} />,
};
