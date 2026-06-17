import type { Meta, StoryObj } from "@storybook/react-vite";
import { WidgetShell } from "./WidgetShell";

const meta: Meta<typeof WidgetShell> = {
  title: "Layout/WidgetShell",
  component: WidgetShell,
  decorators: [
    (Story) => (
      <div
        style={{
          width: 320,
          height: 220,
          border: "1px solid var(--color-border-default)",
          borderRadius: "var(--radius-md)",
          background: "var(--color-bg-card)",
          overflow: "hidden",
        }}
      >
        {Story()}
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof WidgetShell>;

export const Default: Story = {
  args: {
    title: "Car Telemetry",
    widgetId: "telemetry",
    onClose: () => {},
    children: (
      <div style={{ padding: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>
        Widget body content goes here.
      </div>
    ),
  },
};

export const WithHeaderControl: Story = {
  args: {
    title: "Events",
    widgetId: "events",
    onClose: () => {},
    headerExtra: (
      <button
        className="widget-close-btn"
        title="Filter events"
        style={{ fontSize: 12 }}
      >
        ⛢
      </button>
    ),
    children: (
      <div style={{ padding: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>
        Filterable event log.
      </div>
    ),
  },
};

export const NotDraggable: Story = {
  args: {
    title: "Session",
    draggable: false,
    children: (
      <div style={{ padding: 16, color: "var(--color-text-secondary)", fontSize: 13 }}>
        No drag handle, no close button.
      </div>
    ),
  },
};
