import { SettingRow } from "../SettingRow/SettingRow";
import { Select } from "../Select/Select";
import { ToggleSwitch } from "../ToggleSwitch/ToggleSwitch";
import { Badge } from "../Badge/Badge";
import { Button } from "../Button/Button";

export interface UdpFormatOption {
  token: string;
  /** Plugin display name already embeds the format identifier, e.g. "F1 25 (format 2025)". */
  name: string;
}

export interface SettingsScreenValues {
  udpListenIp: string;
  udpListenPort: number;
  /** "" = Auto (newest available). */
  udpFormat: string;
  webPort: number;
  autoSwitchPreset: boolean;
  enableSessionLogging: boolean;
  /** "" = default `Logs/` folder. */
  historyFolder: string;
  debugMode: boolean;
}

export type GameVersion = "f1_25" | "f1_26";

export interface AutoConfigureStatus {
  state: "pending" | "ok" | "err";
  message: string;
}

export interface SettingsScreenProps {
  values: SettingsScreenValues;
  onUdpListenIpChange: (value: string) => void;
  onUdpListenPortChange: (value: number) => void;
  onUdpFormatChange: (value: string) => void;
  onWebPortChange: (value: number) => void;
  onAutoSwitchPresetChange: (value: boolean) => void;
  onEnableSessionLoggingChange: (value: boolean) => void;
  onHistoryFolderChange: (value: string) => void;
  onDebugModeChange: (value: boolean) => void;

  udpFormatOptions: UdpFormatOption[];
  /** Memo table's "UDP Format" cell — the active token, or the newest available when on Auto. */
  recommendedFormatToken: string;

  webPortRestartRequired?: boolean;

  historyFolderResolved?: string | null;
  historyFolderError?: string | null;
  historyFolderBrowsing?: boolean;
  onBrowseHistoryFolder?: () => void;
  onResetHistoryFolder?: () => void;

  gameVersion: GameVersion;
  onGameVersionChange: (value: GameVersion) => void;
  onAutoConfigureUdp: () => void;
  autoConfigureDisabled?: boolean;
  autoConfigureStatus?: AutoConfigureStatus | null;

  className?: string;
}

/** Mirrors `panel-settings` — UDP connection, game telemetry memo, web server, dashboard, history, and developer groups. */
export function SettingsScreen({
  values,
  onUdpListenIpChange,
  onUdpListenPortChange,
  onUdpFormatChange,
  onWebPortChange,
  onAutoSwitchPresetChange,
  onEnableSessionLoggingChange,
  onHistoryFolderChange,
  onDebugModeChange,
  udpFormatOptions,
  recommendedFormatToken,
  webPortRestartRequired = false,
  historyFolderResolved,
  historyFolderError,
  historyFolderBrowsing = false,
  onBrowseHistoryFolder,
  onResetHistoryFolder,
  gameVersion,
  onGameVersionChange,
  onAutoConfigureUdp,
  autoConfigureDisabled = false,
  autoConfigureStatus,
  className,
}: SettingsScreenProps) {
  const hasCustomHistoryFolder = values.historyFolder.trim().length > 0;

  return (
    <div className={["settings-scroll", className ?? ""].filter(Boolean).join(" ")}>
      <div className="settings-container">
        <h2>Settings</h2>

        <div className="settings-group">
          <h3>UDP Connection</h3>
          <SettingRow
            label="UDP Listen IP"
            htmlFor="udpListenIp"
            hint={<>Network interface to listen on. <code>0.0.0.0</code> = all interfaces.</>}
          >
            <input
              type="text"
              id="udpListenIp"
              value={values.udpListenIp}
              placeholder="0.0.0.0"
              onChange={(e) => onUdpListenIpChange(e.target.value)}
            />
          </SettingRow>
          <SettingRow
            label="UDP Listen Port"
            htmlFor="udpListenPort"
            hint={<>Must match the port configured in F1 25 game settings. Default: <code>20777</code></>}
          >
            <input
              type="number"
              id="udpListenPort"
              value={values.udpListenPort}
              min={1}
              max={65535}
              onChange={(e) => onUdpListenPortChange(Number(e.target.value))}
            />
          </SettingRow>
          <SettingRow
            label="UDP Format"
            htmlFor="udpFormatSelect"
            hint={<>Which packet format the host expects. <code>2026</code> covers the F1 25: 2026 Season Pack.</>}
          >
            <Select
              id="udpFormatSelect"
              value={values.udpFormat}
              onChange={(e) => onUdpFormatChange(e.target.value)}
            >
              <option value="">Auto (newest available)</option>
              {udpFormatOptions.map((f) => (
                <option key={f.token} value={f.token} title={`${f.name} (UDP format ${f.token})`}>
                  {f.name}
                </option>
              ))}
            </Select>
          </SettingRow>
        </div>

        <div className="settings-group">
          <h3>Game telemetry settings</h3>
          <p className="game-settings-memo-intro">
            Recommended values in the game's telemetry settings so this app receives data correctly.
          </p>
          <div className="game-settings-memo-wrap">
            <table className="game-settings-memo" aria-label="Recommended F1 game telemetry settings">
              <thead>
                <tr>
                  <th scope="col">Setting</th>
                  <th scope="col">Recommended value</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>UDP Telemetry</td><td>On</td></tr>
                <tr><td>UDP Broadcast Mode</td><td>On</td></tr>
                <tr><td>UDP IP Address</td><td>—</td></tr>
                <tr><td>UDP Port</td><td>20777</td></tr>
                <tr><td>UDP Send Rate</td><td>60 Hz</td></tr>
                <tr><td>UDP Format</td><td>{recommendedFormatToken}</td></tr>
                <tr><td>Your Telemetry</td><td>Public</td></tr>
                <tr><td>Show player names</td><td>On</td></tr>
              </tbody>
            </table>
          </div>
          <div className="game-settings-auto">
            <div className="game-settings-auto-row">
              <Select
                className="game-version-select"
                aria-label="Game version"
                value={gameVersion}
                onChange={(e) => onGameVersionChange(e.target.value as GameVersion)}
              >
                <option value="f1_25">F1 25</option>
                <option value="f1_26">F1 26</option>
              </Select>
              <button
                type="button"
                className="btn-auto-configure"
                onClick={onAutoConfigureUdp}
                disabled={autoConfigureDisabled}
              >
                Auto-configure
              </button>
            </div>
            <span className="setting-hint">
              Writes these values directly to the selected game's <code>hardware_settings_config.xml</code>.{" "}
              <strong>Close the game before applying</strong> — otherwise it will overwrite the file on exit.
            </span>
            {autoConfigureStatus && (
              <span className={`auto-configure-status is-${autoConfigureStatus.state}`}>
                {autoConfigureStatus.message}
              </span>
            )}
          </div>
        </div>

        <div className="settings-group">
          <h3>Web Server</h3>
          <SettingRow
            label="Web Port"
            htmlFor="webPort"
            hint={<>Local web server port. <strong>Requires restart</strong> on change.</>}
          >
            <div className="setting-input-row">
              <input
                type="number"
                id="webPort"
                value={values.webPort}
                min={1}
                max={65535}
                onChange={(e) => onWebPortChange(Number(e.target.value))}
              />
              {webPortRestartRequired && (
                <Badge variant="warning" title="Restart the app to apply this change">
                  Restart required
                </Badge>
              )}
            </div>
          </SettingRow>
        </div>

        <div className="settings-group">
          <h3>Dashboard</h3>
          <SettingRow
            layout="toggle"
            label="Auto-switch Preset"
            htmlFor="autoSwitchPreset"
            hint="Automatically switch layout preset when session type changes (Practice / Qualifying / Race)."
          >
            <ToggleSwitch
              id="autoSwitchPreset"
              checked={values.autoSwitchPreset}
              onChange={(e) => onAutoSwitchPresetChange(e.target.checked)}
            />
          </SettingRow>
        </div>

        <div className="settings-group">
          <h3>History</h3>
          <SettingRow
            layout="toggle"
            label="Session Logging"
            htmlFor="enableSessionLogging"
            hint="Record session data to the History folder. Disabling stops recording but Live mode continues to work."
          >
            <ToggleSwitch
              id="enableSessionLogging"
              checked={values.enableSessionLogging}
              onChange={(e) => onEnableSessionLoggingChange(e.target.checked)}
            />
          </SettingRow>
          <div className="setting-row">
            <label htmlFor="historyFolderInput">History Folder</label>
            <div className="setting-input-row history-folder-input-row">
              <input
                type="text"
                id="historyFolderInput"
                value={values.historyFolder}
                placeholder="Logs (default)"
                autoComplete="off"
                spellCheck={false}
                onChange={(e) => onHistoryFolderChange(e.target.value)}
              />
              <Button variant="secondary" size="small" onClick={onBrowseHistoryFolder} disabled={historyFolderBrowsing}>
                Browse…
              </Button>
              {hasCustomHistoryFolder && (
                <Button variant="secondary" size="small" onClick={onResetHistoryFolder}>
                  Reset
                </Button>
              )}
            </div>
            <span className="setting-hint">
              Persisted root for reading <strong>and</strong> writing session logs. Leave blank for the default{" "}
              <code>Logs/</code> folder. Existing recordings stay where they are — only future sessions land in the
              new location.
            </span>
            {historyFolderResolved && (
              <span className="setting-hint history-folder-resolved">Resolved: {historyFolderResolved}</span>
            )}
            {historyFolderError && <span className="setting-hint history-folder-error">{historyFolderError}</span>}
          </div>
        </div>

        <div className="settings-group">
          <h3>Developer</h3>
          <SettingRow
            layout="toggle"
            label="Debug Mode"
            htmlFor="debugMode"
            hint="Enables the Debug tab with packet inspection and logging."
          >
            <ToggleSwitch
              id="debugMode"
              checked={values.debugMode}
              onChange={(e) => onDebugModeChange(e.target.checked)}
            />
          </SettingRow>
        </div>
      </div>
    </div>
  );
}
