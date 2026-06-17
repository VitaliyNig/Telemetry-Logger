import type { Meta, StoryObj } from "@storybook/react-vite";
import { SettingRow } from "./SettingRow";
import { Select } from "../Select/Select";
import { ToggleSwitch } from "../ToggleSwitch/ToggleSwitch";

const meta: Meta<typeof SettingRow> = {
  title: "Primitives/SettingRow",
  component: SettingRow,
  decorators: [(Story) => <div style={{ width: 460 }}>{Story()}</div>],
};
export default meta;

type Story = StoryObj<typeof SettingRow>;

export const TextInput: Story = {
  render: () => (
    <SettingRow
      label="UDP Listen Port"
      htmlFor="udpPort"
      hint={
        <>
          Must match the port configured in game settings. Default: <code>20777</code>
        </>
      }
    >
      <input id="udpPort" type="number" defaultValue={20777} />
    </SettingRow>
  ),
};

export const WithSelect: Story = {
  render: () => (
    <SettingRow label="UDP Format" htmlFor="fmt" hint="Which packet format the host expects.">
      <Select
        id="fmt"
        options={[
          { value: "", label: "Auto (newest available)" },
          { value: "2026", label: "2026 Season Pack" },
        ]}
      />
    </SettingRow>
  ),
};

export const ToggleLayout: Story = {
  render: () => (
    <SettingRow
      label="Auto-switch Preset"
      layout="toggle"
      hint="Automatically switch layout preset when session type changes."
    >
      <ToggleSwitch defaultChecked />
    </SettingRow>
  ),
};
