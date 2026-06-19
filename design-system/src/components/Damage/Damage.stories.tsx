import type { Meta, StoryObj } from "@storybook/react-vite";
import { Damage } from "./Damage";
import { WidgetShell } from "../WidgetShell/WidgetShell";

const meta: Meta<typeof Damage> = {
  title: "Widgets/Damage",
  component: Damage,
  decorators: [
    (Story) => (
      <div style={{ width: 320, height: 220, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-card)", overflow: "hidden" }}>
        <WidgetShell title="Damage" widgetId="damage">
          <Story />
        </WidgetShell>
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof Damage>;

// Real CarDamage snapshot for carIdx 2 (Sviter, the recorded player) at the
// end of the Singapore race — light wear, no wing/floor damage.
export const Default: Story = {
  args: {
    damage: { frontLeftWing: 0, frontRightWing: 0, rearWing: 0, floor: 0, engine: 7, gearbox: 5 },
  },
};

// Real CarDamage snapshot for carIdx 3 in the same race — a heavy rear-wing
// hit (66%) shows the danger threshold (>50%, red).
export const Damaged: Story = {
  args: {
    damage: { frontLeftWing: 0, frontRightWing: 0, rearWing: 66, floor: 0, engine: 6, gearbox: 3 },
  },
};
