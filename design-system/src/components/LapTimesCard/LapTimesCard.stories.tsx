import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { LapTimesCard, type LapTimesRow, type LapTimesSetup } from "./LapTimesCard";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof LapTimesCard> = {
  title: "Widgets/LapTimesCard",
  component: LapTimesCard,
  decorators: [
    (Story) => (
      <div style={{ width: 480, height: 360, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Lap Times" widgetId="lapTimes">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof LapTimesCard>;

// Singapore session, Sviter's own car — practice run with tyre wear progressing across the stint.
const PRACTICE_ROWS: LapTimesRow[] = [
  { lapNum: 1, lapMs: 93820, s1Ms: 28910, s2Ms: 36300, s3Ms: 28610, tyre: { visualCompound: 16, ageLaps: 1, wearPct: 4 } },
  { lapNum: 2, lapMs: 91845, s1Ms: 28210, s2Ms: 35330, s3Ms: 28305, tyre: { visualCompound: 16, ageLaps: 2, wearPct: 9 } },
  { lapNum: 3, lapMs: 92110, s1Ms: 28260, s2Ms: 35420, s3Ms: 28430, tyre: { visualCompound: 16, ageLaps: 3, wearPct: 15 }, invalid: true },
  { lapNum: 4, lapMs: 92980, s1Ms: 28490, s2Ms: 35780, s3Ms: 28710, tyre: { visualCompound: 16, ageLaps: 4, wearPct: 22 } },
];

const SAMPLE_SETUP: LapTimesSetup = {
  frontWing: 28, rearWing: 35,
  onThrottle: 65, offThrottle: 55,
  frontCamber: -3.1, rearCamber: -1.4, frontToe: 0.08, rearToe: 0.18,
  frontSuspension: 22, rearSuspension: 18, frontAntiRollBar: 11, rearAntiRollBar: 9,
  frontSuspensionHeight: 25, rearSuspensionHeight: 48,
  brakeBias: 58, brakePressure: 95,
  frontRightTyrePressure: 25.8, frontLeftTyrePressure: 25.8, rearRightTyrePressure: 23.2, rearLeftTyrePressure: 23.2,
};

const QUALI_ROWS: LapTimesRow[] = [
  { lapNum: 1, lapMs: 91510, s1Ms: 28330, s2Ms: 35610, s3Ms: 27570, setup: SAMPLE_SETUP },
  { lapNum: 2, lapMs: 90810, s1Ms: 27940, s2Ms: 35150, s3Ms: 27720, setup: { ...SAMPLE_SETUP, frontWing: 30, brakeBias: 56 } },
];

export const PracticeWithTyres: Story = {
  args: {
    rows: PRACTICE_ROWS,
    teamName: "Mercedes",
    equalCarPerformance: true,
    showSetup: false,
  },
};

export const QualifyingWithSetupClosed: Story = {
  args: {
    rows: QUALI_ROWS,
    teamName: "Mercedes",
    equalCarPerformance: false,
    showSetup: true,
    openSetupRowIndex: null,
  },
};

export const QualifyingWithSetupOpen: Story = {
  args: {
    rows: QUALI_ROWS,
    teamName: "Mercedes",
    equalCarPerformance: false,
    showSetup: true,
    openSetupRowIndex: 1,
    setupPopoverPosition: { left: 60, top: 90 },
  },
};

export const Interactive: Story = {
  render: (args) => {
    function Wrapper() {
      const [openIdx, setOpenIdx] = useState<number | null>(null);
      return (
        <LapTimesCard
          {...args}
          openSetupRowIndex={openIdx}
          setupPopoverPosition={{ left: 60, top: 90 }}
          onSetupButtonClick={(i) => setOpenIdx((cur) => (cur === i ? null : i))}
        />
      );
    }
    return <Wrapper />;
  },
  args: {
    rows: QUALI_ROWS,
    teamName: "Mercedes",
    equalCarPerformance: false,
    showSetup: true,
  },
};

export const NoSetupData: Story = {
  args: {
    rows: [{ lapNum: 1, lapMs: 91510, s1Ms: 28330, s2Ms: 35610, s3Ms: 27570, setup: null }],
    teamName: "Mercedes",
    equalCarPerformance: false,
    showSetup: true,
    openSetupRowIndex: 0,
    setupPopoverPosition: { left: 60, top: 90 },
  },
};

export const AwaitingLapData: Story = {
  args: {
    rows: [],
    teamName: "Mercedes",
    equalCarPerformance: true,
  },
};
