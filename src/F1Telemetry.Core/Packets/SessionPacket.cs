namespace F1Telemetry.Packets;

public sealed class MarshalZone
{
    public float ZoneStart { get; set; }
    public sbyte ZoneFlag { get; set; }
}

public sealed class WeatherForecastSample
{
    public byte SessionType { get; set; }
    public byte TimeOffset { get; set; }
    public byte Weather { get; set; }
    public sbyte TrackTemperature { get; set; }
    public sbyte TrackTemperatureChange { get; set; }
    public sbyte AirTemperature { get; set; }
    public sbyte AirTemperatureChange { get; set; }
    public byte RainPercentage { get; set; }
}

/// <summary>Active aero zone (added in packet format 2026). Empty array in 2025 logs.</summary>
public sealed class ActiveAeroZone
{
    public float ZoneStart { get; set; }
    public float ZoneEnd { get; set; }
}

/// <summary>DRS zone (added to <c>PacketSessionData</c> in 2026; previously only in
/// <c>PacketCarStatusData</c>). Empty array in 2025 logs.</summary>
public sealed class DrsZone
{
    public float ZoneStart { get; set; }
    public float ZoneEnd { get; set; }
}

/// <summary>
/// Union of all session-packet fields known across formats 2025 and 2026. Each format's
/// deserializer fills as many fields as it parses; unset fields keep their default values.
/// Consumers should treat 2026-only fields (active-aero, DRS-zones, start-reaction-time,
/// new assist toggles) as optional and check for non-default values.
/// </summary>
public sealed class SessionPacket
{
    public byte Weather { get; set; }
    public sbyte TrackTemperature { get; set; }
    public sbyte AirTemperature { get; set; }
    public byte TotalLaps { get; set; }
    public ushort TrackLength { get; set; }
    public byte SessionType { get; set; }
    public sbyte TrackId { get; set; }
    public byte Formula { get; set; }
    public ushort SessionTimeLeft { get; set; }
    public ushort SessionDuration { get; set; }
    public byte PitSpeedLimit { get; set; }
    public byte GamePaused { get; set; }
    public byte IsSpectating { get; set; }
    public byte SpectatorCarIndex { get; set; }
    public byte SliProNativeSupport { get; set; }
    public byte NumMarshalZones { get; set; }
    public MarshalZone[] MarshalZones { get; set; } = [];
    public byte SafetyCarStatus { get; set; }
    public byte NetworkGame { get; set; }
    public byte NumWeatherForecastSamples { get; set; }
    public WeatherForecastSample[] WeatherForecastSamples { get; set; } = [];
    public byte ForecastAccuracy { get; set; }
    public byte AiDifficulty { get; set; }
    public uint SeasonLinkIdentifier { get; set; }
    public uint WeekendLinkIdentifier { get; set; }
    public uint SessionLinkIdentifier { get; set; }
    public byte PitStopWindowIdealLap { get; set; }
    public byte PitStopWindowLatestLap { get; set; }
    public byte PitStopRejoinPosition { get; set; }
    public byte SteeringAssist { get; set; }
    public byte BrakingAssist { get; set; }
    public byte GearboxAssist { get; set; }
    public byte PitAssist { get; set; }
    public byte PitReleaseAssist { get; set; }
    public byte ErsAssist { get; set; }
    public byte DrsAssist { get; set; }
    public byte DynamicRacingLine { get; set; }
    public byte DynamicRacingLineType { get; set; }
    public byte GameMode { get; set; }
    public byte RuleSet { get; set; }
    public uint TimeOfDay { get; set; }
    public byte SessionLength { get; set; }
    public byte SpeedUnitsLeadPlayer { get; set; }
    public byte TemperatureUnitsLeadPlayer { get; set; }
    public byte SpeedUnitsSecondaryPlayer { get; set; }
    public byte TemperatureUnitsSecondaryPlayer { get; set; }
    public byte NumSafetyCarPeriods { get; set; }
    public byte NumVirtualSafetyCarPeriods { get; set; }
    public byte NumRedFlagPeriods { get; set; }
    public byte EqualCarPerformance { get; set; }
    public byte RecoveryMode { get; set; }
    public byte FlashbackLimit { get; set; }
    public byte SurfaceType { get; set; }
    public byte LowFuelMode { get; set; }
    public byte RaceStarts { get; set; }
    public byte TyreTemperature { get; set; }
    public byte PitLaneTyreSim { get; set; }
    public byte CarDamage { get; set; }
    public byte CarDamageRate { get; set; }
    public byte Collisions { get; set; }
    public byte CollisionsOffForFirstLapOnly { get; set; }
    public byte MpUnsafePitRelease { get; set; }
    public byte MpOffForGriefing { get; set; }
    public byte CornerCuttingStringency { get; set; }
    public byte ParcFermeRules { get; set; }
    public byte PitStopExperience { get; set; }
    public byte SafetyCar { get; set; }
    public byte SafetyCarExperience { get; set; }
    public byte FormationLap { get; set; }
    public byte FormationLapExperience { get; set; }
    public byte RedFlags { get; set; }
    public byte AffectsLicenceLevelSolo { get; set; }
    public byte AffectsLicenceLevelMp { get; set; }
    public byte NumSessionsInWeekend { get; set; }
    public int[] WeekendStructure { get; set; } = [];
    public float Sector2LapDistanceStart { get; set; }
    public float Sector3LapDistanceStart { get; set; }

    // ---- Added in packet format 2026 (Season Pack). Defaulted in 2025 logs. ----

    /// <summary>0 = Full, 1 = Partial.</summary>
    public byte ActiveAeroTrackStatus { get; set; }
    public byte NumActiveAeroZonesFull { get; set; }
    public ActiveAeroZone[] ActiveAeroZonesFull { get; set; } = [];
    public byte NumActiveAeroZonesPartial { get; set; }
    public ActiveAeroZone[] ActiveAeroZonesPartial { get; set; } = [];
    public byte NumDrsZones { get; set; }
    public DrsZone[] DrsZones { get; set; } = [];

    /// <summary>Driver start reaction time in seconds, 0.0f if assisted starts.</summary>
    public float StartReactionTime { get; set; }

    /// <summary>0 = Off, 1 = On.</summary>
    public byte AntiLockBrakesAssist { get; set; }
    /// <summary>0 = Off, 1 = Medium, 2 = Full.</summary>
    public byte TractionControlAssist { get; set; }
    /// <summary>0 = Off, 1 = On.</summary>
    public byte DynamicRacingLineHiVis { get; set; }
    /// <summary>0 = Off, 1 = Protanopia, 2 = Deuteranopia, 3 = Tritanopia.</summary>
    public byte DynamicRacingLineColourBlind { get; set; }
    /// <summary>0 = Off, 1 = On.</summary>
    public byte RecurringRewindPrompt { get; set; }
}
