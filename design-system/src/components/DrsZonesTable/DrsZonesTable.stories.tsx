import type { Meta, StoryObj } from "@storybook/react-vite";
import { DrsZonesTable, type DrsZoneTrack } from "./DrsZonesTable";

const meta: Meta<typeof DrsZonesTable> = {
  title: "Debug/DrsZonesTable",
  component: DrsZonesTable,
  decorators: [
    (Story) => (
      <div style={{ width: 720 }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof DrsZonesTable>;

const TRACKS: DrsZoneTrack[] = [
  { trackId: 1, trackName: "Melbourne", hasZones: true, zoneCount: 4, coverage: 0.21, zones: [[0.02, 0.09], [0.31, 0.38], [0.55, 0.6], [0.81, 0.88]] },
  { trackId: 2, trackName: "Singapore", hasZones: true, zoneCount: 2, coverage: 0.09, zones: [[0.12, 0.17], [0.62, 0.66]] },
  { trackId: 3, trackName: "Suzuka", hasZones: false },
  { trackId: 4, trackName: "Bahrain", hasZones: true, zoneCount: 3, coverage: 0.18, zones: [[0.04, 0.1], [0.41, 0.46], [0.7, 0.76]] },
];

export const Default: Story = {
  args: {
    tracks: TRACKS,
    currentTrackId: 2,
    currentTrackName: "Singapore",
  },
};

export const NoLiveSession: Story = {
  args: {
    tracks: TRACKS,
    currentTrackId: null,
    currentTrackName: null,
  },
};

export const Loading: Story = {
  args: {
    tracks: [],
  },
};

export const LoadFailed: Story = {
  args: {
    tracks: [],
    loadError: "http 500",
  },
};
