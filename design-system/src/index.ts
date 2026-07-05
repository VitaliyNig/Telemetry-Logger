// Telemetry Logger design system — public entry point.
// Styles (tokens + component CSS) ship separately via "./styles.css".

export { Button } from "./components/Button/Button";
export type { ButtonProps, ButtonVariant, ButtonSize } from "./components/Button/Button";

export { ToggleSwitch } from "./components/ToggleSwitch/ToggleSwitch";
export type { ToggleSwitchProps } from "./components/ToggleSwitch/ToggleSwitch";

export { TabNav } from "./components/TabNav/TabNav";
export type { TabNavProps, TabItem } from "./components/TabNav/TabNav";

export { ConnectionPill } from "./components/ConnectionPill/ConnectionPill";
export type {
  ConnectionPillProps,
  ConnectionState,
} from "./components/ConnectionPill/ConnectionPill";

export { Select } from "./components/Select/Select";
export type { SelectProps, SelectOption } from "./components/Select/Select";

export { Badge } from "./components/Badge/Badge";
export type { BadgeProps, BadgeVariant } from "./components/Badge/Badge";

export { SettingRow } from "./components/SettingRow/SettingRow";
export type { SettingRowProps } from "./components/SettingRow/SettingRow";

export { WidgetShell } from "./components/WidgetShell/WidgetShell";
export type { WidgetShellProps } from "./components/WidgetShell/WidgetShell";

export { TyreCompoundBadge } from "./components/TyreCompoundBadge/TyreCompoundBadge";
export type {
  TyreCompoundBadgeProps,
  TyreCompoundVariant,
  TyreCompoundShape,
  TyreCompoundSize,
} from "./components/TyreCompoundBadge/TyreCompoundBadge";

export { GaugeBar } from "./components/GaugeBar/GaugeBar";
export type { GaugeBarProps, GaugeBarTone } from "./components/GaugeBar/GaugeBar";

export { DeltaDisplay } from "./components/DeltaDisplay/DeltaDisplay";
export type { DeltaDisplayProps, DeltaMode, DeltaGoodWhen } from "./components/DeltaDisplay/DeltaDisplay";

export { StatBox, StatGrid } from "./components/StatBox/StatBox";
export type { StatBoxProps, StatGridProps } from "./components/StatBox/StatBox";

export { EventBadge } from "./components/EventBadge/EventBadge";
export type { EventBadgeProps, EventCode } from "./components/EventBadge/EventBadge";

export { Popover } from "./components/Popover/Popover";
export type { PopoverProps, PopoverPlacement } from "./components/Popover/Popover";

export { Damage } from "./components/Damage/Damage";
export type { DamageProps, DamageValues } from "./components/Damage/Damage";

export { Weather } from "./components/Weather/Weather";
export type { WeatherProps, WeatherForecastSample } from "./components/Weather/Weather";

export { PitStopTimer } from "./components/PitStopTimer/PitStopTimer";
export type { PitStopTimerProps, PitStopHistoryRow } from "./components/PitStopTimer/PitStopTimer";

export { TopSpeed } from "./components/TopSpeed/TopSpeed";
export type { TopSpeedProps, TopSpeedRow } from "./components/TopSpeed/TopSpeed";

export { TopSpeedCompare } from "./components/TopSpeedCompare/TopSpeedCompare";
export type { TopSpeedCompareProps } from "./components/TopSpeedCompare/TopSpeedCompare";

export { Standings } from "./components/Standings/Standings";
export type { StandingsProps, StandingsRow } from "./components/Standings/Standings";

export { GapBoard } from "./components/GapBoard/GapBoard";
export type { GapBoardProps, GapBoardDriver } from "./components/GapBoard/GapBoard";

export { FuelErs } from "./components/FuelErs/FuelErs";
export type { FuelErsProps } from "./components/FuelErs/FuelErs";

export { PitPredictor } from "./components/PitPredictor/PitPredictor";
export type { PitPredictorProps, PitPredictorTrafficCar, PitPredictorDamage } from "./components/PitPredictor/PitPredictor";

export { Session } from "./components/Session/Session";
export type { SessionProps, TempTrend, FlagColor } from "./components/Session/Session";

export { Telemetry26 } from "./components/Telemetry26/Telemetry26";
export type { Telemetry26Props } from "./components/Telemetry26/Telemetry26";

export { TyreSets } from "./components/TyreSets/TyreSets";
export type { TyreSetsProps, TyreSetItem } from "./components/TyreSets/TyreSets";

export { Tyres } from "./components/Tyres/Tyres";
export type { TyresProps } from "./components/Tyres/Tyres";

export { CarTelemetry } from "./components/CarTelemetry/CarTelemetry";
export type { CarTelemetryProps } from "./components/CarTelemetry/CarTelemetry";

export { LapData } from "./components/LapData/LapData";
export type { LapDataProps, LapDataReading, LapDataMiniLapRow } from "./components/LapData/LapData";

export { EventsCard } from "./components/EventsCard/EventsCard";
export type { EventsCardProps, EventsCardEntry } from "./components/EventsCard/EventsCard";

export { GapRing } from "./components/GapRing/GapRing";
export type { GapRingProps, GapRingDriver } from "./components/GapRing/GapRing";

export { QualiStandings } from "./components/QualiStandings/QualiStandings";
export type { QualiStandingsProps, QualiStandingsRow } from "./components/QualiStandings/QualiStandings";

export { LapTimesCard } from "./components/LapTimesCard/LapTimesCard";
export type {
  LapTimesCardProps,
  LapTimesRow,
  LapTimesTyreInfo,
  LapTimesSetup,
} from "./components/LapTimesCard/LapTimesCard";

export { SettingsScreen } from "./components/SettingsScreen/SettingsScreen";
export type {
  SettingsScreenProps,
  SettingsScreenValues,
  UdpFormatOption,
  GameVersion,
  AutoConfigureStatus,
} from "./components/SettingsScreen/SettingsScreen";

export { PacketStats } from "./components/PacketStats/PacketStats";
export type { PacketStatsProps } from "./components/PacketStats/PacketStats";

export { DebugConsole } from "./components/DebugConsole/DebugConsole";
export type { DebugConsoleProps, DebugConsoleEntry } from "./components/DebugConsole/DebugConsole";

export { DrsZonesTable } from "./components/DrsZonesTable/DrsZonesTable";
export type { DrsZonesTableProps, DrsZoneTrack } from "./components/DrsZonesTable/DrsZonesTable";

export { HistorySessionList } from "./components/HistorySessionList/HistorySessionList";
export type {
  HistorySessionListProps,
  HistoryWeekend,
  HistorySessionSummary,
  HistoryFilters,
} from "./components/HistorySessionList/HistorySessionList";

export { HistoryDetailShell } from "./components/HistoryDetailShell/HistoryDetailShell";
export type { HistoryDetailShellProps, HistorySubTab } from "./components/HistoryDetailShell/HistoryDetailShell";

export { HistoryLapTimesGrid } from "./components/HistoryLapTimesGrid/HistoryLapTimesGrid";
export type {
  HistoryLapTimesGridProps,
  LapTimesCategory,
  HistoryLapTimesDriver,
  HistoryLapTimesLap,
  HistoryLapTimesPerf,
} from "./components/HistoryLapTimesGrid/HistoryLapTimesGrid";

export { HistoryEventsTable, DEFAULT_HISTORY_EVENTS_CODE_FILTER } from "./components/HistoryEventsTable/HistoryEventsTable";
export type {
  HistoryEventsTableProps,
  HistoryEventsRow,
  HistoryEventsCodeFilter,
} from "./components/HistoryEventsTable/HistoryEventsTable";

export { HistoryLapChart } from "./components/HistoryLapChart/HistoryLapChart";
export type {
  HistoryLapChartProps,
  HistoryLapChartDriver,
  HistoryLapChartLap,
  HistoryLapChartFlagSpan,
  LapChartFlag,
} from "./components/HistoryLapChart/HistoryLapChart";

export { TelemetryChartStack } from "./components/TelemetryChartStack/TelemetryChartStack";
export type {
  TelemetryChartStackProps,
  ChartStackMetricKey,
  ChartStackSample,
  ChartStackDriver,
} from "./components/TelemetryChartStack/TelemetryChartStack";

export { TrackMap3D } from "./components/TrackMap3D/TrackMap3D";
export type {
  TrackMap3DProps,
  TrackMap3DCenterlinePoint,
  TrackMap3DGeometry,
  TrackMap3DMotionSample,
  TrackMap3DDriver,
  TrackMap3DDominanceRun,
  TrackMap3DOverlayMode,
  TrackMap3DSyncMode,
} from "./components/TrackMap3D/TrackMap3D";

export { CompareLapPicker } from "./components/CompareLapPicker/CompareLapPicker";
export type {
  CompareLapPickerProps,
  CompareLapPickerDriver,
  CompareLapPickerLap,
  CompareLapPickerSelection,
} from "./components/CompareLapPicker/CompareLapPicker";

export { SectorBadgesToolbar } from "./components/SectorBadgesToolbar/SectorBadgesToolbar";
export type {
  SectorBadgesToolbarProps,
  SectorBadgesToolbarDeltaMode,
  SectorBadgesToolbarSplit,
  SectorBadgesToolbarChipMode,
  SectorBadgesToolbarZoomRange,
  SectorBadgesToolbarSegment,
  SectorBadgesToolbarChannel,
} from "./components/SectorBadgesToolbar/SectorBadgesToolbar";

export { TransportControls } from "./components/TransportControls/TransportControls";
export type { TransportControlsProps, TransportControlsSpeed } from "./components/TransportControls/TransportControls";

export { CompareModeToggle } from "./components/CompareModeToggle/CompareModeToggle";
export type { CompareModeToggleProps, CompareLayoutMode } from "./components/CompareModeToggle/CompareModeToggle";

export { FocusPanel } from "./components/FocusPanel/FocusPanel";
export type { FocusPanelProps, FocusPanelDriver, FocusPanelDriverSample } from "./components/FocusPanel/FocusPanel";

export { MapDeltaOverlay } from "./components/MapDeltaOverlay/MapDeltaOverlay";
export type { MapDeltaOverlayProps } from "./components/MapDeltaOverlay/MapDeltaOverlay";

export { TopLossZones } from "./components/TopLossZones/TopLossZones";
export type {
  TopLossZonesProps,
  TopLossZonesZone,
  TopLossZonesFact,
  TopLossZonesFactTone,
} from "./components/TopLossZones/TopLossZones";

export { TelemetryCompareScreen } from "./components/TelemetryCompareScreen/TelemetryCompareScreen";
export type { TelemetryCompareScreenProps } from "./components/TelemetryCompareScreen/TelemetryCompareScreen";
