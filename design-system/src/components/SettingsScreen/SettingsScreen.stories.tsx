import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import {
  SettingsScreen,
  type SettingsScreenValues,
  type AutoConfigureStatus,
  type GameVersion,
} from "./SettingsScreen";

const meta: Meta<typeof SettingsScreen> = {
  title: "Screens/SettingsScreen",
  component: SettingsScreen,
  decorators: [
    (Story) => (
      <div style={{ width: 720, height: 700, border: "1px solid var(--color-border-default)", borderRadius: "var(--radius-md)", background: "var(--color-bg-base)", overflow: "auto" }}>
        <Story />
      </div>
    ),
  ],
};
export default meta;

type Story = StoryObj<typeof SettingsScreen>;

const UDP_FORMAT_OPTIONS = [
  { token: "2025", name: "F1 25 (format 2025)" },
  { token: "2026", name: "F1 25: 2026 Season Pack (format 2026)" },
];

const DEFAULT_VALUES: SettingsScreenValues = {
  udpListenIp: "0.0.0.0",
  udpListenPort: 20777,
  udpFormat: "",
  webPort: 5000,
  autoSwitchPreset: true,
  enableSessionLogging: true,
  historyFolder: "",
  debugMode: false,
};

function InteractiveWrapper({
  initialValues,
  initialGameVersion = "f1_25",
  initialAutoConfigureStatus = null,
  historyFolderResolved,
  historyFolderError,
  webPortRestartRequired,
}: {
  initialValues: SettingsScreenValues;
  initialGameVersion?: GameVersion;
  initialAutoConfigureStatus?: AutoConfigureStatus | null;
  historyFolderResolved?: string | null;
  historyFolderError?: string | null;
  webPortRestartRequired?: boolean;
}) {
  const [values, setValues] = useState(initialValues);
  const [gameVersion, setGameVersion] = useState<GameVersion>(initialGameVersion);
  const [autoConfigureStatus, setAutoConfigureStatus] = useState(initialAutoConfigureStatus);
  const [busy, setBusy] = useState(false);

  function set<K extends keyof SettingsScreenValues>(key: K, value: SettingsScreenValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <SettingsScreen
      values={values}
      onUdpListenIpChange={(v) => set("udpListenIp", v)}
      onUdpListenPortChange={(v) => set("udpListenPort", v)}
      onUdpFormatChange={(v) => set("udpFormat", v)}
      onWebPortChange={(v) => set("webPort", v)}
      onAutoSwitchPresetChange={(v) => set("autoSwitchPreset", v)}
      onEnableSessionLoggingChange={(v) => set("enableSessionLogging", v)}
      onHistoryFolderChange={(v) => set("historyFolder", v)}
      onDebugModeChange={(v) => set("debugMode", v)}
      udpFormatOptions={UDP_FORMAT_OPTIONS}
      recommendedFormatToken={values.udpFormat || "2026"}
      webPortRestartRequired={webPortRestartRequired ?? values.webPort !== DEFAULT_VALUES.webPort}
      historyFolderResolved={historyFolderResolved}
      historyFolderError={historyFolderError}
      historyFolderBrowsing={busy}
      onBrowseHistoryFolder={() => {
        setBusy(true);
        setTimeout(() => {
          set("historyFolder", "D:\\F1 Telemetry Logs");
          setBusy(false);
        }, 600);
      }}
      onResetHistoryFolder={() => set("historyFolder", "")}
      gameVersion={gameVersion}
      onGameVersionChange={setGameVersion}
      onAutoConfigureUdp={() => {
        setAutoConfigureStatus({ state: "pending", message: "Applying…" });
        setTimeout(() => {
          setAutoConfigureStatus({ state: "ok", message: "Applied to F1 25: 127.0.0.1:20777 (format 2026)" });
        }, 700);
      }}
      autoConfigureStatus={autoConfigureStatus}
    />
  );
}

export const Default: Story = {
  render: () => <InteractiveWrapper initialValues={DEFAULT_VALUES} />,
};

export const CustomHistoryFolder: Story = {
  render: () => (
    <InteractiveWrapper
      initialValues={{ ...DEFAULT_VALUES, historyFolder: "D:\\F1 Telemetry Logs" }}
      historyFolderResolved="D:\F1 Telemetry Logs"
    />
  ),
};

export const HistoryFolderError: Story = {
  render: () => (
    <InteractiveWrapper
      initialValues={{ ...DEFAULT_VALUES, historyFolder: "Z:\\nonexistent" }}
      historyFolderError="Folder does not exist (Z:\nonexistent)"
    />
  ),
};

export const WebPortRestartRequired: Story = {
  render: () => <InteractiveWrapper initialValues={{ ...DEFAULT_VALUES, webPort: 5050 }} webPortRestartRequired />,
};

export const AutoConfigureSuccess: Story = {
  render: () => (
    <InteractiveWrapper
      initialValues={DEFAULT_VALUES}
      initialAutoConfigureStatus={{ state: "ok", message: "Applied to F1 25: 127.0.0.1:20777 (format 2026)" }}
    />
  ),
};

export const AutoConfigureError: Story = {
  render: () => (
    <InteractiveWrapper
      initialValues={DEFAULT_VALUES}
      initialAutoConfigureStatus={{ state: "err", message: "Close the game before applying." }}
    />
  ),
};
