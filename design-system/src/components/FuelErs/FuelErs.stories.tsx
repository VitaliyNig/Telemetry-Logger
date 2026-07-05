import type { Meta, StoryObj } from "@storybook/react-vite";
import { FuelErs } from "./FuelErs";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof FuelErs> = {
  title: "Widgets/FuelErs",
  component: FuelErs,
  decorators: [
    (Story) => (
      <div style={{ width: 360, height: 240, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Fuel &amp; ERS" widgetId="fuelErs">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof FuelErs>;

// --- F1 26 (formula 13): MGU-H removed, harvest budget from the packet, deploy/lap
// auto-scaled to the session peak (passed via deployCapMJ). ---

// Overtake/Boost mode, near-maxed harvest budget.
export const F1_26_Boost: Story = {
  args: {
    formula: 13,
    fuelMix: 1,
    fuelInTank: 44.8,
    fuelRemainingLaps: 2.1,
    isRaceSession: true,
    ersDeployMode: 3,
    ersStoreEnergy: 2.48e6,
    ersDeployedThisLap: 5.4e6,
    ersHarvestLimitPerLap: 5.9e6,
    ersHarvestedThisLapMguK: 5.45e6,
    ersHarvestedThisLapMguH: 0,
    deployCapMJ: 5.9,
  },
};

export const F1_26_FuelSave: Story = {
  args: {
    formula: 13,
    fuelMix: 0,
    fuelInTank: 52.0,
    fuelRemainingLaps: 0.8,
    isRaceSession: true,
    ersDeployMode: 1,
    ersStoreEnergy: 3.6e6,
    ersDeployedThisLap: 2.2e6,
    ersHarvestLimitPerLap: 5.9e6,
    ersHarvestedThisLapMguK: 3.2e6,
    ersHarvestedThisLapMguH: 0,
    deployCapMJ: 5.9,
  },
};

// Fuel delta below -0.3 laps → critical (red) verdict.
export const F1_26_FuelCritical: Story = {
  args: {
    formula: 13,
    fuelMix: 2,
    fuelInTank: 13.5,
    fuelRemainingLaps: -0.33,
    isRaceSession: true,
    ersDeployMode: 0,
    ersStoreEnergy: 0.32e6,
    ersDeployedThisLap: 0,
    ersHarvestLimitPerLap: 5.9e6,
    ersHarvestedThisLapMguK: 0.5e6,
    ersHarvestedThisLapMguH: 0,
    deployCapMJ: 5.9,
  },
};

// --- F1 25 (formula 0): MGU-K capped at 2 MJ/lap, MGU-H shown as a bonus. ---

// Real snapshot — Overtake mode, MGU-K harvest maxed (bar turns red).
export const F1_25_Overtake: Story = {
  args: {
    formula: 0,
    fuelMix: 1,
    fuelInTank: 6.41,
    fuelRemainingLaps: 3.58,
    isRaceSession: true,
    ersDeployMode: 3,
    ersStoreEnergy: 2.46e6,
    ersDeployedThisLap: 2.11e6,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 2.0e6,
    ersHarvestedThisLapMguH: 1.61e6,
  },
};

export const F1_25_Default: Story = {
  args: {
    formula: 0,
    fuelMix: 1,
    fuelInTank: 2.61,
    fuelRemainingLaps: 1.58,
    isRaceSession: true,
    ersDeployMode: 1,
    ersStoreEnergy: 1.91e6,
    ersDeployedThisLap: 1.88e6,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 0.78e6,
    ersHarvestedThisLapMguH: 0.11e6,
  },
};

// --- F2 (formula 2): no ERS — fuel only. ---
export const F2_NoErs: Story = {
  args: {
    formula: 2,
    fuelMix: 1,
    fuelInTank: 38.0,
    fuelRemainingLaps: 1.2,
    isRaceSession: true,
    ersDeployMode: 0,
    ersStoreEnergy: 0,
    ersDeployedThisLap: 0,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 0,
    ersHarvestedThisLapMguH: 0,
  },
};

// Non-race session: fuel delta/verdict hidden (no race target).
export const QualifyingNoDelta: Story = {
  args: {
    formula: 0,
    fuelMix: 2,
    fuelInTank: 25.4,
    fuelRemainingLaps: 0,
    isRaceSession: false,
    ersDeployMode: 2,
    ersStoreEnergy: 3.8e6,
    ersDeployedThisLap: 0,
    ersHarvestLimitPerLap: 0,
    ersHarvestedThisLapMguK: 0,
    ersHarvestedThisLapMguH: 0,
  },
};
