import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SectorBadgesToolbar,
  type SectorBadgesToolbarChannel,
  type SectorBadgesToolbarChipMode,
  type SectorBadgesToolbarDeltaMode,
  type SectorBadgesToolbarSegment,
  type SectorBadgesToolbarSplit,
  type SectorBadgesToolbarZoomRange,
} from "./SectorBadgesToolbar";
import { TopLossZones, type TopLossZonesZone } from "../TopLossZones/TopLossZones";

const meta: Meta<typeof SectorBadgesToolbar> = {
  title: "Telemetry/SectorBadgesToolbar",
  component: SectorBadgesToolbar,
  decorators: [
    (Story) => (
      <div style={{ width: 280, background: "#0d0f12", padding: 12 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SectorBadgesToolbar>;

function segmentsFor(split: SectorBadgesToolbarSplit): SectorBadgesToolbarSegment[] {
  const parts = split / 3;
  const segments: SectorBadgesToolbarSegment[] = [];
  let distance = 0;
  for (let sector = 1; sector <= 3; sector++) {
    for (let part = 1; part <= parts; part++) {
      const length = 380 + sector * 20;
      const start = distance;
      const end = distance + length;
      distance = end;
      segments.push({
        sector,
        part: parts > 1 ? part : undefined,
        parts,
        start,
        end,
        timeMs: 7800 + sector * 1100 + part * 130,
      });
    }
  }
  return segments;
}

const LOSS_ZONES: TopLossZonesZone[] = [
  {
    id: "z0",
    start: 1180,
    end: 1340,
    loss: 0.482,
    primary: "late_brake",
    primaryLabel: "Поздний тормоз",
    facts: [{ label: "Brake pt", value: "−18 m", tone: "loss" }],
    recommendations: ["Brake 15-20 m earlier into Turn 4"],
  },
  {
    id: "z1",
    start: 2210,
    end: 2390,
    loss: 0.276,
    primary: "low_apex",
    primaryLabel: "Низкая скорость в апексе",
  },
];

const INITIAL_CHANNELS: SectorBadgesToolbarChannel[] = [
  { key: "delta", label: "Δ", active: true },
  { key: "spd", label: "Speed", active: true },
  { key: "thr", label: "Throttle", active: true },
  { key: "brk", label: "Brake", active: true },
  { key: "str", label: "Steering", active: false },
  { key: "gr", label: "Gear", active: false },
  { key: "rpm", label: "RPM", active: false },
  { key: "ers", label: "ERS", active: false },
  { key: "drs", label: "DRS", active: false },
];

function ControlledToolbar({ withInsights }: { withInsights?: boolean }) {
  const [deltaMode, setDeltaMode] = useState<SectorBadgesToolbarDeltaMode>("cumulative");
  const [split, setSplit] = useState<SectorBadgesToolbarSplit>(3);
  const [zoomRange, setZoomRange] = useState<SectorBadgesToolbarZoomRange | null>(null);
  const [channels, setChannels] = useState<SectorBadgesToolbarChannel[]>(INITIAL_CHANNELS);
  const [chipMode, setChipMode] = useState<SectorBadgesToolbarChipMode>("pair");
  const [heightScale, setHeightScale] = useState(1.9);
  const [insightsEnabled, setInsightsEnabled] = useState(false);

  return (
    <SectorBadgesToolbar
      deltaMode={deltaMode}
      onDeltaModeChange={setDeltaMode}
      split={split}
      onSplitChange={setSplit}
      segments={segmentsFor(split)}
      zoomRange={zoomRange}
      onZoomRangeChange={setZoomRange}
      onZoomIn2x={() => {}}
      onZoomOut2x={() => {}}
      channels={channels}
      onChannelToggle={(key) =>
        setChannels((prev) => prev.map((c) => (c.key === key ? { ...c, active: !c.active } : c)))
      }
      chipMode={chipMode}
      onChipModeChange={setChipMode}
      heightScale={heightScale}
      onHeightScaleChange={setHeightScale}
      insightsEnabled={insightsEnabled}
      onInsightsEnabledChange={setInsightsEnabled}
    >
      {withInsights && <TopLossZones zones={LOSS_ZONES} zoomRange={zoomRange} onZoomRangeChange={setZoomRange} />}
    </SectorBadgesToolbar>
  );
}

export const Default: Story = {
  render: () => <ControlledToolbar />,
};

export const NineSplit: Story = {
  name: "9-way split, sector delta",
  render: function Render() {
    const [deltaMode, setDeltaMode] = useState<SectorBadgesToolbarDeltaMode>("sector");
    const [split, setSplit] = useState<SectorBadgesToolbarSplit>(9);
    const [zoomRange, setZoomRange] = useState<SectorBadgesToolbarZoomRange | null>(null);
    const [channels, setChannels] = useState<SectorBadgesToolbarChannel[]>(INITIAL_CHANNELS);
    const [chipMode, setChipMode] = useState<SectorBadgesToolbarChipMode>("diff");
    const [heightScale, setHeightScale] = useState(1.3);
    const [insightsEnabled, setInsightsEnabled] = useState(false);
    return (
      <SectorBadgesToolbar
        deltaMode={deltaMode}
        onDeltaModeChange={setDeltaMode}
        split={split}
        onSplitChange={setSplit}
        segments={segmentsFor(split)}
        zoomRange={zoomRange}
        onZoomRangeChange={setZoomRange}
        onZoomIn2x={() => {}}
        onZoomOut2x={() => {}}
        channels={channels}
        onChannelToggle={(key) =>
          setChannels((prev) => prev.map((c) => (c.key === key ? { ...c, active: !c.active } : c)))
        }
        chipMode={chipMode}
        onChipModeChange={setChipMode}
        heightScale={heightScale}
        onHeightScaleChange={setHeightScale}
        insightsEnabled={insightsEnabled}
        onInsightsEnabledChange={setInsightsEnabled}
      />
    );
  },
};

export const WithZoomedSector: Story = {
  render: () => {
    const segs = segmentsFor(3);
    return (
      <SectorBadgesToolbar
        deltaMode="cumulative"
        onDeltaModeChange={() => {}}
        split={3}
        onSplitChange={() => {}}
        segments={segs}
        zoomRange={{ start: segs[1].start, end: segs[1].end }}
        onZoomRangeChange={() => {}}
        onZoomIn2x={() => {}}
        onZoomOut2x={() => {}}
        channels={INITIAL_CHANNELS}
        onChannelToggle={() => {}}
        chipMode="pair"
        onChipModeChange={() => {}}
        heightScale={1.9}
        onHeightScaleChange={() => {}}
        insightsEnabled={false}
        onInsightsEnabledChange={() => {}}
      />
    );
  },
};

export const WithInsightsPanel: Story = {
  render: () => <ControlledToolbar withInsights />,
};
