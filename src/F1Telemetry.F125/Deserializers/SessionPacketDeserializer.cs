using F1Telemetry.F125.Packets;
using F1Telemetry.F125.Protocol;
using F1Telemetry.Telemetry;

namespace F1Telemetry.F125.Deserializers;

public sealed class SessionPacketDeserializer : IPacketDeserializer
{
    private const int MaxMarshalZones = 21;
    private const int MaxWeatherForecastSamples = 64;
    private const int MaxSessionsInWeekend = 12;

    public byte PacketId => (byte)F125PacketId.Session;

    public object? Deserialize(ReadOnlySpan<byte> data, TelemetryPacketHeader header)
    {
        var reader = new BinaryReader125(data, F125PacketHeaderReader.HeaderSize);
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
        packet.WeekendStructure = reader.ReadByteArray(MaxSessionsInWeekend);
        packet.Sector2LapDistanceStart = reader.ReadFloat();
        packet.Sector3LapDistanceStart = reader.ReadFloat();

        return packet;
    }
}
