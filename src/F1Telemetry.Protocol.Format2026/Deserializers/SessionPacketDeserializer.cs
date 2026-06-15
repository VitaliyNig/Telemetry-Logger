using F1Telemetry.Packets;
using F1Telemetry.Protocol;
using F1Telemetry.Protocol.Format2026.Internal;
using F1Telemetry.Telemetry;

namespace F1Telemetry.Protocol.Format2026.Deserializers;

/// <summary>
/// Session packet for format 2026. Additions vs 2025: Active Aero zones (full + partial),
/// DRS zones inline (previously only via CarStatus), driver start reaction time, and the
/// new assist flags (anti-lock-brakes assist, traction control assist, dynamic racing line
/// hi-vis / colourblind, recurring rewind prompt).
/// </summary>
internal sealed class SessionPacketDeserializer : IPacketDeserializer
{
    private const int MaxMarshalZones = 21;
    private const int MaxWeatherForecastSamples = 64;
    private const int MaxSessionsInWeekend = 12;
    private const int MaxActiveAeroZones = 8;
    private const int MaxDrsZones = 4;

    public byte PacketId => (byte)F1PacketId.Session;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader126(data, PacketHeaderReader.HeaderSize);
        var packet = new SessionPacket
        {
            Weather = reader.ReadByte(),
            TrackTemperature = reader.ReadSByte(),
            AirTemperature = reader.ReadSByte(),
            TotalLaps = reader.ReadByte(),
            TrackLength = reader.ReadUInt16(),
            SessionType = reader.ReadByte(),
            TrackId = reader.ReadSByte(),
            Formula = reader.ReadByte(),
            SessionTimeLeft = reader.ReadUInt16(),
            SessionDuration = reader.ReadUInt16(),
            PitSpeedLimit = reader.ReadByte(),
            GamePaused = reader.ReadByte(),
            IsSpectating = reader.ReadByte(),
            SpectatorCarIndex = reader.ReadByte(),
            SliProNativeSupport = reader.ReadByte(),
            NumMarshalZones = reader.ReadByte(),
        };

        packet.MarshalZones = new MarshalZone[MaxMarshalZones];
        for (var i = 0; i < MaxMarshalZones; i++)
        {
            packet.MarshalZones[i] = new MarshalZone
            {
                ZoneStart = reader.ReadFloat(),
                ZoneFlag = reader.ReadSByte(),
            };
        }

        packet.SafetyCarStatus = reader.ReadByte();
        packet.NetworkGame = reader.ReadByte();
        packet.NumWeatherForecastSamples = reader.ReadByte();

        packet.WeatherForecastSamples = new WeatherForecastSample[MaxWeatherForecastSamples];
        for (var i = 0; i < MaxWeatherForecastSamples; i++)
        {
            packet.WeatherForecastSamples[i] = new WeatherForecastSample
            {
                SessionType = reader.ReadByte(),
                TimeOffset = reader.ReadByte(),
                Weather = reader.ReadByte(),
                TrackTemperature = reader.ReadSByte(),
                TrackTemperatureChange = reader.ReadSByte(),
                AirTemperature = reader.ReadSByte(),
                AirTemperatureChange = reader.ReadSByte(),
                RainPercentage = reader.ReadByte(),
            };
        }

        packet.ForecastAccuracy = reader.ReadByte();
        packet.AiDifficulty = reader.ReadByte();
        packet.SeasonLinkIdentifier = reader.ReadUInt32();
        packet.WeekendLinkIdentifier = reader.ReadUInt32();
        packet.SessionLinkIdentifier = reader.ReadUInt32();
        packet.PitStopWindowIdealLap = reader.ReadByte();
        packet.PitStopWindowLatestLap = reader.ReadByte();
        packet.PitStopRejoinPosition = reader.ReadByte();
        packet.SteeringAssist = reader.ReadByte();
        packet.BrakingAssist = reader.ReadByte();
        packet.GearboxAssist = reader.ReadByte();
        packet.PitAssist = reader.ReadByte();
        packet.PitReleaseAssist = reader.ReadByte();
        packet.ErsAssist = reader.ReadByte();
        packet.DrsAssist = reader.ReadByte();
        packet.DynamicRacingLine = reader.ReadByte();
        packet.DynamicRacingLineType = reader.ReadByte();
        packet.GameMode = reader.ReadByte();
        packet.RuleSet = reader.ReadByte();
        packet.TimeOfDay = reader.ReadUInt32();
        packet.SessionLength = reader.ReadByte();
        packet.SpeedUnitsLeadPlayer = reader.ReadByte();
        packet.TemperatureUnitsLeadPlayer = reader.ReadByte();
        packet.SpeedUnitsSecondaryPlayer = reader.ReadByte();
        packet.TemperatureUnitsSecondaryPlayer = reader.ReadByte();
        packet.NumSafetyCarPeriods = reader.ReadByte();
        packet.NumVirtualSafetyCarPeriods = reader.ReadByte();
        packet.NumRedFlagPeriods = reader.ReadByte();
        packet.EqualCarPerformance = reader.ReadByte();
        packet.RecoveryMode = reader.ReadByte();
        packet.FlashbackLimit = reader.ReadByte();
        packet.SurfaceType = reader.ReadByte();
        packet.LowFuelMode = reader.ReadByte();
        packet.RaceStarts = reader.ReadByte();
        packet.TyreTemperature = reader.ReadByte();
        packet.PitLaneTyreSim = reader.ReadByte();
        packet.CarDamage = reader.ReadByte();
        packet.CarDamageRate = reader.ReadByte();
        packet.Collisions = reader.ReadByte();
        packet.CollisionsOffForFirstLapOnly = reader.ReadByte();
        packet.MpUnsafePitRelease = reader.ReadByte();
        packet.MpOffForGriefing = reader.ReadByte();
        packet.CornerCuttingStringency = reader.ReadByte();
        packet.ParcFermeRules = reader.ReadByte();
        packet.PitStopExperience = reader.ReadByte();
        packet.SafetyCar = reader.ReadByte();
        packet.SafetyCarExperience = reader.ReadByte();
        packet.FormationLap = reader.ReadByte();
        packet.FormationLapExperience = reader.ReadByte();
        packet.RedFlags = reader.ReadByte();
        packet.AffectsLicenceLevelSolo = reader.ReadByte();
        packet.AffectsLicenceLevelMp = reader.ReadByte();
        packet.NumSessionsInWeekend = reader.ReadByte();
        packet.WeekendStructure = reader.ReadByteValuesAsIntArray(MaxSessionsInWeekend);
        packet.Sector2LapDistanceStart = reader.ReadFloat();
        packet.Sector3LapDistanceStart = reader.ReadFloat();

        // ---- New in 2026: Active Aero + DRS zones ----
        packet.ActiveAeroTrackStatus = reader.ReadByte();
        packet.NumActiveAeroZonesFull = reader.ReadByte();
        packet.ActiveAeroZonesFull = ReadActiveAeroZones(ref reader, MaxActiveAeroZones);
        packet.NumActiveAeroZonesPartial = reader.ReadByte();
        packet.ActiveAeroZonesPartial = ReadActiveAeroZones(ref reader, MaxActiveAeroZones);
        packet.NumDrsZones = reader.ReadByte();
        packet.DrsZones = ReadDrsZones(ref reader, MaxDrsZones);

        packet.StartReactionTime = reader.ReadFloat();
        packet.AntiLockBrakesAssist = reader.ReadByte();
        packet.TractionControlAssist = reader.ReadByte();
        packet.DynamicRacingLineHiVis = reader.ReadByte();
        packet.DynamicRacingLineColourBlind = reader.ReadByte();
        packet.RecurringRewindPrompt = reader.ReadByte();

        return packet;
    }

    private static ActiveAeroZone[] ReadActiveAeroZones(ref BinaryReader126 reader, int count)
    {
        var arr = new ActiveAeroZone[count];
        for (var i = 0; i < count; i++)
        {
            arr[i] = new ActiveAeroZone
            {
                ZoneStart = reader.ReadFloat(),
                ZoneEnd = reader.ReadFloat(),
            };
        }
        return arr;
    }

    private static DrsZone[] ReadDrsZones(ref BinaryReader126 reader, int count)
    {
        var arr = new DrsZone[count];
        for (var i = 0; i < count; i++)
        {
            arr[i] = new DrsZone
            {
                ZoneStart = reader.ReadFloat(),
                ZoneEnd = reader.ReadFloat(),
            };
        }
        return arr;
    }
}
