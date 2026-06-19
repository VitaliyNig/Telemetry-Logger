import type { Meta, StoryObj } from "@storybook/react-vite";
import { Weather } from "./Weather";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Weather> = {
  title: "Widgets/Weather",
  component: Weather,
  decorators: [
    (Story) => (
      <div style={{ width: 420, height: 180, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Weather Forecast" widgetId="weather">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Weather>;

// Real weatherForecastSamples from the Singapore race (sessionType 15) — a storm
// (90%+ rain, weather=5/6) clearing to light cloud by +60m. `weather: 6` has no
// name in the game's enum, which is exactly why the "Unknown"/❓ fallback exists.
export const RaceStormClearing: Story = {
  args: {
    forecastAccuracy: 1,
    samples: [
      { weather: 5, timeOffset: 0, rainPercentage: 91, trackTemperature: 25, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 5, timeOffset: 5, rainPercentage: 94, trackTemperature: 24, trackTemperatureChange: 1, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 6, timeOffset: 10, rainPercentage: 90, trackTemperature: 23, trackTemperatureChange: 1, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 5, timeOffset: 15, rainPercentage: 93, trackTemperature: 23, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 3, timeOffset: 30, rainPercentage: 73, trackTemperature: 27, trackTemperatureChange: 0, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 1, timeOffset: 45, rainPercentage: 15, trackTemperature: 28, trackTemperatureChange: 0, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 2, timeOffset: 60, rainPercentage: 23, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
    ],
  },
};

// Real qualifying forecast (sessionType 5) — dry and stable throughout.
export const QualifyingDry: Story = {
  args: {
    forecastAccuracy: 1,
    samples: [
      { weather: 1, timeOffset: 0, rainPercentage: 8, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 0, timeOffset: 5, rainPercentage: 3, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 0, timeOffset: 10, rainPercentage: 1, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 0, timeOffset: 15, rainPercentage: 2, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
      { weather: 1, timeOffset: 20, rainPercentage: 5, trackTemperature: 28, trackTemperatureChange: 2, airTemperature: 25, airTemperatureChange: 2 },
    ],
  },
};

export const NoForecast: Story = { args: { forecastAccuracy: 1, samples: [] } };
