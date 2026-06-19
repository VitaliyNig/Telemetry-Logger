import type { Meta, StoryObj } from "@storybook/react-vite";
import { FuelErs } from "./FuelErs";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof FuelErs> = {
  title: "Widgets/FuelErs",
  component: FuelErs,
  decorators: [
    (Story) => (
      <div style={{ width: 360, height: 220, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Fuel &amp; ERS" widgetId="fuelErs">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FuelErs>;

// Real CarStatus snapshot for carIdx 2 (Sviter, the player) late in the
// Singapore race. `ersHarvestLimitPerLap` is absent on this format-2025
// packet, so the widget falls back to the legacy MGU-K-only 2 MJ/lap cap.
export const Default: Story = {
  args: {
    fuelMix: 1,
    fuelInTank: 2.611706,
    fuelRemainingLaps: 1.5804852,
    isRaceSession: true,
    ersDeployMode: 1,
    ersStoreEnergy: 1911913.1,
    ersDeployedThisLap: 1878.2264,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 781730.3,
    ersHarvestedThisLapMguH: 111665.9,
  },
};

// Real snapshot from another car (carIdx 15) running Overtake mode with
// near-maxed store/deploy/harvest bars.
export const OvertakeMode: Story = {
  args: {
    fuelMix: 1,
    fuelInTank: 6.414726,
    fuelRemainingLaps: 3.5818624,
    isRaceSession: true,
    ersDeployMode: 3,
    ersStoreEnergy: 2461853.5,
    ersDeployedThisLap: 2114252,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 2000679.9,
    ersHarvestedThisLapMguH: 1614918.2,
  },
};

// Real snapshot from carIdx 19 — fuel delta below -0.3 laps, crosses into
// the "critical" (red) threshold.
export const FuelCritical: Story = {
  args: {
    fuelMix: 1,
    fuelInTank: 13.568903,
    fuelRemainingLaps: -0.33003855,
    isRaceSession: true,
    ersDeployMode: 0,
    ersStoreEnergy: 1904761.9,
    ersDeployedThisLap: 0,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 537314.8,
    ersHarvestedThisLapMguH: 48073.145,
  },
};

export const QualifyingNoDelta: Story = {
  args: {
    fuelMix: 2,
    fuelInTank: 25.4,
    fuelRemainingLaps: 0,
    isRaceSession: false,
    ersDeployMode: 2,
    ersStoreEnergy: 3800000,
    ersDeployedThisLap: 0,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 0,
    ersHarvestedThisLapMguH: 0,
  },
};
