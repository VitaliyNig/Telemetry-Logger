import type { Meta, StoryObj } from "@storybook/react-vite";
import { LapData, type LapDataMiniLapRow } from "./LapData";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof LapData> = {
  title: "Widgets/LapData",
  component: LapData,
  decorators: [
    (Story) => (
      <div style={{ width: 280, height: 480, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Lap Data" widgetId="lapData">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LapData>;

// Singapore race, carIdx 2 (Sviter, the player). Session PB: 1:31.845 (S1 28.210 / S2 35.330 / S3 28.305).
const PB_LAP = 91845, PB_S1 = 28210, PB_S2 = 35330, PB_S3 = 28305;

// Laps 7-11, "vs previous lap" mode — lap 8 sets the session PB, lap 9 is an off-track invalid lap.
const DEFAULT_MINI_LAPS: LapDataMiniLapRow[] = [
  { lapNum: 7, valid: true, lap: { currentMs: 92740, refMs: 93010, pbMs: PB_LAP }, s1: { currentMs: 28480, refMs: 28600, pbMs: PB_S1 }, s2: { currentMs: 35680, refMs: 35700, pbMs: PB_S2 }, s3: { currentMs: 28580, refMs: 28710, pbMs: PB_S3 } },
  { lapNum: 8, valid: true, lap: { currentMs: PB_LAP, refMs: 92740, pbMs: PB_LAP }, s1: { currentMs: PB_S1, refMs: 28480, pbMs: PB_S1 }, s2: { currentMs: PB_S2, refMs: 35680, pbMs: PB_S2 }, s3: { currentMs: PB_S3, refMs: 28580, pbMs: PB_S3 } },
  { lapNum: 9, valid: false, lap: { currentMs: 93450, refMs: PB_LAP, pbMs: PB_LAP }, s1: { currentMs: 28900, refMs: PB_S1, pbMs: PB_S1 }, s2: { currentMs: 35850, refMs: PB_S2, pbMs: PB_S2 }, s3: { currentMs: 28700, refMs: PB_S3, pbMs: PB_S3 } },
  { lapNum: 10, valid: true, lap: { currentMs: 92410, refMs: 93450, pbMs: PB_LAP }, s1: { currentMs: 28390, refMs: 28900, pbMs: PB_S1 }, s2: { currentMs: 35560, refMs: 35850, pbMs: PB_S2 }, s3: { currentMs: 28460, refMs: 28700, pbMs: PB_S3 } },
  { lapNum: 11, valid: true, lap: { currentMs: 92120, refMs: 92410, pbMs: PB_LAP }, s1: { currentMs: 28340, refMs: 28390, pbMs: PB_S1 }, s2: { currentMs: PB_S2, refMs: 35560, pbMs: PB_S2 }, s3: { currentMs: 28450, refMs: 28460, pbMs: PB_S3 } },
];

const LAST_LAP_DEFAULT = DEFAULT_MINI_LAPS[4].lap;

export const Default: Story = {
  args: {
    lastLap: LAST_LAP_DEFAULT,
    lastLapValid: true,
    sector1: { currentMs: 28340, refMs: 28390, pbMs: PB_S1 },
    sector2: { currentMs: PB_S2, refMs: 35560, pbMs: PB_S2 },
    sector3: { currentMs: 28450, refMs: 28460, pbMs: PB_S3 },
    activeSector: 2,
    currentLapMs: 41200,
    currentLapInvalid: false,
    predictedFinishMs: 91985,
    miniLaps: DEFAULT_MINI_LAPS,
  },
};

export const PersonalBestLap: Story = {
  args: {
    lastLap: { currentMs: PB_LAP, refMs: 92740, pbMs: PB_LAP },
    lastLapValid: true,
    sector1: { currentMs: PB_S1, refMs: 28480, pbMs: PB_S1 },
    sector2: { currentMs: PB_S2, refMs: 35680, pbMs: PB_S2 },
    sector3: { currentMs: PB_S3, refMs: 28580, pbMs: PB_S3 },
    activeSector: 1,
    currentLapMs: 5200,
    currentLapInvalid: false,
    predictedFinishMs: PB_LAP,
    miniLaps: DEFAULT_MINI_LAPS.slice(0, 2),
  },
};

export const CurrentLapInvalid: Story = {
  args: {
    ...Default.args,
    currentLapMs: 15200,
    currentLapInvalid: true,
    predictedFinishMs: 0,
    activeSector: 1,
  },
};

export const AwaitingData: Story = {
  args: {
    lastLap: { currentMs: 0, refMs: 0, pbMs: 0 },
    lastLapValid: true,
    sector1: { currentMs: 0, refMs: 0, pbMs: 0 },
    sector2: { currentMs: 0, refMs: 0, pbMs: 0 },
    sector3: { currentMs: 0, refMs: 0, pbMs: 0 },
    activeSector: 1,
    currentLapMs: 8400,
    currentLapInvalid: false,
    predictedFinishMs: 0,
    miniLaps: [],
  },
};
